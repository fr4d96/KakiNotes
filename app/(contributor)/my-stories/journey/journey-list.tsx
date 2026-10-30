"use client";

import { useId } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronIcon, MapPinIcon } from "@/components/icons";
import { JourneyMap } from "@/components/story/journey-map";
import {
  buildMyJourneyStops,
  groupMyJourney,
  type MyJourneyEntry,
} from "@/lib/journey/contributor-journey";

/**
 * The Journey map tab (/my-stories/journey): the contributor's published
 * stories as journeys -- each main story with its sub stories listed under
 * it, one card per journey. Drafts are never shown (they can't be pinned).
 * Tapping a card opens that journey's own page (./[storyId]), where its map
 * is and where each story gets pinned. Below the list, the whole journey as
 * readers see it on the profile's Journey tab.
 */
export function JourneyListView({ stories }: { stories: MyJourneyEntry[] }) {
  const t = useTranslations("myJourney");
  const previewId = useId();
  const groups = groupMyJourney(stories);
  const previewStops = buildMyJourneyStops(
    groups.flatMap((g) => [g.main, ...g.subs]),
  );

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 pb-12 sm:px-6 sm:py-16">
      <h1 className="journiq-heading text-[2rem] max-md:sr-only">
        {t("title")}
      </h1>
      {groups.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">{t("listIntro")}</p>
          <ul className="mt-5 space-y-3" aria-label={t("listLabel")}>
            {groups.map(({ main, subs }) => {
              const all = [main, ...subs];
              const pinnable = all.filter((s) => s.pinnable);
              const pinned = pinnable.filter((s) => s.place).length;
              return (
                <li key={main.id}>
                  <Link
                    href={`/my-stories/journey/${main.id}`}
                    className="press press-hover-only flex items-center gap-3 rounded-lg border border-border-subtle bg-surface p-3 hover:border-accent/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-semibold">
                        {main.title ?? main.slug}
                      </span>
                      {subs.length > 0 ? (
                        <span className="mt-1 block space-y-0.5 border-l-2 border-dotted border-border-subtle pl-2.5">
                          {subs.map((sub) => (
                            <span
                              key={sub.id}
                              className="block truncate text-sm text-foreground/75"
                            >
                              {sub.title ?? sub.slug}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      <span className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPinIcon className="h-3.5 w-3.5 shrink-0" />
                        {pinnable.length === 0
                          ? t("rows.notNewZealand")
                          : t("onMap", {
                              pinned,
                              total: pinnable.length,
                            })}
                      </span>
                    </span>
                    <ChevronIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>

          <section className="mt-10" aria-labelledby={previewId}>
            <h2 id={previewId} className="text-lg font-semibold">
              {t("previewTitle")}
            </h2>
            {previewStops.length > 0 ? (
              <JourneyMap stops={previewStops} />
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("previewEmpty")}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
