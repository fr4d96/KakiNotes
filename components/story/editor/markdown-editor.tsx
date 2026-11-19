"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { markdown as markdownLang } from "@codemirror/lang-markdown";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { autocompletion } from "@codemirror/autocomplete";

import { htmlPasteToMarkdown } from "@/lib/story/html-paste";
import {
  HeadingBlockIcon,
  LinkIcon,
  ListBlockIcon,
  QuoteBlockIcon,
} from "@/components/icons";
import {
  markdownImageCount,
  markdownWordCount,
  readingTimeMinutes,
} from "@/lib/story/markdown-text";
import { createMarkdownLiveExtensions } from "./markdown-live-decorations";
import {
  insertOutline,
  insertSectionHeading,
  insertTable,
  toggleLinePrefix,
  wrapSelection,
} from "./markdown-commands";
import { createSlashCommandSource, slashMenuTheme } from "./slash-commands";
import {
  EDITOR_SHELL_ATTR,
  toolbarScrollMargins,
  useToolbarStickyTop,
} from "./sticky-toolbar";

// The four transforms moved to ./markdown-commands.ts so slash-commands.ts
// could reuse them without importing this client component (a cycle). They
// are re-exported here so the original import path -- used by
// markdown-editor.test.ts -- keeps working.
export {
  wrapSelection,
  toggleLinePrefix,
  insertTable,
  insertMediaToken,
} from "./markdown-commands";

export type MarkdownEditorHandle = {
  replaceValue: (text: string) => void;
  /**
   * Appends a `## heading` section at the end of the document and puts
   * the cursor under it. Called by the starter card
   * (components/story/story-starters-card.tsx) via StoryContentEditorHandle.
   */
  insertHeading: (heading: string) => void;
  /**
   * Replaces a BLANK document with the `outline` prop; returns false and
   * does nothing when the document already has text. Same caller.
   */
  insertOutline: () => boolean;
};

export type MarkdownEditorProps = {
  initialValue: string;
  onChange: (text: string) => void;
  editable?: boolean;
  ariaLabel?: string;
  /**
   * Rendered Markdown for the "Outline" slash entry and the handle's
   * insertOutline -- see SlashCommandOptions.outline. Omitted in view-only
   * contexts and tests, which then have no such entry.
   */
  outline?: string;
};

// --- Paste ----------------------------------------------------------------

/**
 * Rich paste. CodeMirror's own paste handler reads `text/plain`, so pasting
 * a story out of Google Docs / Word / Notion used to lose every heading,
 * bold, italic, link and list -- the single biggest friction point found in
 * docs/editor-competitive-research.md, and one contributors hit immediately
 * because CLAUDE.md says their content already exists elsewhere.
 *
 * The conversion itself (and the Engineering Rule 7 reasoning behind it)
 * lives in lib/story/html-paste.ts. Nothing HTML-shaped survives it: the
 * only thing inserted is a Markdown string, identical in kind to typed text.
 *
 * Falls back to CodeMirror's normal plain-text paste whenever there is no
 * HTML flavour, the conversion fails, or a limit is hit -- never a partial
 * or truncated insert.
 */
function createPasteHandler(onNotice: (message: string | null) => void) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const clipboard = event.clipboardData;
      if (!clipboard) return false;

      const html = clipboard.getData("text/html");
      if (!html.trim()) return false;

      // "Select a phrase, paste a URL over it" is already handled by
      // @codemirror/lang-markdown's `pasteURLAsLink`, and it produces a
      // better result than converting the source page's anchor markup would.
      // Copying a link out of a web page puts BOTH text/plain and text/html
      // on the clipboard, so without this the feature would silently stop
      // working.
      const plain = clipboard.getData("text/plain").trim();
      if (!view.state.selection.main.empty && /^https?:\/\/\S+$/i.test(plain)) {
        return false;
      }

      const result = htmlPasteToMarkdown(html);
      if (!result.ok) return false;

      event.preventDefault();
      view.dispatch(view.state.replaceSelection(result.markdown));
      view.focus();
      onNotice(
        result.unsafeLinksRemoved > 0
          ? `Pasted. ${result.unsafeLinksRemoved} link${
              result.unsafeLinksRemoved === 1 ? "" : "s"
            } couldn't be kept — only web links (http/https) are allowed. The words are still there.`
          : null,
      );
      return true;
    },
  });
}

