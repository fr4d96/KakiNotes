-- Follow-up to 20261007190006_story_drive_folders.sql (already applied to
-- dev — do not edit that file). Two independent pieces:
--
-- 1. contributor_drive_connections.staging_folder_id: caches the
--    contributor's resolved ".staging" folder id (nested inside their
--    "Kakinotes" app folder, same column already does for drive_folder_id)
--    so lib/drive/drive-client.ts#ensureAppFolders() can skip BOTH a Drive
--    search call AND the one-time legacy-staging-folder cleanup once this
--    is set. Nullable: existing connections have it null until their next
--    Drive call resolves (and records) it.
--
-- 2. get_story_drive_sync_state(): a caller who is NOT a self-submitted
--    story's own owner (an assigned editor autosaving someone else's
--    story, most commonly) currently makes this function RAISE. The
--    caller (lib/story/drive-folders.ts#getDriveSyncGate) already swallows
--    that into "nothing to do", so this was never a correctness bug — but
--    it means every editor autosave on an editorial-import story writes a
--    Postgres ERROR-level log line, purely as noise. CREATE OR REPLACE
--    with the SAME signature and return shape: a non-owner now gets
--    (false, false) instead of an exception. No other function touched.

alter table public.contributor_drive_connections
  add column staging_folder_id text;

comment on column public.contributor_drive_connections.staging_folder_id is
  'The contributor''s resolved ".staging" Drive folder id, nested inside their "Kakinotes" app folder (drive_folder_id). Null until first resolved. Once set, ensureAppFolders() trusts it directly -- no Drive search call, and the one-time legacy-top-level/legacy-child-of-Kakinotes "Kakinotes staging" cleanup is skipped, since a set value means that cleanup already ran for this connection.';

create or replace function public.get_story_drive_sync_state(p_story_id uuid)
returns table (
  has_drive_media boolean,
  has_folder boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_revision_id uuid;
  v_has_media boolean;
  v_has_folder boolean;
begin
  -- CHANGED: was `raise exception` for a non-owner caller. The caller
  -- (getDriveSyncGate) already treats any error identically to "nothing to
  -- do", so raising bought nothing except an ERROR-level log line on every
  -- editor autosave of an editorial-import story. Same signature, same
  -- return shape, just a quiet (false, false) instead of an exception.
  if not public._is_self_submitted_story_owner(p_story_id) then
    return query select false, false;
    return;
  end if;

  select * into v_story from public.stories where id = p_story_id;
  v_revision_id := coalesce(v_story.current_draft_revision_id, v_story.published_revision_id);

  v_has_media := v_revision_id is not null and exists (
    select 1 from public.story_revision_media rm
    join public.story_media m on m.id = rm.media_id
    where rm.revision_id = v_revision_id and m.storage_backend = 'google_drive'
  );

  v_has_folder := exists (
    select 1 from public.story_drive_folders f where f.story_id = p_story_id
  );

  return query select v_has_media, v_has_folder;
end;
$$;

comment on function public.get_story_drive_sync_state(uuid) is
  'The one cheap, post-response lookup the editor Server Actions call inside next/server''s after() -- never on the request''s own critical path -- to decide whether a best-effort Drive folder sync/rename is worth attempting. has_drive_media: any Drive-backed media on the story''s current draft (else published) revision. has_folder: whether a story_drive_folders row already exists. Returns (false, false) for a non-self-submitted-owner caller (changed from raising, 20261007194535) -- callers already treated any error identically to "nothing to do", so this just avoids the log noise.';

revoke execute on function public.get_story_drive_sync_state(uuid) from public, anon, authenticated;
grant execute on function public.get_story_drive_sync_state(uuid) to authenticated;
