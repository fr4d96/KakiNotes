import type { Metadata } from "next";
import Link from "next/link";
import { listReportsForStaff } from "@/lib/story/moderation";
import { absoluteTime, relativeTime } from "@/lib/story/moderation-queue-view";
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
  PANEL,
  ROW_LIST,
  TEXT_LINK,
} from "@/app/(moderation)/moderation/ui";
import {
  parseReportsQueueSearchParams,
  REPORTS_QUEUE_PAGE_SIZE,
} from "@/lib/validation/moderation";

export const metadata: Metadata = {
  title: "Reports Triage",
  robots: { index: false, follow: false },
};

// Staff content -- never cached/pre-rendered, same convention as every
// other page in this route group.
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const CATEGORY_LABELS: Record<string, string> = {
  misinformation: "Misinformation",
  unsafe_employment_advice: "Unsafe employment advice",
  harassment: "Harassment",
  copyright_privacy: "Copyright / privacy",
  spam_commercial: "Spam / commercial",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  reviewing: "Reviewing",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

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

/**
 * Dedicated reports-triage queue -- Stage 2 only ever surfaced a story's
 * OWN open reports inline on its review page (listReportsForStaff({
 * storyId })). This is the first standalone, cross-story view: every
 * filterable report, any status/category/date range, with a link into
 * each report's own detail/resolution page
 * (app/(moderation)/moderation/reports/[id]/page.tsx).
 *
 * Each row links to /moderation/stories/[report.published_revision_id] --
 * NOT a re-derived "current submitted revision" for the story.
 * story_reports.published_revision_id is snapshotted once, at report-
 * creation time (create_story_report() requires the target to be
 * currently public/published, per docs/content-governance.md
 * "Reporting"), and is immutable afterward (the column has an on delete
 * restrict FK, never updated). That is deliberately the right target: a
 * report is about what a reader actually saw and flagged -- the live
 * published content -- not whatever unrelated draft/replacement revision
 * might separately be in flight for the same story right now (those are
 * two different moderation concerns; the story's OWN moderation-queue
 * entry, if any, already surfaces the in-flight revision separately).
 * get_story_for_moderator()/can_view_moderation_review() place no
 * revision_status filter on their lookup (confirmed by reading both
 * function bodies), so this link resolves for any past-published
 * revision, not only a currently-actionable one -- exactly what a
 * moderator triaging a report needs to see.
 */
export default async function ReportsTriagePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const rawParams = await searchParams;
  const filters = parseReportsQueueSearchParams(rawParams);
  const offset = (filters.page - 1) * REPORTS_QUEUE_PAGE_SIZE;

  let rows: Awaited<ReturnType<typeof listReportsForStaff>> = [];
  let loadError = false;
  try {
    rows = await listReportsForStaff({
      status: filters.status,
      category: filters.category,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      limit: REPORTS_QUEUE_PAGE_SIZE,
      offset,
    });
  } catch {
    loadError = true;
  }

  const hasNextPage = rows.length === REPORTS_QUEUE_PAGE_SIZE;
  const hasPrevPage = filters.page > 1;

  const activeFilters = [
    filters.status,
    filters.category,
    filters.dateFrom,
    filters.dateTo,
  ].filter(Boolean).length;

  return (
    <div className={PAGE}>
      <h1 className={PAGE_TITLE}>Reports triage</h1>
      <p className={PAGE_INTRO}>
        Every reader-submitted report, across every story. Private internal
        notes and resolution live on each report&rsquo;s own page, never here.
      </p>

      <details className={`${PANEL} mt-6`} open={activeFilters > 0}>
        <summary className="-my-1 flex min-h-11 cursor-pointer items-center text-sm font-bold">
          Filters{activeFilters > 0 ? ` · ${activeFilters} on` : ""}
        </summary>
        <form
          method="get"
          className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className={FIELD_LABEL}>
            Status
            <select
              name="status"
              defaultValue={filters.status ?? ""}
              className={FIELD}
            >
              <option value="">Any</option>
              <option value="open">Open</option>
              <option value="reviewing">Reviewing</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>
          <label className={FIELD_LABEL}>
            Category
            <select
              name="category"
              defaultValue={filters.category ?? ""}
              className={FIELD}
            >
              <option value="">Any</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className={FIELD_LABEL}>
            From
            <input
              type="date"
              name="dateFrom"
              defaultValue={filters.dateFrom ?? ""}
              className={FIELD}
            />
          </label>
          <label className={FIELD_LABEL}>
            To
            <input
              type="date"
              name="dateTo"
              defaultValue={filters.dateTo ?? ""}
              className={FIELD}
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
            <button type="submit" className={BUTTON_PRIMARY}>
              Apply filters
            </button>
            {activeFilters > 0 && (
              <Link href="/moderation/reports" className={TEXT_LINK}>
                Clear filters
              </Link>
            )}
          </div>
        </form>
      </details>

      <div className="mt-6" aria-live="polite">
        {loadError ? (
          <p className={EMPTY_STATE}>
            Could not load reports right now. Please try again.
          </p>
        ) : rows.length === 0 ? (
          <p className={EMPTY_STATE}>Nothing matches these filters.</p>
        ) : (
          <ul className={ROW_LIST}>
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">
                      {CATEGORY_LABELS[row.category] ?? row.category}
                    </span>
                    <span
                      className={`${CHIP} ${
                        row.status === "open" || row.status === "reviewing"
                          ? CHIP_TONE.alert
                          : CHIP_TONE.neutral
                      }`}
                    >
                      {STATUS_LABELS[row.status] ?? row.status}
                    </span>
                  </div>
                  <p
                    className="mt-1 text-sm text-muted-foreground"
                    title={absoluteTime(row.created_at) ?? undefined}
                  >
                    Reported {relativeTime(row.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {/*
                    list_reports_for_staff() has no p_report_id filter (by
                    design -- it only ever scopes by status/category/date
                    range/story, see the migration's own comment). The
                    detail page below re-fetches scoped by story_id (the
                    same p_story_id filter the story review page already
                    uses) rather than an unbounded/paginated scan for a
                    single row, so storyId travels as a query param here.
                  */}
                  <Link
                    href={`/moderation/reports/${row.id}?storyId=${row.story_id}`}
                    className={BUTTON_OUTLINE}
                  >
                    Triage
                  </Link>
                  <Link
                    href={`/moderation/stories/${row.published_revision_id}`}
                    className={TEXT_LINK}
                  >
                    View story
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(hasPrevPage || hasNextPage) && (
        <nav
          aria-label="Pagination"
          className="mt-6 flex items-center justify-between gap-3"
        >
          {hasPrevPage ? (
            <Link
              href={buildHref("/moderation/reports", rawParams, {
                page: String(filters.page - 1),
              })}
              className={BUTTON_OUTLINE}
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Page {filters.page}
          </span>
          {hasNextPage ? (
            <Link
              href={buildHref("/moderation/reports", rawParams, {
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
