import type { Metadata } from "next";
import Link from "next/link";
import {
  getModerationQueue,
  getModerationQueueCards,
} from "@/lib/story/moderation";
import {
  parseModerationQueueSearchParams,
  MODERATION_QUEUE_PAGE_SIZE,
} from "@/lib/validation/moderation";
import {
  listActiveRegions,
  listActiveCountries,
} from "@/lib/story/active-lookups";
import {
  COUNTRY_LABELS,
  SUBMISSION_KIND_LABELS,
  SOURCE_KIND_LABELS,
  DECISION_LABELS,
  labelFor,
  queueSignals,
  isEmptySubmission,
  contentLengthLabel,
  relativeTime,
  absoluteTime,
  submitterLabel,
} from "@/lib/story/moderation-queue-view";
import { ChevronIcon, FilterIcon } from "@/components/icons";
import {
  BUTTON_OUTLINE,
  BUTTON_PRIMARY,
  CHIP,
  CHIP_TONE,
  EMPTY_STATE,
  FIELD,
  FIELD_LABEL,
  PAGE,
  PAGE_INTRO,
  PAGE_TITLE,
  TEXT_LINK,
} from "../ui";
import { QueueList, type QueueListRow } from "./queue-list";

export const metadata: Metadata = {
  title: "Moderation Queue",
  robots: { index: false, follow: false },
};

// Staff content, always reflects the caller's own current view of the
// queue -- never cached/pre-rendered, same convention as /editorial.
export const dynamic = "force-dynamic";

// Server Actions on this page use the page's maxDuration. One bulk-approve
// request publishes up to BULK_APPROVE_CHUNK stories, photos included.
export const maxDuration = 60;

type SearchParams = Record<string, string | string[] | undefined>;

