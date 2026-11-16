-- My Stories per country (2026-11-16).
--
-- list_my_stories() gains a trailing `country_slug` column -- the story's
-- own country (stories.country_id is NOT NULL, so the join never drops a
-- row). My Stories uses it to show only the stories of the country the
-- contributor has chosen in the top bar, the same separation the public
-- pages have. Adding a column is additive: callers that don't read it are
-- unaffected, so the deployed app keeps working.
--
-- The return type changes, so the function is dropped and re-created (a
-- DROP takes its comment and grants with it; both are re-applied). Body
-- otherwise byte-for-byte 20261015063409_custom_region_labels.sql.
--
-- Authorization is unchanged: rows are still only the caller's own
-- self-submitted stories or editorial imports linked to them, derived from
-- auth.uid() inside the function (Engineering Rule 2).

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
  revision_count integer,
  country_slug text
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
             'region_name', coalesce(reg.name, loc.custom_region_label),
             'region_name_zh_cn', reg.name_zh_cn,
             'destination_name', coalesce(dest.name, loc.custom_destination_label), 'destination_name_zh_cn', dest.name_zh_cn
           ) order by loc.sort_order), '[]'::jsonb)
           from public.story_revision_locations loc
           left join public.regions reg on reg.id = loc.region_id
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
           select count(*)::integer from public.story_revisions sr where sr.story_id = s.id
         ),
         co.slug
  from public.stories s
  join public.countries co on co.id = s.country_id
  left join public.contributors c on c.id = s.contributor_id
  left join public.story_revisions r on r.id = coalesce(s.current_draft_revision_id, s.published_revision_id)
  left join public.story_revisions dr on dr.id = s.current_draft_revision_id
  where (s.source_kind = 'self_submitted' and s.owner_user_id = auth.uid())
     or (s.source_kind = 'editorial_import' and c.linked_user_id = auth.uid())
  order by s.updated_at desc;
$$;
comment on function public.list_my_stories() is
  'The caller''s own stories (owner of a self_submitted story, or the linked contributor of an editorial_import), with the coalesced current-draft-or-published revision''s title, excerpt, tagged regions (with zh-CN names; a custom region label renders with a null zh-CN twin, 20261015), tags, and cover reference (the flagged cover, else the first image), plus the CURRENT DRAFT revision''s status (null when nothing is in flight) and the story''s total revision_count -- the same count delete_draft_story() itself requires to equal 1 before it will hard-delete a story, so the client can hide Delete for a story with prior review history instead of offering an action the RPC will always refuse. `tags` resolves a lookup tag''s name OR the contributor''s own typed label, exactly as list_published_stories() does. Returns NO storage path of any kind for the cover -- only cover_media_id and cover_alt_text; the signed URL is minted separately after an independent authorization check. country_slug (20261116): the story''s country, so My Stories can show only the country the contributor has chosen.';

revoke execute on function public.list_my_stories() from public, anon, authenticated;
grant execute on function public.list_my_stories() to authenticated;
