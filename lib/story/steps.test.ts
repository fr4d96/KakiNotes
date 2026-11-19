import { describe, expect, it } from "vitest";
import {
  missingStoryRequirements,
  REQUIRED_STORY_STEPS,
  EDITING_STORY_STEPS,
  STORY_STEPS,
} from "./steps";

const complete = {
  title: "A season on the vines",
  hasContent: true,
  tagCount: 1,
};

describe("missingStoryRequirements", () => {
  it("still demands a tag when the story is going public", () => {
    // The default, and unchanged by private stories: a public story has to
    // be findable in browse and search.
    expect(
      missingStoryRequirements({
        ...complete,
        tagCount: 0,
        destination: "public",
      }).map((r) => r.labelKey),
    ).toEqual(["tag"]);
  });

  it("drops the tag requirement for a private story", () => {
    // Tags exist so a story can be FOUND publicly. Nobody will ever search
    // for a story only its author can see.
    expect(
      missingStoryRequirements({
        ...complete,
        tagCount: 0,
        destination: "private",
      }),
    ).toEqual([]);
  });

  it("still demands a title and real content for a private story", () => {
    // The floor is the same either way: this is what makes the thing a
    // story rather than an empty shell, and keep_revision_private()
    // enforces the content half itself (WHV03) rather than trusting this.
    expect(
      missingStoryRequirements({
        ...complete,
        title: "  ",
        hasContent: false,
        destination: "private",
      }).map((r) => r.labelKey),
    ).toEqual(["title", "content"]);
  });

  it("treats an unspecified destination as public", () => {
    // Every caller that predates private stories passes no destination and
    // must keep the list it always had.
    expect(missingStoryRequirements({ ...complete, tagCount: 0 })).toEqual(
      missingStoryRequirements({
        ...complete,
        tagCount: 0,
        destination: "public",
      }),
    );
  });

  it("returns nothing for a story that is ready", () => {
    expect(missingStoryRequirements(complete)).toEqual([]);
  });

  it("names a missing title and points at the Title step", () => {
    expect(missingStoryRequirements({ ...complete, title: "" })).toEqual([
      { labelKey: "title", step: "title" },
    ]);
  });

  // A title of nothing but spaces is not a title -- the server's own
  // createDraftSchema/revisionInputSchema trim before checking, so the UI
  // gate has to agree or it would wave through something the save rejects.
  it("treats a whitespace-only title as missing", () => {
    expect(missingStoryRequirements({ ...complete, title: "   " })).toEqual([
      { labelKey: "title", step: "title" },
    ]);
  });

  it("names missing content and points at the Your story step", () => {
    expect(
      missingStoryRequirements({ ...complete, hasContent: false }),
    ).toEqual([{ labelKey: "content", step: "story" }]);
  });

  // Locations are optional for every story (2026-11-19): plenty of stories
  // are not about one place. Only the tag half of "Places & tags" gates.
  it("never requires a location", () => {
    expect(missingStoryRequirements(complete)).toEqual([]);
    expect(missingStoryRequirements({ ...complete, tagCount: 0 })).toEqual([
      { labelKey: "tag", step: "places" },
    ]);
  });

  it("lists every unmet requirement, in step order", () => {
    const missing = missingStoryRequirements({
      title: "",
      hasContent: false,
      tagCount: 0,
    });
    expect(missing.map((m) => m.labelKey)).toEqual(["title", "content", "tag"]);
    // The preview page links its notice at missing[0].step, so the order
    // has to match the order the labels are read out in.
    expect(missing[0].step).toBe("title");
  });

  it("only ever points at steps that exist and are editable", () => {
    const missing = missingStoryRequirements({
      title: "",
      hasContent: false,
      tagCount: 0,
    });
    // Set<string>, not Set<StoryStepId>: EDITING_STORY_STEPS is narrowed
    // enough that TypeScript already knows "review" is not in it and
    // rejects the comparison outright. The runtime assertion still earns
    // its place -- it is the list, not the type, that a future edit would
    // get wrong.
    const editable = new Set<string>(EDITING_STORY_STEPS.map((s) => s.id));
    for (const requirement of missing) {
      expect(editable.has(requirement.step)).toBe(true);
    }
  });
});

describe("step definitions", () => {
  it("marks every required step as one the editor can open", () => {
    const editable = new Set<string>(EDITING_STORY_STEPS.map((s) => s.id));
    for (const id of REQUIRED_STORY_STEPS) {
      expect(editable.has(id)).toBe(true);
    }
  });

  it("keeps review as the one step that is not an editor pane", () => {
    expect(STORY_STEPS.length - EDITING_STORY_STEPS.length).toBe(1);
    expect(EDITING_STORY_STEPS.map((s) => s.id as string)).not.toContain(
      "review",
    );
    expect(STORY_STEPS[STORY_STEPS.length - 1].id).toBe("review");
  });
});
