import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCheck = vi.fn();
const mockRecord = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkAffirmationRateLimit: (...a: unknown[]) => mockCheck(...a),
  recordAffirmationAttempt: (...a: unknown[]) => mockRecord(...a),
  rateLimitRetryMinutes: (s: number) => Math.max(1, Math.ceil(s / 60)),
}));

const mockRpc = vi.fn();
vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ rpc: (...a: unknown[]) => mockRpc(...a) }),
}));

import { submitAffirmationNoteAction } from "./actions";

const token = "0123456789abcdef".repeat(4);
const GENERIC =
  "We couldn't send your note. Please try again in a little while.";

function formData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  mockCheck.mockReset();
  mockRecord.mockReset();
  mockRpc.mockReset();
  mockCheck.mockResolvedValue({ allowed: true });
  mockRecord.mockResolvedValue(undefined);
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe("submitAffirmationNoteAction", () => {
  it("sends the trimmed note through the RPC with only the token as identity", async () => {
    const result = await submitAffirmationNoteAction(
      {},
      formData({
        token,
        body: "  You are doing great.  ",
        authorName: " Mei ",
        website: "",
        // Smuggled identity a tampered client might post.
        owner_id: "someone-else",
        link_id: "someone-elses-link",
      }),
    );

    expect(result).toEqual({ sent: true });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("submit_affirmation_note", {
      p_token: token,
      p_body: "You are doing great.",
      p_author_name: "Mei",
    });
    expect(JSON.stringify(mockRpc.mock.calls)).not.toContain("someone-else");
  });

  it("omits the name arg (database default null) for a blank name", async () => {
    await submitAffirmationNoteAction(
      {},
      formData({ token, body: "Hi", authorName: "  " }),
    );
    expect(mockRpc.mock.calls[0][1].p_author_name).toBeUndefined();
  });

  it("checks the rate limit before inserting and counts the attempt", async () => {
    await submitAffirmationNoteAction({}, formData({ token, body: "Hi" }));

    expect(mockCheck).toHaveBeenCalledWith(token);
    expect(mockRecord).toHaveBeenCalledWith(token);
    expect(mockCheck.mock.invocationCallOrder[0]).toBeLessThan(
      mockRpc.mock.invocationCallOrder[0],
    );
  });

  describe("honeypot", () => {
    it("pretends success and does nothing when the hidden field is filled", async () => {
      const result = await submitAffirmationNoteAction(
        {},
        formData({ token, body: "Buy pills", website: "http://spam.example" }),
      );

      expect(result).toEqual({ sent: true });
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockCheck).not.toHaveBeenCalled();
      expect(mockRecord).not.toHaveBeenCalled();
    });

    it("pretends success even when the rest of the form is invalid", async () => {
      const result = await submitAffirmationNoteAction(
        {},
        formData({ token: "junk", body: "", website: "x" }),
      );
      expect(result).toEqual({ sent: true });
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("ignores a whitespace-only honeypot", async () => {
      const result = await submitAffirmationNoteAction(
        {},
        formData({ token, body: "Hi", website: "   " }),
      );
      expect(result).toEqual({ sent: true });
      expect(mockRpc).toHaveBeenCalledTimes(1);
    });
  });

  describe("rate limiting", () => {
    it("refuses with a retry time and inserts nothing", async () => {
      mockCheck.mockResolvedValue({ allowed: false, retryAfterSeconds: 1800 });

      const result = await submitAffirmationNoteAction(
        {},
        formData({ token, body: "Hi" }),
      );

      expect(result.sent).toBeUndefined();
      expect(result.error).toBe(
        "Too many notes have been sent recently. Please try again in about 30 minutes.",
      );
      expect(mockRpc).not.toHaveBeenCalled();
      expect(mockRecord).not.toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("rejects an empty note without touching the limiter or database", async () => {
      const result = await submitAffirmationNoteAction(
        {},
        formData({ token, body: "   " }),
      );
      expect(result.error).toBe("Write a few words before sending.");
      expect(mockCheck).not.toHaveBeenCalled();
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("rejects an over-long note", async () => {
      const result = await submitAffirmationNoteAction(
        {},
        formData({ token, body: "a".repeat(1001) }),
      );
      expect(result.error).toBe("Notes can be up to 1000 characters.");
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("reports a malformed token as the generic failure, not 'invalid link'", async () => {
      const result = await submitAffirmationNoteAction(
        {},
        formData({ token: "not-a-token", body: "Hi" }),
      );
      expect(result.error).toBe(GENERIC);
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  describe("failures never reveal whether a token exists", () => {
    it("returns the same message for an unknown/switched-off token (not_found) as for a network error", async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: { message: "not_found", code: "P0002" },
      });
      const notFound = await submitAffirmationNoteAction(
        {},
        formData({ token, body: "Hi" }),
      );

      mockRpc.mockRejectedValueOnce(new Error("fetch failed"));
      const networkDown = await submitAffirmationNoteAction(
        {},
        formData({ token, body: "Hi" }),
      );

      expect(notFound).toEqual({ error: GENERIC });
      expect(networkDown).toEqual({ error: GENERIC });
      expect(JSON.stringify(notFound)).not.toMatch(/not_found|exist|inactive/i);
    });
  });
});
