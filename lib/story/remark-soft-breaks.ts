import { visit, SKIP } from "unist-util-visit";
import type { Root, Text, Parent } from "mdast";

/**
 * Renders a single newline as a line break, the way the editor shows it.
 *
 * CommonMark treats consecutive non-blank lines as ONE paragraph: a soft
 * break collapses to a space. CodeMirror does not -- every `\n` is a new
 * visible line there. So a contributor who pressed Enter once between
 * sentences saw them stacked while they wrote, then found them glued into a
 * single wrapped block on the review page and on the published story. That
 * mismatch is what this fixes: what the editor shows is what gets rendered.
 *
 * Doing it in the renderer rather than rewriting the stored Markdown (e.g.
 * doubling newlines on save) keeps content_json exactly as the contributor
 * typed it -- already-saved revisions are immutable once they leave draft
 * (Engineering Rule 11), so a save-time fix could never reach them anyway.
 *
 * Only `text` nodes are visited, so newlines inside fenced code blocks and
 * inline code are untouched (those carry their content in `value`, with no
 * text children) -- code keeps its own line semantics.
 */
export function remarkSoftBreaks() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index, parent: Parent | undefined) => {
      if (!parent || index === undefined || !node.value.includes("\n")) return;

      const segments = node.value.split("\n");
      const replacement: Parent["children"] = [];
      segments.forEach((segment, i) => {
        if (i > 0) replacement.push({ type: "break" });
        // A blank segment would be an empty text node; a `break` alone
        // already carries the line change.
        if (segment !== "") replacement.push({ type: "text", value: segment });
      });

      parent.children.splice(index, 1, ...replacement);
      // Resume past everything just inserted -- the new text nodes have no
      // newlines left in them, so revisiting them would only waste a pass.
      return [SKIP, index + replacement.length];
    });
  };
}
