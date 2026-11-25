"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { isReviewOnly } from "@/lib/auth/staff-menu";
import { useViewerIdentity } from "@/lib/auth/viewer-identity";
import { useSignedIn } from "@/lib/hooks/use-signed-in";

/**
 * A "Share your story" link that means the right thing to each visitor:
 * sign-up for someone without an account, a new story for a contributor
 * who is already signed in (who has no use for a sign-up page). Only the
 * href changes once the browser confirms a session, so the button never
 * blinks -- which is why this, not SignedOutOnly, is used above the fold.
 */
export function ShareStoryLink({
  newStoryHref,
  className,
  children,
}: {
  /** Where a signed-in contributor starts, e.g. "/stories/new?country=china". */
  newStoryHref: string;
  className?: string;
  children: ReactNode;
}) {
  const signedIn = useSignedIn();
  const { role } = useViewerIdentity();
  // Nothing to offer a moderator: they review, they don't write.
  if (isReviewOnly(role)) return null;
  return (
    <Link href={signedIn ? newStoryHref : "/sign-up"} className={className}>
      {children}
    </Link>
  );
}
