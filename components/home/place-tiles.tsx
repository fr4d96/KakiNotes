import Link from "next/link";
import { useTranslations } from "next-intl";
import { ResolvingImage } from "@/components/ui/resolving-image";

export type PlaceTile = {
  /** Region id -- the value /stories' `region` filter expects. */
  id: string;
  name: string;
  /** Cover of the newest story from this region, when it has one. */
  coverUrl: string | null;
};

/**
 * "Browse by place": one tap from the home page into the Stories tab already
 * filtered to a region. Each place is a small rounded photo with its name
 * underneath -- the same boxless shape as a story pin, one size down.
 * Deliberately NOT round, ringed photos (tried 2026-11-17 and turned down by
 * the owner): that shape is Instagram's "story" row, and a place is not a
 * story.
 *
 * A sideways-swiping row on a phone (it bleeds to the screen edges), a grid
 * from sm up. No story counts, on purpose: the home page only fetches the
 * latest batch, so a count read off it would be a claim about the whole
 * catalogue that the data does not support.
 */
export function PlaceTiles({
  places,
  basePath = "/stories",
}: {
  places: PlaceTile[];
  /** The country's Stories tab ("/stories" NZ, "/my/stories" Malaysia). */
  basePath?: string;
}) {
  const tImages = useTranslations("editor.images");
  return (
    <ul className="nf-scroll-x -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-6">
      {places.map((place) => (
        <li key={place.id} className="w-[132px] shrink-0 snap-start sm:w-auto">
          <Link
            href={`${basePath}?region=${place.id}`}
            className="press press-hover-only group block rounded-2xl focus-visible:outline-offset-4"
          >
            <span className="block aspect-[4/3] overflow-hidden rounded-2xl bg-surface-muted shadow-sm transition-shadow group-hover:shadow-md">
              {place.coverUrl ? (
                <ResolvingImage
                  src={place.coverUrl}
                  alt=""
                  loading="lazy"
                  loadingLabel={tImages("loading")}
                  wrapperClassName="relative block h-full w-full overflow-hidden"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                />
              ) : null}
            </span>
            <span className="mt-2 block truncate px-1 text-sm font-semibold text-foreground">
              {place.name}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
