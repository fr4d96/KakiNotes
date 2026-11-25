-- Moderation queue cards: the country and cover photo of each queue row.
--
-- The queue (get_moderation_queue) predates both the country sections and
-- the photo-first redesign, so a moderator could see neither which country a
-- story belongs to nor what it looks like without opening it.
--
-- A separate, additive function rather than two new columns on
-- get_moderation_queue(): changing that function's return type means
-- DROP + CREATE on the project that also serves the live site, for a purely
-- decorative read. The app treats a missing function as "no cards" and draws
-- the queue without them, so this can land before or after the code.
--
-- Path-free, like every other moderator read: it returns a media ID. The
-- photo itself still needs authorize_story_media_preview() per image, which
-- decides on its own whether this moderator may see it (Engineering Rule 13).

create function public.get_moderation_queue_cards(p_revision_ids uuid[])
returns table (
  revision_id uuid,
  country_slug text,
  currency text,
  cover_media_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Only a moderator or admin can read the moderation queue';
  end if;
  -- get_moderation_queue() never returns more than 50 rows.
  if coalesce(cardinality(p_revision_ids), 0) > 50 then
    raise exception 'Too many revisions requested';
  end if;

  return query
    select
      r.id,
      c.slug,
      r.currency::text,
      (
        select rm.media_id
        from public.story_revision_media rm
        join public.story_media m on m.id = rm.media_id
        where rm.revision_id = r.id
          and m.processing_state in ('processed', 'promotion_pending', 'promoted')
        order by rm.is_cover desc, rm.sort_order asc, rm.media_id asc
        limit 1
      )
    from public.story_revisions r
    join public.stories s on s.id = r.story_id
    left join public.countries c on c.id = s.country_id
    where r.id = any (p_revision_ids)
      -- Same rows the queue itself can list: what is waiting, or what has
      -- already been decided. Never a contributor's unsubmitted draft.
      and (
        r.revision_status = 'submitted'
        or exists (select 1 from public.moderation_actions a where a.revision_id = r.id)
      );
end;
$$;

comment on function public.get_moderation_queue_cards(uuid[]) is
  'Moderator/admin only. Country slug, currency and a path-free cover media id for up to 50 queue rows (submitted or already-decided revisions only). Each photo is still authorized separately by authorize_story_media_preview().';

revoke execute on function public.get_moderation_queue_cards(uuid[]) from public, anon, authenticated;
grant execute on function public.get_moderation_queue_cards(uuid[]) to authenticated;
