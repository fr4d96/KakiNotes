import Link from "next/link";
import { ArrowRightIcon } from "@/components/icons";

export type PlaceTile = {
  /** Region id -- the value /stories' `region` filter expects. */
  id: string;
  name: string;
  /** Cover of the newest story from this region, when it has one. */
  coverUrl: string | null;
};

/**
 * "Browse by place": one tap from the home page into the Stories tab already
 * filtered to a region. The tiles carry no story counts on purpose -- the
 * home page only fetches the latest batch, so a count read off it would be a
 * claim about the whole catalogue that the data does not support.
 *
 * Tiles are always dark (a photo, or the Night Field ground when there is no
 * photo) so the white label clears contrast in both themes.
 */
export function PlaceTiles({ places }: { places: PlaceTile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
      {places.map((place) => (
        <li key={place.id}>
          <Link
            href={`/stories?region=${place.id}`}
            className="press press-hover-only group relative isolate flex aspect-[5/4] items-end justify-between gap-2 overflow-hidden rounded-[16px] bg-[#0b1222] p-3.5 text-white shadow-sm transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            {place.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- public bucket URLs are content-addressed, not a Next.js image-optimizable source list
              <img
                src={place.coverUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 -z-20 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
              />
            ) : null}
            <span
              aria-hidden="true"
              className="absolute inset-0 -z-10 bg-linear-to-t from-black/80 via-black/30 to-black/5"
            />
            <span className="text-base leading-tight font-extrabold tracking-[-.015em] text-balance">
              {place.name}
            </span>
            <ArrowRightIcon
              aria-hidden="true"
              className="h-4 w-4 shrink-0 opacity-80 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
