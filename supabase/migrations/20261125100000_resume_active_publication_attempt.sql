-- An approval that failed after begin_story_publication_attempt() can be
-- retried.
--
-- Approving is begin -> copy photos -> finalize, in three separate
-- transactions. When the copy or finalize step fails, the attempt stays
-- `active` on purpose and the moderator is told to retry approval. But every
-- approval starts with begin, and begin raised "already has an active
-- publication attempt" for that same revision -- so the retry could never
-- reach the copy step, and the story could only be rejected or sent back.
--
-- begin now hands the existing active attempt's id back instead, to the
-- moderator who started it or to an admin. That is the same ownership rule
-- begin_story_media_copy_attempt(), finalize_story_publication() and
-- moderate_revision() already apply to an active attempt, so nobody gains
-- the right to act on an attempt they could not act on before. Unchanged:
-- the moderator/admin role check, the `submitted` check, the one-active-
-- attempt partial unique index, SECURITY DEFINER + empty search_path, the
-- signature, and the grants.
--
-- Two details:
--
-- 1. An attempt that can no longer be finalized is replaced, not resumed.
--    maintenance_resolve_orphaned_copy_attempt() (the manual cleanup script)
--    resolves stale copy rows as `abandoned` and puts their photos back to
--    `processed`, but leaves the parent attempt `active`. A resolution is
--    immutable (story_media_public_copy_attempts_protect_resolution()), so
--    finalize could never mark those rows `promoted`: resuming would only
--    move the dead end. Such an attempt is abandoned here exactly the way
--    moderate_revision() abandons one, and a fresh attempt is minted.
--
-- 2. Resuming refreshes updated_at on the attempt's unresolved copy rows, so
--    the cleanup script (which now goes by updated_at, not created_at) does
--    not treat an approval in progress as an orphan and delete the public
--    object between its copy check and finalize.
--
-- The attempt row is read without a row lock: the revision row lock already
-- serializes begin against itself and moderate_revision(), and finalize
-- cannot complete without it. finalize takes the attempt lock BEFORE the
-- revision lock, so locking the attempt here as well would add a deadlock
-- for every ordinary retry. Only the replace path (1) writes the attempt
-- row, in the same revision-then-attempt order moderate_revision() uses.

create or replace function public.begin_story_publication_attempt(p_revision_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.story_revisions;
  v_attempt public.story_publication_attempts;
  v_attempt_id uuid;
begin
  if not (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only a moderator or admin can begin a publication attempt';
  end if;

  select * into v_revision from public.story_revisions where id = p_revision_id for update;
  if not found then
    raise exception 'No such revision: %', p_revision_id;
  end if;
  if v_revision.revision_status <> 'submitted' then
    raise exception 'Revision % is not currently submitted', p_revision_id;
  end if;

  -- The partial unique index (revision_id) where status = 'active' is the
  -- real, structural guarantee that only one attempt is ever active per
  -- revision, so there is at most one row here.
  select * into v_attempt from public.story_publication_attempts
    where revision_id = p_revision_id and status = 'active';

  if found then
    -- `is distinct from`, never `<>`: a null on either side must refuse, not
    -- make the whole condition null and fall through.
    if v_attempt.initiated_by is distinct from auth.uid()
       and not public.has_role(auth.uid(), 'admin') then
      raise exception 'Revision % already has an active publication attempt started by another moderator; only that moderator or an admin can continue it', p_revision_id;
    end if;

    if not exists (
      select 1 from public.story_media_public_copy_attempts
      where approval_attempt_id = v_attempt.id and resolved_at is not null
    ) then
      update public.story_media_public_copy_attempts
        set updated_at = now()
        where approval_attempt_id = v_attempt.id;
      return v_attempt.id;
    end if;

    -- No longer finalizable (detail 1 above). Same three steps, in the same
    -- order, as moderate_revision()'s abandon block.
    update public.story_media_public_copy_attempts
      set resolved_at = now(), resolution = 'abandoned', updated_at = now()
      where approval_attempt_id = v_attempt.id and resolved_at is null;

    update public.story_media
      set processing_state = 'processed'
      where processing_state = 'promotion_pending'
        and id in (
          select media_id from public.story_media_public_copy_attempts
          where approval_attempt_id = v_attempt.id
        );

    update public.story_publication_attempts
      set status = 'abandoned', resolved_at = now(), updated_at = now()
      where id = v_attempt.id;
  end if;

  insert into public.story_publication_attempts (revision_id, initiated_by, status)
  values (p_revision_id, auth.uid(), 'active')
  returning id into v_attempt_id;

  return v_attempt_id;
end;
$$;

comment on function public.begin_story_publication_attempt(uuid) is
  'Returns the publication-attempt id to use for a submitted revision: the existing active attempt when the caller started it or is an admin (so a failed approval can be retried), otherwise a fresh, server-generated one. A moderator who did not start the active attempt is refused. An active attempt whose copy rows were already resolved by maintenance cannot be finalized, so it is abandoned and replaced. Only one attempt may be active per revision at a time (enforced structurally by a partial unique index, not merely this check).';

revoke execute on function public.begin_story_publication_attempt(uuid) from public, anon, authenticated;
grant execute on function public.begin_story_publication_attempt(uuid) to authenticated;
