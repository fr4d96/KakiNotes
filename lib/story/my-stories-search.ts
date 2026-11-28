import type { Locale } from "@/i18n/locales";
import {
  destinationNames,
  regionNames,
  stringList,
} from "@/lib/story/card-fields";

/**
 * The fields of a My Stories row that the keyword search reads. Every one is
 * already on the row list_my_stories() returns, so searching costs no query:
 * the page loads all of the caller's own stories (RLS + the RPC's owner
 * check decide which), and this only narrows what is already on the client.
 */
export type SearchableStory = {
  title: string | null;
  excerpt: string | null;
  regions: unknown;
  tags: unknown;
};

/** Lower-cased, width-folded text, so "ＱＵＥＥＮ" and "queen" compare equal. */
function fold(text: string, locale: Locale): string {
  return text.normalize("NFKC").toLocaleLowerCase(locale);
}

/**
 * The words of a search, folded. Empty when the box holds only whitespace,
 * which then filters nothing.
 */
export function searchTerms(query: string, locale: Locale): string[] {
  return fold(query, locale).split(/\s+/).filter(Boolean);
}

/**
 * True when every word of the search appears somewhere in the story's title,
 * summary, region or destination names (in the page's language, as printed
 * on the cards) or tags. Words may match different fields: "queenstown
 * bungy" finds a story titled "Bungy day" in Queenstown.
 */
export function storyMatchesSearch(
  story: SearchableStory,
  terms: string[],
  locale: Locale,
): boolean {
  if (terms.length === 0) return true;
  const haystack = fold(
    [
      story.title ?? "",
      story.excerpt ?? "",
      ...regionNames(story.regions, locale),
      ...destinationNames(story.regions, locale),
      ...stringList(story.tags),
    ].join("\n"),
    locale,
  );
  return terms.every((term) => haystack.includes(term));
}
