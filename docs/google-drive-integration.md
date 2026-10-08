# Google Drive integration — design spec

Status: design only, nothing built yet. This doc is the plan so the feature
can be built in small, shippable slices. The decision to use Google Drive as
the storage for processed story images is already made by the product
owner. This doc does not re-argue that decision — it documents how to build
it safely, and is honest about the risks.

**Revision note:** this version replaces an earlier draft. The storage model
changed: when a contributor opts in, Drive becomes the **only** place that
contributor's story images live — Supabase stores nothing for them, not even
a short-lived derivative. The two biggest changes from the first draft are
called out inline wherever they land.

Plain-language terms used below:

- **Original** — the full-size photo exactly as the contributor's device
  produced it.
- **Derivative** — the cleaned-up, resized copy we actually show on the
  public site (EXIF/GPS stripped, resized, re-encoded — see Engineering
  Rule 14). This is the ONLY form of the image that is ever written to
  Drive or served to anyone.
- **Storage backend** — which system holds a given image's derivative:
  `supabase` (today's buckets) or `google_drive` (this feature). Recorded
  per image, not as one global switch — see section 3.
- **Token** — a secret string that lets our server act on a contributor's
  Drive on their behalf, without ever seeing their Google password.
- **Proxy route** — a page on our own server that fetches a **Drive-backed**
  image and sends the bytes to the browser itself. The browser's address
  bar and `<img>` tags only ever see our own domain for a Drive image,
  never `drive.google.com`. A Supabase-backed image keeps using today's
  direct public-bucket URL / signed-preview-URL path — see
  `getImageUrl()` below and section 5.

## 1. Summary — what changes for a contributor

Today: every contributor's story images live in Supabase. A device upload
goes into a private bucket, gets processed, and (once approved) a
derivative is copied into the public bucket.

With this feature: a contributor can, from Account settings, click "Connect
Google Drive." This is **opt-in, per contributor**, and the two storage
models live side by side forever — this is not a platform-wide migration:

- A contributor who has **not** connected Drive keeps working exactly as
  today. Nothing about their flow changes.
- A contributor who **has** connected Drive gets a different deal for every
  image they upload **from that point on**: our server processes the photo
  (strip EXIF/GPS, resize, re-encode) entirely in memory, and writes only
  the finished derivative into a folder in their own Drive. Supabase never
  stores a copy of that image — not the raw original, not a private-bucket
  staging copy, not a public-bucket copy. Drive is the only place that
  bit stream exists, once processing finishes.

This is a real trade-off and the doc says so plainly: today, if something
goes wrong with a stored image, we have a copy to fall back on. For a
Drive-mode contributor, we do not. If their Drive file disappears, the
image shows a designed placeholder instead of breaking the page — the
story itself is never auto-unpublished over it, and if every image in a
story goes missing at once, the contributor is flagged so it doesn't sit
unnoticed (section 6 has the full table; section 12, Decisions Q2, has the
owner's ruling).

A reader's browser never talks to Google Drive directly. For a
`google_drive`-backed image, every request goes through our own proxy
route (section 5). For a `supabase`-backed image, nothing changes at all —
it keeps serving exactly the way it does today (direct public-bucket URL
for a published image, a short-lived signed URL for a draft/review one).
One small helper, `getImageUrl(media)`, decides which path a given image
takes, so the rest of the app never has to ask.

Two more pieces round the feature out. A new **My Photos** page (section 7) lets a contributor see and download every image they've uploaded,
across every story and status, whichever backend it's on — this is also
where the unlink warning now points, instead of a separate one-off zip
offer. And a two-way **move tool** (section 9) lets a contributor move a
story's images between Supabase and Drive deliberately, in either
direction, rather than the backend being fixed forever at upload time.
Disconnecting Drive still stops a contributor's Drive-backed images from
showing (section 8 covers the warning, and now also offers moving them
back to Supabase first) — it has no effect at all on their Supabase-backed
images.

## 2. OAuth flow

### Scope: `drive.file`, not `drive`

We request `https://www.googleapis.com/auth/drive.file` only. This scope
lets our app see and manage only files our app itself creates (plus files
the user explicitly picks with Google's file picker) — never the
contributor's whole Drive. The broader `drive` scope would let us read every
file they own, which we have no reason to ask for and Google reviews much
more strictly before granting it to a production app. `drive.file` is the
narrowest scope that lets us create a folder, write derivative files into
it, and read them back later when serving a story.

We also request `https://www.googleapis.com/auth/userinfo.email` (or the
`openid` + minimal profile scope) only if we need to show "connected as
you@example.com" in the UI — a nice-to-have, not a requirement. If we skip
it, skip this scope too.

### Routes

- `GET /account/drive/connect` — Server Component / Route Handler. Builds
  the Google OAuth consent URL, generates a random CSRF `state` value,
  stores it in a short-lived, `httpOnly`, `secure` cookie (not in the
  database — it only needs to survive one redirect round trip), and
  redirects the browser to Google's consent screen.
- `GET /account/drive/callback` — Route Handler. Google redirects here with
  either `?code=...&state=...` (approved) or `?error=access_denied` (user
  said no). Steps:
  1. Compare the `state` query param against the cookie's value. Mismatch or
     missing cookie → abort, show "that didn't work, try again," do **not**
     exchange any code. This is the CSRF defense: it proves the browser that
     is completing the flow is the same one that started it.
  2. On `error=access_denied` (or any other error param): clear the cookie,
     redirect to `/account#drive` with a plain "you said no, so nothing was
     connected — you can try again anytime" message. Nothing is written to
     the database.
  3. On success: exchange `code` for an access token + refresh token using
     Google's token endpoint (server-to-server call, never from the
     browser). Encrypt the refresh token and store it (section 3). Redirect
     to `/account#drive` with a success message, including the plain-
     language warning described in section 8 if the contributor has
     existing Supabase-backed stories (so they understand those are
     unaffected, and only new uploads change).

Both routes live under `app/(contributor)/account/drive/`, matching the
`(contributor)` route group's existing authenticated-only convention. Both
require a signed-in session — an anonymous visitor hitting either route is
redirected to sign-in first, same as any other `(contributor)` page.

### CSRF / state handling

The `state` cookie is a random 32-byte value, base64url-encoded, set with
`httpOnly`, `secure`, `sameSite=lax`, and a short max-age (10 minutes — long
enough for a slow consent screen, short enough that a stale cookie can't be
replayed days later). It is single-use: the callback route clears it
immediately after checking it, whether the check passed or failed.

### Token refresh

Google access tokens expire in about an hour; the refresh token does not
(until revoked). Every server-side call to the Drive API first checks
whether the cached access token is expired or missing, and if so exchanges
the stored refresh token for a new access token before making the real
call. This refresh happens inside the same server-only module that holds
the decryption key (section 3) — nothing upstream of it ever sees a raw
refresh token.

If the refresh call itself fails (Google says the refresh token is invalid
or revoked), treat it as "Drive is disconnected" — see the failure-mode
table (section 6).

### New environment variables

All server-only. **None of these may be prefixed `NEXT_PUBLIC_`** — that
prefix ships a value into the browser bundle, which would violate
Engineering Rule 1's spirit for the first two and Rule 2 outright for the
third.

| Variable                            | Purpose                                                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_DRIVE_OAUTH_CLIENT_ID`      | OAuth client id, from Google Cloud Console.                                                                                                                                                                                           |
| `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET`  | OAuth client secret. Never sent to the browser.                                                                                                                                                                                       |
| `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` | Symmetric key used to encrypt refresh tokens at rest (section 3). Generated once, stored only in the server environment (Vercel project env vars), never committed.                                                                   |
| `GOOGLE_DRIVE_OAUTH_REDIRECT_URI`   | The exact callback URL registered with Google (e.g. `https://kakinotes.example/account/drive/callback`). Kept explicit rather than derived from the request, so a spoofed `Host` header can't redirect the OAuth flow somewhere else. |

These follow the existing `lib/env.server.ts` pattern: a new Zod schema (e.g.
`driveEnvSchema`), parsed lazily behind a `getDriveEnv()` function the same
shape as today's `getAdminEnv()`, so importing the ordinary public env
object never pulls in these secrets.

## 3. Data model

### `story_media.storage_backend` — data, not a global switch

A new column on the existing `story_media` table records, per image, which
backend holds it:

```sql
create type public.story_media_storage_backend as enum ('supabase', 'google_drive');

alter table public.story_media
  add column storage_backend public.story_media_storage_backend not null default 'supabase';
```

This is set once, at upload time, from whether the uploading contributor
currently has an active Drive connection — and it does not change
retroactively for existing rows when a contributor connects or disconnects
Drive later (section 9 explains why). Every query that currently assumes
"the processed derivative lives in the public bucket" has to branch on this
column instead (see section 5's call-site list).

### Nullable storage-path columns, for `google_drive` rows

Today, `story_media.private_storage_path` is `not null`, and
`approved_public_storage_path`/`metadata_removed_at` gate on each other via
a check constraint (`story_media_approved_requires_metadata_removed`,
`story_media_approved_requires_processed_mime`). A `google_drive`-backend
row never has any Supabase storage path at all — nothing is ever written to
either bucket for it. The migration needs to:

- make `private_storage_path` nullable, and
- add a check constraint that a `supabase`-backend row still requires it
  (and the existing approved/metadata-removed pairing), while a
  `google_drive`-backend row requires `drive_processed_file_id` instead
  (next column) and must have both Supabase path columns `null`.

Sketch:

```sql
alter table public.story_media
  alter column private_storage_path drop not null,
  add column drive_processed_file_id text,
  add column drive_folder_id text,
  add constraint story_media_backend_consistency check (
    (storage_backend = 'supabase'
      and drive_processed_file_id is null and drive_folder_id is null)
    or
    (storage_backend = 'google_drive'
      and private_storage_path is null
      and processed_private_storage_path is null
      and approved_public_storage_path is null
      and drive_processed_file_id is not null
      and drive_folder_id is not null)
  );
```

Note the change from the earlier draft: there is no `drive_file_id` for a
_raw original_ anymore, because the raw original is never persisted
anywhere (section 4). `drive_processed_file_id` is the id of the **finished
derivative** — the only file this feature ever writes to Drive.

`source_width`/`source_height`/`processed_width`/`processed_height`/`sha256`
are still set the same way as today (computed during in-memory processing,
from the real decoded bytes), just written straight onto the row without an
intermediate storage write.

### Token table: `contributor_drive_connections`

Unchanged in shape from the earlier draft — still a table separate from
`profiles`/`contributors` (Engineering Rule 4), still deny-all under RLS,
still encrypted at rest:

```sql
create table public.contributor_drive_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  drive_folder_id text not null,
  google_account_email text,
  encrypted_refresh_token bytea not null,
  encryption_key_version smallint not null default 1,
  access_token_cache text,
  access_token_expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'refresh_failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_refreshed_at timestamptz
);

comment on table public.contributor_drive_connections is
  'One row per contributor who has linked Google Drive. Holds the encrypted refresh token and the app-created Drive folder id. Server-only: no client (anon or authenticated) has any access — see RLS below. Separate from profiles/contributors per Engineering Rule 4.';

alter table public.contributor_drive_connections enable row level security;
-- No policies created for anon/authenticated on purpose: RLS enabled with
-- zero policies denies every row to those roles by default. service_role
-- bypasses RLS, which is how the server-only token-store module (section 4)
-- reads/writes this table at all.
```

Encryption approach is unchanged from the earlier draft: AES-256-GCM, key
in `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY`, encrypt/decrypt only inside the
server-only token-store module (section 4), `encryption_key_version` for
future key rotation.

### Migration files

Three migrations, matching the one-concern-per-file convention:

1. `<timestamp>_contributor_drive_connections.sql` — the token table.
2. `<timestamp>_story_media_storage_backend.sql` — the enum, the
   `storage_backend` column and its default.
3. `<timestamp>_story_media_drive_columns.sql` — the nullable-path change,
   `drive_processed_file_id`/`drive_folder_id`, and the consistency check
   constraint.

## 4. Upload path

For a contributor who has **not** connected Drive: completely unchanged.
`begin_story_media_upload` → direct-to-storage browser upload → the
existing in-bucket pipeline, exactly as today.

For a contributor who **has** connected Drive: **raw bytes must never touch
Supabase storage, not even briefly.** The pipeline (decode, strip EXIF/GPS,
resize, re-encode — unchanged sharp logic from `lib/story/image-pipeline.ts`)
still runs the same way, but the raw bytes it operates on come from the
contributor's own Drive, processed in our server's memory, with the
finished derivative written back to Drive and the raw file then deleted —
never from a Supabase bucket, not even transiently.

### Getting the raw bytes off the server's 4.5 MB request limit, honestly

Here is the problem this runs into, and it is a real one. The direct-to-
storage upload flow
(`supabase/migrations/20260827090000_direct_to_storage_uploads.sql`) exists
because of a hard platform limit: Vercel's Node.js Functions have an
effective inbound request-body ceiling of roughly 4.5 MiB (AWS Lambda's
synchronous invocation payload cap, worsened by base64 inflation for binary
bodies). That migration's comment records a real failure: a genuine 24-
megapixel iPhone HEIC (4.1 MB) got rejected with a non-JSON 413, proof the
platform itself — not our route handler — refused the request. The fix was
to have the browser upload directly to Supabase Storage with its own
session token, bypassing our server for the big transfer entirely.

A Drive-mode upload needs the same trick — a direct browser-to-storage
transfer that skips our 4.5 MB-limited server — except the "storage" on the
other end is now the contributor's own Drive, not our bucket. Four options,
honestly compared (the first draft's Option B is now rejected, because it
staged raw bytes in Supabase, which the owner has ruled out):

| Option                                                                                                                         | How it works                                                                                                                                                                                                                                                                                                                                                                                                 | Where raw bytes briefly exist                                                                                                                                                                                  | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Resize in the browser first, POST to our server, server does the real work**                                              | The browser shrinks the image (decode, then resize/re-encode) client-side purely to get under the 4.5 MB request limit, POSTs that smaller file to a server route, and the server treats it exactly like a freshly downloaded Option D file from that point on: sniff/validate, run the full sharp pipeline, write the derivative to Drive.                                                                  | Browser memory only, then briefly our server's process memory during the same in-request pipeline Option D already uses. Never staged in Drive or Supabase.                                                    | **Rejected as the primary path — adopted as the CORS fallback for Option D** (see (a) below). Rejected as primary because Option D avoids touching our server at all for the big transfer, which is strictly better when it works. Kept as the fallback because, unlike Option C, it reuses the exact same server-side pipeline Option D already has, just fed by a POST instead of a Drive download — no new chunking protocol needed. |
| **B. Temporary raw upload into Supabase's private bucket, deleted after processing**                                           | Reuse the existing direct-to-storage reservation to stage raw bytes in our private bucket, process, then delete.                                                                                                                                                                                                                                                                                             | Our own Supabase private bucket, briefly.                                                                                                                                                                      | **Rejected.** This is exactly the design the owner ruled out — raw bytes must never touch Supabase storage, even briefly.                                                                                                                                                                                                                                                                                                               |
| **C. Chunked upload to a custom server route**                                                                                 | Browser splits the file into pieces under the body-size limit, POSTs them one at a time, server reassembles.                                                                                                                                                                                                                                                                                                 | Wherever the server buffers the reassembled chunks — in memory, or in some temporary store.                                                                                                                    | **Rejected.** No existing precedent in this codebase; correct chunked-upload handling (ordering, retries, partial-failure cleanup) is fiddly, and if the reassembly target is temporary storage of any kind, it just reinvents Option B with more new code.                                                                                                                                                                             |
| **D. Raw goes straight to the contributor's own Drive (resumable upload), server never sees it until it downloads to process** | The server starts a Drive resumable-upload session for a new _staging_ file in the contributor's Drive and hands the browser only the session URI. The browser PUTs the raw bytes straight to Google — not through our server at all. Our server later verifies and fetches that one file via the Drive API itself, processes it in memory, writes the derivative, and permanently deletes the staging file. | Briefly in the contributor's **own** Drive (a file we created, that only our app can see), and briefly in our server's **process memory** during the download-and-process step — never in any Supabase bucket. | **Recommended.** Full details below.                                                                                                                                                                                                                                                                                                                                                                                                    |

**Recommendation: Option D, with Option A as a confirmed fallback if the
CORS spike in (a) below fails.** Option D keeps the owner's "never touch
Supabase storage" rule intact and avoids our server entirely for the big
transfer, which is strictly better when it works. If the spike shows the
browser can't `PUT` to the session URI cross-origin, Option A — browser
shrinks the file under the request limit, POSTs it, server does the
entire real pipeline exactly as it would for an Option D download — is the
fallback, not a chunked custom protocol (C), since it reuses Option D's
server-side pipeline as-is. Either way, the raw file briefly sitting
somewhere (the contributor's own Drive for D, the browser's memory for A)
and a real memory/time budget on our server for the download-or-receive-
and-process step are called out in detail below rather than glossed over.

### Step by step (Drive-mode upload, Option D)

1. Contributor picks a file in the existing upload UI
   (`components/story/image-upload-manager.tsx`). Client-side checks
   (accepted type, rough size) run exactly as today.
2. Browser calls a new server action, `beginDriveMediaUpload(revisionId, mimeType)`.
   This is the Drive equivalent of `begin_story_media_upload`: it creates
   the `story_media` reservation row (`storage_backend = 'google_drive'`,
   decided server-side from the caller's active connection, never from a
   client-supplied flag) — **metadata only, no bytes involved at this
   step.** Then, using the contributor's access token (via `token-store.ts`,
   section 2), it calls the Drive API to open a **resumable upload
   session** for a new file inside a `Kakinotes staging` subfolder of the
   contributor's app folder, setting `appProperties` on the file-to-be:
   `kakinotes_stage: 'raw'` and `kakinotes_reservation: <story_media.id>`.
   The server returns **only the session URI** to the browser — the
   access token itself never leaves the server.
3. The browser `PUT`s the raw file bytes directly to that session URI. This
   goes straight to Google's upload servers, so our 4.5 MB server-side
   limit never applies — the same reason the existing direct-to-storage
   flow works for Supabase, just pointed at Drive instead.
4. The browser tells our server "done" and passes back the Drive file id
   Google gave it. **Per Rule 2, the server does not trust that id at
   face value.** `finalizeDriveMediaUpload(mediaId, driveFileId)`:
   - re-authorizes the caller against the revision exactly as
     `finalize_story_media_upload` does today,
   - fetches that file's real metadata from the Drive API itself (using
     the contributor's token, not anything the browser asserts), and
     checks, all independently: `appProperties.kakinotes_reservation`
     equals this exact `story_media.id` **and** that row is still in a
     pending/unfinalized state owned by this contributor, the file's
     parent folder is the staging subfolder (not the real published
     folder), and `appProperties.kakinotes_stage` is `'raw'`. Any mismatch
     — wrong reservation, wrong parent, wrong stage, or no such file — is
     rejected outright; nothing is downloaded or deleted. See the failure
     table below for the "forged file id" case specifically.
   - only once that passes: downloads the file's bytes into server memory,
     sniffs the real type and checks it against `image-validation.ts`'s
     existing pixel/format limits exactly as today's pipeline does before
     ever trusting a buffer,
   - runs the existing sharp pipeline (decode, strip EXIF/GPS, resize,
     re-encode) entirely in memory,
   - uploads the finished derivative as a **new**, separate Drive file, in
     the real (non-staging) app folder, getting back `drive_processed_file_id`,
   - **permanently deletes the raw staging file** — a `files.delete` call,
     not `files.update` to trash it. Trashing would leave the original,
     GPS-bearing bytes sitting recoverable in the contributor's Trash for
     up to 30 days (Drive's own default); `files.delete` removes it outright,
     which is the only way to honestly call this "never persisted."
   - records `drive_processed_file_id`, `drive_folder_id`, the computed
     `sha256`/dimensions, and moves the row to `processed`.
5. Moderator approval, when it happens, does not copy anything between
   buckets for a `google_drive`-backend row — there is nothing to copy. It
   only flips the row's publication-relevant state, since the derivative
   file itself does not move or change on approval. The proxy route
   (section 5) is what decides whether a given reader may see it, not
   where the bytes physically are.

### Four things to be honest about

**(a) CORS on the browser's direct `PUT` to the session URI — must-verify,
not confirmed; fallback is Option A, not chunking.** The session-creation
call (step 2, a POST from our own server) is not a browser CORS situation
at all, since our server, not the browser, makes it. The part that
genuinely needs verifying is step 3: can a browser on our own origin `PUT`
bytes straight to the session URI Google handed back? Google's official
docs (`developers.google.com/workspace/drive/api/guides/manage-uploads`)
describe the resumable-upload flow and confirm the session URI's one-week
expiry (next point), but do **not** document CORS behavior for the
upload-continuation `PUT` one way or the other. At least one third-party
report describes the session-_creation_ response carrying proper CORS
headers while the upload-_continuation_ endpoint (a separate backend) does
not, which would mean a plain browser `PUT` gets silently blocked. This is
not confirmed either way from official sources, so it is marked a
**must-verify spike** in the build order (section 11, slice 2) rather than
assumed to work.

**Spike result (2026-10-07): the browser `PUT` works. Option D is the
upload path.** Run with `scripts/spike-drive-cors.mjs` (a standalone
localhost server, not app code) in Chrome, on a test Google account, with
the `drive.file` scope:

| Test                                                           | Result                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 6 MB single `PUT`, session started **with** an `Origin` header | **Pass.** HTTP 200, and the browser could read the response (the file id).                  |
| 6 MB single `PUT`, session started **without** `Origin`        | **Blocked** by the browser ("Failed to fetch").                                             |
| 6 MB in two `Content-Range` chunks, with `Origin`              | **Pass.** The first chunk got 308, the second 200. Resumable uploads work from the browser. |
| Server check with a forged `kakinotes_reservation`             | **Rejected**, as it should be. The `appProperties` check works.                             |
| A real JPEG, with `Origin`                                     | **Pass.**                                                                                   |

Every test file was deleted afterwards (`files.delete` returned 204).

**Rule this sets for the build:** the server **must** send
`Origin: <our site origin>` when it starts the resumable session, or the
browser's `PUT` is blocked. The origin comes from configuration (the same
place as `GOOGLE_DRIVE_OAUTH_REDIRECT_URI`), never from the incoming
request's headers. Test it: a session started without `Origin` should be
covered by a unit test asserting the header is always set.

**Not covered by the spike:** Safari and Firefox were not tried, and the
6 MB tests used random bytes, not a large real photo. Slice 3 should check
one large iPhone photo in Safari before it's called done. Option A stays
written down below as the fallback, but nothing is built for it unless a
browser turns out to need it.

If the spike shows the `PUT` is blocked, the approved fallback is **Option
A**: the browser shrinks the image itself (decode, then resize/re-encode
via `createImageBitmap` + `OffscreenCanvas`/canvas) until it's comfortably
under the 4.5 MB request limit, then `POST`s that smaller file to a new
server route. From there, the server does exactly what Option D's step 4
already does — sniff the real type, check it against `image-validation.ts`'s
pixel limits, run the full sharp pipeline (the real EXIF/GPS strip and
resize, Rule 14), and write the derivative to Drive as a new file. No raw
bytes are ever staged in Drive or Supabase in this fallback path — they
exist only in the browser's memory and, briefly, our server's process
memory, same as Option D's own in-memory step.

**The browser shrink is a transfer-size optimization only, never a trust
boundary.** It is never treated as "already stripped" or "already
correctly sized" — the server re-runs the entire real pipeline regardless
of what the browser sent, and rejects anything still over the limit or
that fails `image-validation.ts`'s checks, exactly as it would for any
other upload. (Canvas re-encoding happens to drop EXIF as a side effect in
most browsers, but this design does not rely on that — Rule 14's real
strip still runs server-side unconditionally.)

**Quality target for the browser-side shrink.** To avoid the shrink making
the final result worse than what the server pipeline would have produced
from the full original anyway, the browser caps the longest edge at
roughly **2,400px** (20% over `MAX_PROCESSED_DIMENSION`, which is **2000px**
in `lib/story/image-validation.ts` — some headroom so the server's own
resize is still doing real work, not upscaling a too-aggressively-shrunk
image) and re-encodes at JPEG quality **~0.9**. This keeps the shrunk file
comfortably under 4.5 MB for virtually any photo while staying strictly
above the server's own final output quality, so the server pipeline is
never working from a worse source than it would otherwise have.

**HEIC in the fallback path.** Canvas-based decoding is inconsistent across
browsers — Safari/iOS decodes HEIC natively, but Chrome on Android
generally cannot decode it in a canvas at all. Two options: (1) tell the
contributor to export as JPEG first when their browser can't decode HEIC
client-side, or (2) if the original HEIC file is already under 4.5 MB
on its own, skip the browser-side shrink entirely and send it unshrunk —
the server already transcodes HEIC to JPEG as part of its normal pipeline
(`lib/story/heic.ts`), so an unshrunk HEIC under the size limit needs no
special handling. **Recommendation: option (2) as the default** (skip
shrinking when already small enough, regardless of format), **falling
back to (1)'s "export as JPEG" messaging only when the file is both HEIC
and too large to send unshrunk and the browser's canvas can't decode it**
— this covers the common case (a reasonably sized HEIC) without ever
asking a contributor to leave the site, and only asks for a manual export
in the narrow case of a large HEIC on a browser that can't shrink it
itself. The owner approved this split (section 12, Q9).

**(b) The session URI is a bearer capability.** Whoever holds that URI can
upload to that one specific empty file until the session expires or is
completed — nothing else, since it's scoped to one file-creation only, not
a general Drive credential. Google's official docs state a resumable
session URI is valid for **up to one week** (or one week of inactivity,
whichever comes first) by default, which is far longer than this flow
needs — a contributor's browser should complete the PUT within minutes of
starting it. To narrow the real exposure window: the `story_media`
reservation row itself (not the Drive session) is what `finalize` actually
checks against, so we treat a reservation as expired after a short window
(recommend 30–60 minutes, matching the existing pending-upload pattern) —
after that, `finalizeDriveMediaUpload` refuses even a well-formed call, and
the orphaned staging file is left for the cleanup sweep below. The Drive
session URI itself staying "valid" for up to a week longer than that is a
one week upper bound; it has no actual value once our server stops
honoring the reservation.

**(c) Server memory and time for a ~30 MB file in one request.** Step 4
downloads a file (up to `MAX_HEIC_UPLOAD_BYTES`, 30 MiB) over the Drive
API, decodes it with sharp (decoded RGBA can run well past the compressed
size — the existing `MAX_INPUT_PIXELS` ~50-megapixel guard caps this at a
few hundred MB of working memory, already budgeted for today's pipeline),
re-encodes it, and uploads the result back to Drive — all inside one
serverless function invocation. This is strictly more work in one request
than today's pipeline does (which only downloads from/uploads to Supabase,
typically faster and more predictable than a round trip to a third-party
API), so the real risk is the function's **execution-time** limit, not
memory. **Decided (section 12, Decisions, Q10):** this codebase has no
`maxDuration` configured anywhere today (checked `next.config.ts` and the
repo root for a `vercel.json` — neither exists, so every route runs on
the platform default). The plan is to set `export const maxDuration = 60`
on the Drive-finalize route specifically, which needs no plan upgrade on
any current Vercel tier, and only move this step to a background job
later if real production telemetry shows it timing out even at 60s —
not to build the background-job version up front. Flagged as a build risk
to confirm in slice 3 (section 11) regardless: a 60s budget is a plan, not
a guarantee, for "download from Drive + decode + strip + resize +
re-encode + upload to Drive" on a large file over a slow connection to
Google.

**(d) The raw file briefly sits in the contributor's own Drive, with GPS
intact.** Between step 2 and the `files.delete` call in step 4, the
unprocessed original — full EXIF, full GPS, exactly as the camera wrote it
— exists as a file in the contributor's own Google Drive. This is their
own storage, under their own Google account's control, not ours — a
meaningfully different situation from the first draft's Option B, where
the same bytes briefly sat in a bucket _we_ run. But it's still worth
saying plainly: for that short window (expected seconds; bounded by the
30–60 minute reservation expiry at the outside, point (b) above), a
location-bearing original exists somewhere, even if "somewhere" is the
contributor's own account. See the Rule 15 discussion in section 10.

### Cleanup sweep for abandoned staging files

A scheduled job, run periodically (e.g. hourly), does the following for
**each contributor with an `active` Drive connection**:

1. Uses `token-store.ts` to get (refreshing if needed) a current access
   token for that connection — the same module and the same refresh logic
   the upload and proxy paths already use.
2. Lists files in that contributor's staging subfolder via the Drive API's
   `q` parameter, filtering on `appProperties has { key='kakinotes_stage'
and value='raw' }` and `createdTime < now() - 1 hour`.
3. For each match: permanently deletes it (`files.delete`) and, if the
   matching `story_media` reservation is still pending, cancels that
   reservation too (the same pattern as today's
   `cancel_pending_story_media_upload`, extended to a Drive-mode row).

**For a connection whose `status` is `revoked` or `refresh_failed`:** the
sweep cannot get a token, and therefore **cannot delete that contributor's
orphaned staging files at all.** This is a real, honest gap — an abandoned
raw file in a revoked-access contributor's Drive stays there, in their own
Drive, until they either reconnect (at which point the next sweep run picks
it up normally) or delete it themselves. We have no way to remove it
without a working token, and `drive.file` scope gives us no path around
that. This is listed again in section 10 as a known limitation, not solved
further here.

### Where the admin-client rule is preserved

`lib/story/image-pipeline.ts` stays the **only** module that imports
`lib/supabase/admin.ts`, enforced by the existing `no-restricted-imports`
ESLint rule in `eslint.config.mjs`. The Drive work needs a second
privileged capability — decrypting a refresh token and calling Google's
API — which is a _different_ privilege (Google credentials) from the
Supabase service-role privilege that rule guards:

- A new module, `lib/drive/token-store.ts`, is the **only** place that
  decrypts a refresh token or talks to Google's OAuth/Drive endpoints
  (including starting a resumable session, fetching a file's metadata,
  downloading/uploading/deleting a file, and listing staging files for the
  cleanup sweep).
- A new module, `lib/story/drive-sync.ts`, is the **only** module allowed to
  import `lib/drive/token-store.ts` — enforced the same way, by adding it
  to the ESLint allowlist for a new `no-restricted-imports` entry
  restricting `lib/drive/token-store.ts`.
- `drive-sync.ts` does **not** import `lib/supabase/admin.ts` directly. For
  the step that needs the sharp pipeline, it calls an exported function
  from `image-pipeline.ts` (e.g. `processBytesInMemory(bytes)`, a variant of
  today's pipeline that takes bytes directly instead of a storage path and
  returns processed bytes rather than writing them anywhere) — handing
  plain bytes across the boundary, in-process, never round-tripped through
  any storage. This keeps exactly one module holding the Supabase
  service-role key and exactly one module holding the Drive token
  decryption key, neither needing the other's secret directly.
- The proxy route (section 5) and the cleanup sweep both reuse this same
  `drive-sync.ts` / `token-store.ts` pair — neither gets its own separate
  privileged path.

## 5. Read/cache path — the proxy route

**The proxy route serves `google_drive`-backend media only.**
`supabase`-backend media keeps using exactly what it uses today — a direct
public-bucket URL (`getPublicImageUrl()`) for a published image, and a
short-lived signed URL (`mintMediaPreviewSignedUrl()`) for a contributor
draft or moderator review. Nothing about the Supabase path changes. This is
a deliberate narrowing from the previous draft, which routed everything
through one proxy — that would have meant rewriting a code path that
already works and is already tested, for no benefit to contributors who
never connected Drive.

There is no cache in the old sense for Drive-mode media — the Drive file
**is** the derivative; there is nothing upstream of it to cache from. What
matters is that a reader's browser never talks to Drive directly, and
never sees a Drive URL or a "anyone with the link" share link, for the
media that does live there.

### One small resolver: `getImageUrl(media)`

A single new helper decides, per image, which of the two paths above to
use — so every call site asks one function instead of re-implementing the
branch:

```ts
function getImageUrl(media: {
  id: string;
  storage_backend: "supabase" | "google_drive";
  public_url?: string | null;
}): string | null {
  if (media.storage_backend === "google_drive") return `/media/${media.id}`;
  return getPublicImageUrl(media.public_url ?? null); // today's behavior, untouched
}
```

(The contributor-preview / moderator-review call sites use the equivalent
signed-URL-minting call for a `supabase` row instead of `getPublicImageUrl`
— same branch, different today's-behavior branch. The point is the same:
one `if`, and the `supabase` side of it is a direct call to code that
already exists and is not being changed.)

### The proxy route

`app/media/[mediaId]/route.ts` (a plain Route Handler, not inside any one
route group, since it has to serve anonymous readers, signed-in
contributors, and moderators alike — each gets a different authorization
check, done inside the handler, not by which folder it lives in).

On each request, keyed only by `mediaId` (never by a storage path, Drive or
otherwise — see Rule 11 in section 10 for why that matters):

1. Look up the `story_media` row and its `storage_backend`.
2. **If `storage_backend` is `supabase`: return 404, full stop.** This
   route is not a second way to reach the private or public bucket — a
   Supabase-backed image was never supposed to be requested here, and
   treating that as "fetch it anyway" would quietly open exactly the kind
   of second, unaudited path into the bucket this design is trying to
   avoid. A 404 here is a sign of a caller bug (using the proxy URL for the
   wrong backend), not a real missing-image case — see section 11's test
   for proving this.
3. Otherwise (a `google_drive` row): run the authorization check
   appropriate to the request (below).
4. If authorized: fetch the bytes from Drive via `drive-sync.ts`/
   `token-store.ts` and stream them back with the right `Content-Type` and
   the caching headers below.
5. If not authorized, or the bytes can't be fetched (see the failure-mode
   table in section 6): return the placeholder image (section 6), never a
   raw 404/500 that would show a browser's own broken-image icon.

### Anonymous readers — the exact check

Scoped to `google_drive`-backend rows only (a `supabase` row never reaches
this check — it's already 404'd in step 2 above). The proxy applies the
same discipline `get_published_story_media()`
(`supabase/migrations/20260803090800_story_public_reads.sql`) already
applies for the rest of the public reading path, re-deriving everything
from the database, never trusting anything in the request:

- the story this media belongs to has `visibility = 'public'` and
  `lifecycle_status = 'published'`,
- the media's containing `story_revision_media` row belongs to that story's
  **`published_revision_id` specifically** — never its draft, pending, or
  rejected revision,
- `consent_revoked_at is null` and a currently-valid consent record exists
  for that published revision,
- `storage_backend = 'google_drive'` and `drive_processed_file_id is not
null`.

This is a new, narrow RPC (e.g. `can_serve_public_drive_media(p_media_id
uuid)`) that mirrors `get_published_story_media`'s own `where` clause
exactly (restricted to `google_drive` rows), keyed by media id instead of
story id since the proxy only has the media id from the URL. It must never
be written as "join `story_media` to any revision" — only ever to
`published_revision_id`, by name, the same discipline Rule 10/12 already
requires of every other public query in this codebase. It must also never
be written as "any row with a `drive_processed_file_id`" without the
`storage_backend` check — that column existing is not, on its own, proof
this is a Drive row's intended path (belt-and-suspenders with the route's
own step-2 404).

