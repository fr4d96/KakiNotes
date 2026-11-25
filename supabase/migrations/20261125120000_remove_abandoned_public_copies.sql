-- A photo copied to the public bucket for an approval that was then rejected,
-- sent back or withdrawn can be found and deleted.
--
-- The copy step writes the photo to `story-images-public` before finalize.
-- When the attempt is abandoned, its copy rows are resolved, but the object
-- stays in the world-readable bucket (Engineering Rules 13-14), and
-- scripts/cleanup-abandoned-media-uploads.mjs only looked at UNRESOLVED
-- rows, so it was never deleted.
--
-- Storage deletion cannot be part of a database transaction, and
-- copyStoryMediaToPublic() trusts an object already at the right path with
-- the right hash. Deleting without coordination could remove an object
-- between a new approval's check and its finalize, publishing a story with a
-- missing photo. So the script claims an object first, under the story_media
-- row lock, and begin_story_media_copy_attempt() refuses that photo while a
-- claim is open.
--
-- An object is never claimable when a published story uses it, when it was
-- ever promoted at that path (a photo since moved to Drive is deleted by the
-- move job, which waits out cached pages), or when a newer attempt has an
-- unresolved copy at the same content-addressed path. Rows resolved in the
-- last hour are left alone, so an upload still in flight when its attempt
-- was abandoned has finished long before.

alter table public.story_media_public_copy_attempts
  add column public_object_claimed_at timestamptz,
  add column public_object_removed_at timestamptz;

comment on column public.story_media_public_copy_attempts.public_object_claimed_at is
  'When the cleanup script last claimed this abandoned row''s public object for deletion. Blocks a new copy of the same photo for 10 minutes unless public_object_removed_at follows.';
comment on column public.story_media_public_copy_attempts.public_object_removed_at is
  'When the cleanup script confirmed this abandoned row''s object is gone from the public bucket. Null = it may still be there.';

-- Internal: the one definition of "safe to delete", used by both the list
-- and the claim.
-- `is not distinct from` and coalesce: an unresolved row has a null
-- resolution and resolved_at, and must come out false, never null.
create or replace function public._public_copy_is_removable(p_copy public.story_media_public_copy_attempts)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_copy.resolution is not distinct from 'abandoned'
    and coalesce(p_copy.resolved_at < now() - interval '1 hour', false)
    and p_copy.public_object_removed_at is null
    and not exists (
      select 1 from public.story_media m
      where m.approved_public_storage_path = p_copy.public_path
    )
    and not exists (
      select 1 from public.story_media_public_copy_attempts o
      where o.public_path = p_copy.public_path
        and o.id <> p_copy.id
        and (o.resolved_at is null or o.resolution = 'promoted')
    );
$$;

revoke execute on function public._public_copy_is_removable(public.story_media_public_copy_attempts)
  from public, anon, authenticated;

