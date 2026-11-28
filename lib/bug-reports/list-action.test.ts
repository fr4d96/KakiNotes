import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCheck = vi.fn();
const mockRecord = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkBugListRateLimit: () => mockCheck(),
  recordBugListFailure: () => mockRecord(),
  rateLimitRetryMinutes: (s: number) => Math.max(1, Math.ceil(s / 60)),
}));

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({
    rpc: async (fn: string, args: unknown) => ({
      data: await mockRpc(fn, args),
      error: null,
    }),
  }),
}));

import { openBugListAction } from "./list-action";

const row = {
  id: "6f1c2b8e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
  description: "Save does nothing",
  page_path: "/my-stories",
  status: "open",
  created_at: "2026-11-28T02:00:00+00:00",
};

beforeEach(() => {
  mockCheck.mockReset().mockResolvedValue({ allowed: true });
  mockRecord.mockReset().mockResolvedValue(undefined);
  mockRpc.mockReset();
});

describe("openBugListAction", () => {
  it("returns the reports when the database accepts the password", async () => {
    mockRpc.mockResolvedValue({ ok: true, reports: [row] });
    const result = await openBugListAction("pw");
    expect(mockRpc).toHaveBeenCalledWith("list_bug_reports_with_passcode", {
      p_passcode: "pw",
    });
    expect(result).toEqual({
      ok: true,
      reports: [
        {
          id: row.id,
          description: row.description,
          pagePath: "/my-stories",
          status: "open",
          createdAt: row.created_at,
        },
      ],
    });
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("drops any extra field the database might return", async () => {
    mockRpc.mockResolvedValue({
      ok: true,
      reports: [{ ...row, reporter_id: "someone", user_agent: "UA" }],
    });
    const result = await openBugListAction("pw");
    expect(JSON.stringify(result)).not.toContain("someone");
    expect(JSON.stringify(result)).not.toContain("UA");
  });

  it("counts a wrong password against the IP and says so", async () => {
    mockRpc.mockResolvedValue({ ok: false, reason: "invalid" });
    const result = await openBugListAction("nope");
    expect(result).toEqual({ ok: false, error: "That password isn't right." });
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it("refuses before asking the database when the IP is rate limited", async () => {
    mockCheck.mockResolvedValue({ allowed: false, retryAfterSeconds: 300 });
    const result = await openBugListAction("pw");
    expect(result).toEqual({
      ok: false,
      error: "Too many wrong passwords. Try again in about 5 minutes.",
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("passes on the database's own lock", async () => {
    mockRpc.mockResolvedValue({
      ok: false,
      reason: "rate_limited",
      retry_after_seconds: 600,
    });
    const result = await openBugListAction("admin");
    expect(result).toEqual({
      ok: false,
      error: "Too many wrong passwords. Try again in about 10 minutes.",
    });
  });

  it("rejects an empty password without calling anything", async () => {
    const result = await openBugListAction("");
    expect(result).toEqual({ ok: false, error: "Enter the password." });
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("shows a friendly error when the response is malformed or the call fails", async () => {
    mockRpc.mockResolvedValue({ surprise: true });
    expect(await openBugListAction("pw")).toEqual({
      ok: false,
      error: "We couldn't load the bug list. Please try again.",
    });
    mockRpc.mockRejectedValue(new Error("network"));
    expect((await openBugListAction("pw")).ok).toBe(false);
  });

  it("says when the password has not been set up", async () => {
    mockRpc.mockResolvedValue({ ok: false, reason: "not_configured" });
    expect(await openBugListAction("pw")).toEqual({
      ok: false,
      error: "Bug Lists isn't set up yet.",
    });
  });
});
