-- One "Your story is live" notification per story, not one per approval.
--
-- _notify_on_revision_status_change() inserted a fresh story_published row
-- every time ANY revision of a story was approved. A contributor who edited
-- a live story and had the edit approved got a second "Your story is live"
-- for the same story, then a third after the next edit, and the bell's
-- dropdown read like a list of duplicates.
--
-- Now there is at most one story_published row per (recipient, story). A
-- later approval refreshes that row in place: it points at the newly
-- approved revision, takes its title, moves to the top (created_at = now())
-- and becomes unread again, because the approved edit is news the
-- contributor hasn't seen yet. The partial unique index makes that the
-- schema's guarantee rather than the trigger's habit.
--
-- Other kinds are untouched: each story_submitted row is its own review task
-- for a moderator (and is auto-read when it leaves review), and each
-- rejected / changes_requested row carries its own moderator reason.

-- 1. Remove existing duplicates, keeping the newest row per recipient+story.
delete from public.notifications n
using (
  select id,
         row_number() over (
           partition by recipient_user_id, story_id
           order by created_at desc, id desc
         ) as rn
  from public.notifications
  where kind = 'story_published'
) ranked
where n.id = ranked.id
  and ranked.rn > 1;

-- 2. The guarantee, and the conflict target for the upsert below.
create unique index notifications_one_published_per_story_idx
  on public.notifications (recipient_user_id, story_id)
  where kind = 'story_published';

-- 3. Same trigger, with the story_published insert turned into an upsert.
create or replace function public._notify_on_revision_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_recipient uuid;
begin
  if new.revision_status is not distinct from old.revision_status then
    return new;
  end if;

  select * into v_story from public.stories where id = new.story_id;

  if new.revision_status = 'submitted' then
    insert into public.notifications (
      recipient_user_id, kind, story_id, revision_id, story_title, story_slug
    )
    select ur.user_id, 'story_submitted', v_story.id, new.id, new.title, v_story.slug
    from public.user_roles ur
    where ur.role in ('moderator', 'admin')
      and ur.user_id is distinct from auth.uid();

  elsif new.revision_status = 'approved' then
    v_recipient := public._notification_recipient_for_story(v_story.id);
    if v_recipient is not null then
      insert into public.notifications (
        recipient_user_id, kind, story_id, revision_id, story_title, story_slug
      )
      values (v_recipient, 'story_published', v_story.id, new.id, new.title, v_story.slug)
      on conflict (recipient_user_id, story_id) where kind = 'story_published'
      do update set
        revision_id = excluded.revision_id,
        story_title = excluded.story_title,
        story_slug = excluded.story_slug,
        created_at = now(),
        read_at = null;
    end if;
  end if;

  if old.revision_status = 'submitted' then
    update public.notifications
      set read_at = now()
      where revision_id = new.id
        and kind = 'story_submitted'
        and read_at is null;
  end if;

  return new;
end;
$$;
