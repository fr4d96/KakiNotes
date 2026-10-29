-- Move existing photos to Google Drive (docs/google-drive-integration.md
-- section 9, Supabase -> Drive direction only; Drive -> Supabase is a later
-- slice). A contributor presses one button on Account -> Google Drive, and
-- the browser moves their photos one at a time (one Server Action call per
-- photo) through the RPCs below, showing progress as it goes.
--
-- Per photo: copy the processed derivative to Drive -> verify its sha256
-- -> flip story_media to google_drive in ONE transaction (snapshotting the
-- old Supabase paths onto the job row) -> delete the old Supabase objects.
-- The delete is immediate for a photo that was never published, and waits
-- at least 5 minutes for one that has a public-bucket copy (the window a
-- cached page may still reference the old public URL -- Rule 11: a
-- published image is never broken mid-move). Those waiting deletes run on
-- the contributor's next press of the button.
--
-- Scope matches get_story_media_upload_mode(): only self_submitted stories,
-- only their own owner. Editorial imports stay on Supabase.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table public.story_media_move_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  direction text not null default 'to_google_drive'
    check (direction in ('to_google_drive')),
  status text not null default 'running'
    check (status in ('running', 'finished', 'abandoned')),
  last_activity_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.story_media_move_runs is
  'One row per press of "Move my photos to Drive". At most one running run per user (Decision 13: one heavy job per contributor at a time). A run whose browser tab went away is treated as abandoned once last_activity_at is 2+ minutes old. Server-only: no anon/authenticated access; read/written only via the SECURITY DEFINER RPCs in this migration.';

-- Decision 13, enforced by the database rather than by a read-then-insert
-- race: two tabs pressing the button at once cannot both get a run.
create unique index story_media_move_runs_one_running_per_user
  on public.story_media_move_runs (user_id)
  where status = 'running';

create trigger story_media_move_runs_set_updated_at
  before update on public.story_media_move_runs
  for each row
  execute function public.set_updated_at();

create table public.story_media_move_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.story_media_move_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  media_id uuid not null references public.story_media (id) on delete cascade,
  story_id uuid not null references public.stories (id) on delete cascade,
  direction text not null default 'to_google_drive'
    check (direction in ('to_google_drive')),
  status text not null default 'pending'
    check (status in ('pending', 'copied', 'switched', 'old_deleted', 'failed')),
  new_drive_file_id text,
  new_drive_folder_id text,
  old_private_storage_path text,
  old_processed_private_storage_path text,
  old_public_storage_path text,
  error_code text,
  switched_at timestamptz,
  old_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_media_move_jobs_one_per_run unique (run_id, media_id),
  constraint story_media_move_jobs_copied_has_file check (
    status not in ('copied', 'switched', 'old_deleted')
    or (new_drive_file_id is not null and new_drive_folder_id is not null)
  ),
  constraint story_media_move_jobs_switched_has_time check (
    (switched_at is not null) = (status in ('switched', 'old_deleted'))
  ),
  constraint story_media_move_jobs_failed_has_code check (
    (error_code is not null) = (status = 'failed')
  )
);

comment on table public.story_media_move_jobs is
  'One row per photo per move run -- the resumable state of docs/google-drive-integration.md section 9. pending -> copied (Drive file written, id recorded so a crash can clean it up) -> switched (story_media flipped; the old Supabase paths are snapshotted HERE, since story_media must null them) -> old_deleted. Any pre-switch step can end in failed (photo stays fully on Supabase). Internal operational record (Decision 14): contributors only ever see per-photo "could not move" results, never this table. Server-only: no anon/authenticated access.';

-- A photo is never mid-move in two jobs at once.
create unique index story_media_move_jobs_one_active_per_media
  on public.story_media_move_jobs (media_id)
  where status in ('pending', 'copied');

create index story_media_move_jobs_cleanup_idx
  on public.story_media_move_jobs (user_id, switched_at)
  where status = 'switched';

create trigger story_media_move_jobs_set_updated_at
  before update on public.story_media_move_jobs
  for each row
  execute function public.set_updated_at();

