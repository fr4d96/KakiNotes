import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listReportsForStaff, getReportNotes } from "@/lib/story/moderation";
import { ArrowLeftIcon } from "@/components/icons";
import { absoluteTime, relativeTime } from "@/lib/story/moderation-queue-view";
import {
  BUTTON_OUTLINE,
  CHIP,
  CHIP_TONE,
  PAGE,
  PAGE_INTRO,
  PAGE_TITLE,
  PANEL,
  SECTION_HEADING,
  TEXT_LINK,
} from "@/app/(moderation)/moderation/ui";
import { ResolveReportForm } from "./resolve-form";

export const metadata: Metadata = {
  title: "Report Detail",
  robots: { index: false, follow: false },
};

// Staff content, reflects live status/notes -- never cached/pre-rendered.
export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  misinformation: "Misinformation",
  unsafe_employment_advice: "Unsafe employment advice",
  harassment: "Harassment",
  copyright_privacy: "Copyright / privacy",
  spam_commercial: "Spam / commercial",
  other: "Other",
};

/**
 * `[id]` is the report id. Chosen as an inline single-page detail (not a
 * modal/expand on the queue page) so it has its own bookmarkable URL and
 * its own Server Action target, the same "own page, own actions.ts" shape
 * as app/(moderation)/moderation/stories/[id]/.
 *
 * list_reports_for_staff() has no by-id lookup (its filters are status/
 * category/date-range/story, not report id -- see that migration's own
 * comment) and p_limit is clamped to [1,50] server-side, so an unscoped
 * "fetch everything and find the one with this id" would silently miss any
 * report past the first 50. Instead this page requires a `storyId` query
 * param (populated by the queue page's own link, which already has
 * row.story_id in hand) and re-fetches scoped with p_story_id -- the exact
 * same filter the story review page already uses for a story's own
 * reports. Direct/bookmarked navigation without `storyId` gets a clear
 * "go back to the queue" message rather than an unscoped scan or a silent
 * 404 that looks like the report doesn't exist.
 *
 * getReportNotes()'s result (private internal notes) is read ONLY here,
 * server-side, and rendered only inside this staff-gated route group --
 * grepped the whole repo and confirmed this is the only call site. Never
 * passed through any prop, cache, or response reachable from a
 * reporter/contributor/public surface.
 */
export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ storyId?: string }>;
}) {
  const { id: reportId } = await params;
  const { storyId } = await searchParams;

  if (!storyId) {
    return (
      <div className={PAGE}>
        <h1 className={PAGE_TITLE}>Report detail</h1>
        <p className={PAGE_INTRO}>
          This page needs to be reached from the reports queue, which supplies
          the story context this report belongs to.
        </p>
        <Link href="/moderation/reports" className={`${TEXT_LINK} mt-3`}>
          <ArrowLeftIcon aria-hidden="true" className="size-4" />
          Reports
        </Link>
      </div>
    );
  }

  const reports = await listReportsForStaff({ storyId, limit: 50 }).catch(
    () => null,
  );
  const report = reports?.find((r) => r.id === reportId);
  if (!report) notFound();

  const notes = await getReportNotes(reportId).catch(() => []);

  const open = report.status === "open" || report.status === "reviewing";
  const statusLabel =
    report.status.charAt(0).toUpperCase() + report.status.slice(1);

  return (
    <div className={PAGE}>
      <Link
        href="/moderation/reports"
        className={`${TEXT_LINK} gap-1.5 max-md:hidden`}
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" />
        Reports
      </Link>

      <h1 className={`${PAGE_TITLE} mt-2`}>
        {CATEGORY_LABELS[report.category] ?? report.category}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span title={absoluteTime(report.created_at) ?? undefined}>
          Reported {relativeTime(report.created_at)}
        </span>
        <span
          className={`${CHIP} ${open ? CHIP_TONE.alert : CHIP_TONE.neutral}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-4">
        <Link
          href={`/moderation/stories/${report.published_revision_id}`}
          className={BUTTON_OUTLINE}
        >
          View the reported story
        </Link>
      </div>

      <div className="mt-6 space-y-4">
        <section className={PANEL}>
          <h2 className={SECTION_HEADING}>Reporter details</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {report.details || "No additional details were provided."}
          </p>
        </section>

        {(report.handled_by || report.handled_at) && (
          <section className={PANEL}>
            <h2 className={SECTION_HEADING}>Handled</h2>
            <p
              className="mt-2 text-sm text-muted-foreground"
              title={absoluteTime(report.handled_at) ?? undefined}
            >
              {report.handled_at ? relativeTime(report.handled_at) : "—"}
              {report.handled_by ? ` by staff member ${report.handled_by}` : ""}
            </p>
          </section>
        )}

        <section className={PANEL}>
          <h2 className={SECTION_HEADING}>
            Internal notes (staff only — never shown to the reporter)
          </h2>
          {notes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No internal notes yet.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-border-subtle text-sm">
              {notes.map((n) => (
                <li key={n.id} className="py-3 first:pt-1 last:pb-0">
                  <p className="text-muted-foreground">{n.internal_note}</p>
                  <span
                    className="text-xs text-muted-foreground"
                    title={absoluteTime(n.created_at) ?? undefined}
                  >
                    {relativeTime(n.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={PANEL}>
          <h2 className={SECTION_HEADING}>Resolution</h2>
          <ResolveReportForm
            reportId={report.id}
            category={report.category}
            currentStatus={report.status}
          />
        </section>
      </div>
    </div>
  );
}
