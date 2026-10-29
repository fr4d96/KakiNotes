import { visit } from "unist-util-visit";
import type { Heading, Root, PhrasingContent } from "mdast";

/**
 * Anchor naming + the renderer's remark plugin. Kept free of the Markdown
 * PARSER (see headings.ts) because ContentBlockRenderer ships to the client
 * and already has react-markdown's own parse.
 */

export const SECTION_ID_PREFIX = "section-";

export function sectionDomId(anchor: string): string {
  return `${SECTION_ID_PREFIX}${anchor}`;
}

function phrasingText(nodes: PhrasingContent[]): string {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text" || node.type === "inlineCode") out += node.value;
    else if (node.type === "break") out += " ";
    else if ("children" in node) out += phrasingText(node.children);
  }
  return out;
}

export function headingText(heading: Heading): string {
  return phrasingText(heading.children).replace(/\s+/g, " ").trim();
}

export function slugifyHeading(text: string): string {
  const slug = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug === "" ? "section" : slug;
}

/** Hands out unique anchors in document order. */
export function createAnchorAllocator() {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base = slugifyHeading(text);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  };
}

/** unified plugin: gives every heading its sectionDomId() as `id`. */
export function remarkHeadingIds() {
  return (tree: Root) => {
    const allocate = createAnchorAllocator();
    visit(tree, "heading", (node: Heading) => {
      const anchor = allocate(headingText(node));
      node.data = {
        ...node.data,
        hProperties: {
          ...(node.data?.hProperties ?? {}),
          id: sectionDomId(anchor),
        },
      };
    });
  };
}