alter table public.story_media_move_runs enable row level security;
alter table public.story_media_move_jobs enable row level security;
-- No policies on purpose (deny-all), same as contributor_drive_connections
-- and story_drive_folders.
revoke all on public.story_media_move_runs from public, anon, authenticated;
revoke all on public.story_media_move_jobs from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Transition trigger: one narrow exception for the move flip
-- ---------------------------------------------------------------------------
--
-- Body identical to 20261007063355's definition (diffed against the live dev
-- database before this migration) except for the new `if` at the top of the
-- promoted branch. A promoted row's values stay immutable (Rule 11) EXCEPT
-- the one change switch_story_media_to_drive() makes: supabase -> google_drive
-- with every byte-describing column (mime, size, dimensions, sha256)
-- unchanged, Supabase paths cleared and Drive ids newly set. Gated on a
-- transaction-local setting only that function sets, so no other code path
-- can use the exception even by writing the same columns.

create or replace function public.story_media_validate_processing_state_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.processing_state = new.processing_state then
    if old.processing_state = 'promoted' then
      if coalesce(current_setting('kakinotes.media_move', true), '') = 'on'
        and old.storage_backend = 'supabase'
        and new.storage_backend = 'google_drive'
        and new.processed_mime_type is not distinct from old.processed_mime_type
        and new.processed_file_size_bytes is not distinct from old.processed_file_size_bytes
        and new.processed_width is not distinct from old.processed_width
        and new.processed_height is not distinct from old.processed_height
        and new.sha256 is not distinct from old.sha256
        and new.approved_public_storage_path is null
        and new.processed_private_storage_path is null
        and old.drive_processed_file_id is null
        and old.drive_folder_id is null
        and new.drive_processed_file_id is not null
        and new.drive_folder_id is not null
      then
        return new;
      end if;
      if new.approved_public_storage_path is distinct from old.approved_public_storage_path
        or new.processed_private_storage_path is distinct from old.processed_private_storage_path
        or new.processed_mime_type is distinct from old.processed_mime_type
        or new.processed_file_size_bytes is distinct from old.processed_file_size_bytes
        or new.processed_width is distinct from old.processed_width
        or new.processed_height is distinct from old.processed_height
        or new.sha256 is distinct from old.sha256
        or new.drive_processed_file_id is distinct from old.drive_processed_file_id
        or new.drive_folder_id is distinct from old.drive_folder_id
      then
        raise exception 'story_media % is promoted and its recorded values are immutable', old.id;
      end if;
    end if;
    return new;
  end if;

  if not (
    (old.processing_state = 'pending_upload' and new.processing_state = 'uploaded')
    or (old.processing_state = 'uploaded' and new.processing_state = 'processing')
    or (old.processing_state = 'processing' and new.processing_state in ('processed', 'failed'))
    or (old.processing_state = 'failed' and new.processing_state = 'processing')
    or (old.processing_state = 'processed' and new.processing_state = 'promotion_pending')
    or (old.processing_state = 'promotion_pending' and new.processing_state in ('processed', 'promoted'))
    or (old.processing_state = 'processed' and new.processing_state = 'promoted'
        and old.storage_backend = 'google_drive')
  ) then
    raise exception 'story_media % cannot transition from % to %', old.id, old.processing_state, new.processing_state;
  end if;

  return new;
end;
$$;

comment on function public.story_media_validate_processing_state_transition() is
  'Explicit state-machine guard. Supabase rows: pending_upload -> uploaded -> processing -> processed|failed -> promotion_pending -> promoted. Google Drive rows additionally allow processed -> promoted. A promoted row''s recorded values are immutable (Rule 11), with ONE exception: switch_story_media_to_drive() (gated by the transaction-local kakinotes.media_move setting) may move a promoted supabase row to google_drive with identical bytes (same mime/size/dimensions/sha256).';

-- ---------------------------------------------------------------------------
-- 3. Internal helpers
-- ---------------------------------------------------------------------------

-- Which of the caller's photos the move tool may move. Ready photos only
-- (processed/promoted) plus promotion_pending, which is claimed only to be
-- reported as "being published right now, try again later". Only photos
-- attached to at least one revision -- a reservation that was never
-- attached is not a photo anyone can see.
create or replace function public._my_drive_move_candidates()
returns table (media_id uuid, story_id uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.story_id, m.created_at
  from public.story_media m
  join public.stories s on s.id = m.story_id
  where s.source_kind = 'self_submitted'
    and s.owner_user_id = auth.uid()
    and m.storage_backend = 'supabase'
    and m.deleted_at is null
    and m.processing_state in ('processed', 'promotion_pending', 'promoted')
    and exists (
      select 1 from public.story_revision_media rm where rm.media_id = m.id
    );
$$;

revoke execute on function public._my_drive_move_candidates() from public, anon, authenticated;

create or replace function public._has_active_drive_connection()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contributor_drive_connections
    where user_id = auth.uid() and status = 'active'
  );