function buildHref(
  base: string,
  raw: SearchParams,
  overrides: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) params.delete(key);
    else params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function ModerationStoriesQueuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const rawParams = await searchParams;
  const filters = parseModerationQueueSearchParams(rawParams);

  const [regions, countries] = await Promise.all([
    listActiveRegions(),
    listActiveCountries(),
  ]);
  // Grouped by country so the filter stays usable now that regions span
  // more than one country (China added 2026-10-14) -- no change to what a
  // moderator can actually filter by, just how the options are organized.
  const countryNameBySlug = new Map(countries.map((c) => [c.slug, c.name]));
  const regionsByCountry = new Map<string, typeof regions>();
  for (const region of regions) {
    const existing = regionsByCountry.get(region.countrySlug) ?? [];
    existing.push(region);
    regionsByCountry.set(region.countrySlug, existing);
  }

  const offset = (filters.page - 1) * MODERATION_QUEUE_PAGE_SIZE;
  const status = filters.status ?? "submitted";
  const isReviewedView = status === "recently_reviewed";

  let rows: Awaited<ReturnType<typeof getModerationQueue>> = [];
  let loadError = false;
  try {
    rows = await getModerationQueue({
      status,
      sourceKind: filters.sourceKind,
      regionId: filters.regionId,
      consentMethod: filters.consentMethod,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      limit: MODERATION_QUEUE_PAGE_SIZE,
      offset,
    });
  } catch {
    loadError = true;
  }

  const totalCount = rows[0]?.total_count ?? 0;
  const hasNextPage = offset + rows.length < totalCount;
  const hasPrevPage = filters.page > 1;

  // A single `now` for the whole render, so two rows submitted in the same
  // minute can never disagree about how long ago that was.
  const now = new Date();

  const activeFilters = [
    filters.sourceKind,
    filters.regionId,
    filters.consentMethod,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length;
  const statusHref = (value: string) =>
    buildHref("/moderation/stories", rawParams, {
      status: value,
      page: undefined,
    });

  // Country and cover photo per row. Null when they can't be read; the
  // queue then simply draws without them.
  const cards = loadError
    ? null
    : await getModerationQueueCards(rows.map((row) => row.revision_id)).catch(
        () => null,
      );

  const listRows: QueueListRow[] = rows.map((row) => {
    const stamp = isReviewedView ? row.decided_at : row.submitted_at;
    const relative = relativeTime(stamp, now);
    const card = cards?.get(row.revision_id);
    return {
      // The recently_reviewed branch is one row per DECISION, so a revision
      // decided twice appears twice and revision_id alone is not unique.
      key: isReviewedView
        ? `${row.revision_id}-${row.decided_at ?? ""}`
        : row.revision_id,
      revisionId: row.revision_id,
      title: row.title,
      submitter: submitterLabel(row),
      when: relative,
      whenTitle: absoluteTime(stamp),
      country: labelFor(COUNTRY_LABELS, card?.country_slug),
      kind: isReviewedView
        ? null
        : labelFor(SUBMISSION_KIND_LABELS, row.submission_kind),
      source:
        row.source_kind === "editorial_import"
          ? labelFor(SOURCE_KIND_LABELS, row.source_kind)
          : null,
      decision: isReviewedView ? labelFor(DECISION_LABELS, row.decision) : null,
      length: contentLengthLabel(row.content_text_length),
      signals: queueSignals(row),
      isReplacement: row.is_replacement,
      openReportCount: row.open_report_count,
      // A hint only. approveStoriesAction() re-checks every story itself
      // (lib/story/bulk-approve.ts) before publishing anything.
      blockedReason: isEmptySubmission(row)
        ? "Nothing to publish. Open it to decide."
        : null,
      // Under Reviewed, a moderator may only preview photos of stories they
      // decided themselves, so those rows don't ask.
      coverMediaId: isReviewedView ? null : (card?.cover_media_id ?? null),
    };
  });

  const emptyMessage =
    filters.page > 1 ? (
      <>
        <p className="font-semibold text-foreground">
          Nothing left on this page.
        </p>
        <Link
          href={buildHref("/moderation/stories", rawParams, {
            page: undefined,
          })}
          className={TEXT_LINK}
        >
          Go to the first page
        </Link>
      </>
    ) : (
      <>
        <p className="font-semibold text-foreground">
          {activeFilters > 0
            ? "Nothing matches these filters."
            : isReviewedView
              ? "No decisions recorded yet."
              : "Nothing is waiting on a decision."}
        </p>
        {activeFilters > 0 && (
          <Link
            href={`/moderation/stories?status=${status}`}
            className={TEXT_LINK}
          >
            Clear filters
          </Link>
        )}
      </>
    );

  return (
    <div className={PAGE}>
      <header>
        <h1 className={PAGE_TITLE}>Stories queue</h1>
        <p className={PAGE_INTRO}>
          {isReviewedView
            ? "Decisions already made, most recent first."
            : totalCount === 0
              ? "Stories contributors send in wait here for a decision."
              : totalCount === 1
                ? "1 story is waiting on a decision."
                : `${totalCount} stories are waiting on a decision.`}
        </p>
      </header>

      <nav
        aria-label="Queue"
        className="mt-5 grid max-w-sm grid-cols-2 rounded-full border border-border-subtle p-0.5"
      >
        {(
          [
            ["submitted", "Waiting"],
            ["recently_reviewed", "Reviewed"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={statusHref(value)}
            aria-current={status === value ? "page" : undefined}
            className={`press flex min-h-11 items-center justify-center rounded-full text-sm font-bold ${
              status === value
                ? "bg-surface-muted text-foreground"
                : "text-muted-foreground"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {/* Closed unless a filter is on: the queue is what a moderator came
          for, and six fields above it pushed it off a phone's screen. */}
      <details
        open={activeFilters > 0}
        className="group/filters mt-3 rounded-[20px] bg-surface shadow-sm"
      >
        <summary className="press flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-4 text-base font-medium [&::-webkit-details-marker]:hidden">
          <FilterIcon
            aria-hidden="true"
            className="h-5 w-5 text-muted-foreground"
          />
          <span className="flex-1">Filters</span>
          {activeFilters > 0 && (
            <span className={`${CHIP} ${CHIP_TONE.tag}`}>
              {activeFilters} on
            </span>
          )}
          <ChevronIcon
            aria-hidden="true"
            className="h-4 w-4 text-muted-foreground transition-transform group-open/filters:rotate-90 motion-reduce:transition-none"
          />
        </summary>
        <form method="get" className="px-4 pt-1 pb-4">
          <input type="hidden" name="status" value={status} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="block">
              <span className={FIELD_LABEL}>Source</span>
              <select
                name="sourceKind"
                defaultValue={filters.sourceKind ?? ""}
                className={FIELD}
              >
                <option value="">Any source</option>
                <option value="self_submitted">Self-service</option>
                <option value="editorial_import">Editorial import</option>
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Region</span>
              <select
                name="regionId"
                defaultValue={filters.regionId ?? ""}
                className={FIELD}
              >
                <option value="">Any region</option>
                {[...regionsByCountry.entries()].map(
                  ([countrySlug, countryRegions]) => (
                    <optgroup
                      key={countrySlug}
                      label={countryNameBySlug.get(countrySlug) ?? countrySlug}
                    >
                      {countryRegions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </optgroup>
                  ),
                )}
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>Consent method</span>
              <select
                name="consentMethod"
                defaultValue={filters.consentMethod ?? ""}
                className={FIELD}
              >
                <option value="">Any method</option>
                <option value="account">Account</option>
                <option value="email">Email</option>
                <option value="written_message">Written message</option>
                <option value="in_person">In person</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>From</span>
              <input
                type="date"
                name="dateFrom"
                defaultValue={filters.dateFrom ?? ""}
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className={FIELD_LABEL}>To</span>
              <input
                type="date"
                name="dateTo"
                defaultValue={filters.dateTo ?? ""}
                className={FIELD}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button type="submit" className={BUTTON_PRIMARY}>
              Apply filters
            </button>
            {activeFilters > 0 && (
              <Link
                href={`/moderation/stories?status=${status}`}
                className={TEXT_LINK}
              >
                Clear filters
              </Link>
            )}
          </div>
        </form>
      </details>

      <div className="mt-6">
        {loadError ? (
          <p role="alert" className={EMPTY_STATE}>
            Could not load the queue right now. Please try again.
          </p>
        ) : (
          <QueueList
            // Waiting and Reviewed are different lists: a selection or a
            // result panel must not carry from one to the other.
            key={status}
            rows={listRows}
            selectable={!isReviewedView}
            showCovers={cards !== null && !isReviewedView}
            empty={emptyMessage}
          />
        )}
      </div>

      {(hasPrevPage || hasNextPage) && rows.length > 0 && (
        <nav
          aria-label="Queue pages"
          className="mt-6 flex items-center justify-between gap-3"
        >
          {hasPrevPage ? (
            <Link
              href={buildHref("/moderation/stories", rawParams, {
                page: String(filters.page - 1),
              })}
              className={BUTTON_OUTLINE}
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {offset + 1}–{offset + rows.length} of {totalCount}
          </span>
          {hasNextPage ? (
            <Link
              href={buildHref("/moderation/stories", rawParams, {
                page: String(filters.page + 1),
              })}
              className={BUTTON_OUTLINE}
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
