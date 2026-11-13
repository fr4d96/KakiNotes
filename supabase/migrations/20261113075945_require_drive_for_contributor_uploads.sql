-- Mandatory Google Drive for contributors' photos (2026-11-13).
--
-- Why: the Supabase project was paused when storage filled up. Every
-- ordinary contributor must now connect Google Drive (the app gate is
-- app/(contributor)/layout.tsx -> /connect-drive), and a contributor's own
-- photos must never be written to Supabase storage again.
--
-- This trigger is the storage rule itself (Engineering Rule 3: the
-- database is the source of truth; the app gate and the upload action's
-- error mapping only repeat it). It refuses to create a SUPABASE-backed
-- story_media row when ALL of these hold:
--
--   * a signed-in caller is creating it (auth.uid() is not null; system /
--     service-role work, which has no auth.uid(), is never blocked), and
--   * the row is that caller's own self_submitted photo: begin_story_media_
--     upload() sets owner_user_id = auth.uid() only for a self_submitted
--     story's owner (editorial imports get null), and
--   * the caller has no staff role (editor / moderator / admin), and
--   * the caller has no ACTIVE row in contributor_drive_connections.
--
-- Google Drive-backed rows (begin_drive_media_upload()) are untouched, and
-- so are editorial-import photos and staff uploads, which still use
-- Supabase by design (get_story_media_upload_mode() only ever answers
-- google_drive for a self_submitted story's own owner).
--
-- Existing rows are untouched: it is a BEFORE INSERT trigger only, and
-- nothing in the app ever moves a photo from Drive back to Supabase (the
-- move tool, 20261008053425, is Supabase -> Drive only).
--
-- The exception text 'drive_required' is matched by
-- app/(contributor)/stories/[id]/edit/upload-actions.ts to show a plain
-- "connect your Google Drive" message.

create or replace function public._story_media_require_drive_for_contributors()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
begin
  if new.storage_backend <> 'supabase'
     or v_caller is null
     or new.owner_user_id is distinct from v_caller then
    return new;
  end if;

  if exists (
    select 1 from public.user_roles
    where user_id = v_caller
      and role in ('editor', 'moderator', 'admin')
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.contributor_drive_connections
    where user_id = v_caller
      and status = 'active'
  ) then
    return new;
  end if;

  raise exception 'drive_required'
    using hint = 'Connect Google Drive first. A contributor''s own photos are stored in their Google Drive, never in Supabase storage.';
end;
$$;

comment on function public._story_media_require_drive_for_contributors() is
  'BEFORE INSERT trigger on story_media: refuses a supabase-backed row for a signed-in caller''s own self_submitted photo unless the caller has a staff role or an active Google Drive connection. Raises ''drive_required''. Internal: trigger use only, no API grants.';

revoke execute on function public._story_media_require_drive_for_contributors()
  from public, anon, authenticated;

create trigger story_media_require_drive_for_contributors
  before insert on public.story_media
  for each row
  execute function public._story_media_require_drive_for_contributors();
