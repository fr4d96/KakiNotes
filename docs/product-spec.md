# Product Spec — Kakinotes

## Purpose

Kakinotes exists to help people considering or undertaking a Working Holiday Visa (WHV) in
New Zealand find **real, detailed, written first-person stories** from people who did it — organized
so a reader can find stories relevant to their own situation, and trust that what they're reading is
a genuine personal account, properly attributed, with rights-cleared images.

The product is **stories-first**. It is not a planning tool, not a jobs board, not a social network,
and not a source of professional advice. Every other capability exists to serve the discovery and
trustworthy publication of written stories.

## Audiences

### Readers (public, no account required)

People researching a WHV to New Zealand — initially concentrated among Malaysian travellers, but the
product must not assume a single nationality. Readers want to filter and browse stories by things that
map to their own plans: region/destination, work type, trip year, travel style, reported cost.

### Contributors (registered)

People who have completed or are undertaking a WHV and are willing to write and publish their story
under their own attribution (full name, first name + initial, or a pseudonym — contributor's choice,
recorded explicitly). Contributors draft, preview privately, and submit for moderation.

### Editors (founding-catalogue only)

Staff/volunteers who onboard the initial catalogue: importing stories and images that already exist
in written form from early contributors, formatting them into the platform's structured story schema,
and recording the contributor's attribution and rights confirmations before anything is submitted for
moderation.

### Moderators

Staff who review submitted stories/imports against publication and content-governance rules (see
[docs/content-governance.md](content-governance.md)) and decide to approve, reject, or request changes.
Moderators are not the same role as editors, even though one person may hold both roles.

## Journeys

### Curated founding catalogue (editor-assisted import)

1. Editor imports an existing written story + images supplied by an early contributor (outside the
   platform — e.g. a document and photos).
2. Editor structures the story into the platform's block-based story schema and attaches images.
3. Editor records: contributor attribution as the contributor wants it displayed, publication
   permission confirmation, and image-rights confirmation for each image.
4. Editor (or the contributor, if they have an account) previews the draft privately.
5. Draft is submitted for moderation.
6. Moderator approves → story becomes a published, publicly readable revision. Or rejects with reason.

### Self-service contribution

1. A person registers as a contributor.
2. They create a draft story using the same structured schema, add images.
3. They preview privately, at any point, exactly as it will appear publicly.
4. They submit for moderation when ready.
5. Moderator approves → published revision. Or rejects with reason, draft returns to contributor.
6. Contributor may later submit a revision to a published story; the previous approved revision
   stays live until the new revision is itself approved (Engineering Rule 11).

## MVP scope

- Public browsing of approved stories, filterable by region, destination, work type, trip year,
  travel style, and reported cost band.
- Structured written stories (defined content blocks, not free HTML) with inline images.
- Image upload with automatic metadata stripping before publication.
- Contributor attribution (contributor-chosen display name) and optional public contributor profile
  with only contributor-approved fields visible.
- Editor-assisted import workflow for the founding catalogue.
- Private drafts with an accurate private preview before submission.
- Revision-safe publishing: edits to a published story never go live until separately approved.
- Moderation queue: approve / reject with reason, for both self-service submissions and imports.
- Reporting: a way for readers to flag a published story or image for review.
- Search and the filters listed above.
- Story journey illustration: a contributor may pin up to 12 ordered MAIN stops (a short place-name
  label, optionally linked to a heading in the story), and inside each main stop up to 8 sub-stops
  ("places inside", at most 40 stops in total; one level only, grouped by the contributor, never
  automatically). Readers see the main stops as the route; opening a main stop shows its sub-stops,
  with a "Back to whole journey" control. Readers see a stylised, illustrated New Zealand
  with the route and an animated campervan (a ferry across Cook Strait). It is a picture, not a
  map: no map tiles or third-party map provider, no reader geolocation, no routing, distances or
  itinerary planning. Readers may zoom and pan the illustration itself (zoom buttons, drag,
  Ctrl/⌘-scroll, pinch, keyboard; one-finger touch still scrolls the page) and re-centre it on
  the van. Coordinates are rounded server-side (~1 km), must fall inside New Zealand, and are
  never shown to readers; stops are reviewed as part of the story revision.
- SEO (indexable pages, sitemap, structured metadata) for approved published stories only.
- Operational tooling needed to actually launch with the first real contributors' content
  (import UI/scripts, moderation queue, basic admin visibility) — no more than that.

## MVP non-goals

Explicitly out of scope for MVP — do not build:

- Audio or video stories, or transcription of either.
- Comments, likes, following, messaging, or any social/feed mechanic.
- Live job listings.
- Budgeting tools.
- Preparation checklists.
- Personal visa-status or visa-application tools.
- Itinerary planning.
- Interactive maps (map tiles or third-party map providers, geolocation, route or itinerary
  planning). The one permitted exception is the **story journey illustration** described under MVP
  scope, whose reader zoom/pan applies to that stylised illustration only.
- Native mobile apps.
- Support for other **WHV-country programs** (Australia, Canada, etc.) — the data model stays
  country-agnostic where cheap to do so, but no second WHV-visa-country product surface ships in
  MVP. **Overridden for China specifically, 2026-10-14** (owner decision, recorded in
  [docs/implementation-status.md](implementation-status.md)): China ships as a second country
  section, framed as general first-person travel stories — not WHV, since China has no Working
  Holiday Visa program relevant to this product's Malaysian audience. This is a narrow,
  named exception for one country under its own non-WHV framing, not a reopening of
  multi-country WHV support in general.
- Personalised immigration, legal, employment, tax, or financial advice, or anything that reads as such.
  Every story is explicitly labeled as one person's personal experience (Engineering Rule 17).

## Publishing and trust principles

- A story is either a private draft/pending revision, or a publicly visible **approved published
  revision** — nothing in between is ever publicly reachable (Engineering Rules 10–12).
- Attribution, publication-permission consent, and image-rights confirmation are recorded data, not
  assumptions — see [docs/content-governance.md](content-governance.md).
- Every public story is visibly labeled as a personal experience, not professional advice.
- Nationality, destination, region, and work classification are modeled as reference data so the
  platform can expand beyond its initial Malaysia-focused launch without code changes.