// --- Toolbar ---------------------------------------------------------------

function ToolbarButton({
  label,
  title,
  onClick,
  disabled,
}: {
  label: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="press flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full px-2 text-[15px] text-foreground/80 transition-colors hover:bg-surface hover:text-foreground hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent active:bg-surface disabled:opacity-40"
    >
      {label}
    </button>
  );
}

/**
 * One family of commands (text style, blocks, inserts) on a soft recessed
 * pill. Grouping by shape instead of hairline dividers is what keeps ten
 * buttons readable at a glance; inside a group a button lifts to the surface
 * colour on hover/press.
 */
function ToolGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-surface-muted/70 p-0.5">
      {children}
    </div>
  );
}

const MARKDOWN_GUIDE_URL = "https://www.markdownguide.org/cheat-sheet/";

function MarkdownGuideLink() {
  const t = useTranslations("editor.toolbar");
  return (
    <a
      href={MARKDOWN_GUIDE_URL}
      target="_blank"
      rel="noopener noreferrer"
      title={t("syntaxGuide")}
      aria-label={t("syntaxGuide")}
      className="press flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      <HelpIcon className="h-5 w-5" />
    </a>
  );
}

/**
 * Sticky again (2026-11-19), directly under the stuck page chrome.
 *
 * History: it was once `sticky top-[76px]`, which hid it under the story
 * wizard's own sticky step bar once that arrived at the same offset. The
 * fix then was a fixed-height editor that scrolled its own text with the
 * toolbar as its first row -- but on a phone that box plus the header and
 * step bar (~280px with the safe area) is taller than the screen, so the
 * PAGE still scrolled and carried the toolbar away, and on iOS a scroller
 * inside a scrolling page hands the swipe to the page as soon as it hits
 * an end. Now the editor grows with its text (one page-level scroll, which
 * is also what iOS keeps the caret visible against), and `top` is
 * MEASURED from the bars marked STICKY_CHROME_ATTR (./sticky-toolbar.ts)
 * rather than hard-coded, which is what broke the first sticky version.
 * z-20 keeps it under the step bar (z-30) and site header (z-40).
 *
 * Layout (2026-11-18): three pill groups -- text style (H, B, I, S),
 * blocks (quote and the three lists), inserts (link, table) -- with 36px
 * round buttons and one consistent line-icon set, replacing 32px square
 * buttons with mixed emoji glyphs and hairline dividers.
 */
