-- Fix for 20260926110809_get_story_version_for_media: its authorization
-- check was `if not (_is_story_owner(...) or assigned_editor_id = auth.uid())`.
-- With no assigned editor, the comparison is NULL, `false or NULL` is NULL,
-- and `not NULL` is NULL -- so the raise never fired for a non-owner, and any
-- signed-in user could read any story's version number. Same nullable-actor
-- trap as 20260803091100_fix_nullable_actor_boolean_logic; same guard as
-- _authorize_revision_edit: coalesce(..., false).
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
  -- coalesce(..., false): with no assigned editor, `assigned_editor_id =
  -- auth.uid()` is NULL, `false or NULL` is NULL, and `not NULL` is NULL --
  -- so without it the raise below would never fire for a non-owner. Same
  -- guard as _authorize_revision_edit (20260803091100).
  if not coalesce(public._is_story_owner(v_story_id) or v_story.assigned_editor_id = auth.uid(), false) then
    raise exception 'Not authorized to read story %', v_story_id;
  end if;

  return v_story.version;
end;
$$;

revoke execute on function public.get_story_version_for_media(uuid) from public, anon, authenticated;
grant execute on function public.get_story_version_for_media(uuid) to authenticated;