$$;

revoke execute on function public._has_active_drive_connection() from public, anon, authenticated;

-- Locks and returns the caller's own running run, bumping its activity
-- clock. Raises when the run is not the caller's or is no longer running.
create or replace function public._touch_my_drive_move_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.story_media_move_runs
    set last_activity_at = now()
    where id = p_run_id and user_id = auth.uid() and status = 'running';
  if not found then
    raise exception 'move_run_not_active';
  end if;
end;
$$;

revoke execute on function public._touch_my_drive_move_run(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPCs for the contributor (authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.get_my_drive_move_summary()
returns table (
  movable_count integer,
  cleanup_pending_count integer,
  run_in_progress boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public._my_drive_move_candidates()),
    (select count(*)::integer from public.story_media_move_jobs j
      where j.user_id = auth.uid() and j.status = 'switched'),
    exists (
      select 1 from public.story_media_move_runs r
      where r.user_id = auth.uid() and r.status = 'running'
        and r.last_activity_at >= now() - interval '2 minutes'
    );
$$;

comment on function public.get_my_drive_move_summary() is
  'For the Account -> Google Drive tab: how many of the caller''s photos could move to Drive, how many already-moved photos still have an old Supabase copy waiting to be deleted, and whether a move is running in another tab.';

revoke execute on function public.get_my_drive_move_summary() from public, anon, authenticated;
grant execute on function public.get_my_drive_move_summary() to authenticated;

create or replace function public.begin_drive_move_run()
returns table (run_id uuid, total integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not public._has_active_drive_connection() then
    raise exception 'drive_not_connected';
  end if;

  -- A run whose tab went away stops blocking after 2 minutes of silence.
  update public.story_media_move_runs
    set status = 'abandoned', finished_at = now()
    where user_id = auth.uid() and status = 'running'
      and last_activity_at < now() - interval '2 minutes';

  begin
    insert into public.story_media_move_runs (user_id)
      values (auth.uid())
      returning id into v_run_id;
  exception when unique_violation then
    raise exception 'move_already_running';
  end;

  return query
    select v_run_id, (select count(*)::integer from public._my_drive_move_candidates());
end;
$$;

comment on function public.begin_drive_move_run() is
  'Starts a "move my photos to Drive" run for the caller. Requires an active Drive connection. Raises move_already_running when another run of theirs is active (Decision 13); a run idle for 2+ minutes is abandoned first.';

revoke execute on function public.begin_drive_move_run() from public, anon, authenticated;
grant execute on function public.begin_drive_move_run() to authenticated;

create or replace function public.claim_next_drive_move(p_run_id uuid)
returns table (
  job_id uuid,
  media_id uuid,
  story_id uuid,
  story_title text,
  job_status text,
  error_code text,
  sha256 text,
  processed_mime_type text,
  processed_file_size_bytes bigint,
  stale_drive_file_ids text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_media public.story_media;
  v_stale text[];
  v_job_id uuid;
  v_status text;
  v_error text;
  v_title text;
begin
  perform public._touch_my_drive_move_run(p_run_id);
  if not public._has_active_drive_connection() then
    raise exception 'drive_not_connected';
  end if;

  select m.* into v_media
  from public.story_media m
  where m.id in (
    select c.media_id from public._my_drive_move_candidates() c
    where not exists (
      select 1 from public.story_media_move_jobs j
      where j.run_id = p_run_id and j.media_id = c.media_id
    )
  )
  order by m.story_id, m.created_at, m.id
  limit 1
  for update of m skip locked;

  if not found then
    return;
  end if;

  -- An earlier run that died mid-move may have left a Drive file nothing
  -- points at. Hand its id back so the caller can delete it, and close
  -- that job out; the photo itself is still fully on Supabase.
  with closed as (
    update public.story_media_move_jobs j
      set status = 'failed', error_code = 'abandoned'
      where j.media_id = v_media.id and j.status in ('pending', 'copied')
      returning j.new_drive_file_id
  )
  select coalesce(array_agg(new_drive_file_id) filter (where new_drive_file_id is not null), '{}')
    into v_stale from closed;

  if v_media.processing_state = 'promotion_pending' then
    v_status := 'failed';
    v_error := 'being_published';
  else
    v_status := 'pending';
    v_error := null;
  end if;

  insert into public.story_media_move_jobs (run_id, user_id, media_id, story_id, status, error_code)
    values (p_run_id, auth.uid(), v_media.id, v_media.story_id, v_status, v_error)
    returning id into v_job_id;

  select r.title into v_title
  from public.stories s
  join public.story_revisions r
    on r.id = coalesce(s.current_draft_revision_id, s.published_revision_id)
  where s.id = v_media.story_id;

  return query select
    v_job_id, v_media.id, v_media.story_id, v_title, v_status, v_error,
    v_media.sha256, v_media.processed_mime_type, v_media.processed_file_size_bytes,
    v_stale;
end;
$$;

comment on function public.claim_next_drive_move(uuid) is
  'Picks the caller''s next photo to move in this run and opens a job for it. Zero rows means the run is done. A photo mid-publication is returned already failed (being_published). stale_drive_file_ids are Drive files left by an earlier crashed attempt for the same photo -- safe to delete, nothing references them.';

revoke execute on function public.claim_next_drive_move(uuid) from public, anon, authenticated;
grant execute on function public.claim_next_drive_move(uuid) to authenticated;

create or replace function public.record_drive_move_copied(
  p_job_id uuid,
  p_drive_file_id text,
  p_drive_folder_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  if coalesce(trim(p_drive_file_id), '') = '' or coalesce(trim(p_drive_folder_id), '') = '' then
    raise exception 'Drive file and folder ids are required';
  end if;

  select run_id into v_run_id from public.story_media_move_jobs
    where id = p_job_id and user_id = auth.uid();
  if not found then
    raise exception 'No such move job';
  end if;
  perform public._touch_my_drive_move_run(v_run_id);

  update public.story_media_move_jobs
    set status = 'copied',
        new_drive_file_id = p_drive_file_id,
        new_drive_folder_id = p_drive_folder_id
    where id = p_job_id and status = 'pending';
  if not found then
    raise exception 'Move job % is not pending', p_job_id;
  end if;
end;
$$;

revoke execute on function public.record_drive_move_copied(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_drive_move_copied(uuid, text, text) to authenticated;

create or replace function public.record_drive_move_failed(
  p_job_id uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.story_media_move_jobs
    set status = 'failed', error_code = left(coalesce(nullif(trim(p_error_code), ''), 'unknown'), 64)
    where id = p_job_id and user_id = auth.uid() and status in ('pending', 'copied');
  -- No row is fine: the job already finished or failed.
end;
$$;

revoke execute on function public.record_drive_move_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.record_drive_move_failed(uuid, text) to authenticated;

-- The flip. One transaction: re-check everything, snapshot the old paths
-- onto the job, point story_media at Drive. The caller has already written
-- the Drive file and checked its sha256 against p_sha256; this re-checks
-- that the row still has that exact sha256, so a stale verify can never
-- flip a row whose bytes changed underneath it.
create or replace function public.switch_story_media_to_drive(
  p_job_id uuid,
  p_sha256 text
)
returns table (had_public_copy boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.story_media_move_jobs;
  v_media public.story_media;
begin
  select * into v_job from public.story_media_move_jobs
    where id = p_job_id and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'No such move job';
  end if;
  if v_job.status <> 'copied' then
    raise exception 'Move job % is not ready to switch (status %)', p_job_id, v_job.status;
  end if;
  perform public._touch_my_drive_move_run(v_job.run_id);

  if not public._is_self_submitted_story_owner(v_job.story_id) then
    raise exception 'Not authorized to move photos in story %', v_job.story_id;
  end if;
  if not public._has_active_drive_connection() then
    raise exception 'drive_not_connected';
  end if;

  select * into v_media from public.story_media where id = v_job.media_id for update;
  if v_media.storage_backend <> 'supabase'
    or v_media.deleted_at is not null
    or v_media.processing_state not in ('processed', 'promoted')
  then
    raise exception 'media_not_movable';
  end if;
  if v_media.sha256 is distinct from p_sha256 then
    raise exception 'media_changed';
  end if;

  update public.story_media_move_jobs
    set status = 'switched',
        switched_at = now(),
        old_private_storage_path = v_media.private_storage_path,
        old_processed_private_storage_path = v_media.processed_private_storage_path,
        old_public_storage_path = v_media.approved_public_storage_path
    where id = p_job_id;

  perform set_config('kakinotes.media_move', 'on', true);
  update public.story_media
    set storage_backend = 'google_drive',
        private_storage_path = null,
        processed_private_storage_path = null,
        approved_public_storage_path = null,
        drive_processed_file_id = v_job.new_drive_file_id,
        drive_folder_id = v_job.new_drive_folder_id
    where id = v_media.id;
  perform set_config('kakinotes.media_move', '', true);

  return query select v_media.approved_public_storage_path is not null;
end;
$$;

comment on function public.switch_story_media_to_drive(uuid, text) is
  'Flips one story_media row from supabase to google_drive in a single transaction, after the caller has copied and verified its derivative in Drive. Re-derives ownership and an active connection, refuses a row that is mid-publication, deleted or whose sha256 no longer matches, and snapshots the old Supabase paths onto the job row so they can be deleted afterwards. had_public_copy = true means the old public-bucket object must survive for 5 minutes first.';

revoke execute on function public.switch_story_media_to_drive(uuid, text) from public, anon, authenticated;
grant execute on function public.switch_story_media_to_drive(uuid, text) to authenticated;

create or replace function public.finish_drive_move_run(p_run_id uuid)
returns table (story_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.story_media_move_runs
    set status = 'finished', finished_at = now()
    where id = p_run_id and user_id = auth.uid() and status = 'running';
  -- No row is fine (already finished or abandoned): still report its stories.

  return query
    select distinct j.story_id from public.story_media_move_jobs j
    where j.run_id = p_run_id and j.user_id = auth.uid()
      and j.status in ('switched', 'old_deleted');
end;
$$;

comment on function public.finish_drive_move_run(uuid) is
  'Closes the caller''s run and returns the stories that had a photo moved in it, so their Drive folders can be renumbered.';

revoke execute on function public.finish_drive_move_run(uuid) from public, anon, authenticated;
grant execute on function public.finish_drive_move_run(uuid) to authenticated;

create or replace function public.list_my_drive_move_cleanup_due()
returns table (job_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select j.id from public.story_media_move_jobs j
  where j.user_id = auth.uid()
    and j.status = 'switched'
    and (j.old_public_storage_path is null or j.switched_at < now() - interval '5 minutes')
  order by j.switched_at;
$$;

comment on function public.list_my_drive_move_cleanup_due() is
  'The caller''s moved photos whose old Supabase copies may now be deleted: immediately for a photo with no public copy, 5 minutes after the flip for one with a public copy (a cached page may still point at it).';

revoke execute on function public.list_my_drive_move_cleanup_due() from public, anon, authenticated;
grant execute on function public.list_my_drive_move_cleanup_due() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Service-role-only RPCs (lib/story/image-pipeline.ts)
-- ---------------------------------------------------------------------------

-- Re-checks the same "due" rule as list_my_drive_move_cleanup_due() itself,
-- so the admin-side delete can never run early whatever its caller does.
create or replace function public.get_drive_move_cleanup_target(p_job_id uuid)
returns table (
  story_id uuid,
  media_id uuid,
  old_private_storage_path text,
  old_processed_private_storage_path text,
  old_public_storage_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  select j.story_id, j.media_id, j.old_private_storage_path,
         j.old_processed_private_storage_path, j.old_public_storage_path
  from public.story_media_move_jobs j
  join public.story_media m on m.id = j.media_id
  where j.id = p_job_id
    and j.status = 'switched'
    and m.storage_backend = 'google_drive'
    and (j.old_public_storage_path is null or j.switched_at < now() - interval '5 minutes');
$$;

revoke execute on function public.get_drive_move_cleanup_target(uuid) from public, anon, authenticated;
grant execute on function public.get_drive_move_cleanup_target(uuid) to service_role;

create or replace function public.record_drive_move_old_deleted(p_job_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.story_media_move_jobs
    set status = 'old_deleted', old_deleted_at = now()
    where id = p_job_id and status = 'switched';
$$;

revoke execute on function public.record_drive_move_old_deleted(uuid) from public, anon, authenticated;
grant execute on function public.record_drive_move_old_deleted(uuid) to service_role;
