/**
 * The plain-text transforms the editor's toolbar, keyboard shortcuts and
 * slash-command menu all drive.
 *
 * Every operation manipulates raw Markdown syntax at the cursor/selection --
 * there is no document tree to keep in sync, unlike the Plate editor this
 * replaced. See markdown-live-decorations.ts for how that syntax then
 * renders live.
 *
 * Split out of markdown-editor.tsx so slash-commands.ts can use the same
 * transforms without importing a React client component (which would be a
 * module cycle). markdown-editor.tsx re-exports all four names, so the
 * original import path still works.
 */
import { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";

import { mediaEmbedToken } from "@/lib/story/markdown-media";

// --- Emphasis toggling ----------------------------------------------------
//
// Bold/italic/strikethrough are TOGGLES, not "add more syntax". Pressing the
// button a second time on the same words has to take the markers off again;
// before this, wrapSelection only ever wrapped, so a second click produced
// `****word****` -- which CommonMark reads as bold-inside-bold and renders
// as still-bold, exactly the "it won't unbold" this fixes.

/** The single repeated character an emphasis marker is made of, or null for
 *  asymmetric markers like the link button's `[` / `](https://)`, which have
 *  no meaningful "already applied" shape to detect. */
function markerChar(marker: string): string | null {
  const ch = marker[0];
  if (!ch || !"*_~".includes(ch)) return null;
  return [...marker].every((c) => c === ch) ? ch : null;
}

/** How many `ch` in a row sit immediately before `pos` / from `pos` onwards. */
function runBefore(text: string, pos: number, ch: string): number {
  let n = 0;
  while (pos - n - 1 >= 0 && text[pos - n - 1] === ch) n++;
  return n;
}
function runAfter(text: string, pos: number, ch: string): number {
  let n = 0;
  while (pos + n < text.length && text[pos + n] === ch) n++;
  return n;
}

/**
 * Whether a run of marker characters of length `run` should count as "this
 * marker is already applied here".
 *
 * `run === markerLength` is the plain case (`**word**` for the bold button).
 * The `run === 3` case is `***word***` -- bold AND italic, where the run is
 * shared by both buttons and each one owns its own slice of it: italic takes
 * one character off each side and leaves `**word**`, bold takes two and
 * leaves `*word*`.
 *
 * Deliberately NOT a `run >= markerLength` test: `*` is a prefix of `**`, so
 * a loose check would make the italic button peel one asterisk off each side
 * of already-bold text and silently downgrade it to italic.
 */
function isAppliedRun(run: number, markerLength: number): boolean {
  return run === markerLength || (markerLength <= 2 && run === 3);
}

/**
 * Wraps the selection in `before`/`after` -- or UNWRAPS it when the markers
 * are already there, whether they sit inside the selection (the contributor
 * selected `**word**` including the stars) or just outside it (the common
 * case: select a word, click B, click B again -- the selection is still the
 * bare word, with the stars either side of it).
 */
export function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholder: string,
) {
  const doc = view.state.doc.toString();
  const ch =
    markerChar(before) === markerChar(after) ? markerChar(before) : null;

  view.dispatch(
    view.state.changeByRange((range) => {
      const selectedText = view.state.sliceDoc(range.from, range.to);

      if (ch && !range.empty) {
        // Markers inside the selection: `**word**` is selected, stars and all.
        const lead = runAfter(selectedText, 0, ch);
        const trail = runBefore(selectedText, selectedText.length, ch);
        if (
          selectedText.length > before.length + after.length &&
          isAppliedRun(lead, before.length) &&
          isAppliedRun(trail, after.length)
        ) {
          const inner = selectedText.slice(
            before.length,
            selectedText.length - after.length,
          );
          return {
            changes: { from: range.from, to: range.to, insert: inner },
            range: EditorSelection.range(range.from, range.from + inner.length),
          };
        }
      }

      if (ch) {
        // Markers outside the selection: `**[word]**`. Also covers an empty
        // selection sitting between the markers of an empty `****`.
        const lead = runBefore(doc, range.from, ch);
        const trail = runAfter(doc, range.to, ch);
        if (
          isAppliedRun(lead, before.length) &&
          isAppliedRun(trail, after.length)
        ) {
          const from = range.from - before.length;
          const to = range.to + after.length;
          return {
            changes: [
              { from, to: range.from, insert: "" },
              { from: range.to, to, insert: "" },
            ],
            range: EditorSelection.range(from, from + selectedText.length),
          };
        }
      }

      const text = range.empty ? placeholder : selectedText;
      return {
        changes: {
          from: range.from,
          to: range.to,
          insert: `${before}${text}${after}`,
        },
        range: EditorSelection.range(
          range.from + before.length,
          range.from + before.length + text.length,
        ),
      };
    }),
  );
  view.focus();
}

