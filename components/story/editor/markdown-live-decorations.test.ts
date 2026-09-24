import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createMarkdownLiveExtensions } from "./markdown-live-decorations";

// Headless, same approach as markdown-editor.test.ts / markdown-commands.test.ts:
// a real EditorView, no React rendering. Unlike those two (which only check
// plain-text transforms), this suite reads back the RENDERED cm-content text,
// since the thing under test is the live-preview decoration layer itself --
// concealed markers are Decoration.replace({}) (zero-width), so a concealed
// `**`/`*`/`## ` simply does not appear in contentDOM.textContent, while a
// revealed one does. Confirmed feasible with a throwaway probe first: even
// though these decorations are built from `view.visibleRanges`, a headless
// jsdom EditorView still populates a full visible range ({ from: 0, to: doc
// length }) and the decorations render for real.
//
// The view is appended to document.body (not left detached) -- EditorView
// only computes non-empty visibleRanges once it believes it has real layout,
// and a detached view was observed to report an empty viewport.
function viewWithDoc(doc: string, selFrom: number, selTo = selFrom) {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: selFrom, head: selTo },
      extensions: createMarkdownLiveExtensions(),
    }),
  });
  document.body.appendChild(view.dom);
  return view;
}

describe("createMarkdownLiveExtensions per-construct reveal", () => {
  it("conceals every marker when the caret sits outside all constructs", () => {
    const view = viewWithDoc("Kia ora **friends** and *all*", 0);
    expect(view.contentDOM.textContent).toBe("Kia ora friends and all");
  });

  it("reveals only the ** pair the caret is touching, not the * pair elsewhere on the line", () => {
    // Caret inside the word "friends" -- this is the core regression: the
    // old per-LINE reveal used to show every marker on the whole line the
    // moment the caret landed anywhere on it, including the unrelated *all*
    // emphasis later in the same sentence.
    const view = viewWithDoc("Kia ora **friends** and *all*", 12);
    expect(view.contentDOM.textContent).toBe("Kia ora **friends** and all");
  });

  it("reveals only the * pair the caret is touching, not the ** pair elsewhere on the line", () => {
    const view = viewWithDoc("Kia ora **friends** and *all*", 26);
    expect(view.contentDOM.textContent).toBe("Kia ora friends and *all*");
  });

  it("conceals a line-leading heading marker unless the caret is on the marker itself", () => {
    const midWord = viewWithDoc("## My heading", 8);
    expect(midWord.contentDOM.textContent).toBe("My heading");

    const onMarker = viewWithDoc("## My heading", 0);
    expect(onMarker.contentDOM.textContent).toBe("## My heading");
  });

  it("still renders the bullet glyph instead of raw '- ' when the caret is inside the item text", () => {
    const view = viewWithDoc("- a list item", 6);
    expect(view.contentDOM.textContent).toContain("•");
    expect(view.contentDOM.textContent).not.toContain("- a list item");
  });
});
