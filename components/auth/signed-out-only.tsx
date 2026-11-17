"use client";

import type { ReactNode } from "react";
import { useSignedIn } from "@/lib/hooks/use-signed-in";

/**
 * Shows its children to signed-out visitors only -- for sign-up pitches a
 * contributor who is already signed in has no use for (the home page's
 * "Lived it? Share your story." panel, owner request 2026-11-17).
 *
 * The children are in the server HTML for everyone (public pages carry
 * nothing per-person) and are removed once the browser confirms a session.
 * Use it for content below the first screen, where that moment is never
 * seen; above the fold it would visibly blink out.
 */
export function SignedOutOnly({ children }: { children: ReactNode }) {
  const signedIn = useSignedIn();
  return signedIn ? null : <>{children}</>;
}