function selectedLineNumbers(view: EditorView): number[] {
  const nums = new Set<number>();
  for (const range of view.state.selection.ranges) {
    const startLine = view.state.doc.lineAt(range.from).number;
    const endLine = view.state.doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n++) nums.add(n);
  }
  return [...nums].sort((a, b) => a - b);
}

export function toggleLinePrefix(view: EditorView, prefix: string) {
  const lines = selectedLineNumbers(view).map((n) => view.state.doc.line(n));
  const allHavePrefix = lines.every((line) => line.text.startsWith(prefix));
  const changes = lines.map((line) =>
    allHavePrefix
      ? { from: line.from, to: line.from + prefix.length }
      : line.text.startsWith(prefix)
        ? { from: line.from, to: line.from }
        : { from: line.from, insert: prefix },
  );
  view.dispatch(view.state.update({ changes }));
  view.focus();
}

export function insertTable(view: EditorView) {
  const pos = view.state.selection.main.to;
  const needsLeadingNewline =
    pos > 0 && view.state.sliceDoc(pos - 1, pos) !== "\n";
  const table = `${needsLeadingNewline ? "\n" : ""}\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n`;
  view.dispatch({
    changes: { from: pos, insert: table },
    selection: { anchor: pos + table.length },
  });
  view.focus();
}

export function insertMediaToken(
  view: EditorView,
  mediaId: string,
  width?: number,
) {
  const pos = view.state.selection.main.to;
  // A BLANK line either side, not a single newline. Consecutive non-blank
  // lines are one Markdown paragraph, so photos separated by single
  // newlines are inline siblings and the published page packs as many onto
  // a row as will fit -- while the editor drew one per row. A photo dropped
  // in gets its own paragraph, so "stacked" means stacked everywhere; two
  // photos share a line only when someone deliberately drags one beside
  // another (moveMediaEmbed's "inline" mode).
  const before = view.state.sliceDoc(Math.max(0, pos - 2), pos);
  const leading =
    pos === 0
      ? ""
      : before.endsWith("\n\n")
        ? ""
        : before.endsWith("\n")
          ? "\n"
          : "\n\n";
  const insert = `${leading}${mediaEmbedToken(mediaId, width)}\n\n`;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
  });
  view.focus();
}

/**
 * Whether the document is blank -- nothing but whitespace, optionally
 * ignoring one range (the `/outline` trigger the contributor just typed,
 * which is about to be replaced).
 */
export function isBlankDoc(
  view: EditorView,
  ignore?: { from: number; to: number },
): boolean {
  const doc = view.state.doc.toString();
  const text = ignore ? doc.slice(0, ignore.from) + doc.slice(ignore.to) : doc;
  return text.trim().length === 0;
}

/**
 * Appends a `## heading` at the END of the document (not at the cursor:
 * the starter card sits outside the editor, and "write about this" means
 * "start a new section", never "split whatever I was in the middle of")
 * and leaves the cursor on the empty line below it, ready to type. A blank
 * line before, on the same reasoning as insertMediaToken above.
 */
export function insertSectionHeading(view: EditorView, heading: string) {
  const end = view.state.doc.length;
  const before = view.state.sliceDoc(Math.max(0, end - 2), end);
  const leading =
    end === 0 || isBlankDoc(view)
      ? ""
      : before.endsWith("\n\n")
        ? ""
        : before.endsWith("\n")
          ? "\n"
          : "\n\n";
  const from = isBlankDoc(view) ? 0 : end;
  const to = end;
  const insert = `${leading}## ${heading.trim()}\n\n`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    scrollIntoView: true,
  });
  view.focus();
}

/**
 * Replaces a BLANK document with the outline (already-rendered Markdown,
 * see lib/story/story-starters.ts#outlineMarkdown) and puts the cursor on
 * the line under the first heading. Returns false and changes nothing when
 * the document has any text: an outline dropped into a story someone has
 * started would either clobber it or land nine headings under their
 * paragraph, and neither is what "start from an outline" means.
 */
export function insertOutline(
  view: EditorView,
  outline: string,
  ignore?: { from: number; to: number },
): boolean {
  if (!isBlankDoc(view, ignore)) return false;
  const firstLineEnd = outline.indexOf("\n");
  const anchor = firstLineEnd === -1 ? outline.length : firstLineEnd + 1;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: outline },
    selection: { anchor },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}
