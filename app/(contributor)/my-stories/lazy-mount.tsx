"use client";

import { useEffect, useRef, useState } from "react";

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
 * (old browsers, jsdom) the children mount straight away.
 */
export function LazyMount({
  children,
  rootMargin = "400px 0px",
}: {
  children: React.ReactNode;
  rootMargin?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(
    () => typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    if (near) return;
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
  }, [near, rootMargin]);

  if (near) return <>{children}</>;
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="nf-skeleton h-full w-full rounded-none"
    />
  );
}