function EditorToolbar({
  getView,
  stickyTop,
}: {
  getView: () => EditorView | null;
  stickyTop: number | undefined;
}) {
  const t = useTranslations("editor.toolbar");
  const run = (fn: (view: EditorView) => void) => () => {
    const view = getView();
    if (view) fn(view);
  };
  const icon = "h-5 w-5";

  return (
    <div
      data-testid="editor-toolbar"
      // Until the first measurement lands, stick under the site header alone
      // (its known 76px + safe area): at worst briefly behind the step bar,
      // never over the text.
      style={stickyTop === undefined ? undefined : { top: stickyTop }}
      className="sticky top-[calc(76px+env(safe-area-inset-top))] z-20 flex shrink-0 items-center gap-1.5 rounded-t-md border-b border-border-subtle bg-surface py-2 pr-1.5 pl-2"
    >
      {/* Scrolls sideways rather than wrapping. At 375px the groups just
          overflow, and wrapping cost stacked rows of chrome above the
          writing area on a phone -- the opposite of Engineering Rule 18.
          The right edge fades so the overflow reads as "more this way".
          Keyboard users are unaffected: tabbing to a button scrolls it into
          view automatically. */}
      <div
        role="toolbar"
        aria-label={t("formattingLabel")}
        className="nf-editor-toolbar flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-4"
      >
        <ToolGroup>
          <ToolbarButton
            title={t("heading")}
            label={<HeadingBlockIcon className={icon} />}
            onClick={run((v) => toggleLinePrefix(v, "## "))}
          />
          <ToolbarButton
            title={t("bold")}
            label={<span className="font-extrabold">B</span>}
            onClick={run((v) => wrapSelection(v, "**", "**", "bold text"))}
          />
          <ToolbarButton
            title={t("italic")}
            label={<span className="font-serif text-base italic">I</span>}
            onClick={run((v) => wrapSelection(v, "*", "*", "italic text"))}
          />
          <ToolbarButton
            title={t("strikethrough")}
            label={<span className="font-semibold line-through">S</span>}
            onClick={run((v) => wrapSelection(v, "~~", "~~", "struck text"))}
          />
        </ToolGroup>
        <ToolGroup>
          <ToolbarButton
            title={t("quote")}
            label={<QuoteBlockIcon className={icon} />}
            onClick={run((v) => toggleLinePrefix(v, "> "))}
          />
          <ToolbarButton
            title={t("bulletedList")}
            label={<ListBlockIcon className={icon} />}
            onClick={run((v) => toggleLinePrefix(v, "- "))}
          />
          <ToolbarButton
            title={t("numberedList")}
            label={<NumberedListIcon className={icon} />}
            onClick={run((v) => toggleLinePrefix(v, "1. "))}
          />
          <ToolbarButton
            title={t("checklist")}
            label={<ChecklistIcon className={icon} />}
            onClick={run((v) => toggleLinePrefix(v, "- [ ] "))}
          />
        </ToolGroup>
        <ToolGroup>
          <ToolbarButton
            title={t("link")}
            label={<LinkIcon className={icon} />}
            onClick={run((v) =>
              wrapSelection(v, "[", "](https://)", "link text"),
            )}
          />
          <ToolbarButton
            title={t("table")}
            label={<TableIcon className={icon} />}
            onClick={run((v) => insertTable(v))}
          />
        </ToolGroup>
      </div>
      <div className="shrink-0">
        <MarkdownGuideLink />
      </div>
    </div>
  );
}

// Toolbar-only glyphs, drawn on components/icons.tsx's grid (24x24, 1.6
// stroke, round caps) so they sit with the shared Heading/Quote/List/Link
// icons used beside them.
type GlyphProps = { className?: string };
const glyph = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function NumberedListIcon({ className }: GlyphProps) {
  return (
    <svg {...glyph} className={className}>
      <path d="M10 6.5h9.5M10 12h9.5M10 17.5h9.5" />
      <path d="M4.5 5.5 5.5 5v4" />
      <path d="M4.25 11.25c.3-.5.8-.75 1.3-.6.6.2.75.9.3 1.4L4.25 13.75H6.1" />
      <path d="M4.3 16.2h1.6l-.9 1.1c.7 0 1.1.4 1.1.9s-.5.9-1.1.9c-.4 0-.7-.15-.9-.4" />
    </svg>
  );
}

function ChecklistIcon({ className }: GlyphProps) {
  return (
    <svg {...glyph} className={className}>
      <rect x="3.75" y="4.75" width="5" height="5" rx="1.2" />
      <path d="m4.9 7.3 1 1 1.9-2" />
      <rect x="3.75" y="14.25" width="5" height="5" rx="1.2" />
      <path d="M12 7.25h8M12 16.75h8" />
    </svg>
  );
}

