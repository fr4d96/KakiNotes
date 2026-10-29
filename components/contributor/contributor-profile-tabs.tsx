import Link from "next/link";
import { useTranslations } from "next-intl";

/**
 * Stories | Journey navigation on a contributor's public profile. Two real
 * pages (the profile and its /journey sub-route), not client-side tabs, so
 * each is linkable and works without JavaScript. The Journey link is only
 * offered when the contributor has at least one pin, and only the New
 * Zealand profile uses this component (the map is New Zealand only).
 */
export function ContributorProfileTabs({
  slug,
  active,
  showJourney,
}: {
  slug: string;
  active: "stories" | "journey";
  showJourney: boolean;
}) {
  const t = useTranslations("contributors");
  if (!showJourney) return null;
  const base = `/contributors/${slug}`;
  const tabs = [
    { id: "stories", href: base, label: t("tabStories") },
    { id: "journey", href: `${base}/journey`, label: t("tabJourney") },
  ] as const;
  return (
    <nav aria-label={t("tabsLabel")} className="mt-6">
      <ul className="m-0 flex list-none gap-2 border-b border-border-subtle p-0">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <Link
              href={tab.href}
              aria-current={active === tab.id ? "page" : undefined}
              className={`-mb-px inline-flex min-h-[44px] items-center border-b-2 px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                active === tab.id
                  ? "border-accent text-foreground"
                  : "border-transparent text-foreground/60 hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
