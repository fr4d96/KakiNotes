import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import {
  isBlankDoc,
  insertSectionHeading,
  insertOutline,
} from "./markdown-commands";

// Headless: same "closed-loop, no DOM" approach as markdown-editor.test.ts --
// a real EditorState/EditorView, no React rendering needed.
function viewWithDoc(doc: string, selFrom: number, selTo = selFrom) {
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: selFrom, head: selTo },
    }),
  });
}

describe("isBlankDoc", () => {
  it("is true for an empty document", () => {
    expect(isBlankDoc(viewWithDoc("", 0))).toBe(true);
  });

  it("is true for whitespace-only content", () => {
    expect(isBlankDoc(viewWithDoc("  \n\n", 0))).toBe(true);
  });

  it("is false once there is real text", () => {
    expect(isBlankDoc(viewWithDoc("hi", 0))).toBe(false);
  });

  it("ignores the given range when checking", () => {
    const view = viewWithDoc("/outline", 8);
    expect(isBlankDoc(view, { from: 0, to: 8 })).toBe(true);
  });

  it("is false when there is text outside the ignored range", () => {
    const view = viewWithDoc("x /outline", 10);
    expect(isBlankDoc(view, { from: 2, to: 10 })).toBe(false);
  });
});

describe("insertSectionHeading", () => {
  it("inserts a heading into an empty document", () => {
    const view = viewWithDoc("", 0);
    insertSectionHeading(view, "My first night");
    expect(view.state.doc.toString()).toBe("## My first night\n\n");
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    view.destroy();
  });

  it("appends after existing text with no trailing newline", () => {
    const view = viewWithDoc("Para one", 8);
    insertSectionHeading(view, "Heading");
    expect(view.state.doc.toString()).toBe("Para one\n\n## Heading\n\n");
    expect(view.state.selection.main.head).toBe(view.state.doc.length);
    view.destroy();
  });

  it("adds exactly one extra newline when the doc already ends in one", () => {
    const view = viewWithDoc("Para one\n", 9);
    insertSectionHeading(view, "Heading");
    expect(view.state.doc.toString()).toBe("Para one\n\n## Heading\n\n");
    view.destroy();
  });

  it("adds no extra newline when the doc already ends in a blank line", () => {
    const view = viewWithDoc("Para one\n\n", 10);
    insertSectionHeading(view, "Heading");
    expect(view.state.doc.toString()).toBe("Para one\n\n## Heading\n\n");
    view.destroy();
  });

  it("trims the heading text", () => {
    const view = viewWithDoc("", 0);
    insertSectionHeading(view, "  Hi  ");
    expect(view.state.doc.toString()).toBe("## Hi\n\n");
    view.destroy();
  });
});

describe("insertOutline", () => {
  const outline = "## A\n\n## B\n";

  it("replaces a blank document and returns true", () => {
    const view = viewWithDoc("", 0);
    const result = insertOutline(view, outline);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toBe(outline);
    expect(view.state.selection.main.anchor).toBe(5);
    view.destroy();
  });

  it("does nothing and returns false on a document with text", () => {
    const view = viewWithDoc("Already writing", 15);
    const result = insertOutline(view, outline);
    expect(result).toBe(false);
    expect(view.state.doc.toString()).toBe("Already writing");
    view.destroy();
  });

  it("replaces the /outline trigger, ignoring it as blank", () => {
    const view = viewWithDoc("/outline", 8);
    const result = insertOutline(view, outline, { from: 0, to: 8 });
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toBe(outline);
    view.destroy();
  });
});
