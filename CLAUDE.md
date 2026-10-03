# CLAUDE.md — Kakinotes

This file orients any engineer (human or AI) working in this repository. Read it, and
[docs/implementation-status.md](docs/implementation-status.md), before starting any task.

## Product context

Kakinotes is a public platform for detailed, written first-person stories from people
who completed or are completing a Working Holiday Visa (WHV) experience in New Zealand.

- The product is **stories-first**: structured, searchable, trustworthy written accounts with images —
  not a social feed, not a planning tool, not a source of personalised advice.
- Initial contributor content already exists (written stories + images) and must be importable by editors.
- Initial market is Malaysian WHV travellers, but nationality, destination, and work classification
  are **data**, not hard-coded strings or enums baked into UI copy or logic.
- Full scope is defined in [docs/product-spec.md](docs/product-spec.md). Do not build anything listed
  under MVP Non-Goals there (audio/video, comments/likes/follow, live jobs, budgeting, checklists,
  personalised visa/legal/tax advice, interactive maps, native apps, multi-country support).

## Engineering rules

1. Never expose the Supabase service-role key to browser-accessible code. Server-only.
2. Never trust client-supplied user IDs, roles, contributor IDs, ownership, status, revision IDs,
   consent state, or publication state. Re-derive/verify server-side on every mutation.
3. Row Level Security is the source of truth for authorization; application code repeats the important
   checks server-side but never _substitutes_ for RLS.
4. Keep user-editable profile data separate from protected role/permission data — different tables.
5. Editorial preparation (import, attribution cleanup) is a distinct workflow from moderation
   (approve/reject) — different roles, different tables/state where practical.
6. Story content is controlled structured JSON (a defined schema of blocks), never raw/arbitrary HTML.
7. Any pasted/rich-text input is sanitized before storage and rendered only through controlled
   components — never `dangerouslySetInnerHTML` on raw user input.
8. UUID primary keys; `timestamptz` audit columns (`created_at`, `updated_at`) unless documented otherwise.
9. Travel dates are calendar dates (`date`), not timestamps.
10. Public queries select only the **approved, published revision** of a story. Never join across
    draft/pending/rejected state into a public-facing query.
11. An unapproved edit must never overwrite or replace what is publicly visible.
12. Draft, private, rejected, and archived content must never appear in public queries, sitemaps,
    metadata, previews-by-URL-guessing, or public image delivery.
13. An unapproved image must never be reachable by anyone other than its owner, the assigned
    editor, and a moderator actively reviewing it. For a Supabase-backed image, this means the
    private bucket until approved, served exactly as today. For a Drive-backed image, this means
    the proxy route's authorization check (never a Drive share link) is the only path to its
    bytes, for every state — draft, in review, or published. The proxy route only ever serves
    Drive-backed images — it refuses (404) any request for a Supabase-backed one, so it can never
    become a second, unaudited path into the private bucket.
14. Only a processed, approved derivative with stripped metadata (EXIF/GPS etc.) is ever shown to
    a public reader. For a Supabase-backed image, this is the public bucket, unchanged. For a
    Drive-backed image, this is the one derivative file this platform ever writes for public use
    — the raw, unprocessed original, if it reaches Drive at all, exists there only as a transient
    staging file, never shared or linked, permanently deleted (not trashed) as soon as its
    one-time processing run finishes. The proxy route is the only path a reader's request can
    take to reach the derivative, and it never serves the staging file.
    See [docs/google-drive-integration.md](docs/google-drive-integration.md).
15. Do not collect or store passport scans, visa documents, bank credentials, exact live location, or
    medical records — ever, in any form, seed data included.
16. Public contributor profiles expose only fields explicitly marked public.
17. Every public story carries a clear "personal experience, not advice" label.
18. Design mobile-first; verify at mobile viewport before desktop.
19. Meet basic WCAG expectations (semantic HTML, labels, contrast, keyboard navigation).
20. Don't add a dependency without stating why in the PR/commit description.
21. Never weaken RLS or storage policies to make a bug or blocker go away — fix the actual cause.
22. All seed data (users, stories, images) is fictional. Never seed with real contributor content.

## Commands

These exist in `package.json` as of Prompt 1. Node 24 LTS (`.nvmrc`/`engines.node`); npm is the
package manager.

```bash
npm run verify                 # format:check && lint && typecheck && test && build — the
                                #   single non-destructive gate; run before calling anything done
npm run verify:full            # verify, then Playwright (reuses verify's build, no rebuild)

npm run supabase:start / :stop / :reset   # local Supabase stack — needs Docker
npm run supabase:migration:new -- <name>
npm run supabase:types          # from the local stack (Docker)
npm run supabase:types:linked   # from a linked Supabase DEVELOPMENT project (no Docker needed)
```

See [docs/architecture.md](docs/architecture.md#local-vs-hosted-supabase-development) for the full
local-vs-hosted Supabase workflow, including why local verification may be blocked on this machine.

## Folder conventions

See the proposed structure in [docs/architecture.md](docs/architecture.md#application-structure).
Key rules:

- `app/` — routes, Server Components by default; `"use client"` only where interactivity requires it.
- `app/(editor)/` and `app/(moderation)/` — staff-only workflows, separated per Engineering Rule 5.
- `lib/supabase/` — server/client/browser Supabase client factories. Never import the service-role
  client from anything reachable by a Client Component.
- `supabase/migrations/` — versioned SQL migrations (source of truth for schema + RLS + storage policies).
- `supabase/seed.sql` — fictional seed data only.
- `types/database.ts` — generated, never hand-edited.

## Definition of Done

A task is not complete until all of the following hold:

- [ ] Acceptance criteria for the task are met and demonstrably testable.
- [ ] RLS policies and storage policies touched or implied by the change have been reviewed
      (not just written) against Engineering Rules 2, 3, 10–14.
- [ ] Validation (Zod) and error states are implemented at every new trust boundary.
- [ ] Tests are added or updated (Vitest/RTL for units/components; Playwright for new critical flows).
- [ ] `lint`, `typecheck`, `test`, and `build` all pass locally.
- [ ] Relevant docs updated: this file if rules/commands changed, `docs/architecture.md` if structure
      changed, `docs/content-governance.md` if moderation/consent behavior changed.
- [ ] [docs/implementation-status.md](docs/implementation-status.md) updated: status, decisions, risks,
      next prompt.
- [ ] No service-role key, secret, or real personal/contributor data introduced (Rules 1, 15, 22).

## CI and releases

- `.github/workflows/ci.yml` runs `npm run verify` on every PR and on pushes to `main`/`release`.
  It needs two repository secrets pointing at the **development** Supabase project:
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Never add the
  service-role key to CI.
- `release` is the production branch. Vercel deploys it; `.github/workflows/release.yml`
  (release-please) turns Conventional Commits into a version bump, `CHANGELOG.md`, git tag and
  GitHub Release. Details: [docs/architecture.md](docs/architecture.md#ci-and-releases).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