create or replace function public.maintenance_list_abandoned_public_copies(p_limit integer)
returns table (copy_attempt_id uuid, media_id uuid, public_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (c.public_path) c.id, c.media_id, c.public_path
  from public.story_media_public_copy_attempts c
  where c.resolution = 'abandoned'
    and c.public_object_removed_at is null
    and public._public_copy_is_removable(c)
  order by c.public_path, c.resolved_at desc
  limit least(greatest(p_limit, 0), 500);
$$;

comment on function public.maintenance_list_abandoned_public_copies(integer) is
  'Abandoned copies whose object may still be in the public bucket and that nothing published or in progress uses. One row per path. Only a report: every deletion must still succeed at maintenance_claim_abandoned_public_copy(). service_role only.';

revoke execute on function public.maintenance_list_abandoned_public_copies(integer)
  from public, anon, authenticated;
grant execute on function public.maintenance_list_abandoned_public_copies(integer) to service_role;

create or replace function public.maintenance_claim_abandoned_public_copy(p_copy_attempt_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media_id uuid;
  v_copy public.story_media_public_copy_attempts;
begin
  select media_id into v_media_id from public.story_media_public_copy_attempts
    where id = p_copy_attempt_id;
  if not found then
    raise exception 'No such copy attempt: %', p_copy_attempt_id;
  end if;

  -- Media first, then the copy row: the order the copy step uses.
  perform 1 from public.story_media where id = v_media_id for update;
  select * into v_copy from public.story_media_public_copy_attempts
    where id = p_copy_attempt_id for update;

  if public._public_copy_is_removable(v_copy) is distinct from true then
    return null;
  end if;

  update public.story_media_public_copy_attempts
    set public_object_claimed_at = now()
    where id = p_copy_attempt_id;
  return v_copy.public_path;
end;
$$;

comment on function public.maintenance_claim_abandoned_public_copy(uuid) is
  'Re-checks, under the photo''s row lock, that an abandoned public object is unused, and blocks new copies of that photo for 10 minutes. Returns the path to delete, or null when it must be left alone. service_role only.';

revoke execute on function public.maintenance_claim_abandoned_public_copy(uuid)
  from public, anon, authenticated;
grant execute on function public.maintenance_claim_abandoned_public_copy(uuid) to service_role;

create or replace function public.maintenance_record_public_copy_removed(p_copy_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_copy public.story_media_public_copy_attempts;
begin
  select * into v_copy from public.story_media_public_copy_attempts
    where id = p_copy_attempt_id;
  if not found then
    raise exception 'No such copy attempt: %', p_copy_attempt_id;
  end if;
  if v_copy.public_object_claimed_at is null then
    raise exception 'Copy attempt % was never claimed for removal', p_copy_attempt_id;
  end if;

  -- Every abandoned row at that path described the same object. Only rows
  -- resolved before the claim: a later attempt may have copied it again.
  update public.story_media_public_copy_attempts
    set public_object_removed_at = now()
    where public_path = v_copy.public_path
      and resolution = 'abandoned'
      and resolved_at <= v_copy.public_object_claimed_at
      and public_object_removed_at is null;
end;
$$;

comment on function public.maintenance_record_public_copy_removed(uuid) is
  'Records that a claimed abandoned object is gone from the public bucket, which also ends the claim. service_role only.';

revoke execute on function public.maintenance_record_public_copy_removed(uuid)
  from public, anon, authenticated;
grant execute on function public.maintenance_record_public_copy_removed(uuid) to service_role;

-- begin_story_media_copy_attempt (originally 20260804090200). Verbatim except
-- for the block marked NEW.
create or replace function public.begin_story_media_copy_attempt(
  p_media_id uuid,
  p_approval_attempt_id uuid
)
returns table (public_path text, content_hash text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.story_media;
  v_attempt public.story_publication_attempts;
  v_ext text;
  v_public_path text;
begin
  select * into v_attempt from public.story_publication_attempts
    where id = p_approval_attempt_id for update;
  if not found then
    raise exception 'No such publication attempt: %', p_approval_attempt_id;
  end if;
  if v_attempt.status <> 'active' then
    raise exception 'Publication attempt % is not active (status %)', p_approval_attempt_id, v_attempt.status;
  end if;
  if not (v_attempt.initiated_by = auth.uid() or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only the initiating moderator or an admin may act on this publication attempt';
  end if;

  select * into v_media from public.story_media where id = p_media_id for update;
  if not found then
    raise exception 'No such media: %', p_media_id;
  end if;
  if not exists (
    select 1 from public.story_revision_media
    where revision_id = v_attempt.revision_id and media_id = p_media_id
  ) then
    raise exception 'Media % is not attached to revision %', p_media_id, v_attempt.revision_id;
  end if;

  -- NEW: an object being deleted must not be mistaken for a finished copy.
  -- The media row lock above and the same lock in
  -- maintenance_claim_abandoned_public_copy() make the two mutually
  -- exclusive. A claim whose delete never reported back expires.
  if exists (
    select 1 from public.story_media_public_copy_attempts cca
    where cca.media_id = p_media_id
      and cca.public_object_removed_at is null
      and cca.public_object_claimed_at > now() - interval '10 minutes'
  ) then
    raise exception 'Media % is being cleaned up; try again in a few minutes', p_media_id;
  end if;

  if v_media.processing_state = 'promotion_pending' then
    -- Retry: already flipped for this or a prior attempt at this exact
    -- attempt id — return the existing copy-attempt's recorded target.
    return query
      select cca.public_path, cca.content_hash
      from public.story_media_public_copy_attempts cca
      where cca.media_id = p_media_id and cca.approval_attempt_id = p_approval_attempt_id;
    return;
  end if;
  if v_media.processing_state <> 'processed' then
    raise exception 'Media % is not ready to be copied for publication (state %)', p_media_id, v_media.processing_state;
  end if;

  v_ext := case v_media.processed_mime_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
  end;
  v_public_path := v_media.story_id::text || '/' || p_media_id::text || '/' || v_media.sha256 || '.' || v_ext;

  update public.story_media set processing_state = 'promotion_pending' where id = p_media_id;

  insert into public.story_media_public_copy_attempts (
    approval_attempt_id, revision_id, media_id, content_hash, public_path, status
  )
  values (p_approval_attempt_id, v_attempt.revision_id, p_media_id, v_media.sha256, v_public_path, 'pending')
  on conflict (approval_attempt_id, media_id) do update
    set status = 'pending', attempt_count = story_media_public_copy_attempts.attempt_count + 1, updated_at = now();

  return query select v_public_path, v_media.sha256;
end;
$$;

revoke execute on function public.begin_story_media_copy_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_story_media_copy_attempt(uuid, uuid) to service_role;
