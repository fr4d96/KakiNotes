import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LazyMount } from "./lazy-mount";

type Callback = (entries: { isIntersecting: boolean }[]) => void;

/** Minimal IntersectionObserver whose callback the test fires by hand. */
function stubIntersectionObserver() {
  const callbacks: Callback[] = [];
  class FakeObserver {
    constructor(callback: Callback) {
      callbacks.push(callback);
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  return callbacks;
}

const tree = (
  <LazyMount>
    <span data-testid="cover">cover</span>
  </LazyMount>
);

/**
 * Server-render with no IntersectionObserver (as on Node), then hydrate in
 * this jsdom document with `setUpBrowser` deciding what the browser has.
 */
async function serverRenderThenHydrate(setUpBrowser: () => void) {
  vi.stubGlobal("IntersectionObserver", undefined);
  const serverHtml = renderToString(tree);
  setUpBrowser();
  const container = document.createElement("div");
  container.innerHTML = serverHtml;
  document.body.appendChild(container);

  const recoverableErrors: unknown[] = [];
  const root = await act(async () =>
    hydrateRoot(container, tree, {
      onRecoverableError: (error) => recoverableErrors.push(error),
    }),
  );
  return { serverHtml, container, root, recoverableErrors };
}

describe("LazyMount", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("server-renders the placeholder, never the children", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const html = renderToString(tree);
    expect(html).toContain("nf-skeleton");
    expect(html).not.toContain('data-testid="cover"');
  });

  it("hydrates without a mismatch and waits for the viewport", async () => {
    let callbacks: Callback[] = [];
    const { container, root, recoverableErrors } =
      await serverRenderThenHydrate(() => {
        callbacks = stubIntersectionObserver();
      });

    expect(recoverableErrors).toEqual([]);
    expect(container.querySelector(".nf-skeleton")).not.toBeNull();
    expect(container.querySelector("[data-testid=cover]")).toBeNull();

    act(() => callbacks.forEach((cb) => cb([{ isIntersecting: true }])));
    expect(container.querySelector("[data-testid=cover]")).not.toBeNull();

    act(() => root.unmount());
  });

  it("hydrates without a mismatch and then mounts when IntersectionObserver is missing", async () => {
    const { container, root, recoverableErrors } =
      await serverRenderThenHydrate(() => {});

    expect(recoverableErrors).toEqual([]);
    expect(container.querySelector("[data-testid=cover]")).not.toBeNull();

    act(() => root.unmount());
  });
});