### Contributor preview and moderator review

Served through the **same** proxy route, authorized the **same** way
today's private-preview flow already is: `_can_access_story_media()` /
`authorize_story_media_preview()`
(`supabase/migrations/20260804090600_story_preview_and_media_access.sql`),
called from the caller's own regular (RLS-respecting) Supabase client
before the proxy fetches anything. This replaces the current
mint-a-120-second-signed-URL dance for the cases that need it (contributor
drafts, moderator review) — the proxy route itself becomes the "signed URL",
scoped to one request instead of a short-lived token the browser has to
remember. These responses are `Cache-Control: private, no-store` — nothing
about a draft or an in-review image is ever cacheable by a shared cache.

### Caching for published media

A `google_drive` row that passes the anonymous check above is served with
`Cache-Control: public, s-maxage=<N>, stale-while-revalidate=<M>` so a CDN
in front of the app (Vercel's) caches it rather than hitting Drive on
every page view — this is the real mitigation for Drive API read volume.
(A `supabase` row's public-bucket URL already gets CDN-level caching from
Supabase/Vercel today, unchanged by this feature.)

**The bound on "how long can an unpublished/archived/rejected story's image
keep being served from cache":** `s-maxage` is set short enough that this is
a real, statable number rather than "eventually" — recommended **5 minutes**
(`s-maxage=300`), matching the kind of window this codebase already treats
as acceptable staleness elsewhere (`app/sitemap.ts`'s `revalidate = 3600` is
far looser, precisely because a sitemap entry going stale for an hour is low
stakes; a still-servable image for an unpublished story is not, so it gets
a tighter number). On unpublish/archive/reject, the moderation/editorial
action that flips `lifecycle_status` should also actively purge that
story's media URLs from the CDN cache (Vercel's on-demand cache
invalidation API, keyed by the proxy path) so the real-world bound is
"immediately, with a 5-minute worst case if the active purge itself fails."

