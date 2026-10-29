// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: rpcMock }),
}));

const getAccessToken = vi.hoisted(() => vi.fn(async () => "access-token"));
const ensureAppFolders = vi.hoisted(() =>
  vi.fn(async () => ({
    appFolderId: "app-folder",
    stagingFolderId: "staging",
  })),
);
const createFolder = vi.hoisted(() => vi.fn(async () => "new-folder-id"));
const getFileMetadata = vi.hoisted(() => vi.fn());
const listFolderChildren = vi.hoisted(() =>
  vi.fn(
    async () => [] as Array<{ id: string; name: string; parents: string[] }>,
  ),
);
const renameFile = vi.hoisted(() =>
  vi.fn(
    async (
      _token: string,
      _fileId: string,
      _name: string,
      _userId?: string,
    ) => {},
  ),
);
const moveFile = vi.hoisted(() =>
  vi.fn(
    async (
      _token: string,
      _fileId: string,
      _newParentId: string,
      _oldParentId: string,
      _userId?: string,
    ) => {},
  ),
);
const renameAndMoveFile = vi.hoisted(() =>
  vi.fn(
    async (
      _token: string,
      _fileId: string,
      _name: string,
      _newParentId: string,
      _oldParentId: string,
      _userId?: string,
    ) => {},
  ),
);

vi.mock("@/lib/drive/drive-client", () => ({
  getAccessToken,
  ensureAppFolders,
  createFolder,
  getFileMetadata,
  listFolderChildren,
  renameFile,
  moveFile,
  renameAndMoveFile,
}));

import {
  sanitizeStoryFolderName,
  uniqueFolderName,
  extensionForMimeType,
  ensureStoryFolder,
  syncStoryFolder,
  renameStoryFolderIfExists,
  getDriveSyncGate,
} from "@/lib/story/drive-folders";

describe("sanitizeStoryFolderName", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeStoryFolderName("  My   Big   Trip  ")).toBe("My Big Trip");
  });

  it("strips characters Drive/OSes choke on", () => {
    expect(sanitizeStoryFolderName('A/B\\C:D*E?F"G<H>I|J')).toBe(
      "A B C D E F G H I J",
    );
  });

  it("falls back to Untitled story for an empty title", () => {
    expect(sanitizeStoryFolderName("")).toBe("Untitled story");
    expect(sanitizeStoryFolderName(null)).toBe("Untitled story");
    expect(sanitizeStoryFolderName(undefined)).toBe("Untitled story");
  });

  it("falls back to Untitled story when the title is ONLY forbidden characters/whitespace", () => {
    expect(sanitizeStoryFolderName("   ///***   ")).toBe("Untitled story");
  });

  it("caps at ~100 chars", () => {
    const long = "x".repeat(150);
    expect(sanitizeStoryFolderName(long).length).toBe(100);
  });
});

describe("uniqueFolderName", () => {
  it("returns the base name when it is not taken", () => {
    expect(uniqueFolderName("My Trip", ["Other Trip"])).toBe("My Trip");
  });

  it("appends (2) when the base name collides", () => {
    expect(uniqueFolderName("My Trip", ["My Trip"])).toBe("My Trip (2)");
  });

  it("keeps incrementing past existing numbered collisions", () => {
    expect(
      uniqueFolderName("My Trip", ["My Trip", "My Trip (2)", "My Trip (3)"]),
    ).toBe("My Trip (4)");
  });
});

describe("extensionForMimeType", () => {
  it("maps jpeg to .jpg and png to .png", () => {
    expect(extensionForMimeType("image/jpeg")).toBe("jpg");
    expect(extensionForMimeType("image/png")).toBe("png");
  });

  it("defaults to .jpg for anything else", () => {
    expect(extensionForMimeType("image/webp")).toBe("jpg");
    expect(extensionForMimeType(null)).toBe("jpg");
  });
});

function supabaseStub() {
  return { rpc: rpcMock } as unknown as Parameters<typeof ensureStoryFolder>[0];
}

beforeEach(() => {
  rpcMock.mockReset();
  getAccessToken.mockReset();
  getAccessToken.mockResolvedValue("access-token");
  ensureAppFolders.mockClear();
  createFolder.mockClear();
  getFileMetadata.mockReset();
  listFolderChildren.mockReset();
  listFolderChildren.mockResolvedValue([]);
  renameFile.mockReset();
  moveFile.mockReset();
  renameAndMoveFile.mockReset();
});

