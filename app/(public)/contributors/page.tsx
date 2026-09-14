import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ContributorAvatar } from "@/components/contributor/contributor-avatar";
import { countryName } from "@/lib/countries";
import { formatCountryName } from "@/lib/i18n/format";
import { listPublicContributors } from "@/lib/story/public-queries";

// No `export const revalidate` here on purpose. This route awaits
// `searchParams` (the keyset pagination cursor), which forces dynamic
// rendering in the App Router -- confirmed in the production build output,
// where /contributors is `ƒ (Dynamic) server-rendered on demand` with no
// revalidate period. A `revalidate` export here would be a silent no-op, so
// don't re-add one.

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contributors");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ContributorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const [t, locale] = await Promise.all([
    getTranslations("contributors"),
    getLocale(),
  ]);
  const cursorDisplayName = first(raw.cursorDisplayName);
  const cursorId = first(raw.cursorId);

  let contributors: Awaited<ReturnType<typeof listPublicContributors>> = [];
  let loadError = false;
  try {
    contributors = await listPublicContributors({
      cursorDisplayName,
      cursorId,
      limit: 24,
    });
  } catch {
    loadError = true;
  }

  const last = contributors[contributors.length - 1];
  const hasNextPage = contributors.length === 24;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-3 max-w-2xl text-foreground/70">{t("intro")}</p>

      <div className="mt-8" aria-live="polite">
        {loadError ? (
          <p className="rounded-md border border-border-subtle bg-surface-muted p-6 text-sm text-foreground/70">
            {t("loadError")}
          </p>
        ) : contributors.length === 0 ? (
          <p className="rounded-md border border-border-subtle bg-surface-muted p-6 text-sm text-foreground/70">
            {t("empty")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {contributors.map((c) => (
              <li key={c.contributor_id}>
                <Link
                  href={`/contributors/${c.public_slug}`}
                  className="flex h-full flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-4 hover:shadow-md"
                >
                  <ContributorAvatar
                    emoji={c.avatar_emoji}
                    displayName={c.display_name}
                    className="h-10 w-10 text-sm"
                  />
                  <span className="font-medium">{c.display_name}</span>
                  {c.bio ? (
                    <span className="line-clamp-2 text-sm text-foreground/60">
                      {c.bio}
                    </span>
                  ) : null}
                  <span className="mt-auto text-xs text-foreground/50">
                    {t("storyCount", { count: c.published_story_count })}
                    {countryName(c.home_country_code)
                      ? ` · ${t("fromCountry", {
                          country: formatCountryName(
                            c.home_country_code,
                            locale,
                            countryName(c.home_country_code),
                          ) as string,
                        })}`
                      : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasNextPage && last ? (
        <div className="mt-10 flex justify-center">
          <Link
            href={`/contributors?cursorDisplayName=${encodeURIComponent(
              last.display_name,
            )}&cursorId=${last.contributor_id}`}
            className="rounded-md border border-border-subtle px-4 py-2 text-sm font-medium hover:bg-surface-muted"
          >
            {t("loadMore")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
