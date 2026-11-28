import type { BugReportStatus } from "@/lib/validation/bug-report";

/** Staff-only English, like the rest of /admin. */
export const BUG_STATUS_LABELS: Record<BugReportStatus, string> = {
  open: "Open",
  triaged: "Triaged",
  fixed: "Fixed",
  wontfix: "Won't fix",
};
