import type { Root, RootContent } from "mdast";

/**
 * Turns a run of story photos placed together -- two or more `![[mediaId]]`
 * embeds with no words between them, in one paragraph or in consecutive
 * photo-only paragraphs -- into ONE swipeable carousel node, the way
 * Instagram shows a set of photos. Rendered by ContentBlockRenderer as a
 * PhotoCarousel.
 *
 * A single photo is left exactly as written: authors can drag-resize an
 * inline photo to a chosen width (`![[id|480]]`), and a lone photo in a
 * carousel frame would throw that choice away. Photos with words between
 * them stay where the author put them, too -- only an uninterrupted run is
 * grouped.
 *
 * Must run after remarkMediaEmbed (which creates the `mediaEmbed` nodes)
 * and remarkSoftBreaks (which turns newlines into `break` nodes).
 */
type EmbedNode = { type: "mediaEmbed"; mediaId: string };

/** The photos in a paragraph that holds nothing else, or null. */
function photoOnlyParagraph(node: RootContent): string[] | null {
  if (node.type !== "paragraph") return null;
  const ids: string[] = [];
  for (const child of node.children as unknown as Array<{
    type: string;
    value?: string;
    mediaId?: string;
  }>) {
    if (child.type === "mediaEmbed") {
      ids.push((child as unknown as EmbedNode).mediaId);
    } else if (child.type === "break") {
      continue;
    } else if (child.type === "text" && !child.value?.trim()) {
      continue;
    } else {
      return null;
    }
  }
  return ids.length > 0 ? ids : null;
}

export function remarkMediaCarousel() {
  return (tree: Root) => {
    const out: RootContent[] = [];
    let run: { ids: string[]; nodes: RootContent[] } | null = null;

    const flush = () => {
      if (!run) return;
      if (run.ids.length >= 2) {
        out.push({
          type: "mediaCarousel",
          children: [],
          data: {
            hName: "div",
            hProperties: {
              "data-media-carousel": "true",
              "data-media-ids": run.ids.join(","),
            },
          },
        } as unknown as RootContent);
      } else {
        out.push(...run.nodes);
      }
      run = null;
    };

    for (const node of tree.children) {
      const ids = photoOnlyParagraph(node);
      if (ids) {
        run ??= { ids: [], nodes: [] };
        run.ids.push(...ids);
        run.nodes.push(node);
      } else {
        flush();
        out.push(node);
      }
    }
    flush();
    tree.children = out;
  };
}
