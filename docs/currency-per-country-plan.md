# Plan: currency per country (NZD → country's currency)

Status: **built, NOT applied** (2026-11-21). Migration
`supabase/migrations/20261121090000_currency_per_country.sql` and the app code are in the working
tree, uncommitted. The owner approved the three open questions as proposed (CNY for China; refuse
a country change that would change the currency of existing amounts; hide cost bands outside
NZD). Applying it to `yzaonhjieupxyrmbienf` (also production) still needs the owner's OK.

### What was built differs from the plan below in four places

- **Currency is set by a trigger, not in each create RPC.** `story_revisions_set_currency()`
  (BEFORE INSERT) picks it for every new revision: the story's latest revision's currency, else
  the country's. So `create_self_service_draft`, `create_editorial_import_draft` and
  `create_next_draft_revision` are untouched, and no insert path can forget it.
  `story_revisions_guard_currency()` (BEFORE UPDATE OF currency) is the guard from step 6.
- **Only three reads gain `currency`**: `get_my_story_with_draft`, `get_story_preview`,
  `get_published_story`. Moderation, cards and the published snapshot never show amounts, so
  they are not re-created.
- **Cost bands are refused in the app, not in `list_published_stories`.** The stories page drops
  `?costBand=` and hides the filter when the country's currency isn't NZD
  (`lib/story/country-currency.ts`). That avoids re-creating a 250-line RPC; there is no data
  exposure either way.
- **App field names are unchanged** (`totalExpenseNzdCents`, `amountNzdCents`): `currency`
  travels beside them. Amounts stay "divide by 100" everywhere (editor, formatter), which holds
  for every currency in `countries` today. A zero-decimal currency would need both changed.

### How it was tested without Docker

`supabase/migrations/*` replayed in order on a throwaway local Postgres 18 (Homebrew) with small
stand-ins for Supabase's `auth` and `storage` schemas: all 159 migrations apply, including the tags
migration from the same day. A behaviour script then checks 22 things: the backfill (NZ stays NZD;
China with no amounts → CNY; China with a total or expense rows stays NZD), new drafts per
country, the reads' `currency`, `set_story_country` moving or refusing, the trigger ignoring a
supplied currency, the guard, an approved revision's currency being immutable,
`get_published_story` (anon) returning CNY with amounts intact and its country filter still
working, and a next draft inheriting CNY. Execute grants on the re-created functions are
identical before and after.

`types/database.ts` is not regenerated yet (the generator needs Docker or the live project). The
app reads `currency` defensively (`lib/story/currency.ts`, `lib/story/country-currency.ts`), so
it works before and after the migration. Regenerate with `npm run supabase:types:linked` after
applying.

## Problem

Every amount a contributor enters is labelled and stored as NZD, whatever the story's country.
Under China the editor says "Total expenses (NZD)", and the public story, its donut, the PDF and
the cost-band filter all show NZ$. The database enforces this:

- `story_revisions.currency text not null default 'NZD'` with
  `check (currency = 'NZD')` (`story_revisions_currency_nzd_only`, 20260803090200).
- Amounts live in `story_revisions.total_expense_nzd_cents` and
  `story_revision_expenses.amount_nzd_cents` (about 49 migrations reference them).
- `story_revision_expenses` has no currency of its own: it is the breakdown of its revision's
  total, so it follows the revision's currency.

## Facts this plan relies on

- `stories.country_id` is non-null, and **locked once a story is first published**
  (`set_story_country()`, 20261014205738). So a published revision's country can never change, and
  only a never-published draft can move country.
- `get_expense_aggregates()` (the `/costs` page) already reads New Zealand stories only.
- `list_published_stories(..., p_cost_band, ..., p_country_slug)` applies NZ$ bands
  (5k / 15k / 30k) to whatever country is asked for.

## Decisions

1. **Currency is data per country:** `countries.currency_code`, ISO 4217 (`NZD`, `CNY`). No
   currency enum in code.
2. **Each revision keeps its own `currency`** (the existing column), set by the database from the
   story's country, **never from the client** (Rule 2). Storing it on the revision (rather than
   reading the country's currency each time) means an amount always shows in the currency it was
   entered in, even if a country's currency ever changed.
3. **Column names stay** (`total_expense_nzd_cents`, `amount_nzd_cents`). Renaming them means
   re-creating about 15 RPCs and every caller in one go, for no change in behaviour. They are
   redefined in their column comments as "minor units of the revision's currency". The rename
   can be a later clean-up with its own migration.
4. **No conversion between currencies anywhere.** Figures in different currencies are never
   added, averaged or banded together.

## Migration (one file, one transaction)

`supabase/migrations/2026112xxxxxxx_currency_per_country.sql`:

1. `alter table public.countries add column currency_code text;` set `NZD` for
   `new-zealand`, `CNY` for `china`; then `set not null` and
   `check (currency_code ~ '^[A-Z]{3}$')`.
2. Replace the NZD-only check on `story_revisions`:
   `drop constraint story_revisions_currency_nzd_only`, add
   `story_revisions_currency_format check (currency ~ '^[A-Z]{3}$')`, and drop the `'NZD'`
   default (every insert sets it explicitly, so a forgotten one fails loudly instead of being
   silently NZD).
