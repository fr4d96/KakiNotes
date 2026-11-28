import type { Metadata } from "next";
import Link from "next/link";
import { listBugReports, type BugReportRow } from "@/lib/bug-reports/db";
import { createClient } from "@/lib/supabase/server";
import { BUG_REPORT_STATUSES } from "@/lib/validation/bug-report";
import { BUG_STATUS_LABELS } from "./labels";
import { BugStatusForm } from "./status-form";

export const metadata: Metadata = {
  title: "Bug reports",
  robots: { index: false, follow: false },
};

// Staff content -- never cached or pre-rendered, like every staff route.
export const dynamic = "force-dynamic";

/** Enough for a small site's backlog; older ones stay queryable in SQL. */
const PAGE_LIMIT = 200;

const dateFormat = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Pacific/Auckland",
});

/**
 * The bug list Fred reviews: newest first, filterable by status. Reading is
 * admin-only twice over -- this route group's layout (and proxy.ts) 404 for
 * anyone else, and RLS ("bug_reports: admin reads all") returns no rows to
 * anyone else. Changing a status only relabels the report; nothing else
 * happens, and no fix is ever started from here.
 *
 * Descriptions are plain text rendered as React text (pre-wrap), never HTML.
 */
export default async function AdminBugsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).status;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const status = BUG_REPORT_STATUSES.find((s) => s === value);

  let rows: BugReportRow[] = [];
  let loadError = false;
  try {
    rows = await listBugReports(await createClient(), {
      status,
      limit: PAGE_LIMIT,
    });
  } catch {
    loadError = true;
  }

  const filters: { href: string; label: string; current: boolean }[] = [
    { href: "/admin/bugs", label: "All", current: !status },
    ...BUG_REPORT_STATUSES.map((s) => ({
      href: `/admin/bugs?status=${s}`,
      label: BUG_STATUS_LABELS[s],
      current: status === s,
    })),
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Bug reports
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Sent from the Report a bug dialog, newest first. Recording only: decide
        here which ones to fix, then fix them yourself.
      </p>

      <nav aria-label="Filter by status" className="mt-6">
        <ul className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <li key={filter.href}>
              <Link
                href={filter.href}
                aria-current={filter.current ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium ${
                  filter.current
                    ? "bg-foreground text-background"
                    : "bg-surface-muted text-foreground"
                }`}
              >
                {filter.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-6">
        {loadError ? (
          <p className="rounded-md border border-border-subtle bg-surface-muted p-6 text-sm">
            Could not load bug reports right now. Please try again.
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-border-subtle bg-surface-muted p-6 text-sm">
            No bug reports{status ? ` marked ${BUG_STATUS_LABELS[status]}` : ""}
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-4">
            {rows.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-border-subtle bg-surface p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold">
                    {BUG_STATUS_LABELS[row.status] ?? row.status}
                  </span>
                  <time
                    dateTime={row.created_at}
                    className="text-muted-foreground"
                  >
                    {dateFormat.format(new Date(row.created_at))}
                  </time>
                  <span className="text-muted-foreground">
                    {row.reporter_id ? "Signed in" : "Signed out"}
                  </span>
                </div>
                {row.page_path ? (
                  <p className="mt-2 font-mono text-sm break-all">
                    {row.page_path}
                  </p>
                ) : null}
                <p className="mt-2 text-base break-words whitespace-pre-wrap">
                  {row.description}
                </p>
                {row.user_agent ? (
                  <p className="mt-2 text-xs break-all text-muted-foreground">
                    {row.user_agent}
                  </p>
                ) : null}
                <div className="mt-3 border-t border-border-subtle pt-3">
                  <BugStatusForm reportId={row.id} status={row.status} />
                </div>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  {row.id}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
