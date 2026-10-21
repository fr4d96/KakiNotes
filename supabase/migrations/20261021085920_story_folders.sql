-- Story folders: back to one level of hierarchy -- a story is either a
-- MAIN story (may have sub stories), a SUB story (filed under exactly one
-- main story), or neither. Replaces the free, undirected story_links design
-- (20261013004751_story_links.sql).
--
-- WHY. The owner decided (2026-10-21) that free Obsidian-style links, while
-- flexible, left "what belongs under what" ambiguous on a contributor's own
-- profile -- two stories could point at each other with no sense of which
-- one was primary. Folders restore the simple hierarchy of the very first
-- design (20261003051644_story_level_sub_stories.sql) but keep what was
-- learned since: the link lives on the STORY (not the revision), goes
-- public immediately without review (an unchanged, documented exception to
-- Engineering Rule 11, reworded in docs/content-governance.md), and only
-- ever involves two of the SAME owner's PUBLISHED stories.
--
-- Same rules every design here has shared:
--   * only the story's OWNER can file it -- ownership re-derived via
--     _is_story_owner() on BOTH stories (contributor_id alone is a grouping
--     key, never an auth check, see get_my_story_folders() below, which
--     mirrors list_my_stories()'s source-kind-partitioned ownership rule);
--   * both stories must be PUBLISHED to file one under the other;
--   * removing a story from its folder is always allowed for the owner,
--     whatever either story's state -- it can only ever reduce what's
--     shown;
--   * public reads gate BOTH ends with _story_is_publicly_visible() every
--     time, so an archived/taken-down/consent-revoked story simply drops
--     out, without parent_story_id itself changing;
--   * each change is logged by the caller (story.folder.set /
--     story.folder.cleared, app/(contributor)/my-stories/map/actions.ts).
--
-- One level only, enforced entirely inside set_story_parent(): a sub story
-- can't have sub stories of its own, and a story that already has sub
-- stories can't be filed under another main story. Re-filing a story under
-- a DIFFERENT main story is allowed in a single call -- no need to clear
-- first.
--
-- Error codes: WHV10 (self), WHV11 (not found/not yours) and WHV15 (not
-- published -- only enforced when SETTING a parent, never when clearing)
-- are reused with the same meaning every design has given them. WHV13
-- (parent is itself a sub story) and WHV14 (this story already has sub
-- stories) are restored from the original hierarchy -- they are exactly
-- the "one level only" checks this design needs again. WHV12 ("parent not
-- published", folded into WHV15 here) and WHV16 ("already linked", which
-- has no meaning for a single parent pointer) stay retired.

-- --------------------------------------------------------------------------
-- The column. on delete set null (not restrict, unlike the very first
-- design): deleting a main story should orphan its sub stories back into
-- "not in a folder", never block the delete.
-- --------------------------------------------------------------------------
alter table public.stories
  add column parent_story_id uuid references public.stories (id) on delete set null,
  add constraint stories_parent_story_not_self
    check (parent_story_id is null or parent_story_id <> id);

comment on column public.stories.parent_story_id is
  'The main story this story is filed under, or null. Same owner, both published when set, one level only (a sub story cannot itself have sub stories; a story with sub stories cannot be filed under another). Written only by set_story_parent(); public the moment it is set -- not moderated (documented exception to Engineering Rule 11, see this migration''s header and docs/content-governance.md). Public reads follow it only when both ends pass _story_is_publicly_visible().';

create index stories_parent_story_id_idx
  on public.stories (parent_story_id)
  where parent_story_id is not null;

-- --------------------------------------------------------------------------
-- Convert existing story_links rows into parent/child pairs before the
-- table and its functions are dropped.
--
-- For each link, the end with MORE total links (counting every link that
-- end appears in, not just this one) becomes the parent; a tie goes to the
-- end with the earlier published_at, then the lower id. A child is only
-- actually filed if the result is one-level-valid AT THE TIME this link is
-- processed: the would-be child currently has no children of its own, and
-- the would-be parent currently has no parent of its own. Links that would
-- break that are simply skipped -- this is a best-effort carry-over, not a
-- guarantee every old link survives as a folder.
-- --------------------------------------------------------------------------
do $$
declare
  v_link record;
  v_parent uuid;
  v_child uuid;
begin
  for v_link in
    select
      l.story_a_id,
      l.story_b_id,
      (
        select count(*) from public.story_links x
        where x.story_a_id = l.story_a_id or x.story_b_id = l.story_a_id
      ) as a_degree,
      (
        select count(*) from public.story_links x
        where x.story_a_id = l.story_b_id or x.story_b_id = l.story_b_id
      ) as b_degree
    from public.story_links l
    order by l.story_a_id, l.story_b_id
  loop
    if v_link.a_degree > v_link.b_degree then
      v_parent := v_link.story_a_id;
      v_child := v_link.story_b_id;
    elsif v_link.b_degree > v_link.a_degree then
      v_parent := v_link.story_b_id;
      v_child := v_link.story_a_id;
    else
      -- Tie: earlier published_at wins as parent, then lower id.
      select id into v_parent
      from public.stories
      where id in (v_link.story_a_id, v_link.story_b_id)
      order by published_at asc nulls last, id asc
      limit 1;
      v_child := case
        when v_parent = v_link.story_a_id then v_link.story_b_id
        else v_link.story_a_id
      end;
    end if;

    if not exists (select 1 from public.stories where parent_story_id = v_child)
      and not exists (
        select 1 from public.stories
        where id = v_parent and parent_story_id is not null
      )
    then
      update public.stories set parent_story_id = v_parent where id = v_child;
    end if;
  end loop;
end;
$$;

-- --------------------------------------------------------------------------
-- Drop the free-link design: table, its 4 functions. Nothing else in
-- supabase/migrations/ references story_links, link_stories(),
-- unlink_stories(), get_my_story_graph() or get_published_story_links() --
-- grepped the whole directory to confirm before writing this.
-- --------------------------------------------------------------------------
drop function public.get_published_story_links(uuid);
drop function public.get_my_story_graph();
drop function public.unlink_stories(uuid, uuid);
drop function public.link_stories(uuid, uuid);
drop table public.story_links;

-- --------------------------------------------------------------------------
-- set_story_parent(): the only writer. Null p_parent_id removes the story
-- from its folder.
-- --------------------------------------------------------------------------
create or replace function public.set_story_parent(p_story_id uuid, p_parent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
  v_parent public.stories;
begin
  if p_parent_id is not null and p_parent_id = p_story_id then
    raise exception 'A story cannot be filed under itself' using errcode = 'WHV10';
  end if;

  -- Ownership of the story being filed first, so nobody can take a lock on
  -- someone else's story. One message for "no such story" and "not yours".
  if not coalesce(public._is_story_owner(p_story_id), false) then
    raise exception 'Story not found' using errcode = 'WHV11';
  end if;

  if p_parent_id is null then
    update public.stories set parent_story_id = null where id = p_story_id;
    return;
  end if;

  if not coalesce(public._is_story_owner(p_parent_id), false) then
    raise exception 'Story not found' using errcode = 'WHV11';
  end if;

  -- Lock both rows in id order so two concurrent filings on the same pair
  -- (from either direction) queue instead of racing each other.
  perform 1 from public.stories
    where id in (p_story_id, p_parent_id)
    order by id
    for update;

  select * into v_story from public.stories where id = p_story_id;
  if not found then
    raise exception 'Story not found' using errcode = 'WHV11';
  end if;

  select * into v_parent from public.stories where id = p_parent_id;
  if not found then
    raise exception 'Story not found' using errcode = 'WHV11';
  end if;

  if v_story.lifecycle_status <> 'published' or v_story.published_revision_id is null
    or v_parent.lifecycle_status <> 'published' or v_parent.published_revision_id is null
  then
    raise exception 'Only published stories can be filed into a folder' using errcode = 'WHV15';
  end if;

  if v_parent.parent_story_id is not null then
    raise exception 'That story is itself a sub story' using errcode = 'WHV13';
  end if;

  if exists (select 1 from public.stories where parent_story_id = p_story_id) then
    raise exception 'This story already has sub stories, so it cannot be filed into a folder' using errcode = 'WHV14';
  end if;

  -- No version bump on purpose, same as every earlier design: the folder
  -- link is not draft content, and bumping stories.version would make an
  -- open editor tab's next save fail as stale.
  update public.stories set parent_story_id = p_parent_id where id = p_story_id;
end;
$$;
comment on function public.set_story_parent(uuid, uuid) is
  'Owner only: files a published story under another of their published stories (public immediately, no review), or removes it from its folder with null. Refusals: WHV10 itself, WHV11 not found/not yours, WHV13 the target is itself a sub story, WHV14 this story already has sub stories, WHV15 either side is not published (checked only when setting).';

revoke execute on function public.set_story_parent(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_story_parent(uuid, uuid) to authenticated;

-- --------------------------------------------------------------------------
-- get_my_story_folders(): the caller's own stories (every lifecycle status,
-- so the folder view can grey out anything not published), with their
-- current parent. Same source-kind-partitioned ownership check
-- list_my_stories() and the old get_my_story_graph() used -- see that
-- function's header (20260804092200_source_kind_partitioned_authorization.sql)
-- for why contributor_id alone is never enough.
-- --------------------------------------------------------------------------
create or replace function public.get_my_story_folders()
returns table (
  id uuid,
  slug text,
  title text,
  lifecycle_status text,
  linkable boolean,
  parent_story_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    s.slug,
    coalesce(pr.title, dr.title),
    s.lifecycle_status,
    s.lifecycle_status = 'published' and s.published_revision_id is not null,
    s.parent_story_id
  from public.stories s
  left join public.contributors c on c.id = s.contributor_id
  left join public.story_revisions pr on pr.id = s.published_revision_id
  left join public.story_revisions dr on dr.id = s.current_draft_revision_id
  where (s.source_kind = 'self_submitted' and s.owner_user_id = auth.uid())
     or (s.source_kind = 'editorial_import' and c.linked_user_id = auth.uid())
  order by coalesce(pr.title, dr.title, ''), s.id;
$$;
comment on function public.get_my_story_folders() is
  'Owner-scoped, same source-kind-partitioned ownership check as list_my_stories(): all of the caller''s own stories ({id,slug,title,lifecycle_status,linkable,parent_story_id}, title from the published revision else the current draft, linkable true only when published).';

revoke execute on function public.get_my_story_folders() from public, anon, authenticated;
grant execute on function public.get_my_story_folders() to authenticated;

-- --------------------------------------------------------------------------
-- get_published_story_family(): the public read. Mirrors the very first
-- design's get_published_story_family(text) exactly, keyed by story id
-- instead of slug, and following stories.parent_story_id again.
-- --------------------------------------------------------------------------
create or replace function public.get_published_story_family(p_story_id uuid)
returns table (
  parent jsonb,
  sub_stories jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_story public.stories;
begin
  select st.* into v_story from public.stories st where st.id = p_story_id;
  if not found or not public._story_is_publicly_visible(p_story_id) then
    return;
  end if;

  return query
    select
      (
        select jsonb_build_object('slug', p.slug, 'title', pr.title, 'excerpt', pr.excerpt)
        from public.stories p
        join public.story_revisions pr on pr.id = p.published_revision_id
        where p.id = v_story.parent_story_id
          and p.id <> v_story.id
          and public._story_is_publicly_visible(p.id)
      ),
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'slug', c.slug,
          'title', cr.title,
          'excerpt', cr.excerpt
        ) order by c.published_at asc, c.id), '[]'::jsonb)
        from (
          select c0.*
          from public.stories c0
          where c0.parent_story_id = v_story.id
            and c0.id <> v_story.id
            and public._story_is_publicly_visible(c0.id)
          order by c0.published_at asc, c0.id
          limit 50
        ) c
        join public.story_revisions cr on cr.id = c.published_revision_id
      );
end;
$$;
comment on function public.get_published_story_family(uuid) is
  'Public: for a publicly visible story, its publicly visible main story ({slug,title,excerpt} or null) and up to 50 publicly visible sub stories ([{slug,title,excerpt}], oldest publication first), following stories.parent_story_id. Both ends of every link pass _story_is_publicly_visible(). No row at all when p_story_id itself is not publicly visible.';

revoke execute on function public.get_published_story_family(uuid) from public, anon, authenticated;
grant execute on function public.get_published_story_family(uuid) to anon, authenticated;
