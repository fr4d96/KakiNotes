import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mockRole = vi.fn();
vi.mock("@/lib/auth/roles", () => ({ getCurrentUserRole: () => mockRole() }));
const mockRedirect = vi.fn((path: string) => {
  throw new Error(`redirect ${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

import { AuthoringLayout } from "./authoring-guard";

beforeEach(() => vi.clearAllMocks());

describe("AuthoringLayout", () => {
  it("sends a moderator to Moderation", async () => {
    mockRole.mockResolvedValue("moderator");
    await expect(AuthoringLayout({ children: "page" })).rejects.toThrow(
      "redirect /moderation",
    );
  });

  it.each(["user", "editor", "admin", null])(
    "lets %s through",
    async (role) => {
      mockRole.mockResolvedValue(role);
      expect(await AuthoringLayout({ children: "page" })).toBe("page");
      expect(mockRedirect).not.toHaveBeenCalled();
    },
  );
});
