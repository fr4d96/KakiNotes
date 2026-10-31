import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getAffirmationWritingTarget } from "@/lib/affirmations/queries";
import { NoteForm } from "./note-form";

/**
 * Deliberately generic, and noindex/nofollow: the URL is a private
 * capability (whoever holds the token can write a note), so it must never be
 * indexed, previewed with the recipient's name, or leak through a Referer.
 * The title and Open Graph carry no recipient or label.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("affirmationWrite");
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false, nocache: true },
    referrer: "no-referrer",
    openGraph: { title: t("metaTitle"), description: t("metaDescription") },
  };
}

export default async function WriteNotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  // Null for a malformed, unknown OR switched-off token -- the page cannot
  // tell a visitor which.
  const target = await getAffirmationWritingTarget(token);
  if (!target) notFound();

  const t = await getTranslations("affirmationWrite");

  return (
    <div className="mx-auto max-w-xl px-4 pt-6 pb-16 sm:px-6 sm:py-16">
      <h1 className="journiq-heading text-[2rem] sm:text-[2.4rem]">
        {target.recipient_name
          ? t("headingNamed", { name: target.recipient_name })
          : t("headingNeutral")}
      </h1>
      {target.label && (
        <p className="mt-2 text-sm font-bold text-muted-foreground">
          {target.label}
        </p>
      )}
      <p className="mt-3 text-sm text-muted-foreground">{t("intro")}</p>
      <NoteForm token={token} />
    </div>
  );
}
