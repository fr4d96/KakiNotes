import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import {
  listMyAffirmationLinks,
  listMyAffirmationNotes,
} from "@/lib/affirmations/queries";
import { shareOriginFromHeaders } from "@/lib/affirmations/share-origin";
import { AffirmationsView } from "./affirmations-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("affirmations");
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

/**
 * The owner's affirmation links and the private notes left through them.
 * Signed-in only: proxy.ts and the (contributor) layout gate the route, and
 * both reads are SECURITY INVOKER RPCs, so RLS scopes them to the caller.
 */
export default async function AffirmationsPage() {
  const [links, notes, requestHeaders] = await Promise.all([
    listMyAffirmationLinks(),
    listMyAffirmationNotes(),
    headers(),
  ]);
  // The share link must open on the deployment the owner is using; see
  // lib/affirmations/share-origin.ts for why the env var is only a fallback.
  const siteUrl = shareOriginFromHeaders(requestHeaders);

  return (
    <AffirmationsView
      links={links}
      notes={notes}
      siteUrl={siteUrl}
      // Passed from the server so the relative dates render the same on the
      // server and in hydration (see app/(contributor)/notifications/page.tsx).
      now={new Date().toISOString()}
    />
  );
}
