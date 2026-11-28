import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCheck = vi.fn();
const mockRecord = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkBugReportRateLimit: (...a: unknown[]) => mockCheck(...a),
  recordBugReportAttempt: (...a: unknown[]) => mockRecord(...a),
  rateLimitRetryMinutes: (s: number) => Math.max(1, Math.ceil(s / 60)),
}));

const mockUser = vi.fn();
vi.mock("@/lib/auth/get-current-user", () => ({
  getCurrentUser: () => mockUser(),
}));

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }),
}));

vi.mock("./db", () => ({
  callSubmitBugReport: (
    client: { rpc: (...a: unknown[]) => unknown },
    args: unknown,
  ) => client.rpc("submit_bug_report", args),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "  TestBrowser/1.0  " }),
}));

import { submitBugReportAction } from "./submit-action";

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

const valid = {
  description: "The photo upload spins forever.",
  pagePath: "/my-photos",
};

beforeEach(() => {
  mockCheck.mockReset().mockResolvedValue({ allowed: true });
  mockRecord.mockReset().mockResolvedValue(undefined);
  mockRpc.mockReset().mockResolvedValue({ data: null, error: null });
  mockUser.mockReset().mockResolvedValue(null);
});

describe("submitBugReportAction", () => {
  it("saves the report with the server's user agent and no client identity", async () => {
    const result = await submitBugReportAction(
      {},
      formData({
        ...valid,
        pagePath: "/my-photos?secret=1",
        // Smuggled fields a tampered client might post.
        reporter_id: "someone-else",
        status: "fixed",
        userAgent: "FakeAgent",
      }),
    );

    expect(result).toEqual({ sent: true });
    expect(mockRpc).toHaveBeenCalledWith("submit_bug_report", {
      p_description: valid.description,
      p_page_path: "/my-photos",
      p_user_agent: "TestBrowser/1.0",
    });
    const sent = JSON.stringify(mockRpc.mock.calls);
    expect(sent).not.toContain("someone-else");
    expect(sent).not.toContain("FakeAgent");
    expect(sent).not.toContain("fixed");
  });

  it("buckets a signed-in reporter by the session's user id", async () => {
    mockUser.mockResolvedValue({ id: "session-user" });
    await submitBugReportAction({}, formData(valid));
    expect(mockCheck).toHaveBeenCalledWith("session-user");
    expect(mockRecord).toHaveBeenCalledWith("session-user");
  });

  it("buckets a signed-out visitor as null (the limiter falls back to IP)", async () => {
    await submitBugReportAction({}, formData(valid));
    expect(mockCheck).toHaveBeenCalledWith(null);
    expect(mockCheck.mock.invocationCallOrder[0]).toBeLessThan(
      mockRpc.mock.invocationCallOrder[0],
    );
  });

  it("refuses when rate limited, without inserting or counting", async () => {
    mockCheck.mockResolvedValue({ allowed: false, retryAfterSeconds: 600 });
    const result = await submitBugReportAction({}, formData(valid));
    expect(result.error).toBe(
      "You've sent several reports recently. Try again in about 10 minutes.",
    );
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("rejects a too-short description before the limiter or database", async () => {
    const result = await submitBugReportAction(
      {},
      formData({ description: "bad" }),
    );
    expect(result.error).toBe(
      "Please add a little more detail (at least 10 characters).",
    );
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("pretends success for a filled honeypot and does nothing", async () => {
    const result = await submitBugReportAction(
      {},
      formData({ ...valid, website: "http://spam.example" }),
    );
    expect(result).toEqual({ sent: true });
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("shows a friendly error when the database refuses", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "rate_limited" },
    });
    const result = await submitBugReportAction({}, formData(valid));
    expect(result).toEqual({
      error:
        "We couldn't send your report. Please try again in a little while.",
    });
  });
});
