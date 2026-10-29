import { useTranslations } from "next-intl";
import { PersonalExperienceIcon } from "@/components/icons";

/**
 * Product spec / Engineering Rule 17: every public story must visibly carry
 * a "personal experience, not advice" label -- a real, consistently-placed
 * component, not a footnote. Used on both the story detail page and the
 * home page (docs/design-brief.md).
 */
export function PersonalExperienceLabel({
  tone = "surface",
  countrySlug,
}: {
  /** "onPhoto" is a white-on-glass variant for placement over a photo hero, where the default surface-toned pill wouldn't have enough contrast. */
  tone?: "surface" | "onPhoto";
  /**
   * NZ's label names immigration/employment/tax advice specifically
   * (WHV-framed, common.personalExperienceLabel). China's section is
   * general travel, not WHV, so it gets its own shorter variant
   * (countryContent.china.personalExperienceLabel) rather than the NZ
   * wording with the country name swapped in -- the categories of advice
   * it's disclaiming genuinely differ. Omitted/"new-zealand" => unchanged
   * historical copy and behaviour.
   */
  countrySlug?: string;
}) {
  const t = useTranslations("common");
  const tCountry = useTranslations("countryContent");
  const label =
    countrySlug === "china"
      ? tCountry("china.personalExperienceLabel")
      : t("personalExperienceLabel");
  const toneClasses =
    tone === "onPhoto"
      ? "border-white/35 bg-black/30 text-white backdrop-blur-sm"
      : "border-border-subtle bg-surface-muted text-tag-foreground";
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${toneClasses}`}
    >
      <PersonalExperienceIcon className="h-4 w-4 shrink-0" />
      {label}
    </p>
  );
}
