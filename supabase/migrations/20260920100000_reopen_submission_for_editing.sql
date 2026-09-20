-- Contributors can edit a story that is under review.
--
-- "Under review" means the story's current revision is `submitted` and is
-- sitting in the moderation queue. That revision is FROZEN by
-- story_revisions_protect_immutable_content() and that freeze is deliberate:
-- a revision_id must stay a trustworthy snapshot of what the contributor
-- consented to, and a moderator must never be reviewing a moving target
-- (docs/architecture.md, "Only draft is ever content-editable").
--
-- So "edit while under review" is NOT "unfreeze the submitted revision". It
-- is two things the schema already knows how to do, done atomically:
--
--   1. withdraw_unstarted_submission()  -- the submitted revision becomes
--      `withdrawn` and leaves the queue (get_moderation_queue() selects only
--      `submitted`; the story_submitted notification cascade marks the
--      moderators' alert read because the revision left `submitted`).
--   2. create_next_draft_revision()     -- copies that withdrawn revision,
--      every child row included, into a fresh `draft` and points the story
--      at it. The contributor keeps everything they wrote and can submit
--      again when they are done, through the ordinary consent path.
--
-- Doing them in ONE function matters: if the copy failed after the
-- withdrawal, the contributor would have pulled their story from review and
-- gained nothing. plpgsql runs the whole body in the caller's transaction, so
-- either both happen or neither.
--
-- Every authorization and precondition check lives in the two callees, and
-- each one re-derives the caller from auth.uid() (Engineering Rule 2):
--   - owner or assigned editor only;
--   - the current revision must be `submitted`;
--   - no moderator has acted on it yet (moderate_revision() is the only
--     writer of moderation_actions, and it also moves the revision out of
--     `submitted`, so in practice "acted on" and "no longer submitted" are
--     the same guard twice -- kept for the day they are not).
-- A published story stays `published` throughout (Engineering Rule 11:
-- what readers see is untouched; only approve_revision() swaps the live
-- pointer). A never-published story goes back to `draft`.

create or replace function public.reopen_submission_for_editing(p_story_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.withdraw_unstarted_submission(p_story_id);
  return public.create_next_draft_revision(p_story_id);
end;
$$;

comment on function public.reopen_submission_for_editing(uuid) is
  'Lets a contributor keep editing a story that is under review: withdraws the submitted revision (it leaves the moderation queue, frozen forever) and copies it into a fresh draft in the same transaction. All ownership and status checks are the callees'' (withdraw_unstarted_submission, create_next_draft_revision). Returns the new draft revision id.';

revoke execute on function public.reopen_submission_for_editing(uuid) from public, anon, authenticated;
grant execute on function public.reopen_submission_for_editing(uuid) to authenticated;
