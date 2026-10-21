-- Story links: free, Obsidian-style links between a contributor's own
-- stories, replacing the two-level main/sub-story hierarchy
-- (20261003051644_story_level_sub_stories.sql).
--
-- WHY. The owner decided (2026-10-13) that "one main story, one level of
-- sub stories" was too rigid -- contributors want to connect any of their
-- stories to any others, with no depth limit and no direction. The new
-- story map page (app/(contributor)/my-stories/map/) lets a contributor
-- drag their own stories' nodes around and drop one onto another to link
-- them.
--
-- What moves over unchanged from the old design, because the underlying
-- safety story is identical:
--   * a link may only be created between two stories owned by the SAME
--     contributor (never someone else's story);
--   * BOTH stories must already be PUBLISHED to create a link -- drafts
--     and in-review stories can't be linked, so nothing unreviewed ever
--     appears through a link (documented exception to Engineering Rule 11,
--     reworded in docs/content-governance.md, "Story links");
--   * unlinking is always allowed for the owner, no matter either story's
--     state, since removing a link can only ever reduce what's shown;
--   * public reads gate BOTH ends with _story_is_publicly_visible() every
--     time, so an archived/taken-down/consent-revoked story just drops out
--     of the other story's link list -- the link row itself stays;
--   * each change is logged (story.link.created / story.link.removed).
--
-- What's different: no hierarchy. Any number of links, any two of the
-- owner's own published stories, undirected (story_a_id < story_b_id makes
-- "A links to B" and "B links to A" the same row). No depth limit.
--
-- Error codes: WHV10 (self-link) and WHV11 (not found/not yours) are
-- reused with the same meaning as before -- a self-link and an
-- ownership/existence failure mean exactly the same thing under the new
-- model. WHV15 (not published) is reused the same way, now checked against
-- EITHER story rather than only the "sub" side. WHV12 (parent not
-- published -- subsumed by the symmetric WHV15 check), WHV13 (parent is
-- itself a sub story) and WHV14 (this story already has sub stories) are
-- retired outright: both were hierarchy-depth rules that have no meaning
-- once links are symmetric and unlimited. WHV16 is new: the pair is
-- already linked.

