import { describe, expect, it } from "vitest";
import {
  AFFIRMATION_AUTHOR_NAME_MAX,
  AFFIRMATION_LABEL_MAX,
  AFFIRMATION_NOTE_MAX,
  AFFIRMATION_TOKEN_PATTERN,
  affirmationTokenSchema,
  createAffirmationLinkSchema,
  deleteAffirmationNoteSchema,
  renameAffirmationLinkSchema,
  submitAffirmationNoteSchema,
  toggleAffirmationLinkSchema,
} from "./affirmation";

const token = "0123456789abcdef".repeat(4);
const uuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("affirmationTokenSchema", () => {
  it("accepts what create_affirmation_link() generates (64 lowercase hex)", () => {
    expect(affirmationTokenSchema.safeParse(token).success).toBe(true);
    expect(AFFIRMATION_TOKEN_PATTERN.test(token)).toBe(true);
  });

  it.each([
    ["too short", "abc123"],
    ["too long", `${token}0`],
    ["uppercase", token.toUpperCase()],
    ["non-hex", "z".repeat(64)],
    ["hyphenated uuid", `${uuid}-${uuid}`],
    ["empty", ""],
  ])("rejects a token that is %s", (_name, value) => {
    const result = affirmationTokenSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("affirmation.tokenInvalid");
    }
  });
});

describe("submitAffirmationNoteSchema", () => {
  it("trims the note and name", () => {
    const parsed = submitAffirmationNoteSchema.parse({
      token,
      body: "  You've got this.  ",
      authorName: "  Mei  ",
    });
    expect(parsed).toEqual({
      token,
      body: "You've got this.",
      authorName: "Mei",
    });
  });

  it("keeps line breaks inside the note", () => {
    const parsed = submitAffirmationNoteSchema.parse({
      token,
      body: "Line one\n\nLine two",
    });
    expect(parsed.body).toBe("Line one\n\nLine two");
  });

  it("treats a blank name as no name", () => {
    expect(
      submitAffirmationNoteSchema.parse({
        token,
        body: "Hi",
        authorName: "   ",
      }).authorName,
    ).toBeUndefined();
    expect(
      submitAffirmationNoteSchema.parse({ token, body: "Hi" }).authorName,
    ).toBeUndefined();
  });

  it("rejects an empty or whitespace-only note", () => {
    for (const body of ["", "   \n\t "]) {
      const result = submitAffirmationNoteSchema.safeParse({ token, body });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("affirmation.bodyRequired");
      }
    }
  });

  it("allows exactly the maximum and rejects one more", () => {
    expect(
      submitAffirmationNoteSchema.safeParse({
        token,
        body: "a".repeat(AFFIRMATION_NOTE_MAX),
      }).success,
    ).toBe(true);
    const over = submitAffirmationNoteSchema.safeParse({
      token,
      body: "a".repeat(AFFIRMATION_NOTE_MAX + 1),
    });
    expect(over.success).toBe(false);
    if (!over.success) {
      expect(over.error.issues[0]).toMatchObject({
        message: "affirmation.bodyTooLong",
        maximum: AFFIRMATION_NOTE_MAX,
      });
    }
  });

  it("rejects an over-long name", () => {
    const result = submitAffirmationNoteSchema.safeParse({
      token,
      body: "Hi",
      authorName: "n".repeat(AFFIRMATION_AUTHOR_NAME_MAX + 1),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "affirmation.authorNameTooLong",
      );
    }
  });

  it("does not interpret markup: HTML passes through as plain characters", () => {
    // Nothing strips or allows HTML because nothing renders it as HTML; the
    // guarantee is in how it is displayed (React text), not in this schema.
    const parsed = submitAffirmationNoteSchema.parse({
      token,
      body: "<b>hi</b>",
    });
    expect(parsed.body).toBe("<b>hi</b>");
  });

  it("rejects a bad token", () => {
    expect(
      submitAffirmationNoteSchema.safeParse({ token: "nope", body: "Hi" })
        .success,
    ).toBe(false);
  });
});

describe("link schemas", () => {
  it("trims a label and turns blank into undefined", () => {
    expect(createAffirmationLinkSchema.parse({ label: "  Family  " })).toEqual({
      label: "Family",
    });
    expect(createAffirmationLinkSchema.parse({ label: "   " }).label).toBe(
      undefined,
    );
    expect(createAffirmationLinkSchema.parse({}).label).toBe(undefined);
  });

  it("rejects a label over the maximum", () => {
    const result = createAffirmationLinkSchema.safeParse({
      label: "l".repeat(AFFIRMATION_LABEL_MAX + 1),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("affirmation.labelTooLong");
    }
  });

  it("requires a uuid for the link and note ids", () => {
    expect(
      renameAffirmationLinkSchema.safeParse({ linkId: "x", label: "a" })
        .success,
    ).toBe(false);
    expect(
      renameAffirmationLinkSchema.safeParse({ linkId: uuid, label: "a" })
        .success,
    ).toBe(true);
    expect(
      toggleAffirmationLinkSchema.safeParse({ linkId: uuid, isActive: "yes" })
        .success,
    ).toBe(false);
    expect(
      deleteAffirmationNoteSchema.safeParse({ noteId: "../../etc" }).success,
    ).toBe(false);
  });
});