function TableIcon({ className }: GlyphProps) {
  return (
    <svg {...glyph} className={className}>
      <rect x="3.75" y="5" width="16.5" height="14" rx="2" />
      <path d="M3.75 9.75h16.5M3.75 14.25h16.5M12 9.75V19" />
    </svg>
  );
}

function HelpIcon({ className }: GlyphProps) {
  return (
    <svg {...glyph} className={className}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="M9.75 9.6a2.3 2.3 0 0 1 4.45.6c0 1.55-2.2 1.9-2.2 3.3" />
      <circle cx="12" cy="16.6" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

// --- Editor ------------------------------------------------------------

export const MarkdownEditor = React.forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  { initialValue, onChange, editable = true, ariaLabel, outline },
  ref,
) {
  const t = useTranslations("editor.toolbar");
  const tFields = useTranslations("editor.fields");
  const tSlash = useTranslations("editor.slash");
  // The slash menu's entries, resolved once here and handed to the
  // CodeMirror source, which is plain module code and cannot translate.
  const labels = React.useMemo(
    () =>
      Object.fromEntries(
        (
          [
            "heading",
            "subheading",
            "list",
            "numbered",
            "todo",
            "quote",
            "link",
            "table",
            "outline",
          ] as const
        ).map((key) => [
          key,
          { label: tSlash(key), detail: tSlash(`${key}Detail`) },
        ]),
      ),
    [tSlash],
  );
  // Uncontrolled, like the Plate editor this replaces: `value` is only ever
  // read from this lazy initializer, never resynced from a changing prop --
  // resyncing on every parent re-render would fight the user's cursor
  // position (mutation queue debouncing means the parent re-renders often).
  const [initial] = React.useState(initialValue);
  const cmRef = React.useRef<ReactCodeMirrorRef>(null);
  const getView = React.useCallback(() => cmRef.current?.view ?? null, []);
  const stickyTop = useToolbarStickyTop(editable);

  // Mirrors the document purely so the word count below can be derived from
  // it. Safe with the uncontrolled `value` above: @uiw/react-codemirror only
  // rewrites the document when the `value` PROP changes, and `initial` never
  // does -- a re-render alone (which already happens on every keystroke via
  // the parent's own setContent) does not touch the document.
  const [text, setText] = React.useState(initialValue);
  const [pasteNotice, setPasteNotice] = React.useState<string | null>(null);

  const handleChange = React.useCallback(
    (value: string) => {
      setText(value);
      // Clears a stale paste notice on the next edit. The paste's own
      // dispatch runs this synchronously BEFORE createPasteHandler sets the
      // notice, so a just-pasted message survives its own paste and is
      // dismissed by whatever the contributor types next.
      setPasteNotice(null);
      onChange(value);
    },
    [onChange],
  );

  React.useImperativeHandle(
    ref,
    () => ({
      replaceValue: (text: string) => {
        const view = getView();
        if (!view) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
        });
      },
      insertHeading: (heading: string) => {
        const view = getView();
        if (view) insertSectionHeading(view, heading);
      },
      insertOutline: () => {
        const view = getView();
        if (!view || !outline) return false;
        return insertOutline(view, outline);
      },
    }),
    [getView, outline],
  );

  // Split in two on purpose. Everything that must never be rebuilt lives in
  // the `[]`-memoized half below: the language (rebuilding it would throw
  // away the parse state) and createMarkdownLiveExtensions() (whose signed
  // image-URL cache is per editor instance -- a new one every render would
  // re-mint a URL for every embedded image on every keystroke). Only the
  // slash-command source depends on `outline`/`labels`, so even a caller
  // passing fresh values each render can at worst reconfigure that one
  // facet; CodeMirror keeps the plugin instances behind the extension
  // values that did not change.
  const stableExtensions = React.useMemo(
    () => [
      markdownLang(),
      EditorView.lineWrapping,
      // When CodeMirror scrolls the caret into view (typing on the last
      // visible line, arrowing up, a toolbar command), it keeps it clear of
      // the sticky toolbar rather than parking it underneath. Measured from
      // the DOM at scroll time, so it follows the sticky top unaided.
      toolbarScrollMargins,
      createPasteHandler(setPasteNotice),
      // Ctrl/Cmd+B, +I and +K. Prec.high so these win over anything the
      // default keymap might bind later. Every one of them is also a
      // toolbar button, and every toolbar button is a real <button> -- so
      // formatting is reachable by mouse, by keyboard shortcut, and by
      // tabbing to the toolbar (Engineering Rule 19).
      Prec.high(
        keymap.of([
          {
            key: "Mod-b",
            run: (view) => {
              wrapSelection(view, "**", "**", "bold text");
              return true;
            },
          },
          {
            key: "Mod-i",
            run: (view) => {
              wrapSelection(view, "*", "*", "italic text");
              return true;
            },
          },
          {
            key: "Mod-k",
            run: (view) => {
              wrapSelection(view, "[", "](https://)", "link text");
              return true;
            },
          },
        ]),
      ),
      // Renames the completion popup's own accessible name, which CodeMirror
      // otherwise labels "Completions".
      EditorState.phrases.of({ Completions: t("commandsLabel") }),
      slashMenuTheme,
      ...createMarkdownLiveExtensions(),
    ],
    // `t` is stable per locale; listing it means switching language rebuilds
    // the extensions with the new popup label rather than keeping the old one.
    [t],
  );

  const extensions = React.useMemo(
    () => [
      ...stableExtensions,
      autocompletion({
        override: [createSlashCommandSource({ outline, labels })],
        // No type icons: this is a prose menu, not a code completion list.
        icons: false,
      }),
    ],
    [stableExtensions, outline, labels],
  );

  const words = markdownWordCount(text);
  const minutes = readingTimeMinutes(words, markdownImageCount(text));

  return (
    /* Grows with the story. The toolbar sticks under the page's stuck
       chrome instead of the editor owning a fixed-height scroll box -- see
       EditorToolbar for why the box failed on a phone. The 20rem minimum
       keeps a blank draft looking like a place to write.

       Read-only renders (editable=false) keep their natural height too, with
       a smaller floor and no toolbar. */
    <div
      className={editable ? "flex flex-col" : undefined}
      {...(editable ? { [EDITOR_SHELL_ATTR]: "" } : {})}
    >
      {editable && <EditorToolbar getView={getView} stickyTop={stickyTop} />}
      <div
        aria-label={ariaLabel ?? tFields("storyContent")}
        role="textbox"
        aria-multiline="true"
      >
        <CodeMirror
          ref={cmRef}
          value={initial}
          onChange={handleChange}
          editable={editable}
          extensions={extensions}
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            // Configured explicitly above instead. Two `autocompletion()`
            // calls would mean two competing configs for one facet.
            autocompletion: false,
          }}
          theme="none"
          placeholder={t("placeholder")}
          className={
            editable
              ? "px-1 py-2 text-base [&_.cm-editor]:min-h-80"
              : "min-h-40 px-1 py-2 text-base [&_.cm-editor]:min-h-40 [&_.cm-scroller]:overflow-auto"
          }
        />
      </div>
      {editable && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border-subtle px-2 py-1.5 text-xs text-muted-foreground">
          {/* Deliberately NOT an aria-live region: it changes on every
              keystroke, and a counter that announces itself hundreds of
              times while you write is worse than one you can read on
              demand. */}
          <p>
            {t("wordCount", { count: words })}
            {minutes > 0 &&
              `${t("statSeparator")}${t("readingTime", { minutes })}${
                words < 150 ? `${t("statSeparator")}${t("aimForWords")}` : ""
              }`}
          </p>
          {pasteNotice && (
            <p role="status" className="text-amber-700 dark:text-amber-400">
              {pasteNotice}
            </p>
          )}
        </div>
      )}
    </div>
  );
});
