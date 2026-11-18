"use client";

import { useViewerIdentity } from "@/lib/auth/viewer-identity";

/**
 * Whether the visitor has a session, read in the browser only.
 *
 * Public pages never read the session on the server (see SiteHeader's
 * "Session awareness" note): their HTML must be the same for everyone. So
 * this starts as `false` -- the signed-out view, which is what the server
 * rendered -- and flips once the browser knows, then follows sign-in /
 * sign-out live. Backed by the same tab-wide store as SiteHeader and
 * BottomTabBar (lib/auth/viewer-identity.ts), so all three agree and only
 * one session lookup runs.
 *
 * Display only. It must never decide access: anything a signed-in visitor
 * can do is re-checked on the server.
 */
export function useSignedIn(): boolean {
  return useViewerIdentity().status === "signed-in";
}
