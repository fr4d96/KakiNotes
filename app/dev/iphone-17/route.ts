import { readFile } from "node:fs/promises";
import path from "node:path";

// Dev-only iPhone 17 device frame (.claude/device-preview/iphone-17.html)
// around the live site, for previewing the installed-app (PWA) look in the
// browser pane. Served from the app's own origin because the pane opens
// local files as sandboxed data: snapshots that can't frame localhost.
// Production returns 404 before touching the filesystem.
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response("Not found", { status: 404 });
  }
  const html = await readFile(
    path.join(process.cwd(), ".claude/device-preview/iphone-17.html"),
    "utf8",
  );
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}
