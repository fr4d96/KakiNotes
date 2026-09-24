import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STARTERS_HIDE_THRESHOLD_WORDS,
  StoryStartersCard,
} from "./story-starters-card";
import { getStoryStarters } from "@/lib/story/story-starters";

const STORY_ID = "story-1";

// jsdom in this repo's Vitest config runs with an opaque origin (no `url`
// set), under which real jsdom throws SecurityError just touching
// `window.localStorage` -- unrelated to anything this component does. Stub
// a minimal in-memory localStorage so these tests exercise the component's
// actual read/write behaviour instead of that jsdom gap.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function setup(
  overrides: Partial<React.ComponentProps<typeof StoryStartersCard>> = {},
) {
  const onWriteAbout = vi.fn();
  const onInsertOutline = vi.fn();
  const props = {
    storyId: STORY_ID,
    wordCount: 0,
    bodyIsEmpty: true,
    onWriteAbout,
    onInsertOutline,
    ...overrides,
  };
  const view = render(<StoryStartersCard {...props} />);
  return { onWriteAbout, onInsertOutline, ...view };
}

describe("StoryStartersCard", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: createMemoryStorage(),
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders title, a question, and the three buttons at wordCount 0", () => {
    setup();

    expect(screen.getByText("Not sure where to start?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Write about this" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show me another" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("calls onWriteAbout with a heading from getStoryStarters", async () => {
    const user = userEvent.setup();
    const { onWriteAbout } = setup();
    const headings = getStoryStarters("en").prompts.map((p) => p.heading);

    await user.click(screen.getByRole("button", { name: "Write about this" }));

    expect(onWriteAbout).toHaveBeenCalledTimes(1);
    const calledWith = onWriteAbout.mock.calls[0][0];
    expect(headings).toContain(calledWith);
  });

  it("changes the question text on Show me another", async () => {
    const user = userEvent.setup();
    setup();

    const questionEl = screen.getByText(
      (_, el) =>
        el?.tagName === "P" && el.getAttribute("aria-live") === "polite",
    );
    const firstQuestion = questionEl.textContent;

    // Cycle through all prompts; with more than one prompt the text must
    // change at some point during the cycle.
    const { prompts } = getStoryStarters("en");
    let changed = false;
    for (let i = 0; i < prompts.length; i += 1) {
      await user.click(screen.getByRole("button", { name: "Show me another" }));
      const el = screen.getByText(
        (_, node) =>
          node?.tagName === "P" && node.getAttribute("aria-live") === "polite",
      );
      if (el.textContent !== firstQuestion) {
        changed = true;
        break;
      }
    }

    expect(prompts.length).toBeGreaterThan(1);
    expect(changed).toBe(true);
  });

  it("hides on Hide and sets the localStorage key", async () => {
    const user = userEvent.setup();
    const { container } = setup();

    await user.click(screen.getByRole("button", { name: "Hide" }));

    expect(container).toBeEmptyDOMElement();
    expect(
      window.localStorage.getItem(`kakinotes:starters-hidden:${STORY_ID}`),
    ).toBe("1");
  });

  it("hides after mount on a fresh render when the key is already set", async () => {
    window.localStorage.setItem(`kakinotes:starters-hidden:${STORY_ID}`, "1");

    const { container } = setup();

    await vi.waitFor(() => {
      expect(container).toBeEmptyDOMElement();
    });
  });

  it("renders nothing at wordCount 50", () => {
    const { container } = setup({ wordCount: STARTERS_HIDE_THRESHOLD_WORDS });

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the outline line when bodyIsEmpty and calls onInsertOutline", async () => {
    const user = userEvent.setup();
    const { onInsertOutline } = setup({ bodyIsEmpty: true });

    expect(screen.getByText("Know the shape already?")).toBeInTheDocument();
    const outlineButton = screen.getByRole("button", {
      name: "Start from an outline",
    });

    await user.click(outlineButton);

    expect(onInsertOutline).toHaveBeenCalledTimes(1);
  });

  it("hides the outline line when body is not empty", () => {
    setup({ bodyIsEmpty: false });

    expect(
      screen.queryByText("Know the shape already?"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start from an outline" }),
    ).not.toBeInTheDocument();
  });

  it("hydrates server HTML without a mismatch, even if Math.random differs", async () => {
    // The real bug: the server and the browser each shuffled with their own
    // Math.random, so the server-rendered question never matched the one the
    // client hydrated with. Force the two passes to disagree -- the card must
    // not care, because its order comes from the story id.
    const props = {
      storyId: STORY_ID,
      wordCount: 0,
      bodyIsEmpty: true,
      onWriteAbout: vi.fn(),
      onInsertOutline: vi.fn(),
    };
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const serverHtml = renderToString(<StoryStartersCard {...props} />);

    random.mockReturnValue(0.999);
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.appendChild(container);
    const serverQuestion = container.querySelector(
      'p[aria-live="polite"]',
    )?.textContent;

    const recoverableErrors: unknown[] = [];
    const root = await act(async () =>
      hydrateRoot(container, <StoryStartersCard {...props} />, {
        onRecoverableError: (error) => recoverableErrors.push(error),
      }),
    );

    expect(recoverableErrors).toEqual([]);
    expect(serverQuestion).toBeTruthy();
    expect(container.querySelector('p[aria-live="polite"]')?.textContent).toBe(
      serverQuestion,
    );

    act(() => root.unmount());
    container.remove();
  });
});
