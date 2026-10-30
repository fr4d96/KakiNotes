"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * A story photo that "resolves" into place -- the app's focus-pull loading
 * (DESIGN.md, Loading): while the bytes are on their way the frame holds a
 * soft `.nf-skeleton` sheen, then the photo fades in from a slight blur and
 * scale. Under reduced motion the swap is instant.
 *
 * Visible by default, on purpose. Server-rendered story pages ship the <img>
 * in the HTML, and it can finish loading before React hydrates (when onLoad
 * would be missed) or with JavaScript off entirely. So the first render --
 * the server's, and the client's first paint -- shows the image plainly;
 * only once mounted, and only if the image is genuinely still loading, does
 * it switch to the sheen. A photo can never be stranded invisible (DESIGN.md:
 * never a reveal whose resting state is invisible). useLayoutEffect makes
 * that switch before the browser paints, so a still-loading image never
 * flashes in before its sheen.
 *
 * `reserveClassName` gives an image with no intrinsic box yet (an auto-height
 * inline photo) something to hold the sheen while loading, e.g.
 * "aspect-video"; it is dropped once the real image takes over.
 */
export function ResolvingImage({
  src,
  alt,
  className = "",
  wrapperClassName = "relative block",
  reserveClassName = "",
  loadingLabel,
  loading,
  onError,
}: {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  reserveClassName?: string;
  /** Accessible name of the placeholder, e.g. "Loading image". */
  loadingLabel: string;
  loading?: "lazy" | "eager";
  onError?: () => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  // "settled": draw the image normally (first paint, or after it loaded).
  // "loading": it is still downloading -- sheen up, image held back.
  const [phase, setPhase] = useState<"settled" | "loading">("settled");
  const [fading, setFading] = useState(false);

  useLayoutEffect(() => {
    const img = imgRef.current;
    // `complete` is true once the browser is done with the image either way
    // -- loaded OR failed -- so only a genuinely in-flight image gets the
    // sheen; one that already failed is never left shimmering forever.
    // (React's onLoad cannot report an image that settled before hydration;
    // this is the image's own state, read straight off the element.)
    if (img && !img.complete) {
      setPhase("loading");
    }
  }, [src]);

  const isLoading = phase === "loading";

  return (
    <span className={wrapperClassName}>
      {isLoading && (
        <span
          role="status"
          aria-label={loadingLabel}
          className="nf-skeleton absolute inset-0 rounded-[inherit]"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- signed or public-bucket URLs, not a Next/Image source */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => {
          if (phase === "loading") {
            setFading(true);
            setPhase("settled");
          }
        }}
        onError={() => {
          setPhase("settled");
          onError?.();
        }}
        className={`${className} ${
          isLoading
            ? `${reserveClassName} scale-[1.03] opacity-0 blur-sm`
            : "scale-100 opacity-100 blur-none"
        } ${
          fading || isLoading
            ? "transition-[opacity,filter,transform] duration-500 ease-out motion-reduce:transition-none"
            : ""
        }`}
      />
    </span>
  );
}
