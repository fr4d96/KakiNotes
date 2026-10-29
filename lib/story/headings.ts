import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import type { Heading } from "mdast";
import { createAnchorAllocator, headingText } from "@/lib/story/heading-ids";

/**
 * Stable anchors for the headings inside a story's Markdown.
 *
 * The journey map links a stop to "a part of the story". The contributor
 * picks a heading in the editor; the renderer puts the matching DOM id on
 * that heading (remarkHeadingIds below, used by ContentBlockRenderer). Both
 * sides use the SAME function over the SAME parse, so an anchor chosen in
 * the editor lands on the right heading on the published page.
 *
 * An anchor is the lower-cased heading text with spaces turned into hyphens,
 * keeping letters and digits from any script (so Chinese headings work). A
 * repeated heading gets "-2", "-3"... in document order. The DOM id is
 * prefixed (sectionDomId) so it can never collide with other ids on the page.
 */

export type StoryHeading = { anchor: string; text: string; depth: number };

/** Headings h2-h6 (h1 is the story title) with their anchors, in order. */
export function extractHeadings(markdown: string): StoryHeading[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown);
  const allocate = createAnchorAllocator();
  const headings: StoryHeading[] = [];
  visit(tree, "heading", (node: Heading) => {
    const text = headingText(node);
    // An h1 is rendered as an h2 (content-block-renderer); count it so the
    // allocator stays in step with the renderer's own walk.
    headings.push({
      anchor: allocate(text),
      text,
      depth: Math.max(2, node.depth),
    });
  });
  return headings;
}
