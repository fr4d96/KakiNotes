"use client";

import * as React from "react";
import { EditorView } from "@codemirror/view";

/**
 * Marks a bar that stays stuck to the top of the window (the site header,
 * the story wizard's step bar). The editor toolbar sticks directly under the
 * lowest of them, so it never needs to know their heights -- which vary with
 * the safe-area inset, the breakpoint and flex-wrap.
 */
export const STICKY_CHROME_ATTR = "data-sticky-chrome";

type ChromeBar = { top: number; height: number };

/**
 * Where the stuck chrome ends, in px from the top of the layout viewport:
 * the largest `top + height` among the bars. `top` is each bar's resolved
 * CSS `top` (its stuck position), not where it happens to be right now, so
 * the answer is the same whether or not the page has scrolled yet.
 */
export function stickyChromeBottom(bars: ChromeBar[]): number {
  let bottom = 0;
  for (const { top, height } of bars) {
    if (!Number.isFinite(top) || height <= 0) continue;
    bottom = Math.max(bottom, top + height);
  }
  return Math.round(bottom);
}

/**
 * The toolbar's sticky `top`. With the iOS keyboard up, Safari pans the
 * visual viewport down inside the layout viewport (`visualViewport.offsetTop`
 * > 0) instead of resizing it, which can carry the stuck chrome -- and a
 * toolbar stuck under it -- off the top of what you can see. Sticking at
 * least `offsetTop` down keeps the toolbar at the visible top in that case.
 */
export function toolbarStickyTop(
  chromeBottom: number,
  visualOffsetTop: number,
): number {
  return Math.max(chromeBottom, Math.max(0, Math.round(visualOffsetTop)));
}

function measure(doc: Document): number {
  const win = doc.defaultView;
  if (!win) return 0;
  const bars = [...doc.querySelectorAll<HTMLElement>(`[${STICKY_CHROME_ATTR}]`)]
    .filter((el) => {
      const position = win.getComputedStyle(el).position;
      return position === "sticky" || position === "fixed";
    })
    .map((el) => ({
      top: parseFloat(win.getComputedStyle(el).top),
      height: el.offsetHeight,
    }));
  return toolbarStickyTop(
    stickyChromeBottom(bars),
    win.visualViewport?.offsetTop ?? 0,
  );
}

/**
 * The live sticky `top` for the editor toolbar, re-measured when a chrome
 * bar changes size (wraps, safe area), on window resize/rotation and when
 * the visual viewport moves (iOS keyboard). `enabled=false` skips all of it
 * for read-only editors, which have no toolbar.
 */
export function useToolbarStickyTop(enabled: boolean): number | undefined {
  const [top, setTop] = React.useState<number | undefined>(undefined);

  React.useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setTop(measure(document)));
    };
    update();

    // Absent in jsdom and very old browsers; window resize still covers
    // rotation there, just not a bar re-wrapping on its own.
    const resize =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    for (const el of document.querySelectorAll(`[${STICKY_CHROME_ATTR}]`)) {
      resize?.observe(el);
    }
    const vv = window.visualViewport;
    window.addEventListener("resize", update);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      window.removeEventListener("resize", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, [enabled]);

  return top;
}

/**
 * How far below the window top CodeMirror must keep the caret: the bottom
 * edge of the toolbar, plus a line's breathing room. Measured live, so it is
 * right whether the toolbar is stuck or still sitting in flow above the text.
 */
export function toolbarScrollMargin(toolbar: HTMLElement | null): number {
  if (!toolbar) return 0;
  const bottom = Math.round(toolbar.getBoundingClientRect().bottom);
  return bottom > 0 ? bottom + 8 : 0;
}

/** Marks the editable editor's outer column; the toolbar is inside it. */
export const EDITOR_SHELL_ATTR = "data-editor-shell";

/**
 * The CodeMirror extension that applies toolbarScrollMargin. It finds the
 * toolbar from the editor's own DOM when CodeMirror asks (at scroll time),
 * so it needs no React ref and works for every editor on a page.
 */
export const toolbarScrollMargins = EditorView.scrollMargins.of((view) => ({
  top: toolbarScrollMargin(
    view.dom
      .closest(`[${EDITOR_SHELL_ATTR}]`)
      ?.querySelector<HTMLElement>('[role="toolbar"]')?.parentElement ?? null,
  ),
}));