-- --------------------------------------------------------------------------
-- Carry over every existing main/sub link as a story_links row, before the
-- column it lives on is dropped. Canonical order (least/greatest) up
-- front, since the table's own check constraint will require it.
-- --------------------------------------------------------------------------
create table public.story_links (
  story_a_id uuid not null references public.stories (id) on delete cascade,
  story_b_id uuid not null references public.stories (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint story_links_pkey primary key (story_a_id, story_b_id),
  constraint story_links_order check (story_a_id < story_b_id),
  constraint story_links_not_self check (story_a_id <> story_b_id)
);

comment on table public.story_links is
  'Undirected link between two of the same contributor''s own PUBLISHED stories -- no hierarchy, no depth limit. Canonical order (story_a_id < story_b_id) makes each pair unique regardless of which side the owner dragged. No direct API grants for any role (like stories); every access goes through a SECURITY DEFINER function below. RLS is enabled with zero policies as a structural backstop only. Public reads of a link go through get_published_story_links(), which re-checks _story_is_publicly_visible() on BOTH ends every time, so an archived/taken-down/consent-revoked story drops out of the other story''s list without the link row itself being touched.';

-- Looking up a story's links means matching either column; the primary key
-- already covers story_a_id as a leading column, this covers story_b_id.
create index story_links_story_b_id_idx on public.story_links (story_b_id);

alter table public.story_links enable row level security;
-- Deliberately no policies: RLS enabled = deny-all if a grant is ever added
-- by mistake. The only intended path is the SECURITY DEFINER functions
-- below, all `set search_path = ''`, which bypass RLS as their owner.
revoke all on public.story_links from public, anon, authenticated;

insert into public.story_links (story_a_id, story_b_id, created_at)
select least(s.id, s.parent_story_id), greatest(s.id, s.parent_story_id), now()
from public.stories s
where s.parent_story_id is not null
on conflict do nothing;

-- --------------------------------------------------------------------------
-- Drop the old hierarchy: column, its constraint and index, then every
-- function that read or wrote it. Nothing else in the migrations folder
-- references parent_story_id, set_story_parent_story(),
-- get_story_parent_story(), list_parent_story_options(),
-- get_published_story_family() or _story_has_sub_stories() -- grepped the
-- whole supabase/migrations/ directory to confirm before writing this.
-- --------------------------------------------------------------------------
drop function public.get_published_story_family(text);
drop function public.list_parent_story_options(uuid);
drop function public.get_story_parent_story(uuid);
drop function public.set_story_parent_story(uuid, uuid);
drop function public._story_has_sub_stories(uuid);

alter table public.stories
  drop constraint stories_parent_story_not_self;
drop index public.stories_parent_story_id_idx;
alter table public.stories
  drop column parent_story_id;

-- --------------------------------------------------------------------------
-- link_stories(): the only writer that creates a link. Owner of BOTH
-- stories (same contributor), both published, not itself, not already
-- linked.
-- --------------------------------------------------------------------------
create or replace function public.link_stories(p_story_id uuid, p_other_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_other public.stories;
  v_a uuid;
  v_b uuid;
begin
  if p_other_id = p_story_id then
    raise exception 'A story cannot be linked to itself' using errcode = 'WHV10';
  end if;

  -- Ownership of BOTH stories first, so nobody can take locks on someone
  -- else's stories. contributor_id alone is a grouping key, not an auth
  -- check (see get_my_story_graph() below), so the other story gets the
  -- same _is_story_owner() test, with the same WHV11 so the two failures
  -- can't be told apart.
  if not coalesce(public._is_story_owner(p_story_id), false)
    or not coalesce(public._is_story_owner(p_other_id), false)
  then
    raise exception 'Only the story owner can link it' using errcode = 'WHV11';
  end if;

  -- Lock both rows in id order so two concurrent link attempts on the same
  -- pair (from either direction) queue instead of racing each other.
  perform 1 from public.stories
    where id in (p_story_id, p_other_id)
    order by id
    for update;

  select * into v_story from public.stories where id = p_story_id;
  select * into v_other from public.stories where id = p_other_id;

  -- One message for "no such story" and "not yours", so this can't be used
  -- to probe for other contributors' story ids.
  if not found or v_other.contributor_id <> v_story.contributor_id then
    raise exception 'Story not found' using errcode = 'WHV11';
  end if;

  if v_story.lifecycle_status <> 'published' or v_story.published_revision_id is null
    or v_other.lifecycle_status <> 'published' or v_other.published_revision_id is null
  then
    raise exception 'Only published stories can be linked' using errcode = 'WHV15';
  end if;

  v_a := least(p_story_id, p_other_id);
  v_b := greatest(p_story_id, p_other_id);

  if exists (select 1 from public.story_links where story_a_id = v_a and story_b_id = v_b) then
    raise exception 'These stories are already linked' using errcode = 'WHV16';
  end if;

  insert into public.story_links (story_a_id, story_b_id, created_by)
  values (v_a, v_b, auth.uid());
end;
$$;
comment on function public.link_stories(uuid, uuid) is
  'Owner only: links two of the caller''s own published stories (public immediately, no review). Refusals: WHV10 self-link, WHV11 not found/not yours, WHV15 one side is not published, WHV16 already linked.';

revoke execute on function public.link_stories(uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_stories(uuid, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- unlink_stories(): always allowed for the owner, regardless of either
-- story's current state -- removing a link only ever reduces what's shown.
-- Idempotent: unlinking an already-unlinked (or never-linked) pair is not
-- an error, same as clearing set_story_parent_story() used to be.
-- --------------------------------------------------------------------------
create or replace function public.unlink_stories(p_story_id uuid, p_other_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  if not coalesce(public._is_story_owner(p_story_id), false) then
    raise exception 'Only the story owner can unlink it' using errcode = 'WHV11';
  end if;

  v_a := least(p_story_id, p_other_id);
  v_b := greatest(p_story_id, p_other_id);

  perform 1 from public.story_links where story_a_id = v_a and story_b_id = v_b for update;

  delete from public.story_links where story_a_id = v_a and story_b_id = v_b;
end;
$$;
comment on function public.unlink_stories(uuid, uuid) is
  'Owner only: removes a link between two of the caller''s own stories, if one exists. Idempotent -- never fails for an already-unlinked pair. Refusal: WHV11 not yours.';

revoke execute on function public.unlink_stories(uuid, uuid) from public, anon, authenticated;
grant execute on function public.unlink_stories(uuid, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- get_my_story_graph(): the caller's own stories as graph nodes (every
-- lifecycle status, so the map can grey out anything not published) plus
-- their edges. Single row of two jsonb arrays, same shape convention as
-- get_published_story_family() used.
--
-- Ownership here MUST be the same source-kind-partitioned check
-- list_my_stories() uses (20260804092200_source_kind_partitioned_
-- authorization.sql's header explains why): a self_submitted story's only
-- authoritative owner is stories.owner_user_id, and an editorial_import
-- story's is the live contributors.linked_user_id -- never an OR across
-- both regardless of source_kind, and never contributor_id alone (which
-- isn't an auth check at all, just a grouping key).
-- --------------------------------------------------------------------------
create or replace function public.get_my_story_graph()
returns table (
  nodes jsonb,
  edges jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with my_stories as (
    select s.id, s.slug, s.lifecycle_status, s.published_revision_id, s.current_draft_revision_id
    from public.stories s
    left join public.contributors c on c.id = s.contributor_id
    where (s.source_kind = 'self_submitted' and s.owner_user_id = auth.uid())
       or (s.source_kind = 'editorial_import' and c.linked_user_id = auth.uid())
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'slug', m.slug,
        'title', coalesce(pr.title, dr.title),
        'lifecycleStatus', m.lifecycle_status,
        'linkable', m.lifecycle_status = 'published' and m.published_revision_id is not null
      ) order by coalesce(pr.title, dr.title, ''), m.id)
      from my_stories m
      left join public.story_revisions pr on pr.id = m.published_revision_id
      left join public.story_revisions dr on dr.id = m.current_draft_revision_id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'storyAId', l.story_a_id,
        'storyBId', l.story_b_id
      ) order by l.story_a_id, l.story_b_id)
      from public.story_links l
      where l.story_a_id in (select id from my_stories)
         or l.story_b_id in (select id from my_stories)
    ), '[]'::jsonb);
$$;
comment on function public.get_my_story_graph() is
  'Owner-scoped, same source-kind-partitioned ownership check as list_my_stories(): all of the caller''s own stories as nodes ({id,slug,title,lifecycleStatus,linkable}, title from the published revision else the current draft) and their story_links as edges ({storyAId,storyBId}).';

revoke execute on function public.get_my_story_graph() from public, anon, authenticated;
grant execute on function public.get_my_story_graph() to authenticated;

-- --------------------------------------------------------------------------
-- get_published_story_links(): the public read. Mirrors
-- get_published_story_family()'s gate exactly -- both ends of every link
-- pass _story_is_publicly_visible().
-- --------------------------------------------------------------------------
create or replace function public.get_published_story_links(p_story_id uuid)
returns table (
  slug text,
  title text,
  excerpt text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public._story_is_publicly_visible(p_story_id) then
    return;
  end if;

  return query
    select o.slug, orv.title, orv.excerpt
    from public.story_links l
    join public.stories o
      on o.id = (case when l.story_a_id = p_story_id then l.story_b_id else l.story_a_id end)
    join public.story_revisions orv on orv.id = o.published_revision_id
    where (l.story_a_id = p_story_id or l.story_b_id = p_story_id)
      and public._story_is_publicly_visible(o.id)
    order by o.published_at asc, o.id
    limit 50;
end;
$$;
comment on function public.get_published_story_links(uuid) is
  'Public: for a publicly visible story, up to 50 of its publicly visible linked stories ([{slug,title,excerpt}], oldest publication first). Both ends of every link pass _story_is_publicly_visible(), same gate as get_published_story(). No rows at all when p_story_id itself is not publicly visible.';

revoke execute on function public.get_published_story_links(uuid) from public, anon, authenticated;
grant execute on function public.get_published_story_links(uuid) to anon, authenticated;