### Every current image URL/byte-read site, and how each changes

Grepped for `getPublicImageUrl` usage, the PDF export, the cover/first-photo
fallback, the landing hero/featured slide, OG/metadata images, the sitemap,
and the photo viewer. Every site below switches to calling the
`getImageUrl(media)` resolver (or its signed-URL equivalent for the two
private-preview sites) instead of calling `getPublicImageUrl` /
`mintMediaPreviewSignedUrl` directly — and for every `supabase`-backend row,
that resolver's `supabase` branch calls exactly the same existing function
with exactly the same arguments as today, so behavior for every
contributor who never connects Drive is unchanged, not just similar. Only a
`google_drive`-backend row's behavior is new, at each site:

| Site                                                                                                                                                                                          | Today                                                                                                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/story/public-image-url.ts` (`getPublicImageUrl`)                                                                                                                                         | Builds a direct Supabase public-bucket URL from a storage path.                                        | Stays exactly as-is, unchanged — it becomes the `supabase` branch inside the new `getImageUrl(media)` resolver described above, called with the same arguments as today.                                                                                                                                                                                                                                               |
| `app/(public)/stories/[id]/page.tsx` — cover image used for the `openGraph.images` / OG metadata, and inline content-block images                                                             | Calls `getPublicImageUrl(coverOf(media)?.public_url)` and per-media `getPublicImageUrl(m.public_url)`. | Calls `getImageUrl(media)` instead. For a `supabase` row, identical output to today. For a `google_drive` row, returns `/media/{id}` — fetchable by social-media crawlers with no cookies, since the proxy's anonymous check allows that for published media.                                                                                                                                                          |
| `app/(moderation)/moderation/stories/[id]/page.tsx` — published-snapshot inline images shown in the moderator diff view                                                                       | Same `getPublicImageUrl(m.public_url)` pattern, reading the already-published copy for comparison.     | Calls `getImageUrl(media)`; `supabase` rows unchanged, `google_drive` rows get `/media/{id}`.                                                                                                                                                                                                                                                                                                                          |
| `components/home/story-index.tsx`, `components/home/featured-story-slide.tsx`, `components/story/story-card.tsx` — cover thumbnails on the homepage and story listings                        | `getPublicImageUrl(story.cover_image_path)`.                                                           | Calls `getImageUrl(media)`; these components need `storage_backend` and the media id alongside `cover_image_path` from whatever query populates them today — a small ripple into `lib/story/public-queries.ts` and friends to carry one extra column, not a reshape of the query.                                                                                                                                      |
| `components/story/story-gallery.tsx` — the trailing photo gallery on a published story page                                                                                                   | `getPublicImageUrl(image.public_url)`.                                                                 | Calls `getImageUrl(media)`.                                                                                                                                                                                                                                                                                                                                                                                            |
| `components/story/story-cover-fallback.tsx`                                                                                                                                                   | Renders a placeholder when there is no cover at all.                                                   | Unchanged.                                                                                                                                                                                                                                                                                                                                                                                                             |
| `components/ui/photo-lightbox.tsx`, `components/story/preview-gallery.tsx`, `components/story/content-block-renderer.tsx`                                                                     | Render whatever URL they're handed; they don't build URLs themselves.                                  | No change — they keep working whether the URL they're handed is today's Supabase URL or the new `/media/{id}`.                                                                                                                                                                                                                                                                                                         |
| Contributor draft preview: `app/(contributor)/stories/[id]/media-actions.ts` (`mintPreviewUrlAction` → `mintMediaPreviewSignedUrl`), `app/(contributor)/my-stories/story-cover-thumbnail.tsx` | Mints a 120-second signed Supabase URL per image, client-side cached for 90s.                          | For a `supabase` row: unchanged — same minting, same 90s client cache, same everything. For a `google_drive` row: renders `/media/{id}` directly instead of minting anything, authorized per-request by the proxy's contributor-preview check (section 5).                                                                                                                                                             |
| PDF export: `lib/story/image-pipeline.ts#downloadMediaPreviewBytes`, used by the story PDF export route to embed image bytes directly into the PDF                                            | Downloads the processed derivative's bytes from the private bucket for a `supabase`-backend row.       | Gains a `storage_backend`-aware branch: `supabase` rows call this exact function, unchanged; `google_drive` rows instead call `drive-sync.ts` to fetch the derivative's bytes straight from Drive (same authorization precondition as today — the caller must already have checked `authorize_story_media_preview()`). `lib/story/story-pdf.ts` itself is unaffected either way — it only ever receives decoded bytes. |
| `app/sitemap.ts`, `app/robots.ts`                                                                                                                                                             | List page URLs only — no image URLs.                                                                   | No change.                                                                                                                                                                                                                                                                                                                                                                                                             |

