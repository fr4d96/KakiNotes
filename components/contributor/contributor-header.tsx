import { useTranslations } from "next-intl";
import { ContributorAvatar } from "@/components/contributor/contributor-avatar";

/**
 * The avatar + name + "N stories published · from X" block at the top of a
 * contributor's public profile and its sub-pages (Journey). Only fields the
 * contributor made public arrive here (get_public_contributor()).
 */
export function ContributorHeader({
  contributor,
  storyCount,
  from,
}: {
  contributor: { display_name: string; avatar_emoji: string | null };
  storyCount: number;
  /** The localized home country name, or an empty value for none. */
  from: string | null | undefined;
}) {
  const t = useTranslations("contributors");
  return (
    <div className="flex items-center gap-4">
      <ContributorAvatar
        emoji={contributor.avatar_emoji}
        displayName={contributor.display_name}
        className="h-16 w-16 text-2xl"
      />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {contributor.display_name}
        </h1>
        <p className="text-sm text-foreground/60">
          {t("storyCountPublished", { count: storyCount })}
          {from ? ` · ${t("fromCountry", { country: from })}` : ""}
        </p>
      </div>
    </div>
  );
}
