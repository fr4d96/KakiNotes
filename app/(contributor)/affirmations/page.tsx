import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  listMyAffirmationLinks,
  listMyAffirmationNotes,
} from "@/lib/affirmations/queries";
import { AffirmationsView } from "./affirmations-view";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

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
  const [links, notes] = await Promise.all([
    listMyAffirmationLinks(),
    listMyAffirmationNotes(),
  ]);

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
