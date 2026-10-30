"use client";

import { ViewTransition, useState } from "react";
import { usePathname } from "next/navigation";
import { countryFromPathname, countryUrlPrefix } from "@/lib/story/countries";

export type NavDirection = "forward" | "back" | "sibling";

/**
 * Which way a navigation goes, judged by how deep the two URLs are
 * (country prefix ignored): /stories -> /stories/<slug> is forward,
 * /my-stories -> /stories/<id>/edit is forward, anything shallower is back,
 * same depth is a sibling move. Deliberately a heuristic over URL depth --
 * it needs no cooperation from the links, so it also covers the browser's
 * back button and every link in files this component does not own.
 */
export function navDirection(
  from: string | null,
  to: string | null,
): NavDirection {
  const depth = (pathname: string | null) => {
    if (!pathname) return 0;
    const prefix = countryUrlPrefix(countryFromPathname(pathname));
    return pathname.slice(prefix.length).split("/").filter(Boolean).length;
  };
  const a = depth(from);
  const b = depth(to);
  if (b > a) return "forward";
  if (b < a) return "back";
  return "sibling";
}

/** The `.vt-in-*` classes are defined in app/globals.css. */
const ENTER_BY_DIRECTION: Record<NavDirection, string> = {
  forward: "vt-in-forward",
  back: "vt-in-back",
  sibling: "vt-in-rise",
};

/**
 * iOS-style route transitions with React's <ViewTransition> (Next 16
 * "Designing view transitions" guide, step 3).
 *
 * Keyed by pathname, so a route change unmounts this boundary (old page =
 * exit) and mounts a new one (new page = enter) -- never the header, footer
 * or tab bar around it, which sit outside the boundary. The motion itself is
 * CSS: the class names below pick `::view-transition-old/new(.vt-*)` rules
 * in app/globals.css.
 *
 *  - going deeper: the new page slides in from the right;
 *  - going back: it slides in from the left;
 *  - same depth: a quick fade + rise;
 *  - tab-bar links pass the `tab` transition type: a plain crossfade;
 *  - links that pass `nav-forward` / `nav-back` also move the OLD page
 *    (it shifts a little the other way) -- the depth heuristic alone cannot
 *    know the direction at exit time, so untyped navigations fade the old
 *    page out in place.
 *
 * Browsers without view transitions simply swap pages. Under
 * prefers-reduced-motion the CSS drops every slide for a 120ms fade.
 *
 * The wrapper div carries no styling: React gives it a view-transition-name
 * only while a transition runs, so at rest it is not a stacking context or a
 * containing block for `position: fixed` descendants (the old transform
 * wrapper was -- see "Loading" in DESIGN.md).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Remember the previous pathname (adjust-state-during-render pattern) so
  // the enter animation can be chosen from where we came from.
  const [seen, setSeen] = useState({ path: pathname, from: pathname });
  let from = seen.from;
  if (seen.path !== pathname) {
    from = seen.path;
    setSeen({ path: pathname, from });
  }
  const direction = navDirection(from, pathname);

  return (
    <ViewTransition
      key={pathname}
      default="none"
      enter={{
        tab: "vt-fade",
        "nav-forward": "vt-in-forward",
        "nav-back": "vt-in-back",
        default: ENTER_BY_DIRECTION[direction],
      }}
      exit={{
        tab: "vt-fade",
        "nav-forward": "vt-out-forward",
        "nav-back": "vt-out-back",
        default: "vt-out",
      }}
    >
      <div>{children}</div>
    </ViewTransition>
  );
}
