-- Stored card sizes for Drive photos (docs/photo-card-sizes-plan.md, Option B).
--
-- /media/<id>?w=640|1080 used to download the whole display photo from the
-- contributor's Drive and resize it with sharp on every CDN miss (the biggest
-- share of function CPU). Each Drive photo now also gets two small, fixed
-- 4:3 WebP copies in the story folder's "Card sizes" subfolder, made from the
-- already EXIF-stripped display derivative (never the raw upload). This
-- table records them; the proxy serves them instead of resizing, and falls
-- back to resizing whenever a row is missing.
--
-- Engineering Rule 14 wording changed with this migration (owner-approved
-- 2026-11-27): the display derivative plus its two card-size copies are the
-- only files written for public use. Rule 13 is unchanged: the proxy route's
-- authorization (get_drive_media_for_proxy, CALLED below, never copied) is
-- still the only path to the bytes.

-- ---------------------------------------------------------------------------
-- 1. Table: RLS on, no policies, no direct grants
-- ---------------------------------------------------------------------------

create table public.story_media_card_sizes (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.story_media (id) on delete cascade,
  width integer not null check (width in (640, 1080)),
  drive_file_id text not null,
  source_drive_file_id text not null,
  sha256 text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (media_id, width)
);

comment on table public.story_media_card_sizes is
  'Stored 640/1080-wide 4:3 WebP card copies of a Drive photo, made from its stripped display derivative. source_drive_file_id is the display file they were made from: a row only counts while it equals story_media.drive_processed_file_id. Reachable only through get_drive_card_for_proxy() and record_drive_card_size().';

alter table public.story_media_card_sizes enable row level security;
-- Deliberately NO policies: with RLS on, anon/authenticated see nothing even
-- if a grant slipped in. The revoke makes that explicit too.
revoke all on table public.story_media_card_sizes from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Proxy lookup: the existing authorization, plus the stored card if any
-- ---------------------------------------------------------------------------
--
-- SELECTs FROM get_drive_media_for_proxy(): zero rows there (unknown id,
-- supabase backend, draft/in review/takedown the caller may not see, ...)
-- means zero rows here, so the route's 404 is unchanged for every state. The
-- left join only ever adds card columns (null when there is no usable copy).

create or replace function public.get_drive_card_for_proxy(p_media_id uuid, p_width integer)
returns table (
  media_id uuid,
  drive_processed_file_id text,
  processed_mime_type text,
  owner_user_id uuid,
  is_published boolean,
  story_id uuid,
  card_drive_file_id text,
  card_sha256 text,
  card_file_size_bytes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.media_id,
         p.drive_processed_file_id,
         p.processed_mime_type,
         p.owner_user_id,
         p.is_published,
         m.story_id,
         c.drive_file_id,
         c.sha256,
         c.file_size_bytes
  from public.get_drive_media_for_proxy(p_media_id) p
  join public.story_media m on m.id = p.media_id
  left join public.story_media_card_sizes c
    on c.media_id = p.media_id
   and c.width = p_width
   and c.source_drive_file_id = p.drive_processed_file_id;
$$;

comment on function public.get_drive_card_for_proxy(uuid, integer) is
  'get_drive_media_for_proxy() plus the stored card-size copy for p_width (card_* columns null when none, or when it was made from a since-replaced display file). Same authorization and zero-row behaviour as get_drive_media_for_proxy(), which it calls. Used by app/media/[mediaId]/route.ts for ?w=.';

revoke execute on function public.get_drive_card_for_proxy(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_drive_card_for_proxy(uuid, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Record a card size (the story's own self-submitted owner)
-- ---------------------------------------------------------------------------

create or replace function public.record_drive_card_size(
  p_media_id uuid,
  p_width integer,
  p_drive_file_id text,
  p_source_drive_file_id text,
  p_sha256 text,
  p_file_size_bytes bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.story_media;
begin
  select * into v_media from public.story_media where id = p_media_id for update;
  if not found then
    raise exception 'No such media: %', p_media_id;
  end if;
  if not public._is_self_submitted_story_owner(v_media.story_id) then
    raise exception 'Not authorized to record a card size for media %', p_media_id;
  end if;
  if v_media.storage_backend <> 'google_drive' or v_media.drive_processed_file_id is null then
    raise exception 'Media % has no Drive display copy', p_media_id;
  end if;
  if p_source_drive_file_id is distinct from v_media.drive_processed_file_id then
    raise exception 'Card size for media % was made from a file that is not its current display copy', p_media_id;
  end if;
  if p_width not in (640, 1080) then
    raise exception 'Unsupported card width: %', p_width;
  end if;

  insert into public.story_media_card_sizes
    (media_id, width, drive_file_id, source_drive_file_id, sha256, file_size_bytes)
  values
    (p_media_id, p_width, p_drive_file_id, p_source_drive_file_id, p_sha256, p_file_size_bytes)
  on conflict (media_id, width) do update
    set drive_file_id = excluded.drive_file_id,
        source_drive_file_id = excluded.source_drive_file_id,
        sha256 = excluded.sha256,
        file_size_bytes = excluded.file_size_bytes,
        updated_at = now();
end;
$$;

comment on function public.record_drive_card_size(uuid, integer, text, text, text, bigint) is
  'Records a card-size copy lib/story/drive-sync.ts wrote to the contributor''s Drive. Only the story''s own self-submitted owner (same check as record_drive_media_full_copy), only on a Drive row with its display copy, and only for a source file id that is that display copy right now.';

revoke execute on function public.record_drive_card_size(uuid, integer, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.record_drive_card_size(uuid, integer, text, text, text, bigint) to authenticated;
