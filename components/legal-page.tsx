import { getTranslations } from "next-intl/server";
import { PlaceholderPage } from "@/components/placeholder-page";

/**
 * The shared shell for the Privacy, Terms, Community Guidelines and
 * Copyright & Removal pages. Copy lives in i18n `legal.<prefix>Body` plus
 * `legal.<prefix>S<n>Title` / `S<n>Body` pairs, so both languages stay in
 * step (messages.test.ts checks the keys match).
 */
/** Public takedown / copyright contact, shown on Copyright & Removal. */
export const LEGAL_CONTACT_EMAIL = "kakinotes811@gmail.com";

/** Tags the legal copy may use, e.g. `<email>…</email>` for a mailto link. */
const richTags = {
  email: (chunks: React.ReactNode) => (
    <a
      href={`mailto:${LEGAL_CONTACT_EMAIL}`}
      className="font-medium text-accent underline underline-offset-2"
    >
      {chunks}
    </a>
  ),
};

export async function LegalPage({
  title,
  prefix,
  sections,
}: {
  title: string;
  prefix: "privacy" | "terms" | "guidelines" | "copyright";
  sections: number;
}) {
  const t = await getTranslations("legal");
  const key = (suffix: string) =>
    `${prefix}${suffix}` as Parameters<typeof t>[0];
  return (
    <PlaceholderPage title={title}>
      <p className="text-sm text-foreground/60">{t("lastUpdated")}</p>
      <p>{t(key("Body"))}</p>
      {Array.from({ length: sections }, (_, i) => (
        <section key={i} className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            {t(key(`S${i + 1}Title`))}
          </h2>
          <p>{t.rich(key(`S${i + 1}Body`), richTags)}</p>
        </section>
      ))}
    </PlaceholderPage>
  );
}
