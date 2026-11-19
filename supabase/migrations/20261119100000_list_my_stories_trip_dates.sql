-- My Stories: trip dates for sorting (2026-11-19).
--
-- list_my_stories() gains two trailing columns, `trip_start_date date` and
-- `trip_end_date date`, read from the same revision row `r` the card already
-- shows (current draft, else published). My Stories sorts by trip date /
-- year / month client-side over the rows it already loads.
--
-- Additive: callers that don't read the columns are unaffected. The return
-- type changes, so the function is dropped and re-created with its comment
-- and grants. Body otherwise byte-for-byte
-- 20261116110000_list_my_stories_media_ids.sql (same security definer,
-- search_path, auth.uid() ownership filter, revision selection, grants).

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
  country_slug text,
  media_ids uuid[],
  trip_start_date date, trip_end_date date
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
         co.slug,
         (
           select coalesce(
             array_agg(m.media_id order by m.is_cover desc, m.sort_order, m.id),
             '{}'::uuid[]
           )
           from public.story_revision_media m
           where m.revision_id = r.id
         ),
         r.trip_start_date, r.trip_end_date
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
  'The caller''s own stories (owner of a self_submitted story, or the linked contributor of an editorial_import), with the coalesced current-draft-or-published revision''s title, excerpt, tagged regions (with zh-CN names; a custom region label renders with a null zh-CN twin, 20261015), tags, and cover reference (the flagged cover, else the first image), plus the CURRENT DRAFT revision''s status (null when nothing is in flight) and the story''s total revision_count -- the same count delete_draft_story() itself requires to equal 1 before it will hard-delete a story, so the client can hide Delete for a story with prior review history instead of offering an action the RPC will always refuse. `tags` resolves a lookup tag''s name OR the contributor''s own typed label, exactly as list_published_stories() does. Returns NO storage path of any kind for the cover -- only cover_media_id and cover_alt_text; the signed URL is minted separately after an independent authorization check. country_slug (20261116): the story''s country, so My Stories can show only the country the contributor has chosen. media_ids (20261116): every image on that same revision, cover first then in the contributor''s order (the cover_media_id ordering) -- ids only, never a storage path; each is shown only through a signed URL minted after authorize_story_media_preview(). trip_start_date / trip_end_date (20261119): the same revision''s calendar dates (null when unset), so My Stories can sort by trip date.';

revoke execute on function public.list_my_stories() from public, anon, authenticated;
grant execute on function public.list_my_stories() to authenticated;
