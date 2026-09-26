-- Hardening (not the reported "2+ photos fail" bug -- that was the client's
-- story version going stale, fixed in 20260926110809): lock the revision row
-- before computing the next sort_order.
--
-- finalize_story_media_upload() assigns the new row's position with an
-- unprotected read-then-write (select max(sort_order) + 1, then insert).
-- Two finalize calls for DIFFERENT media on the SAME revision that overlap
-- in time (two tabs on one draft, or a retry racing the original) could both
-- read the same max and the second would fail
-- story_revision_media_sort_order_unique (20260803090400_story_media.sql).
-- Rare in practice -- one tab's MutationQueue already serializes finalize
-- calls -- but begin_story_media_upload() already guards its own
-- read-then-write with `perform 1 from story_revisions ... for update`, and
-- this adds the same lock here so concurrent finalizes serialize.
--
-- Nothing else changes: body is 20260806110100's, plus the lock.
create or replace function public.finalize_story_media_upload(
  p_media_id uuid,
  p_expected_version integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.story_media;
  v_story_id uuid;
  v_story public.stories;
  v_object_exists boolean;
  v_object_size bigint;
  max_upload_bytes constant bigint := 15728640; -- 15 MiB
  v_next_sort integer;
begin
  select * into v_media from public.story_media where id = p_media_id for update;
  if not found then
    raise exception 'No such media: %', p_media_id;
  end if;

  -- Idempotent: a prior finalize call for this exact media already
  -- succeeded (state has moved past pending_upload) — safe to call twice.
  if v_media.processing_state <> 'pending_upload' then
    return;
  end if;

  -- Re-derive edit authorization independently — never trust that
  -- begin_story_media_upload's earlier check is still valid.
  select public._authorize_revision_edit(v_media.reserved_for_revision_id) into v_story_id;

  select exists (
    select 1 from storage.objects
    where bucket_id = 'story-images-private' and name = v_media.private_storage_path
  ), (
    select (metadata ->> 'size')::bigint from storage.objects
    where bucket_id = 'story-images-private' and name = v_media.private_storage_path
  )
  into v_object_exists, v_object_size;

  if not v_object_exists then
    raise exception 'Upload not found for media % at %; please re-upload', p_media_id, v_media.private_storage_path;
  end if;
  if v_object_size is null or v_object_size > max_upload_bytes then
    raise exception 'Uploaded object for media % exceeds the maximum allowed size', p_media_id;
  end if;

  select * into v_story from public.stories where id = v_story_id;
  if v_story.version <> p_expected_version then
    raise exception 'Stale version for story % (expected %, got %)', v_story_id, v_story.version, p_expected_version;
  end if;

  -- NEW: lock the revision row before reading/computing the next
  -- sort_order, mirroring begin_story_media_upload()'s own lock-before-
  -- read-then-write. Without this, two concurrent finalize calls for
  -- different media on the same revision can both read the same
  -- coalesce(max(sort_order), -1) and both try to insert it, and the loser
  -- fails story_revision_media_sort_order_unique. The lock is released when
  -- this function's implicit transaction ends, same as every other
  -- `for update` lock in this domain.
  perform 1 from public.story_revisions where id = v_media.reserved_for_revision_id for update;

  select coalesce(max(sort_order), -1) + 1 into v_next_sort
  from public.story_revision_media where revision_id = v_media.reserved_for_revision_id;

  -- decorative = true (not false): no alt text has been collected yet at
  -- this point, and story_revision_media_alt_text_required forbids
  -- alt_text is null unless decorative is true. See 20260806110100.
  insert into public.story_revision_media (revision_id, media_id, decorative, sort_order)
  values (v_media.reserved_for_revision_id, p_media_id, true, v_next_sort);

  update public.story_media
    set source_file_size_bytes = v_object_size,
        processing_state = 'uploaded'
    where id = p_media_id;

  update public.stories set version = version + 1 where id = v_story_id;
end;
$$;

comment on function public.finalize_story_media_upload(uuid, integer) is
  'Verifies the reserved object exists and reads its true stored size (never client-supplied), then creates the revision-media join (decorative=true placeholder, since no alt text exists yet) and bumps the authoring version exactly once. Locks the revision row before computing the next sort_order (20260926110716) so two concurrent finalize calls on the same revision cannot both compute the same value and collide on story_revision_media_sort_order_unique. Retryable after a stale-version error without re-uploading bytes: existence/access/state checks (which do not depend on version) run first, and a repeat call after the row has already moved past pending_upload is a safe no-op.';

revoke execute on function public.finalize_story_media_upload(uuid, integer) from public, anon, authenticated;
grant execute on function public.finalize_story_media_upload(uuid, integer) to authenticated;
