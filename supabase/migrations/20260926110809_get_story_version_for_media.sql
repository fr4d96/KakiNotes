-- Bug fix: every image upload after the first one on a given tab (and every
-- autosave/tags/locations save after that) failed with "Stale version for
-- story X (expected N, got N-1)", over and over, never recovering.
--
-- ROOT CAUSE. lib/story/mutations.ts#storyVersionForMedia() -- used by
-- finalizeMediaUploadAction (app/(contributor)/stories/[id]/edit/
-- upload-actions.ts) both to recover from a stale-version conflict AND to
-- read back the authoritative version after a SUCCESSFUL finalize -- reads
-- `story_media` and `stories` directly through the caller's regular
-- (RLS-respecting) PostgREST client:
--
--   supabase.from("story_media").select("story_id").eq("id", mediaId)...
--   supabase.from("stories").select("version").eq("id", story_id)...
--
-- Both tables had EVERY privilege revoked from `anon`/`authenticated` back
-- in 20260803090900_lock_down_story_domain_grants.sql -- "no policies —
-- every access is a SECURITY DEFINER function" is enforced at the GRANT
-- level, not just via RLS, precisely so a direct table query like this
-- CANNOT silently start working under a permissive policy someday. So
-- every call to storyVersionForMedia() has always failed with Postgres'
-- "permission denied for table story_media" -- confirmed in the dev
-- project's logs -- and the function swallows that error and returns null.
--
-- THE CASCADE. finalize_story_media_upload() (unconditionally, on success)
-- bumps stories.version by exactly 1 in the database. But
-- finalizeMediaUploadAction always calls storyVersionForMedia() afterward
-- to hand the CLIENT its new version -- and that call always returns null,
-- so the client's `if (result.version !== null) versionRef.current =
-- result.version` never fires. The DB is now one ahead of what the client
-- believes. The very next mutation on that story (a second image's
-- finalize, an autosave, a tags/locations save) sends the client's
-- one-behind version and gets rejected with "Stale version ... (expected
-- {actual}, got {client's stale value})" -- and stays rejected forever,
-- because nothing in this path ever re-syncs the client's version once it
-- has fallen behind.
--
-- THE FIX. A new, narrowly-scoped, properly-authorized accessor --
-- get_story_version_for_media() -- replaces the direct table reads.
-- Re-derives the caller's own edit relationship to the story from the
-- database (never trusts that an earlier authorization on this media id is
-- still valid), exactly mirroring _authorize_revision_edit()'s own
-- owner-or-assigned-editor check. lib/story/mutations.ts#storyVersionForMedia
-- is updated in the same change to call this RPC instead of `.from(...)`.
--
-- No grant is added to story_media or stories themselves — the lock-down
-- migration's guarantee (only ever through a SECURITY DEFINER function) is
-- preserved exactly; this is a new, single-purpose function of that kind,
-- not an exception to the rule.
create or replace function public.get_story_version_for_media(p_media_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story_id uuid;
  v_story public.stories;
begin
  select story_id into v_story_id from public.story_media where id = p_media_id;
  if v_story_id is null then
    raise exception 'No such media: %', p_media_id;
  end if;

  select * into v_story from public.stories where id = v_story_id;
  if not (public._is_story_owner(v_story_id) or v_story.assigned_editor_id = auth.uid()) then
    raise exception 'Not authorized to read story %', v_story_id;
  end if;

  return v_story.version;
end;
$$;

comment on function public.get_story_version_for_media(uuid) is
  'Looks up the current stories.version for the story a media item belongs to, re-deriving the caller''s own owner-or-assigned-editor relationship independently (never trusting a prior authorization on this media id). Replaces a direct `.from("story_media")`/`.from("stories")` read from lib/story/mutations.ts#storyVersionForMedia that always failed with "permission denied" -- story_media and stories have had every table privilege revoked from anon/authenticated since 20260803090900_lock_down_story_domain_grants.sql; every access must go through a function like this one.';

revoke execute on function public.get_story_version_for_media(uuid) from public, anon, authenticated;
grant execute on function public.get_story_version_for_media(uuid) to authenticated;
