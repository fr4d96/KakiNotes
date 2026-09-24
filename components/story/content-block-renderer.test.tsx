import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContentBlockRenderer } from "@/components/story/content-block-renderer";
import { markdownToStoryContent } from "@/lib/validation/story";

// Regression coverage: this renderer is what actually shows on the preview
// and public story pages -- it parses the single Markdown content_json
// block via react-markdown/remark-gfm, never dangerouslySetInnerHTML.
describe("ContentBlockRenderer", () => {
  it("renders a GFM table, including an empty cell", () => {
    const blocks = markdownToStoryContent(
      ["| Item | Price |", "| --- | --- |", "| **Coffee** |  |"].join("\n"),
    );

    render(<ContentBlockRenderer blocks={blocks} />);

    const table = screen.getByRole("table");
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Item")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Coffee").tagName).toBe("STRONG");
    expect(table.querySelectorAll("td")).toHaveLength(2);
  });

  it("renders an image embed token resolved against the media map, with decorative/alt handling", () => {
    const blocks = markdownToStoryContent(
      [
        "![[11111111-1111-4111-8111-111111111111]]",
        "",
        "![[22222222-2222-4222-8222-222222222222]]",
      ].join("\n"),
    );

    render(
      <ContentBlockRenderer
        blocks={blocks}
        media={{
          "11111111-1111-4111-8111-111111111111": {
            url: "https://example.com/a.jpg",
            altText: "A sunset",
            decorative: false,
          },
          "22222222-2222-4222-8222-222222222222": {
            url: "https://example.com/b.jpg",
            altText: "ignored for decorative images",
            decorative: true,
          },
        }}
      />,
    );

    const images = screen.getAllByRole("img", { hidden: true });
    expect(images).toHaveLength(1); // the decorative one has alt="", so it isn't exposed as role=img
    expect(screen.getByAltText("A sunset")).toBeInTheDocument();
  });

  it("applies a stored embed width as an explicit style, capped to the container", () => {
    const blocks = markdownToStoryContent(
      "![[11111111-1111-4111-8111-111111111111|480]]",
    );

    render(
      <ContentBlockRenderer
        blocks={blocks}
        media={{
          "11111111-1111-4111-8111-111111111111": {
            url: "https://example.com/a.jpg",
            altText: "A photo",
            decorative: false,
          },
        }}
      />,
    );

    // The stored width sizes the photo's wrapper (the LightboxPhoto trigger,
    // which is the element that occupies the layout slot); the <img> fills it.
    const img = screen.getByRole("img");
    expect(img.parentElement).toHaveStyle({ width: "480px", maxWidth: "100%" });
  });

  it("renders nothing for an embed whose mediaId isn't in the media map (e.g. detached after save)", () => {
    const blocks = markdownToStoryContent(
      ["![[33333333-3333-4333-8333-333333333333]]", "", "still here"].join(
        "\n",
      ),
    );

    render(<ContentBlockRenderer blocks={blocks} media={{}} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("still here")).toBeInTheDocument();
  });

  it('renders a spinner in place of an embed whose entry is the literal "loading" state', () => {
    const blocks = markdownToStoryContent(
      "![[44444444-4444-4444-8444-444444444444]]",
    );

    render(
      <ContentBlockRenderer
        blocks={blocks}
        media={{ "44444444-4444-4444-8444-444444444444": "loading" }}
      />,
    );

    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders bold, italic, and strikethrough as real tags", () => {
    const blocks = markdownToStoryContent("**bold** *italic* ~~struck~~");

    render(<ContentBlockRenderer blocks={blocks} />);

    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
    expect(screen.getByText("struck").tagName).toBe("DEL");
  });

  it("renders headings, blockquotes, and lists", () => {
    const blocks = markdownToStoryContent(
      ["## Heading", "", "> A quote", "", "- one", "- two"].join("\n"),
    );

    render(<ContentBlockRenderer blocks={blocks} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Heading" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A quote").closest("blockquote"),
    ).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders a link with the stored href", () => {
    const blocks = markdownToStoryContent("[click me](https://example.com)");

    render(<ContentBlockRenderer blocks={blocks} />);

    const link = screen.getByRole("link", { name: "click me" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  // Regression coverage for remark-soft-breaks: CodeMirror shows every `\n`
  // as its own line, but CommonMark collapses a single newline inside a
  // paragraph into a space. Without the plugin, "Line one\nLine two" used to
  // render as one glued-together line with no <br>.
  it("renders a single newline inside a paragraph as a <br>, not a collapsed space", () => {
    const blocks = markdownToStoryContent("Line one\nLine two");

    render(<ContentBlockRenderer blocks={blocks} />);

    const paragraph = screen.getByText((_, node) => {
      if (!node || node.tagName !== "P") return false;
      return node.textContent === "Line one\nLine two";
    });
    expect(paragraph.querySelector("br")).toBeInTheDocument();
    expect(paragraph.textContent).toContain("Line one");
    expect(paragraph.textContent).toContain("Line two");
  });

  it("still renders a blank line between paragraphs as two separate <p> elements", () => {
    const blocks = markdownToStoryContent("Paragraph one\n\nParagraph two");

    render(<ContentBlockRenderer blocks={blocks} />);

    const paraOne = screen.getByText("Paragraph one").closest("p");
    const paraTwo = screen.getByText("Paragraph two").closest("p");
    expect(paraOne).toBeInTheDocument();
    expect(paraTwo).toBeInTheDocument();
    expect(paraOne).not.toBe(paraTwo);
    expect(paraOne?.querySelector("br")).not.toBeInTheDocument();
    expect(paraTwo?.querySelector("br")).not.toBeInTheDocument();
  });

  it("does not convert newlines inside a fenced code block to <br>", () => {
    const blocks = markdownToStoryContent(
      ["```", "line one", "line two", "```"].join("\n"),
    );

    render(<ContentBlockRenderer blocks={blocks} />);

    const code = document.querySelector("pre code");
    expect(code).toBeInTheDocument();
    expect(code?.querySelector("br")).not.toBeInTheDocument();
    expect(code?.textContent).toBe("line one\nline two\n");
  });

  it("leaves list items unaffected -- a two-item list stays two <li>, no stray <br>", () => {
    const blocks = markdownToStoryContent(["- a", "- b"].join("\n"));

    render(<ContentBlockRenderer blocks={blocks} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].querySelector("br")).not.toBeInTheDocument();
    expect(items[1].querySelector("br")).not.toBeInTheDocument();
  });
});
