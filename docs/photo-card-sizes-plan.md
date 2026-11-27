# Card photo plan: fewer cache misses, then cheaper ones

Status (2026-11-27): **Option A is approved and built. Option B is approved and built on
`feat/stored-card-sizes` but NOT deployed: migration `20261127090000_story_media_card_sizes.sql` is
written and NOT applied, and the backfill script has not been run.** The Rule 14 change (wording
below) is approved and applied to CLAUDE.md. Option C is not approved and not built. The "photo
file deleted" row below is an accepted trade-off. Vercel (Oct 28 - Nov 27): Active CPU 4h 8m of
4h; `/media` used 41 s of about 70 s of function CPU in 12 hours. The migration must be applied
(owner's explicit OK, it is production) before the code is deployed.

## What we know, and what we do not

- A `/media` request costs CPU only when the CDN has no copy.
- Vercel's cache key includes the deployment URL, and the cache is per region
  (vercel.com/docs/cdn-cache/purge and /cdn-cache). So a new deployment should start with an empty
  photo cache; the docs do not say so outright, and it has not been confirmed on this project.
- There were about 150 production deployments from 2026-10-25 to 2026-11-24 (GitHub). 4.7.5 now
  skips docs/changelog-only ones.
- Live totals on 2026-11-25: 741 Drive photos, 698 of them published, 2 owners, average 441 KB.
- One resize, measured on a Mac with a synthetic 1500x2000 photo: about 47 ms CPU at 640px and
  95 ms at 1080px. Earlier measurement on real photos: 36-68 ms.

**Resizing may not be the main cost.** 5,000 requests in a day, if every one were a resized miss,
is about 4-8 CPU-minutes on this Mac. The free plan allows 240 a month, so the two known busy days
together explain roughly 3-7% of it. Vercel's CPUs may be slower, and other days were not counted.
Vercel's per-route usage would settle it; nobody has looked yet.

## Option A: stop purging photos when no photo changed

No migration. No change to Rules 13 or 14.

Today `invalidateStoryPublicCache`, `invalidateStoryListingsPublicCache` and
`invalidateContributorPublicCache` each clear every cached photo.

A purge can only matter if the action changes the answer of `get_drive_media_for_proxy()`. For a
reader that depends on: the story's `visibility`, `lifecycle_status`, `published_revision_id` and
`consent_revoked_at`; the published revision's photo list; its consent row; and the photo's
`storage_backend`, Drive file id and mime type. It never reads `contributors`.

| Action                          | What it writes                   | Photo purge |
| ------------------------------- | -------------------------------- | ----------- |
| Approve and publish             | `published_revision_id`          | keep, all   |
| Archive                         | `lifecycle_status`               | keep, all   |
| Takedown approved               | consent and status               | keep, all   |
| Journey pin set or cleared      | `journey_*` columns only         | remove      |
| Story filed or unfiled          | `parent_story_id` only           | remove      |
| Avatar, or identity create/edit | `profiles` / `contributors` only | remove      |
| Photo moved to Drive            | backend and file id (see below)  | remove      |

- **Contributor edits:** the code comment says a contributor leaving public view "can take their
  photos with them". The proxy does not check that, so today's purge is undone by the next request.
- **Move to Drive:** before the switch `/media/<id>` is a 404 sent with `private, no-store`, so there
  is no cached copy to go stale.

How: the two story helpers keep purging by default, so a future caller that forgets to think about
it over-purges. Journey, filing and Drive moves use new page-only helpers. The contributor helper
simply loses its purge, since no caller of it can change a photo. Page and data invalidation stays
exactly as it is.

Rules 11-14: 11, 12 and 13 hold because every action that changes the proxy's answer still purges
everything; 14 is untouched.

Tests: each "keep" action still purges the tag; each "remove" action still invalidates its pages and
does not purge.

## Option B: store the two card sizes

Needs a Rule 14 change and a migration. Removes the resize on a miss and shrinks the Drive download
(about 441 KB to roughly 50-200 KB). It does not reduce the number of misses.

### Proposed Rule 14 wording

Replace "this is the one derivative file this platform ever writes for public use" with:

> this is the one display derivative plus its two fixed card-size copies (640 and 1080 wide, 4:3
> WebP), each made only from that already-stripped derivative, never from the raw original. These
> three files are the only ones this platform ever writes for public use.

And extend the proxy sentence to "reach the derivative or a card-size copy". Rule 13 is unchanged.

### Data

New table `story_media_card_sizes`: `media_id` (FK, `on delete cascade`), `width` (640 or 1080),
`drive_file_id`, `source_drive_file_id`, `sha256`, `file_size_bytes`, timestamps, unique on
(`media_id`, `width`). RLS on, no policies: reachable only through these functions.

- `get_drive_card_for_proxy(media_id, width)` selects **from `get_drive_media_for_proxy()`** and
  left-joins the new table, so authorization is called, not copied. The join requires
  `source_drive_file_id` to equal the current Drive file id, so a copy of a replaced photo is never
  returned. It also returns `story_id` (Option C).
- `record_drive_card_size(...)`: the story's own self-submitted owner only, the same check as
  `record_drive_media_full_copy()`; refuses a source id that is not the current one.

### Writing

In `processAndRecordDriveMedia()`'s existing `after()`, from the processed bytes and not the raw ones.
Best effort: upload, record, and delete the Drive file if recording fails. An upload never fails
because of this. Files go in a "Card sizes" subfolder of the story folder, named `<mediaId>-640.webp`.

### Serving

`?w=` uses the new function. It serves the stored file after checking its sha256. If there is no row,
Drive has no such file, or the hash differs, it falls back to today's download and resize. Same
authorization, cache header and purge tag. `?download=1` still gets the full photo. The hash matters
because today's resize re-encodes the bytes, while a stored file would otherwise be sent as it is.

### Cases

| Case                               | What happens                                                        |
| ---------------------------------- | ------------------------------------------------------------------- |
| Caption, cover or reorder          | Nothing. Names use the media id, so no renumbering                  |
| Photo replaced                     | A new photo row, so new sizes; the source-id check covers any other |
| Photo removed from a story         | Files stay in the contributor's Drive, as the display copy does     |
| Draft story deleted                | Rows go by cascade; files stay, as the display copy does            |
| Moved from Kakinotes to Drive      | Sizes made after the switch, best effort                            |
| Story folder renamed or moved      | Nothing. Drive ids do not change                                    |
| Drive disconnected                 | Same 502 as today                                                   |
| Contributor deletes a card file    | Falls back to resizing                                              |
| Contributor deletes the photo file | **Change:** cards keep working until the small copies go too        |
| Existing 741 photos                | Resize fallback, plus a dry-run-by-default backfill script          |

The backfill follows `scripts/drive-backfill-story-folders.mjs` (run on the Mac, service role, never
on Vercel). It writes to contributors' Drives, so it runs only on the owner's say-so.

The "photo file deleted" row matters most: today deleting the file in Drive takes the photo off
the site once caches expire. Checking that the original still exists would cost an extra Drive call
per miss. Suggested: accept it, and say in the docs that deleting the story folder removes
everything.

## Option C: purge one story on approval

Uses `story_id` from Option B's function, so it comes with B. The full-size path needs it too, through
a similar wrapper. Each published response gets a second tag for its story. Approving a story purges
only that tag, which covers any photo the new revision dropped. Archive and takedown keep purging
everything, so removal is no weaker than now. If the story id is not known, everything is purged.
Vercel allows 128 tags per response. The docs do not say whether the tag header reaches the browser;
a story id grants nothing if it does.

## Recommendation

1. Build **A** now.
2. Look at Vercel's Active CPU by route.
3. Build **B and C** only if `/media` is a large share of it.

Any migration is written but not applied without a separate, explicit OK: the Supabase project is
production. It must be applied before the code that calls it is deployed.
