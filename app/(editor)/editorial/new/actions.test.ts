import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRedirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({
  redirect: (path: string) => mockRedirect(path),
}));

let currentRole: "user" | "editor" | "moderator" | "admin" | null = "editor";
vi.mock("@/lib/auth/roles", () => ({
  getCurrentUserRole: vi.fn(async () => currentRole),
  resolveStaffAccess: (role: string | null, allowed: readonly string[]) =>
    role && allowed.includes(role)
      ? { ok: true as const }
      : { ok: false as const },
}));

const mockCreateEditorialImportDraftShell = vi.fn();
vi.mock("@/lib/story/mutations", () => ({
  createEditorialImportDraftShell: (...args: unknown[]) =>
    mockCreateEditorialImportDraftShell(...args),
}));

vi.mock("@/lib/story/editorial-queries", () => ({
  createUnlinkedContributor: vi.fn(async () => ({ id: "new-contributor" })),
}));

const CONTRIBUTOR_ID = "33333333-3333-4333-8333-333333333333";

function formDataWith(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

beforeEach(() => {
  currentRole = "editor";
  mockCreateEditorialImportDraftShell.mockReset();
  mockCreateEditorialImportDraftShell.mockResolvedValue({
    story_id: "story-1",
  });
  mockRedirect.mockClear();
});

describe("createEditorialImportAction", () => {
  it("passes a valid country field through as the shell's countrySlug argument", async () => {
    const { createEditorialImportAction } = await import("./actions");
    await expect(
      createEditorialImportAction(
        {},
        formDataWith({
          title: "My Trip",
          contributorMode: "existing",
          existingContributorId: CONTRIBUTOR_ID,
          country: "china",
        }),
      ),
    ).rejects.toThrow("REDIRECT:/editorial/story-1/edit");

    expect(mockCreateEditorialImportDraftShell).toHaveBeenCalledWith(
      CONTRIBUTOR_ID,
      "My Trip",
      undefined,
      "china",
    );
  });

  it("omits countrySlug (RPC default applies) when the country field is missing", async () => {
    const { createEditorialImportAction } = await import("./actions");
    await expect(
      createEditorialImportAction(
        {},
        formDataWith({
          title: "My Trip",
          contributorMode: "existing",
          existingContributorId: CONTRIBUTOR_ID,
        }),
      ),
    ).rejects.toThrow("REDIRECT:/editorial/story-1/edit");

    expect(mockCreateEditorialImportDraftShell).toHaveBeenCalledWith(
      CONTRIBUTOR_ID,
      "My Trip",
      undefined,
      undefined,
    );
  });

  it("rejects an invalid country field without creating a draft", async () => {
    const { createEditorialImportAction } = await import("./actions");
    const result = await createEditorialImportAction(
      {},
      formDataWith({
        title: "My Trip",
        contributorMode: "existing",
        existingContributorId: CONTRIBUTOR_ID,
        country: "not-a-real-country",
      }),
    );

    expect(result.error).toBeTruthy();
    expect(mockCreateEditorialImportDraftShell).not.toHaveBeenCalled();
  });

  it("rejects a non-editor/admin caller", async () => {
    currentRole = "user";
    const { createEditorialImportAction } = await import("./actions");
    const result = await createEditorialImportAction(
      {},
      formDataWith({
        title: "My Trip",
        contributorMode: "existing",
        existingContributorId: CONTRIBUTOR_ID,
      }),
    );

    expect(result.error).toBeTruthy();
    expect(mockCreateEditorialImportDraftShell).not.toHaveBeenCalled();
  });
});
