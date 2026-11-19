"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Mounts its children only once the box is near the viewport, and keeps them
 * mounted afterwards.
 *
 * This is what makes /my-stories fast: a cover or photo strip starts minting
 * its signed preview URL (a Server Action, which the browser runs one at a
 * time) when it MOUNTS, so rendering every row eagerly queued dozens of
 * mints before the first card could paint. Gating the mount on proximity
 * changes only WHEN a URL is requested -- who may get one is still decided
 * server-side per id (Rule 13).
 *
 * The placeholder is the same fixed-size box the image fills, so nothing
 * shifts when it resolves. A collapsed <details> has no layout box, so rows
 * folded away never intersect and never mint. Without IntersectionObserver
 * (old browsers, jsdom) the children mount right after hydration.
 *
 * The server always renders the placeholder: it has no IntersectionObserver
 * either, so deciding with `typeof IntersectionObserver` during render made
 * the server paint the children while a modern browser's first render
 * painted the placeholder -- a hydration mismatch. useSyncExternalStore's
 * server snapshot pins hydration to the placeholder, then re-renders with
 * the browser's real answer.
 */
export function LazyMount({
  children,
  rootMargin = "400px 0px",
}: {
  children: React.ReactNode;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const noObserver = useSyncExternalStore(
    subscribeToNothing,
    lacksIntersectionObserver,
    renderPlaceholderOnServer,
  );
  const show = near || noObserver;

  useEffect(() => {
    // Hydration commits with the server snapshot first, so this effect can
    // run once before the re-render that reports a missing observer.
    if (show || lacksIntersectionObserver()) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [show, rootMargin]);

  if (show) return <>{children}</>;
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="nf-skeleton h-full w-full rounded-none"
    />
  );
}

// Whether the browser has IntersectionObserver never changes, so there is
// nothing to subscribe to.
function subscribeToNothing() {
  return () => {};
}

function lacksIntersectionObserver() {
  return typeof IntersectionObserver === "undefined";
}

function renderPlaceholderOnServer() {
  return false;
}
