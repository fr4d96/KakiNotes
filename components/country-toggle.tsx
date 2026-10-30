import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  COUNTRY_SLUGS,
  countryMessageSegment,
  countryUrlPrefix,
  type CountrySlug,
} from "@/lib/story/countries";

/**
 * The NZ | China landing-page switch (product decision 3). A plain, real
 * two-link `<nav>` rather than a client-side segmented control -- each
 * option IS the destination URL (NZ unprefixed, China under /cn), so no
 * JavaScript is needed for it to work, it's fully keyboard-navigable (Tab
 * between two real links, Enter/Space to follow), and it survives with JS
 * disabled. `aria-current="page"` marks the active country for assistive
 * tech, same convention as a normal nav's current-page link.
 *
 * Copy is keyed per country (countryContent.<segment>.name), never a
 * hard-coded "New Zealand"/"China" string in this component, per
 * CLAUDE.md's "nationality/destination ... are data, not hard-coded UI
 * copy" and the task's explicit "don't hard-code country names in
 * components" instruction.
 *
 * `useTranslations` (the synchronous, dual-mode next-intl hook), not
 * `getTranslations` -- this follows the rest of this codebase's shared
 * component convention (PersonalExperienceLabel, StoryCard, ...): an async
 * component can only be awaited at the TOP of a Server Component tree
 * (generateMetadata / a page's own default export), never as a plain nested
 * child, or React throws "is an async Client Component" when the tree is
 * rendered outside Next's RSC runtime (confirmed by
 * app/(public)/page.test.tsx, which renders HomePage directly with RTL).
 */
export function CountryToggle({
  current,
  className = "",
}: {
  current: CountrySlug;
  className?: string;
}) {
  const t = useTranslations("common");
  const tCountry = useTranslations("countryContent");

  return (
    <nav
      aria-label={t("countryToggle.label")}
      className={`inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface p-1 text-sm ${className}`}
    >
      {COUNTRY_SLUGS.map((slug) => {
        const isActive = slug === current;
        const name = tCountry(`${countryMessageSegment(slug)}.name`);
        return (
          <Link
            key={slug}
            href={countryUrlPrefix(slug) || "/"}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-3 font-medium transition-colors md:min-h-0 md:py-1.5 ${
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-foreground/70 hover:bg-surface-muted hover:text-foreground"
            }`}
          >
            {name}
          </Link>
        );
      })}
    </nav>
  );
}