describe("ensureStoryFolder", () => {
  function mockRpcs(opts: {
    title: string;
    existing?: { drive_folder_id: string; folder_name: string } | null;
    takenNames?: string[];
  }) {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "get_story_preview") {
        return { data: [{ title: opts.title }], error: null };
      }
      if (name === "get_story_drive_folder") {
        return { data: opts.existing ? [opts.existing] : [], error: null };
      }
      if (name === "list_my_story_drive_folder_names") {
        return {
          data: (opts.takenNames ?? []).map((n) => ({ folder_name: n })),
          error: null,
        };
      }
      if (name === "upsert_story_drive_folder") {
        return { data: null, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
  }

  it("creates a new folder, named after the title, when none exists yet", async () => {
    mockRpcs({ title: "My Big OE", existing: null, takenNames: [] });

    const folderId = await ensureStoryFolder(
      supabaseStub(),
      "access-token",
      "user-1",
      "story-1",
    );

    expect(folderId).toBe("new-folder-id");
    expect(createFolder).toHaveBeenCalledWith(
      "access-token",
      "My Big OE",
      "app-folder",
      "user-1",
    );
    expect(rpcMock).toHaveBeenCalledWith("upsert_story_drive_folder", {
      p_story_id: "story-1",
      p_drive_folder_id: "new-folder-id",
      p_folder_name: "My Big OE",
    });
  });

  it("adds a uniqueness suffix when another of the caller's stories already has that name", async () => {
    mockRpcs({ title: "My Big OE", existing: null, takenNames: ["My Big OE"] });

    await ensureStoryFolder(
      supabaseStub(),
      "access-token",
      "user-1",
      "story-1",
    );

    expect(createFolder).toHaveBeenCalledWith(
      "access-token",
      "My Big OE (2)",
      "app-folder",
      "user-1",
    );
  });

  it("does nothing (no rename) when the title has not changed", async () => {
    mockRpcs({
      title: "My Big OE",
      existing: { drive_folder_id: "folder-1", folder_name: "My Big OE" },
      takenNames: [],
    });

    const folderId = await ensureStoryFolder(
      supabaseStub(),
      "access-token",
      "user-1",
      "story-1",
    );

    expect(folderId).toBe("folder-1");
    expect(renameFile).not.toHaveBeenCalled();
    expect(createFolder).not.toHaveBeenCalled();
  });

  it("renames the existing folder only when the title-implied name changed", async () => {
    mockRpcs({
      title: "New Title",
      existing: { drive_folder_id: "folder-1", folder_name: "Old Title" },
      takenNames: [],
    });

    const folderId = await ensureStoryFolder(
      supabaseStub(),
      "access-token",
      "user-1",
      "story-1",
    );

    expect(folderId).toBe("folder-1");
    expect(renameFile).toHaveBeenCalledWith(
      "access-token",
      "folder-1",
      "New Title",
      "user-1",
    );
    expect(rpcMock).toHaveBeenCalledWith("upsert_story_drive_folder", {
      p_story_id: "story-1",
      p_drive_folder_id: "folder-1",
      p_folder_name: "New Title",
    });
  });
});

describe("syncStoryFolder", () => {
  function baseRpcs(
    media: Array<{
      media_id: string;
      drive_processed_file_id: string;
      processed_mime_type: string;
      sort_order: number;
    }>,
  ) {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "get_story_preview") {
        return { data: [{ title: "My Trip" }], error: null };
      }
      if (name === "get_story_drive_folder") {
        return {
          data: [{ drive_folder_id: "story-folder", folder_name: "My Trip" }],
          error: null,
        };
      }
      if (name === "list_my_story_drive_folder_names") {
        return { data: [], error: null };
      }
      if (name === "upsert_story_drive_folder") {
        return { data: null, error: null };
      }
      if (name === "list_story_drive_media_for_sync") {
        return { data: media, error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });
  }

  it("renumbers media in order, moving a loose file into the story folder, via ONE listFolderChildren call", async () => {
    baseRpcs([
      {
        media_id: "m1",
        drive_processed_file_id: "f1",
        processed_mime_type: "image/jpeg",
        sort_order: 0,
      },
      {
        media_id: "m2",
        drive_processed_file_id: "f2",
        processed_mime_type: "image/png",
        sort_order: 1,
      },
    ]);
    // f1 is already a child of the story folder, correctly named -- the
    // ONE listFolderChildren call finds it. f2 is loose in the bare app
    // folder (not a child of the story folder at all), so it's NOT in that
    // listing and falls back to an individual getFileMetadata call.
    listFolderChildren.mockResolvedValue([
      { id: "f1", name: "01.jpg", parents: ["story-folder"] },
    ]);
    getFileMetadata.mockImplementation(
      async (_token: string, fileId: string) => ({
        id: fileId,
        name: "random-name.png",
        size: 10,
        parents: ["app-folder"],
        appProperties: {},
      }),
    );

    await syncStoryFolder("user-1", "story-1");

    expect(listFolderChildren).toHaveBeenCalledTimes(1);
    expect(listFolderChildren).toHaveBeenCalledWith(
      "access-token",
      "story-folder",
      "user-1",
    );
    // Only f2 needed the fallback -- f1 was already resolved by the list.
    expect(getFileMetadata).toHaveBeenCalledTimes(1);
    expect(getFileMetadata).toHaveBeenCalledWith(
      "access-token",
      "f2",
      "user-1",
    );

    // f1 needed no change at all.
    expect(renameFile).not.toHaveBeenCalledWith(
      expect.anything(),
      "f1",
      expect.anything(),
      expect.anything(),
    );
    expect(moveFile).not.toHaveBeenCalledWith(
      expect.anything(),
      "f1",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );

    // f2 needed both a move and a rename: pass 1 does a combined temp
    // rename+move, pass 2 assigns the final name.
    expect(renameAndMoveFile).toHaveBeenCalledWith(
      "access-token",
      "f2",
      "__sync-m2",
      "story-folder",
      "app-folder",
      "user-1",
    );
    expect(renameFile).toHaveBeenCalledWith(
      "access-token",
      "f2",
      "02.png",
      "user-1",
    );
  });

  it("does a pure move with no rename when the name is already correct", async () => {
    baseRpcs([
      {
        media_id: "m1",
        drive_processed_file_id: "f1",
        processed_mime_type: "image/jpeg",
        sort_order: 0,
      },
    ]);
    // Not a child of the story folder yet -- the list call (scoped to the
    // story folder) won't find it, so it falls back to getFileMetadata.
    listFolderChildren.mockResolvedValue([]);
    getFileMetadata.mockResolvedValue({
      id: "f1",
      name: "01.jpg",
      size: 10,
      parents: ["app-folder"],
      appProperties: {},
    });

    await syncStoryFolder("user-1", "story-1");

    expect(moveFile).toHaveBeenCalledWith(
      "access-token",
      "f1",
      "story-folder",
      "app-folder",
      "user-1",
    );
    expect(renameFile).not.toHaveBeenCalled();
    expect(renameAndMoveFile).not.toHaveBeenCalled();
  });

  it("two-pass renumbering never lets two files share a name mid-way (a straight swap)", async () => {
    baseRpcs([
      {
        media_id: "m1",
        drive_processed_file_id: "f1",
        processed_mime_type: "image/jpeg",
        sort_order: 0,
      },
      {
        media_id: "m2",
        drive_processed_file_id: "f2",
        processed_mime_type: "image/jpeg",
        sort_order: 1,
      },
    ]);
    // f1 currently holds what should become f2's name, and vice versa --
    // a reorder/swap. Both already live in the story folder (move-free),
    // and both are resolved by the ONE listFolderChildren call.
    listFolderChildren.mockResolvedValue([
      { id: "f1", name: "02.jpg", parents: ["story-folder"] },
      { id: "f2", name: "01.jpg", parents: ["story-folder"] },
    ]);

    const renameOrder: string[] = [];
    renameFile.mockImplementation(
      async (_token: string, fileId: string, name: string) => {
        renameOrder.push(`${fileId}->${name}`);
      },
    );

    await syncStoryFolder("user-1", "story-1");

    expect(getFileMetadata).not.toHaveBeenCalled();
    // Pass 1 gives both a unique temp name BEFORE either gets its real
    // target name, so "01.jpg" and "02.jpg" are never both missing/
    // duplicated at the same instant.
    expect(renameOrder).toEqual([
      "f1->__sync-m1",
      "f2->__sync-m2",
      "f1->01.jpg",
      "f2->02.jpg",
    ]);
  });

  it("never throws when Drive calls fail -- logs and returns", async () => {
    baseRpcs([
      {
        media_id: "m1",
        drive_processed_file_id: "f1",
        processed_mime_type: "image/jpeg",
        sort_order: 0,
      },
    ]);
    getAccessToken.mockRejectedValueOnce(new Error("Drive is down"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(syncStoryFolder("user-1", "story-1")).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });

  it("logs and skips (never throws) a per-file rename/move failure, continuing with the rest", async () => {
    baseRpcs([
      {
        media_id: "m1",
        drive_processed_file_id: "f1",
        processed_mime_type: "image/jpeg",
        sort_order: 0,
      },
      {
        media_id: "m2",
        drive_processed_file_id: "f2",
        processed_mime_type: "image/jpeg",
        sort_order: 1,
      },
    ]);
    listFolderChildren.mockResolvedValue([
      { id: "f1", name: "wrong-name.jpg", parents: ["story-folder"] },
      { id: "f2", name: "wrong-name.jpg", parents: ["story-folder"] },
    ]);
    renameFile.mockImplementation(async (_token: string, fileId: string) => {
      if (fileId === "f1") throw new Error("rename failed");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(syncStoryFolder("user-1", "story-1")).resolves.toBeUndefined();
    // f2 still got renamed despite f1's failure.
    expect(renameFile).toHaveBeenCalledWith(
      expect.anything(),
      "f2",
      "02.jpg",
      "user-1",
    );
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("renameStoryFolderIfExists", () => {
  it("does nothing -- never creates a folder -- when none exists yet", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "get_story_drive_folder") return { data: [], error: null };
      throw new Error(`unexpected rpc ${name}`);
    });

    await renameStoryFolderIfExists("user-1", "story-1");

    expect(createFolder).not.toHaveBeenCalled();
    expect(renameFile).not.toHaveBeenCalled();
  });

  it("renames the existing folder when the title-implied name has changed", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "get_story_drive_folder") {
        return {
          data: [{ drive_folder_id: "folder-1", folder_name: "Old Title" }],
          error: null,
        };
      }
      if (name === "get_story_preview") {
        return { data: [{ title: "New Title" }], error: null };
      }
      if (name === "list_my_story_drive_folder_names") {
        return { data: [], error: null };
      }
      if (name === "upsert_story_drive_folder")
        return { data: null, error: null };
      throw new Error(`unexpected rpc ${name}`);
    });

    await renameStoryFolderIfExists("user-1", "story-1");

    expect(renameFile).toHaveBeenCalledWith(
      "access-token",
      "folder-1",
      "New Title",
      "user-1",
    );
  });

  it("does nothing when the title-implied name is unchanged", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "get_story_drive_folder") {
        return {
          data: [{ drive_folder_id: "folder-1", folder_name: "Same Title" }],
          error: null,
        };
      }
      if (name === "get_story_preview") {
        return { data: [{ title: "Same Title" }], error: null };
      }
      if (name === "list_my_story_drive_folder_names") {
        return { data: [], error: null };
      }
      throw new Error(`unexpected rpc ${name}`);
    });

    await renameStoryFolderIfExists("user-1", "story-1");

    expect(renameFile).not.toHaveBeenCalled();
  });

  it("never throws when Drive/DB calls fail", async () => {
    rpcMock.mockImplementation(async () => {
      throw new Error("db down");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      renameStoryFolderIfExists("user-1", "story-1"),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("getDriveSyncGate", () => {
  it("returns the gate's booleans on success", async () => {
    rpcMock.mockResolvedValue({
      data: [{ has_drive_media: true, has_folder: false }],
      error: null,
    });

    await expect(getDriveSyncGate("story-1")).resolves.toEqual({
      hasDriveMedia: true,
      hasFolder: false,
    });
  });

  it("returns null (never throws) on an RPC error -- e.g. a non-owner caller", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "not authorized" },
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    consoleError.mockClear(); // isolate from any earlier test's calls

    await expect(getDriveSyncGate("story-1")).resolves.toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("returns null when the RPC throws outright", async () => {
    rpcMock.mockRejectedValue(new Error("network down"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(getDriveSyncGate("story-1")).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalled();
  });
});
