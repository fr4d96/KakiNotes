import { describe, expect, it } from "vitest";
import {
  BUG_REPORT_MAX,
  sanitizeBugReportPath,
  submitBugReportSchema,
  updateBugReportStatusSchema,
} from "./bug-report";

describe("sanitizeBugReportPath", () => {
  it("keeps a plain pathname", () => {
    expect(sanitizeBugReportPath("/stories/abc")).toBe("/stories/abc");
  });

  it("drops the query string and hash, where secrets ride", () => {
    expect(sanitizeBugReportPath("/reset-password?code=secret#x")).toBe(
      "/reset-password",
    );
  });

  it("redacts an affirmation link's capability token", () => {
    expect(sanitizeBugReportPath(`/notes/${"a".repeat(64)}`)).toBe(
      "/notes/[token]",
    );
  });

  it("drops anything that is not a same-site absolute path", () => {
    expect(sanitizeBugReportPath("https://evil.example/x")).toBeUndefined();
    expect(sanitizeBugReportPath("//evil.example/x")).toBeUndefined();
    expect(sanitizeBugReportPath("stories")).toBeUndefined();
    expect(sanitizeBugReportPath(42)).toBeUndefined();
    expect(sanitizeBugReportPath(null)).toBeUndefined();
    expect(sanitizeBugReportPath(`/${"x".repeat(600)}`)).toBeUndefined();
  });
});

describe("submitBugReportSchema", () => {
  it("trims the description and sanitizes the path", () => {
    const parsed = submitBugReportSchema.parse({
      description: "  The save button does nothing.  ",
      pagePath: "/my-stories?x=1",
    });
    expect(parsed).toEqual({
      description: "The save button does nothing.",
      pagePath: "/my-stories",
    });
  });

  it("requires a description of at least 10 characters", () => {
    const empty = submitBugReportSchema.safeParse({ description: "   " });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0]?.message).toBe(
      "bugReport.descriptionRequired",
    );

    const short = submitBugReportSchema.safeParse({ description: "broken" });
    expect(short.error?.issues[0]?.message).toBe(
      "bugReport.descriptionTooShort",
    );

    const missing = submitBugReportSchema.safeParse({ description: null });
    expect(missing.success).toBe(false);
  });

  it("caps the description length", () => {
    const long = submitBugReportSchema.safeParse({
      description: "x".repeat(BUG_REPORT_MAX + 1),
    });
    expect(long.error?.issues[0]?.message).toBe("bugReport.descriptionTooLong");
    expect(
      submitBugReportSchema.safeParse({
        description: "x".repeat(BUG_REPORT_MAX),
      }).success,
    ).toBe(true);
  });

  it("never carries a reporter id or status through, whatever is posted", () => {
    const parsed = submitBugReportSchema.parse({
      description: "Something is wrong here.",
      reporter_id: "someone-else",
      status: "fixed",
    });
    expect(parsed).not.toHaveProperty("reporter_id");
    expect(parsed).not.toHaveProperty("status");
  });
});

describe("updateBugReportStatusSchema", () => {
  it("accepts a uuid and a known status only", () => {
    const id = "6f1c2b8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
    expect(
      updateBugReportStatusSchema.safeParse({ reportId: id, status: "fixed" })
        .success,
    ).toBe(true);
    expect(
      updateBugReportStatusSchema.safeParse({ reportId: id, status: "done" })
        .success,
    ).toBe(false);
    expect(
      updateBugReportStatusSchema.safeParse({ reportId: "x", status: "open" })
        .success,
    ).toBe(false);
  });
});