## 6. Failure modes — rewritten for "no backup"

The old draft's table assumed a Supabase-side copy to fall back on. That
copy does not exist anymore for `google_drive`-backend media, so this table
is rewritten around the owner-decided default (section 12, Decisions, Q2):
**a story stays published, and shows a designed placeholder in place of
any image it can't currently serve. The system never auto-unpublishes.**
When **every** image in a story becomes unavailable, the contributor is
flagged — a notification plus a status shown on that story in My Stories
— so a fully-broken story doesn't sit silently unnoticed. A story with
some images still showing stays exactly as placeholder-for-the-missing-ones,
no flag, since that's the common, lower-severity case.

The placeholder is a real designed asset — alt text intact, matching the
image's recorded `alt_text`/`caption` where we have one, clearly a "this
photo isn't available right now" state, never a browser's native
broken-image icon and never a bare 404.

| Scenario                                                                                                                                                   | Reader sees                                                                                                                                                                                                 | Contributor sees                                                                                                                                                | Story stays published?                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drive file deleted (the one file this image needs)                                                                                                         | The placeholder, with the image's own alt text if recorded.                                                                                                                                                 | A "this photo is missing from your Drive" notice attached to that specific image in My Stories, plus a one-time notification.                                   | Yes — only that image is affected.                                                                                                                                                                                                                                                                                                                                                                       |
| Drive folder deleted                                                                                                                                       | Placeholder for every image that was in that folder.                                                                                                                                                        | Same per-image notices, repeated; My Stories can show a one-time "your connected Drive folder is missing" banner at the top.                                    | Yes.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Access revoked (contributor revokes from Google's side)                                                                                                    | Placeholder for every `google_drive`-backend image of theirs.                                                                                                                                               | "Drive isn't connected anymore — reconnect to restore your photos" banner in Account settings and My Stories. Connection row marked `status = 'revoked'`.       | Yes.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Token expired and refresh fails                                                                                                                            | Same as revoked — treated identically once refresh fails.                                                                                                                                                   | Same reconnect banner. Connection row marked `status = 'refresh_failed'`.                                                                                       | Yes.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Contributor unlinks Drive themselves                                                                                                                       | Placeholder for every `google_drive`-backend image, immediately.                                                                                                                                            | They saw the warning in section 8 before confirming; afterward, My Stories shows the same "photos unavailable" state as any other disconnect, with no surprise. | Yes.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Drive quota exceeded                                                                                                                                       | Placeholder, same as any other fetch failure, shown only while the quota window is exceeded — the proxy retries later requests once the quota resets, so this can self-heal without any contributor action. | Nothing proactive — this is expected to be rare and self-healing. If it persists, same as "Drive API down" below.                                               | Yes.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Drive API down (Google outage)                                                                                                                             | Placeholder while the outage lasts. CDN caching (section 5) means already-cached published images keep serving fine during a short outage — only uncached or newly-requested images are affected.           | Nothing proactive for a short outage. A sustained outage (longer than some threshold) could warrant a status-page note — operational detail, not specced here.  | Yes.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Upload abandoned halfway (browser starts the resumable session, or even finishes the `PUT`, but never calls `finalizeDriveMediaUpload`)                    | Nothing — the image was never attached to a revision, so no reader ever sees it.                                                                                                                            | The upload UI shows it as failed/incomplete, same as any other stalled upload today; the contributor can retry, which starts a fresh reservation and session.   | N/A — not a published image yet. The orphaned raw staging file (if the `PUT` did complete) is deleted by the cleanup sweep within about an hour; the stale `story_media` reservation is cancelled the same way.                                                                                                                                                                                          |
| `finalizeDriveMediaUpload` called with a forged or mismatched Drive file id (Rule 2: the server never trusts a client-supplied id)                         | No change to anything public — nothing is downloaded, processed, or deleted on a failed check.                                                                                                              | A generic "upload failed, please try again" error — never a detailed reason that would help someone probe the check.                                            | The metadata check (section 4, step 4) fails closed: wrong `kakinotes_reservation`, wrong parent folder, wrong `kakinotes_stage`, or a reservation that isn't pending/owned by this caller all reject the call outright. Nothing is deleted unless it matched. Worth alerting on repeated mismatches from the same account as a possible probing attempt — operational detail, not specced further here. |
| **Every image in a story becomes unavailable** (all its Drive files missing, or the connection revoked)                                                    | Every image on that story shows the placeholder.                                                                                                                                                            | A flag on that specific story in My Stories, plus a notification — this is the one case that gets proactively surfaced beyond the per-image notices above.      | Yes — still never auto-unpublished, per the owner's Q2 decision (section 12).                                                                                                                                                                                                                                                                                                                            |
| A move-tool transfer (section 9) can't move a specific image — its Drive file is missing, the connection is revoked, or Drive's quota is exceeded mid-move | No change — that image keeps serving from whichever backend it was already on until its own move succeeds.                                                                                                  | That one image is reported as "couldn't move" in the move tool's per-image results; the rest of the story's images that did move are unaffected.                | Yes — a partial move never takes anything offline; see section 9's idempotent, per-image design.                                                                                                                                                                                                                                                                                                         |

## 7. My Photos page (contributor-only)

A new page where a contributor sees and downloads every image they've
uploaded — this is what replaces the old "offer a zip before unlinking"
idea (section 12, Decisions, Q3): there's no separate one-off flow,
because this page always exists, and the unlink warning (section 8) just
links to it.

### What it shows

Every image the contributor has ever uploaded, **grouped by story**,
covering **every story status** — draft, in review, published, private,
and rejected — not just published ones. This is deliberately broader than
My Stories' own default view, because the point of this page is "where are
all my photos," not "what's live." The data comes through the
contributor's own regular, RLS-respecting Supabase client, the same as
every other contributor-facing page — never the admin client, and never a
staff view grafted on. A contributor sees only their own stories here; a
moderator or editor has no equivalent page, and this route is not reachable
by them (same `(contributor)` route-group gate as the rest of this area).

For each image, the page shows:

- a thumbnail (via `getImageUrl(media)`, section 5 — the contributor
  authorization branch, same as any other draft/preview image),
- which story it belongs to and that story's status,
- **where it lives** — "Kakinotes" or "Google Drive" — reusing
  `storage_backend` directly, so a contributor never has to guess,
- **a status**: `ok`, `missing in Drive`, or `needs reconnect` (derived the
  same way the failure-mode table in section 6 already decides what a
  reader/contributor sees — this page is simply where those states get a
  permanent, browsable home instead of only surfacing as a one-off
  notification),
- a **Download** button for that one image, and
- a **Download all** button once per story (not per image).

### What "download" means, and why it's always the derivative

Download always means **the processed derivative** — the same stripped,
resized, re-encoded file a reader would see — never a raw original.

- For a `google_drive`-backend image: there is no raw original to offer.
  It was processed in server memory and permanently deleted
  (`files.delete`, section 4) right after the derivative was written to
  Drive. The derivative is the only file that has ever existed past the
  upload request.
- For a `supabase`-backend image: today's pipeline (`lib/story/
image-pipeline.ts`) does **not** delete the raw original from the
  private bucket after processing — checked directly against the code,
  there is no delete call for `private_storage_path` anywhere in that
  module. So a raw original with full EXIF/GPS currently sits in the
  private bucket indefinitely for every Supabase-mode image.

Even though a raw original is technically still available for a
Supabase-mode image, **this page only ever offers the processed
derivative, for both backends, with no "download original" option at
all.** Three reasons: it keeps the page's behavior identical regardless of
backend, so a contributor never has to learn two different buttons; it
never hands back a GPS-bearing file from a page whose whole purpose is
"here are your photos," which would quietly work against the spirit of
Rule 15 even though the raw copy's _existence_ is a pre-existing,
separate fact this feature didn't create; and it matches what the
contributor actually sees published — the derivative is the real
canonical copy of "this photo on Kakinotes," not an implementation detail.

### How the download is served

- **Supabase-backed image:** a new short-lived signed URL (same pattern as
  today's `mintMediaPreviewSignedUrl`, authorized the same way, via
  `authorize_story_media_preview()`), but minted with
  `Content-Disposition: attachment; filename="..."` set on the signed
  URL's response headers, so the browser saves it instead of displaying
  it inline.
- **Drive-backed image:** the same proxy route from section 5
  (`/media/{id}`), with a `?download=1` query flag that makes it set
  `Content-Disposition: attachment` instead of serving it inline — same
  authorization path as the rest of the route, unchanged. For a
  contributor downloading their **own draft** image specifically: this
  goes through the exact same contributor-preview authorization branch
  section 5 already defines (`_can_access_story_media()` /
  `authorize_story_media_preview()`, called via the caller's own
  RLS-respecting client before the proxy fetches anything), and the
  response is `Cache-Control: private, no-store` either way — a draft
  download is never cacheable by a shared cache, same as a draft preview.

### "Download all for this story"

Three ways to build this, compared honestly:

| Approach                              | How it works                                                                                                                                                                                                                                                                                                                | Trade-off                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-file list (no zip)                | The button just reveals every image's individual download link/button at once.                                                                                                                                                                                                                                              | Simplest, zero new dependencies, but a multi-image download becomes a multi-click, multi-file-picker-dialog experience for the contributor — not what "download all" implies.                                                                                                                |
| Browser-side zip                      | The browser fetches each image through its own authorized download URL, then zips them client-side (e.g. with a small JS zip library) before saving one file.                                                                                                                                                               | No new server dependency, but it's a bigger client bundle addition and the browser holds every image in memory at once while zipping — fine for a handful of photos, uncomfortable for a story near the 12-image cap at `MAX_PROCESSED_BYTES` (8 MiB) each (up to ~96 MB in browser memory). |
| **Server-streamed zip (recommended)** | A new route streams a zip archive back to the browser, writing each image's bytes into the archive as it fetches them (from the public bucket or from Drive, per that image's backend) — never holding the whole archive, or even one fully-buffered image, in server memory longer than it takes to stream that one entry. | One new dependency (below), but keeps both server and browser memory bounded regardless of story size, and gives the contributor one familiar "Save As" dialog for one `.zip`, which is what "download all" should feel like.                                                                |

**Recommendation: server-streamed zip.** The memory argument is the
deciding one: a story can have up to 12 images (`MAX_IMAGES_PER_REVISION`)
at up to `MAX_PROCESSED_BYTES` (8 MiB) each, so "download all" has to
handle something like 96 MB without a plan that scales badly. Streaming
each entry into the zip as it's fetched, rather than assembling the whole
archive (or holding every source image) in memory first, keeps this
bounded no matter how large a story gets. This needs one new library — see
section 13 — justified specifically because Node has no zip-container
writer in its standard library (only raw deflate/gzip via `zlib`, not the
zip archive format itself), and a hand-rolled zip writer is exactly the
kind of fiddly-to-get-right binary format work this doc has already
flagged as a bad trade elsewhere (section 4, Option C's rejection).

### Route and navigation

`app/(contributor)/my-photos/page.tsx` — a Server Component by default,
matching the folder convention this route group already uses, with the
download-all route as a sibling Route Handler (e.g.
`app/(contributor)/my-photos/[storyId]/download/route.ts`). Reached two
ways: a new entry in the Account settings tabs (`account-tabs.tsx`,
alongside the Drive connect/disconnect tab from section 2), and a link
from My Stories (so a contributor already looking at their stories doesn't
have to detour through Account to find their photos).

Mobile-first per Rule 18: images grouped by story as a single-column list
on narrow viewports (matching My Stories' own existing grid/list pattern),
with the per-image status shown as a short text label, not a hover-only
tooltip, since hover doesn't exist on a touch device. Accessible per Rule
19: every status and download control has real, programmatically
associated text (not just an icon or a color), and the page is fully
operable by keyboard, same baseline as the rest of this route group.

## 8. Unlinking — the warning, and what it offers

Before a contributor can disconnect Drive, they must see a clear,
unambiguous warning, something like: _"Disconnecting will stop your photos
from showing on your published and draft stories. We don't keep a copy of
these photos anywhere else, so once you disconnect, we can't bring them
back. This can't be undone from our side."_ They must actively confirm
past this warning — not a passive "are you sure?" that's easy to click
through without reading.

Two things sit alongside that warning, now that the two features above
exist:

- A link to the **My Photos** page (section 7), so the contributor can
  see and download everything first, instead of a separate one-off zip
  flow — My Photos always exists, so there's nothing extra to build here.
- An offer to **move their photos back to Kakinotes first**, using the
  move tool (section 9), run as a "move everything" job scoped to this
  connection before it's disconnected. This is new specifically because
  the owner wants two-way moves (section 12, Decisions Q4) — unlinking is
  the single most obvious moment a contributor would want that, so the
  warning screen offers it directly rather than making them find the move
  tool separately first.

This flow still does **not** quietly copy anything into Supabase on its
own — the move tool is an explicit, contributor-triggered action with its
own progress and results, never an automatic side effect of clicking
"disconnect."

## 9. Two-way move tool

A contributor-triggered tool, run per story or as "move everything," that
moves a story's images between `supabase` and `google_drive` deliberately
— replacing the earlier "leave it forever, in both directions" default
(section 12, Decisions, Q4: the owner wants this built now).

### Supabase → Drive

**Built 2026-10-08** (see docs/implementation-status.md): the "move everything" button on
Account → Google Drive, driven one photo per request by the browser rather than a background
job; a published photo's old copies are deleted on the contributor's next run, at least 5 minutes
after the flip. "Verified" is not a separate job status: the flip RPC only runs after the
read-back sha256 matched. The job statuses are `pending` / `copied` / `switched` /
`old_deleted` / `failed`.

Requires an active Drive connection. Moves **only the processed
derivative** — never a raw original with GPS intact, per Rule 14 (there is
no reason to ever write a non-derivative file to Drive, move tool
included). Order: download the derivative from the public or private
bucket (whichever currently holds it), upload it to Drive as a **new**
file in the real app folder, verify, flip `story_media.storage_backend` to
`google_drive` in the same transaction as recording the new
`drive_processed_file_id`/`drive_folder_id`, then delete the Supabase
objects — **including the raw original in the private bucket, if one
still exists** (per section 7's finding that today's pipeline never
deletes it) — only after the flip has committed.

### Drive → Supabase

Fetches the derivative from Drive using the contributor's token. Writes it
to **whichever bucket matches the image's current state** — the public
bucket only if this `story_media` row belongs to its story's
`published_revision_id` right now (i.e. it's the live, publicly-visible
copy), otherwise the private bucket (Rules 12 and 13 — a draft or
in-review image must never land anywhere a public query could see it).
Flips `storage_backend` to `supabase` once the write is verified, then
deletes the Drive file.

### Zero broken window (Rule 11)

A published image must stay viewable for the entire move, not just before
and after it. The order is always: **copy to the new location → verify
(size and a hash/checksum match) → flip `storage_backend` and the new
location's id columns, in one database transaction → only then delete the
old copy.** The move never overwrites a file that's already published or
already serving — it always writes a brand-new object/file first and only
switches which one `story_media` points to, the same discipline section
10's Rule 11 walkthrough already requires of ordinary uploads.

What this means for caching specifically: the proxy's CDN cache
(`s-maxage=300`, section 5) and a Supabase public-bucket URL can both keep
serving the **old** location for up to that cache window after the DB flip
commits, which is fine — the old object is still there and still correct,
because the delete step hasn’t run yet. The old copy is only deleted once
that cache window has safely elapsed (or the relevant URL/path has been
actively purged, same as section 5's unpublish-purge behavior) — whichever
is sooner. A reader mid-move either sees the old location (still valid) or
the new one (also valid, once the flip has committed); there is no instant
where neither is correct.

### Idempotent and resumable

Each image's move is tracked as its own row in a new small job table (e.g.
`story_media_move_jobs`: `id`, `media_id`, `direction`, `status` —
`pending` / `copied` / `verified` / `switched` / `old_deleted` / `failed`
— plus audit timestamps), mirroring the existing
`story_media_public_copy_attempts` pattern this codebase already uses for
exactly this kind of multi-step, retryable transfer. A crash at any point
leaves an image in one of those states, every one of which is safe to
resume or retry from: before `switched`, the image is still fully on its
old backend (nothing public changed); from `switched` onward, it's fully
on its new backend and only the old copy's cleanup is outstanding. **An
image is never left with both copies deleted, and never left mid-flip** —
the DB transaction in the zero-broken-window step above is what guarantees
the flip itself is all-or-nothing.

### Privileges, keeping the existing isolation

- The Supabase-facing half (reading/writing the public/private buckets)
  stays inside `lib/story/image-pipeline.ts`, the one module allowed to
  import `lib/supabase/admin.ts`.
- The Drive-facing half (reading/writing Drive files, via the
  contributor's token) stays inside `lib/story/drive-sync.ts` /
  `lib/drive/token-store.ts`, exactly as section 4 already constrains it.
- A move, by definition, needs both secrets in the same job. This does
  **not** mean merging the two modules or widening the ESLint allowlist —
  a new orchestrating function (e.g. in a new `lib/story/media-move.ts`)
  calls into `image-pipeline.ts` for the Supabase-side step and
  `drive-sync.ts` for the Drive-side step, passing only plain bytes
  between them, the same hand-off shape section 4 already uses between
  the pipeline and Drive upload. Neither privileged module imports the
  other's secret-holding dependency; the orchestrator holds no secret of
  its own, only plain image bytes in transit.

### Limits and failure handling

An image that can't be moved — its Drive file is missing, the connection
is revoked, or Drive's quota is hit mid-move — is **skipped and reported
individually**; it stays on its current backend (per the zero-broken-
window guarantee above) and shows up in the move tool's results as "could
not move," never silently dropped. "Move everything" across many stories
is rate-limited against Drive's own per-user quota (section 5) the same
way the cleanup sweep already has to be.

**Given the owner's Q10 answer (run the pipeline inline for now, section
11), a single-image move can run inline in a request. "Move everything,"
which can touch every image across every one of a contributor's stories,
runs as a background job** — the same reasoning as section 4(c)'s
function-duration concern, just multiplied across many images instead of
one. The contributor sees a progress state (e.g. "12 of 40 moved") rather
than a single request that has to stay open for the whole batch.

### Rule 15 check

None of this moves a raw original into Drive at any point, in either
direction — Supabase → Drive moves only the already-processed derivative
(the Supabase-side raw original, if one exists, is deleted, never
uploaded anywhere), and Drive → Supabase moves the Drive derivative file
itself, which was already stripped before it was ever written to Drive.

## 10. Rule conflicts and mitigations

Rules 13 and 14, as originally worded, assumed Supabase buckets were the
only place story images could be ("private bucket," "public bucket") —
not literally true once a `google_drive`-backend row exists. The owner
reviewed and approved the replacement wording below on 2026-10-03, and it
has since been applied to CLAUDE.md directly (a separate change, not part
of this doc). Section 12, Decisions, Q1 records this as resolved.

> **Rule 13 — APPROVED 2026-10-03, applied to CLAUDE.md:**
> "An unapproved image must never be reachable by anyone other than its
> owner, the assigned editor, and a moderator actively reviewing it. For a
> Supabase-backed image, this means the private bucket until approved,
> served exactly as today. For a Drive-backed image, this means the proxy
> route's authorization check (never a Drive share link) is the only path
> to its bytes, for every state — draft, in review, or published. The
> proxy route only ever serves Drive-backed images — it refuses (404) any
> request for a Supabase-backed one, so it can never become a second,
> unaudited path into the private bucket."
>
> **Rule 14 — APPROVED 2026-10-03, applied to CLAUDE.md:**
> "Only a processed, approved derivative with stripped metadata (EXIF/GPS
> etc.) is ever shown to a public reader. For a Supabase-backed image, this
> is the public bucket, unchanged. For a Drive-backed image, this is the
> one derivative file this platform ever writes for public use — the raw,
> unprocessed original, if it reaches Drive at all, exists there only as a transient staging file,
> never shared or linked, permanently deleted (not trashed) as soon as its
> one-time processing run finishes. The proxy route is the only path a
> reader's request can take to reach the derivative, and it never serves
> the staging file."

Walking the other rules this design touches:

- **Rule 10** (public queries select only the approved, published
  revision): a `supabase`-backend image already satisfies this exactly as
  it does today — nothing about that path changes. A `google_drive`-backend
  image satisfies it via the proxy's anonymous check (section 5), a new,
  narrow RPC that re-derives `published_revision_id` from the database on
  every request, scoped to `storage_backend = 'google_drive'` rows only.
- **Rule 11** (an unapproved edit must never overwrite or replace what's
  publicly visible): this is the rule Drive's mutability makes genuinely
  trickier, and the design is built specifically to satisfy it. Two things
  make that true: first, **a new revision's image edits always create a
  brand-new Drive file** (a new `drive_processed_file_id`) rather than
  overwriting the bytes behind an existing one — exactly mirroring how a
  new revision today gets a new `story_media` row rather than mutating a
  published one. Second, **the proxy route is keyed only by `story_media.id`
  , never by a Drive file id or path directly** — a client never holds a
  Drive path it could swap out from under us, and nothing about the
  content of a published image can change without a new row (and therefore
  a new moderation approval) existing first. The move tool (section 9)
  follows the identical discipline for a different kind of change — moving
  backends, not editing content — by always writing a new object/file
  first and only flipping which one `story_media` points to inside one
  transaction, never overwriting a file that's already published.
- **Rule 12** (draft/private/rejected/archived content must never appear in
  public queries, sitemaps, metadata, or public image delivery): a
  `supabase`-backend image satisfies this exactly as today. A
  `google_drive`-backend image satisfies it because the proxy is the only
  path to a Drive-backed image's bytes, its anonymous check only ever
  passes a published-revision row, and the route refuses (404) a request
  for any id that isn't a Drive-backed row in the first place — there is no
  second code path (no direct Drive link, no raw file ever reachable) that
  could leak a non-published or staging image out.
- **Rule 14**: see the proposed replacement above. Satisfied for Drive
  rows because the only durable file this feature ever writes for public
  use is the processed derivative; the raw original exists in Drive only
  as a transient, permanently-deleted staging file, and the proxy never
  serves that staging file even if it somehow still existed (it isn't the
  file `drive_processed_file_id` points to).
- **Rule 15** (no passport scans, visa documents, bank credentials, exact
  live location, or medical records, ever): the GPS concern is **narrowed,
  not eliminated** by switching to Option D — worth being precise about
  the difference. The raw original, full EXIF and GPS intact, now briefly
  exists in two places instead of one: (1) as a staging file in the
  contributor's **own** Drive, between the resumable upload finishing and
  `files.delete` running (bounded by the 30–60 minute reservation-expiry
  window in section 4, expected to be seconds in the normal case), and
  (2) in our server's **process memory** during the download-decode-strip-
  reencode-upload step, never written to any disk or bucket of ours. The
  meaningful improvement over the rejected Option B is that nothing
  location-bearing ever touches **our own** infrastructure in persisted
  form — only the contributor's own account, briefly, and our server's RAM,
  briefly. The one gap called out honestly in section 4(d): a revoked or
  refresh-failed connection's orphaned staging file cannot be swept by us
  at all, so in that specific case the window is not "briefly" but
  "indefinitely, in the contributor's own Drive, until they act" — still
  their own storage, not ours, but worth the owner knowing this edge case
  exists. The move tool (section 9) introduces no new exposure here: it
  only ever moves the already-processed derivative, in either direction,
  and explicitly never uploads a raw original to Drive.

## 11. Build slices

Ordered so each is independently shippable and testable, smallest safe
slice first.

1. **OAuth connect/disconnect, no upload integration yet.**
   `contributor_drive_connections` table + RLS, the connect/callback
   routes, the Account settings tab showing connected/not-connected, the
   disconnect flow with the warning from section 8 (store a
   confirmation timestamp or similar so the warning can't be silently
   skipped by a replayed request). No image ever touches Drive yet.
   _Acceptance:_ a contributor can connect, see status persist, and
   disconnect only after confirming the warning. RLS test proves
   anon/authenticated cannot read the token table directly. No change to
   any upload or read behavior for anyone.

2. **Spike: confirm the resumable-upload CORS question, then build the
   token module and the resolver.** Before anything else in this slice is
   built on top of it, spend a short, time-boxed spike confirming whether a
   browser can actually `PUT` to a Drive resumable session URI
   cross-origin (section 4(a) — not confirmed from official docs). The
   outcome decides which upload path slice 3 builds: if the `PUT` works,
   slice 3 builds Option D as specced (browser PUTs straight to Drive). If
   it's blocked, slice 3 builds Option A instead — the browser-side
   shrink-and-`POST` fallback from section 4(a) — which reuses the same
   server-side verify/pipeline/write-to-Drive logic either way, just fed by
   a `POST` body instead of a Drive download. Either outcome is a
   same-shaped slice 3, not a re-spec.
   Once the spike result is known, build `lib/drive/token-store.ts` (encrypt/decrypt,
   refresh-on-demand), `lib/story/drive-sync.ts`, the ESLint allowlist
   entry, and the `getImageUrl(media)` resolver from section 5 — wired in
   but with every image still `storage_backend = 'supabase'` at this point,
   so the resolver's Drive branch has nothing to serve yet.
   _Acceptance:_ the CORS spike's result is written down (pass/fail) before
   any other work in this slice is considered done. `getImageUrl(media)`
   returns byte-identical output to today's direct `getPublicImageUrl()`
   call for every existing image, proven by a test that calls both and
   asserts equality. Unit tests on `token-store.ts` prove encryption/refresh
   behavior with a mocked Google endpoint. `npm run lint` passes with the
   new restriction.

3. **`storage_backend` column + Drive-mode upload (Option D, or Option A if
   slice 2's spike says Option D's `PUT` is blocked) + the Drive half of
   the proxy route.**
   The `story_media` migrations from section 3, the upload flow from
   section 4 — either Option D (resumable session → browser PUT → verified
   finalize) or its fallback Option A (browser shrinks + POSTs → server
   runs the same verify/pipeline step), whichever the slice-2 spike
   selected — both converging on: in-memory pipeline → Drive derivative
   write → any staging file permanently deleted. Wired in only for
   contributors with an active connection. The proxy route
   (`app/media/[mediaId]/route.ts`) ships, serving `google_drive`-backend
   rows per section 5 and 404ing on `supabase` rows. Non-Drive uploads and
   non-Drive reads are untouched.
   _Acceptance:_ a Drive-connected contributor's new upload ends up with
   `storage_backend = 'google_drive'`, a `drive_processed_file_id`, and
   nothing in any Supabase bucket — asserted directly against
   `storage.objects`, which should show zero rows for that media id at any
   point during the test, not just at the end. A second test proves the
   function-time/memory concern from section 4(c) isn't a silent failure:
   a realistic ~25–30 MB fixture completes within the configured function
   duration. A third test proves the forged-file-id failure mode (section
   6): calling `finalizeDriveMediaUpload` with a `driveFileId` that doesn't
   match the reservation's `appProperties` is rejected and nothing is
   downloaded or deleted. A fourth proves non-Drive behavior is provably
   unchanged: run the full existing upload/read test suite for
   `supabase`-backend media unmodified and confirm it still passes verbatim
   — no test in that suite should need editing for this slice to land.
   A fifth proves the route's own boundary: requesting
   `/media/{id}` for a known `supabase`-backend id returns 404.

4. **Cleanup sweep for abandoned staging files.** The scheduled job from
   section 4: per active connection, list and permanently delete stale
   `kakinotes_stage='raw'` files, cancel the matching reservation, and log
   (rather than crash) on a `revoked`/`refresh_failed` connection it can't
   act on.
   _Acceptance:_ a seeded staging file older than the threshold, with an
   `active` connection, is deleted and its reservation cancelled on the
   next sweep run. A second seeded file under a `revoked` connection is
   left untouched, and the run completes without error (confirms section
   4's honest gap is a logged no-op, not a crash).

5. **Failure-mode handling, placeholder, and CDN caching.**
   The full table in section 6, the placeholder asset, the anonymous
   check's `s-maxage`/purge-on-unpublish behavior from section 5. Update
   every call site in section 5's table to go through `getImageUrl(media)`
   (or its signed-URL equivalent for the two private-preview sites) instead
   of calling `getPublicImageUrl`/`mintMediaPreviewSignedUrl` directly.
   _Acceptance:_ a Playwright test simulates a revoked token (mocked
   Google response) and confirms the reader sees the placeholder (not a
   broken-image icon), the contributor sees the reconnect banner, and an
   unrelated already-published story — Drive or Supabase-backed — is
   untouched. A second test confirms an unpublish action purges that
   story's cached proxy responses within the stated bound. A third
   re-confirms every `supabase`-backend call site's rendered output is
   byte-for-byte identical to its pre-change snapshot, now that the
   resolver sits in front of it.

6. **PDF export.** The `downloadMediaPreviewBytes` backend-aware branch
   from section 5's call-site table.
   _Acceptance:_ a PDF export of a story with a mix of `supabase`- and
   `google_drive`-backend images embeds both correctly.

7. **Reconnect prompt for unfinished Drive uploads (section 12, Decisions,
   Q11).** When a contributor reconnects a `revoked`/`refresh_failed`
   connection, check for any `kakinotes_stage='raw'` files still sitting in
   their staging folder before the next scheduled sweep gets to them, and
   show a prompt offering to finish processing them or delete them.
   _Acceptance:_ reconnecting an account with one seeded orphaned staging
   file shows the prompt; choosing "finish" runs `finalizeDriveMediaUpload`
   for it; choosing "delete" removes it outright. Reconnecting an account
   with no orphaned files shows no prompt.

8. **My Photos page.** The page and its route from section 7, both
   download paths (signed URL for `supabase`, proxy `?download=1` for
   `google_drive`), and the per-image status column. Depends on slices 2,
   3, and 5 (the resolver, Drive uploads, and the proxy both existing).
   _Acceptance:_ a contributor sees every one of their own images across
   every story status, correctly labeled with backend and status. A
   second contributor's account sees none of them. Downloading a
   `supabase`-backend image and a `google_drive`-backend image both save a
   file with `Content-Disposition: attachment`, not an inline render.

9. **"Download all for this story," then the move tool.** The
   server-streamed zip route from section 7 first (lower risk, no new
   cross-backend state machine), then the move tool from section 9 — the
   job table, the Supabase↔Drive orchestration, the per-image move, then
   "move everything" as a background job. The unlink flow's "move back to
   Kakinotes first" offer (section 8) lands as part of this slice, since
   it's just the move tool invoked from one more place.
   _Acceptance (zip):_ downloading all images for a story with a mix of
   backends produces one valid zip containing every image's derivative,
   without the route's memory usage scaling with story size (verified by
   running it against a story at the 12-image cap and checking the
   process doesn't buffer the whole archive). _Acceptance (move tool):_ a
   single-image move in each direction passes the zero-broken-window test
   from section 9 (the image stays fetchable throughout, via a test that
   polls it during the move); killing the job mid-move leaves the image
   fully on one backend, never both deleted; retrying a killed job
   completes it; an image with a missing/revoked Drive file is skipped and
   reported, not fatal to the rest of a "move everything" batch.

## 12. Decisions

Each item below was an open question in an earlier draft. The owner has
now answered all twelve; this section records the answer and which part of
the doc it changes.

1. **Rule 13/14 wording — resolved.** Approved 2026-10-03 and applied to
   CLAUDE.md directly (outside this doc). Section 10 records the approved
   wording.
2. **Auto-unpublish vs. always-placeholder — stay published, with
   placeholders; flag when every image is gone.** Never auto-unpublish.
   When **all** of a story's images become unavailable, flag it to the
   contributor (notification + a status on that story in My Stories).
   Changes: section 6's intro and failure table (new row), section 1's
   summary.
3. **Offer a zip before unlinking — replaced by the My Photos page.**
   Instead of a one-off zip offer at the unlink moment, there's now a
   standing **My Photos** page (section 7) where a contributor can browse
   and download everything at any time, and the unlink warning (section 8)
   links to it. No separate zip-before-unlink flow exists.
4. **Mode-switching defaults — build a two-way move tool now,** not "leave
   forever." See the new section 9 (move tool) in full, and section 8's
   updated unlink flow, which now offers "move back to Kakinotes first" as
   part of the same tool.
5. **Max file size for Drive-mode uploads — unchanged.** Keep today's
   `MAX_UPLOAD_BYTES` / `MAX_HEIC_UPLOAD_BYTES` (`lib/story/
image-validation.ts`) as-is for Drive mode; no stricter Drive-specific
   ceiling. No doc changes needed beyond this record.
6. **Editor-imported contributors — account holders only.** A contributor
   with no `auth.users` row cannot connect Drive; the token table's
   `user_id` foreign key (section 3) already assumes this, so no schema
   change is needed, just confirmation that this is intentional, not a gap.
7. **`s-maxage` — 300 seconds (5 minutes), as recommended.** Section 5's
   caching discussion is confirmed as-is, no change needed.
8. **CORS on the resumable `PUT` — settled 2026-10-07: it works (with `Origin` set), so Option D is built.** See the spike result in section 4(a). Original note: The
   spike (section 11, slice 2) still decides between Option D and the
   Option A fallback; nothing about the decision process itself changed.
9. **HEIC handling in the Option A fallback — keep the doc's split.**
   Send an already-small HEIC unshrunk; ask for a JPEG export only when a
   large HEIC can't be shrunk client-side. Section 4(a)'s recommendation
   stands as written.
10. **Function duration for the Drive pipeline step — configure a longer
    duration first; move to a background job only if real timeouts show
    up.** This codebase has **no existing `maxDuration` configured
    anywhere** today (checked `next.config.ts` and the repo root for a
    `vercel.json` — neither sets one, so every route currently runs on
    the platform default). Recommend setting **`export const maxDuration
= 60`** (seconds) on the Drive finalize route specifically
    (`app/(contributor)/stories/[id]/edit/upload/` or wherever
    `finalizeDriveMediaUpload` ends up living) — 60s is within the
    default limit on every current Vercel plan tier (no plan upgrade
    required to set it explicitly), and well above what a download +
    sharp pipeline + re-upload should normally take. If real production
    telemetry later shows this step timing out even at 60s, move it to a
    background job at that point rather than raising the duration further
    — section 4(c) is updated to reflect "configure 60s now" as the
    starting plan, background job as the fallback if needed.
11. **The un-sweepable orphaned-staging-file gap — surface it on
    reconnect.** When a contributor reconnects, show a prompt if they have
    unfinished photo(s) waiting in their Drive staging folder, offering to
    finish processing them or delete them. New build slice 7 (section 11)
    implements this.
12. **Reservation-expiry window — 30 minutes.** Section 4(b)'s "30–60
    minutes" range is narrowed to a fixed 30 minutes.

### Decisions on the questions raised by My Photos and the move tool

13. **Concurrent heavy jobs (sections 7 and 9)** — **Decided 2026-10-03:
    one heavy job per contributor at a time.** A "move everything" job
    (section 9) and a "download all" zip (section 7) are both heavy jobs.
    While one is running for a contributor, starting another is refused
    with a plain "you've already got one running — try again when it
    finishes" message, not queued. Single-story moves and single-image
    downloads are not heavy jobs and are not blocked. Enforce it
    server-side (Rule 2), e.g. by checking for an active
    `story_media_move_jobs` run or an in-flight zip for that contributor
    before starting, so two browser tabs can't get around it.
14. **Move-tool audit trail (section 9)** — **Decided 2026-10-03:
    contributors see only the per-image "could not move" results.**
    `story_media_move_jobs` stays an internal, operational record. It is
    not shown as a contributor-facing move history. Staff can read it for
    support and debugging.

## 13. New dependencies

**The browser-side shrink fallback (section 4a, Option A) needs no new
library.** `createImageBitmap` and `OffscreenCanvas` (or a plain `<canvas>`
element as a fallback for either not being available) are built into every
browser this app already needs to support — decode, draw at the capped
dimensions, and re-export as a JPEG `Blob` via `canvas.convertToBlob()` /
`toBlob()` are all standard Web APIs. No WASM image library or npm package
is needed for this path.

One new dependency is expected, for the Drive-facing work itself: an
official Google API client for Node
(e.g. `googleapis`, or the narrower `google-auth-library` plus direct REST
calls to the Drive v3 API). Justification: implementing OAuth token
exchange, refresh, and the Drive upload/download REST calls by hand with
raw `fetch` is possible — the codebase already does something similar for
Supabase Storage in `lib/story/raw-storage-http.ts` — but that existing
raw-HTTP approach was built to fix an observed binary-corruption bug, not to
avoid one; OAuth token handling has enough edge cases (clock skew, token
expiry formats, error-code variants) that using Google's maintained client
is the lower-risk default here. If the eventual implementer finds the full
`googleapis` package too heavy, the narrower `google-auth-library` package
alone (just for the OAuth/token part) plus hand-written REST calls for the
file upload/download (mirroring `raw-storage-http.ts`'s pattern) is a
reasonable lighter alternative — either choice should state its reason in
the PR description per Engineering Rule 20.

A second new dependency is expected for My Photos' "download all" feature
(section 7): a streaming zip-archive library for Node (e.g. `archiver`).
Justification: Node's built-in `zlib` module only does raw deflate/gzip
compression, not the zip _container_ format itself, and a story's images
can total close to 96 MB (12 images at up to 8 MiB each) — a streaming
writer is needed so the route never buffers a whole archive, or every
source image, in memory at once. `archiver` is a well-established,
actively maintained package built exactly for this (stream entries in,
stream a zip out); hand-writing a zip encoder would be exactly the kind of
fiddly binary-format work this doc already avoided elsewhere (section 4,
Option C's rejection) for no real benefit.
