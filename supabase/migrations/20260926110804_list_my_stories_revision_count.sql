-- Bug fix: My Stories offered "Delete" on drafts that delete_draft_story()
-- was always going to refuse. The RPC's real rule (supabase/migrations/
-- 20260907100100_private_stories.sql) requires the story have had EXACTLY
-- ONE story_revisions row, ever -- a story that was submitted and then
-- rejected/withdrawn/sent back for changes and is now editable again as a
-- plain draft has TWO OR MORE (a fresh revision is created for the retry;
-- the old one is immutable once it leaves 'draft', per
-- story_revisions_protect_immutable_content()). The Delete button's own
-- client-side gate (storyStatusFlags in my-stories-view.tsx) only checked
-- lifecycle_status and published_revision_id, which that story satisfies —
-- so Delete showed, and confirming it always failed with "... has prior
-- reviewed revision history and cannot be deleted this way", with no way
-- for the contributor to have known why.
--
-- Fix: list_my_stories() gains ONE new trailing column, `revision_count`,
-- so the client can gate Delete on the exact same fact the RPC itself
-- checks, instead of a looser approximation of it. my-stories-view.tsx's
-- `deletable` now also requires `revision_count === 1`.
--
-- Every existing column, the WHERE clause, the ordering, the grants and
-- the security settings are unchanged -- the body below is the live
-- definition from 20260907110000_list_my_stories_tags.sql with one
-- subquery added, extracted from that file rather than retyped.
--
-- No RLS or grant change: this function is already security definer and
-- already scoped to the caller's own stories; the added subquery reads
-- story_revisions filtered to `story_id = s.id`, the same table this
-- function's `r`/`dr` joins already read from.
--
-- Return row shape changes (one new OUT column), so DROP first — same as
-- every previous list_my_stories() change.
drop function if exists public.list_my_stories();

create function public.list_my_stories()
returns table (
  id uuid, slug text, source_kind public.story_source_kind, visibility public.story_visibility,
  lifecycle_status public.story_lifecycle_status, current_draft_revision_id uuid,
  published_revision_id uuid, version integer, submitted_at timestamptz, published_at timestamptz,
  archived_at timestamptz, created_at timestamptz, updated_at timestamptz,
  title text, excerpt text, regions jsonb,
  cover_media_id uuid, cover_alt_text text,
  draft_revision_status public.story_revision_status,
  tags jsonb,
  revision_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.slug, s.source_kind, s.visibility, s.lifecycle_status, s.current_draft_revision_id,
         s.published_revision_id, s.version, s.submitted_at, s.published_at, s.archived_at,
         s.created_at, s.updated_at, r.title, r.excerpt,
         (
           select coalesce(jsonb_agg(jsonb_build_object(
             'region_name', reg.name, 'region_name_zh_cn', reg.name_zh_cn,
             'destination_name', dest.name, 'destination_name_zh_cn', dest.name_zh_cn
           ) order by loc.sort_order), '[]'::jsonb)
           from public.story_revision_locations loc
           join public.regions reg on reg.id = loc.region_id
           left join public.destinations dest on dest.id = loc.destination_id
           where loc.revision_id = r.id
         ),
         (
           select cover.media_id
           from public.story_revision_media cover
           where cover.revision_id = r.id
           order by cover.is_cover desc, cover.sort_order, cover.id
           limit 1
         ),
         (
           select cover.alt_text
           from public.story_revision_media cover
           where cover.revision_id = r.id
           order by cover.is_cover desc, cover.sort_order, cover.id
           limit 1
         ),
         dr.revision_status,
         (
           select coalesce(jsonb_agg(coalesce(t.name, srt.custom_label)), '[]'::jsonb)
           from public.story_revision_tags srt
           left join public.tags t on t.id = srt.tag_id
           where srt.revision_id = r.id
         ),
         (
           -- Matches delete_draft_story()'s own
           -- `select count(*) from story_revisions where story_id = ...`
           -- exactly (20260907100100_private_stories.sql) -- this is what
           -- "has prior reviewed revision history" actually means: more
           -- than one revision has ever existed for this story.
           select count(*)::integer from public.story_revisions sr where sr.story_id = s.id
         )
  from public.stories s
  left join public.contributors c on c.id = s.contributor_id
  left join public.story_revisions r on r.id = coalesce(s.current_draft_revision_id, s.published_revision_id)
  left join public.story_revisions dr on dr.id = s.current_draft_revision_id
  where (s.source_kind = 'self_submitted' and s.owner_user_id = auth.uid())
     or (s.source_kind = 'editorial_import' and c.linked_user_id = auth.uid())
  order by s.updated_at desc;
$$;

comment on function public.list_my_stories() is
  'The caller''s own stories (owner of a self_submitted story, or the linked contributor of an editorial_import), with the coalesced current-draft-or-published revision''s title, excerpt, tagged regions (with zh-CN names), tags, and cover reference (the flagged cover, else the first image), plus the CURRENT DRAFT revision''s status (null when nothing is in flight) and the story''s total revision_count (20260926110804) -- the same count delete_draft_story() itself requires to equal 1 before it will hard-delete a story, so the client can hide Delete for a story with prior review history instead of offering an action the RPC will always refuse. `tags` resolves a lookup tag''s name OR the contributor''s own typed label, exactly as list_published_stories() does. Returns NO storage path of any kind for the cover -- only cover_media_id and cover_alt_text; the signed URL is minted separately after an independent authorization check.';

revoke execute on function public.list_my_stories() from public, anon, authenticated;
grant execute on function public.list_my_stories() to authenticated;
