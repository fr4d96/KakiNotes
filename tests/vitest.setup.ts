import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement IntersectionObserver -- components/home/reveal.tsx
// (the scroll-reveal-on-view wrapper used throughout the home page) needs
// one to mount at all. This stub treats every observed element as already
// intersecting, so reveal-wrapped content renders visible immediately in
// tests rather than staying hidden forever.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: ReadonlyArray<number> = [];
  constructor(
    private callback: IntersectionObserverCallback,
    private options?: IntersectionObserverInit,
  ) {}
  observe(target: Element) {
    this.callback(
      [
        {
          target,
          isIntersecting: true,
          intersectionRatio: 1,
          boundingClientRect: target.getBoundingClientRect(),
          intersectionRect: target.getBoundingClientRect(),
          rootBounds: null,
          time: 0,
        } as IntersectionObserverEntry,
      ],
      this,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

global.IntersectionObserver = MockIntersectionObserver;

// jsdom's <dialog> support is a bare stub (the `open` attribute reflects,
// but showModal()/close() aren't implemented at all) -- components/auth/
// auth-modal.tsx needs both. This polyfill is just enough to exercise real
// open/close behavior in tests: showModal() sets the `open` attribute
// (matching what real browsers do, and what our component's open-state
// guard checks via `dialog.open`), close() clears it and fires the native
// "close" event React's onClose prop listens for.
// Guarded: some test files (e.g. lib/story/image-pipeline.test.ts) run in
// Vitest's plain "node" environment rather than jsdom, where this global
// doesn't exist at all.
if (typeof HTMLDialogElement !== "undefined") {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      if (!this.hasAttribute("open")) return;
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
}

// jsdom has no layout engine, so it implements no scrolling at all --
// Element.prototype.scrollIntoView simply doesn't exist, and calling it
// throws. components/home/story-index.tsx calls it when the reader pages
// the record (to put the new page's first entry at the top), and any
// component that moves the viewport will hit the same wall. A no-op is the
// honest stub: there is no scroll position in jsdom to assert against, and
// what the paging tests actually check is which entries render and where
// focus lands.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// next-intl: every reader- and contributor-facing string now comes from
// messages/<locale>.json, and the real hooks need a provider (client) or the
// per-request config (server) to resolve. Neither exists under RTL, so both
// entry points are mocked to resolve straight from the JSON files -- English
// by default, so every existing English assertion keeps passing untouched.
// tests/support/i18n.ts owns the locale switch (setTestLocale) a test uses
// to render a component in Chinese; the mocks read it on every call.
//
// Both factories are at the top level of this file on purpose: vi.mock is
// only hoisted from a file's top level, and it must be registered before any
// test file imports a component that imports next-intl.
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const { getTestLocale, TEST_MESSAGES, TEST_TIME_ZONE } =
    await import("./support/i18n");
  const translator = (namespace?: string) =>
    actual.createTranslator({
      locale: getTestLocale(),
      messages: TEST_MESSAGES[getTestLocale()],
      // createTranslator is generic over the namespace key type; the mock
      // hands through whatever string a component asked for.
      namespace: namespace as never,
    });
  return {
    ...actual,
    useTranslations: translator,
    useLocale: () => getTestLocale(),
    useFormatter: () =>
      actual.createFormatter({
        locale: getTestLocale(),
        timeZone: TEST_TIME_ZONE,
      }),
    useMessages: () => TEST_MESSAGES[getTestLocale()],
    useTimeZone: () => TEST_TIME_ZONE,
    useNow: () => new Date(),
  };
});

vi.mock("next-intl/server", async () => {
  // The real server entry is a react-server build that cannot load under
  // jsdom; the client entry carries the same createTranslator/createFormatter.
  const actual = await vi.importActual<typeof import("next-intl")>("next-intl");
  const { getTestLocale, TEST_MESSAGES, TEST_TIME_ZONE } =
    await import("./support/i18n");
  const translator = (locale: keyof typeof TEST_MESSAGES, namespace?: string) =>
    actual.createTranslator({
      locale,
      messages: TEST_MESSAGES[locale],
      namespace: namespace as never,
    });
  return {
    getTranslations: async (
      arg?:
        string | { locale?: keyof typeof TEST_MESSAGES; namespace?: string },
    ) => {
      if (typeof arg === "string") return translator(getTestLocale(), arg);
      return translator(arg?.locale ?? getTestLocale(), arg?.namespace);
    },
    getLocale: async () => getTestLocale(),
    getFormatter: async () =>
      actual.createFormatter({
        locale: getTestLocale(),
        timeZone: TEST_TIME_ZONE,
      }),
    getMessages: async () => TEST_MESSAGES[getTestLocale()],
    getTimeZone: async () => TEST_TIME_ZONE,
    getNow: async () => new Date(),
    setRequestLocale: () => {},
  };
});
