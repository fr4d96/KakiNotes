-- A publication attempt ends when its revision leaves review.
--
-- Only moderate_revision() (reject / changes requested) and
-- finalize_story_publication() (approved) used to resolve an active attempt.
-- A submitted revision can also leave review through
-- withdraw_unstarted_submission(), reopen_submission_for_editing() and
-- _terminalize_active_revision() (archive_story(), consent withdrawal, an
-- approved takedown). Those left the attempt `active` and its photos
-- `promotion_pending`. create_next_draft_revision() reuses the same media
-- rows, so the next approval asked begin_story_media_copy_attempt() for a
-- copy row under its OWN attempt id, got none, and could never publish --
-- and rejecting did not release the photos either, because they were not in
-- that attempt's copy rows.
--
-- One rule instead of one more hand-copied block per route: when a revision
-- stops being `submitted` for any reason other than approval, its active
-- attempt is abandoned and its photos go back to `processed`. A trigger
-- enforces it, so a route added later cannot forget. Nobody gains a
-- permission: each route keeps its own authorization, and the contributor
-- who may withdraw a submission was already ending the moderator's attempt
-- (begin, finalize and the copy step all refuse once it is not submitted).
-- moderate_revision() still abandons the attempt itself BEFORE changing the
-- status, so its "initiating moderator or admin" check is unaffected and the
-- trigger then finds nothing active.
--
-- Lock order is revision then attempt, the same as moderate_revision().
-- finalize_story_publication() takes attempt then revision, so a withdrawal
-- racing a finalize can deadlock; Postgres aborts one of them and nothing is
-- half-done. (That pair could already deadlock on revision and story.)

create or replace function public._abandon_publication_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Wait for an in-flight copy step or finalize, then re-check.
  perform 1 from public.story_publication_attempts
    where id = p_attempt_id and status = 'active' for update;
  if not found then
    return;
  end if;

  update public.story_media_public_copy_attempts
    set resolved_at = now(), resolution = 'abandoned', updated_at = now()
    where approval_attempt_id = p_attempt_id and resolved_at is null;

  update public.story_media
    set processing_state = 'processed'
    where processing_state = 'promotion_pending'
      and id in (
        select media_id from public.story_media_public_copy_attempts
        where approval_attempt_id = p_attempt_id
      );

  update public.story_publication_attempts
    set status = 'abandoned', resolved_at = now(), updated_at = now()
    where id = p_attempt_id;
end;
$$;

comment on function public._abandon_publication_attempt(uuid) is
  'Internal: resolves an active publication attempt''s copy rows as abandoned, puts its promotion_pending photos back to processed, and marks it abandoned. No-op unless the attempt is active. NO authorization of its own. No API grants.';

revoke execute on function public._abandon_publication_attempt(uuid)
  from public, anon, authenticated;

create or replace function public.story_revisions_abandon_attempt_on_review_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._abandon_publication_attempt(a.id)
    from public.story_publication_attempts a
    where a.revision_id = new.id and a.status = 'active';
  return null;
end;
$$;

comment on function public.story_revisions_abandon_attempt_on_review_end() is
  'Trigger: an active publication attempt only exists while its revision is submitted. Skips approval, which finalize_story_publication() resolves itself. No API grants.';

revoke execute on function public.story_revisions_abandon_attempt_on_review_end()
  from public, anon, authenticated;

create trigger story_revisions_abandon_attempt_on_review_end
  after update of revision_status on public.story_revisions
  for each row
  when (old.revision_status = 'submitted' and new.revision_status not in ('submitted', 'approved'))
  execute function public.story_revisions_abandon_attempt_on_review_end();

-- Repair what the old behaviour already left behind: active attempts whose
-- revision is no longer submitted, and the photos stuck with them.
select public._abandon_publication_attempt(a.id)
from public.story_publication_attempts a
join public.story_revisions r on r.id = a.revision_id
where a.status = 'active' and r.revision_status <> 'submitted';
