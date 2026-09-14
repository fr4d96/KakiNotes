import { useTranslations } from "next-intl";

// Labels live in messages/<locale>.json at `whatsPublic.attribution`, keyed
// by the contributor_attribution_type enum value itself.

export type WhatsPublicSummaryProps = {
  attributionType: string;
  attributionValue: string;
  hasExcerpt: boolean;
  imageCount: number;
  decorativeImageCount: number;
};

/**
 * Prompt 7: "Show exactly which fields are public" -- a plain-language
 * summary of what a reader will actually see if this story is approved,
 * shown alongside the contributor's own approve/submit action. Never
 * includes internal editorial or moderation notes (editor_note,
 * moderation_action_notes, story_publication_consent_notes) -- those are
 * staff-only, structurally separate tables this component's caller never
 * even queries (see get_story_preview()), not merely hidden here.
 */
export function WhatsPublicSummary({
  attributionType,
  attributionValue,
  hasExcerpt,
  imageCount,
  decorativeImageCount,
}: WhatsPublicSummaryProps) {
  const t = useTranslations("whatsPublic");
  const key = `attribution.${attributionType}` as never;
  // An enum value this app has not been taught renders as itself rather
  // than as a missing-message error.
  const attributionLabel = t.has(key) ? t(key) : attributionType;
  const captionedImageCount = imageCount - decorativeImageCount;

  return (
    <div className="rounded-md border border-border-subtle p-4 text-sm">
      <h2 className="text-sm font-semibold">{t("heading")}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          {t.rich("nameLine", {
            value: attributionValue,
            attribution: attributionLabel,
            name: (chunks) => <strong>{chunks}</strong>,
          })}
        </li>
        <li>{hasExcerpt ? t("titleExcerptAndBody") : t("titleAndBody")}</li>
        <li>{t("tripDetails")}</li>
        {imageCount > 0 && (
          <li>
            {captionedImageCount > 0
              ? t("imagesWithCaptions", {
                  count: imageCount,
                  captioned: captionedImageCount,
                })
              : t("images", { count: imageCount })}
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        {t("notesNeverShown")}{" "}
        <a href="/copyright" className="underline underline-offset-2">
          {t("copyrightRemoval")}
        </a>
        .
      </p>
    </div>
  );
}