3. **Backfill:** every existing revision is left at `NZD`. That is true for New Zealand stories,
   and also for any China story that already has amounts: they were typed under an "(NZD)" label,
   so NZD is what they mean. A China **draft** revision with **no amounts** (total null and no
   expense rows) is set to `CNY`, so the editor shows ¥ from its next open. (I couldn't count
   China rows on the live project: the read-only query was refused. The rule is safe either
   way.)
4. **Set on create:** `create_self_service_draft`, `create_editorial_import_draft` and
   `create_next_draft_revision` insert `currency` from
   `(select co.currency_code from countries co where co.id = story.country_id)`.
   `create_next_draft_revision` copies the previous revision's currency, so a published NZD
   China story (if any) keeps NZD on its next edit instead of reinterpreting its numbers.
5. **Country change on a draft** (`set_story_country`): when the current draft has no amounts,
   switch its `currency` to the new country's. When it has amounts, **refuse the change** with
   a clear error ("Clear the expenses first: amounts can't change currency"). The editor shows
   that error. That keeps every amount attached to the currency it was typed in, and
   it's the same "refuse, don't silently rewrite" rule the function already uses after publication.
6. **Guard trigger** `story_revisions_currency_matches_country` (before insert or update of
   `currency`): a draft revision's currency must equal its story's country's currency **unless**
   it is inherited (same as the previous revision). Same style as
   `story_revision_locations_validate_country()`. `story_revisions_protect_immutable_content`
   already blocks changing a submitted or approved revision, so add `currency` to its protected
   list.
7. **Reads return the currency:** append `currency text` to `get_my_story_with_draft`,
   `get_story_preview`, `get_story_for_moderator`, `get_published_story`,
   `list_published_stories`, `get_published_revision_snapshot` and `get_revision_selections`
   (appended columns, so callers that ignore them keep working). Changing a return type means
   `drop function` plus `create`, re-granting exactly the same `execute` rights. This is the bulk
   of the file.
8. **Cost bands:** `list_published_stories` applies `p_cost_band` only when the country's currency
   is `NZD`. For any other currency it raises `'Cost bands are not available for %'`. The UI
   hides the filter there (below), so this only catches a hand-typed URL.
9. `get_expense_aggregates()` is unchanged (already NZ-only). Its comment gains a note that
   `/costs` for another country needs per-currency aggregates (out of scope).
10. Comments on the changed columns and functions; `revoke`/`grant` exactly as before. No RLS or
    storage policy changes (Rule 21).

Then regenerate `types/database.ts` (`npm run supabase:types:linked`).

## App changes

- `lib/i18n/format.ts`: `formatCurrencyNzd(cents, locale)` → `formatCurrency(cents, currency,
locale)` using `Intl.NumberFormat`'s `currency` option. Minor units come from
  `Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits` (2 for NZD and CNY), not a
  hard-coded 100. Update all callers: `story-edit-form.tsx`, `expense-breakdown.tsx`,
  `expense-donut.tsx`, `public-expenses.tsx`, `expense-per-month.ts`, `story-pdf.ts`, `/costs`.
- `lib/story/contributor-queries.ts` / `public-queries.ts`: carry `currency` through.
  Rename the app-side fields `totalExpenseNzdCents` / `amountNzdCents` to
  `totalExpenseCents` / `amountCents` (TypeScript only; the RPC parameter names stay).
- Editor: label "Total expenses ({currency})", the breakdown's placeholder shows the currency
  code, and the country-change error from step 5 shows inline.
- `components/story/filter-bar.tsx`: show the cost-band filter only when the country's currency is
  NZD (`/cn/stories` loses it). `i18n` `costBands` stay NZ$.
- `lib/validation/story.ts`: no currency field from the client, on purpose (Rule 2).
- `/cn/costs` stays as it is.

## Tests

- **RLS / RPC (`npm run test:rls`, local stack):** a new China draft gets `CNY`; a new NZ draft
  gets `NZD`; `create_next_draft_revision` inherits; `set_story_country` switches currency when
  there are no amounts and refuses when there are; the guard trigger rejects a mismatched
  currency; a cost band on China raises; reads return `currency`.
- **Units:** `formatCurrency` for NZD/CNY in `en` and `zh-CN`; editor label per currency;
  filter bar hides cost bands for China; PDF cost lines use the revision's currency.
- `npm run verify`, then the iPhone 17 frame: a China draft's expense step shows ¥, an NZ draft
  still NZ$, and an NZ published story is unchanged.

## Rollout (live project = production)

1. Write and test against the local stack (Docker) or a Supabase branch, never the live project
   first.
2. Ship the app change first and make it tolerant: `currency ?? "NZD"` when the column isn't
   there yet, so the deployed site keeps working either way.
3. Apply the migration to `yzaonhjieupxyrmbienf` **with the owner's OK**, run
   `npm run backup:db` just before.
4. Check: an NZ story page, `/stories` with a cost band, a China draft's expense step.
5. Rollback: the migration is additive apart from the dropped check. Re-adding
   `check (currency = 'NZD')` works only while every row is still NZD, so rollback is only clean
   before any China amounts are saved in CNY.

## Size

One migration (mostly re-creating 7 read RPCs with one extra column), about 10 app files, about
15 tests. About a day of focused work. No new dependency.

## Open questions for the owner

1. China's currency is **CNY (¥)**: correct, or do China contributors think in another currency?
2. Changing a draft's country when it has amounts: **refuse** (proposed), or clear the amounts
   with a warning?
3. Cost-band filter on `/cn/stories`: **hide** (proposed), or define ¥ bands now?
