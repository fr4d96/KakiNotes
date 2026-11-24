import { describe, expect, it } from "vitest";
import { canSkipBuild } from "./vercel-ignore-build.mjs";

const pkg = (version: string, dep = "1.0.0") =>
  JSON.stringify({ name: "kakinotes", version, dependencies: { sharp: dep } });
const lock = (version: string, dep = "1.0.0") =>
  JSON.stringify({
    version,
    packages: { "": { version }, "node_modules/sharp": { version: dep } },
  });

function unexpectedRead(): never {
  throw new Error("should not read file contents");
}

describe("canSkipBuild", () => {
  it("skips changelog, docs and workflow changes", () => {
    expect(
      canSkipBuild(
        ["CHANGELOG.md", "docs/architecture.md", ".github/workflows/ci.yml"],
        unexpectedRead,
      ),
    ).toBe(true);
  });

  it("skips the release bot's version bump", () => {
    expect(
      canSkipBuild(
        [
          ".github/.release-please-manifest.json",
          "CHANGELOG.md",
          "package-lock.json",
          "package.json",
        ],
        (file) =>
          file === "package.json"
            ? { before: pkg("4.7.3"), after: pkg("4.7.4") }
            : { before: lock("4.7.3"), after: lock("4.7.4") },
      ),
    ).toBe(true);
  });

  it("builds when a dependency changed, in either file", () => {
    expect(
      canSkipBuild(["package.json"], () => ({
        before: pkg("4.7.3"),
        after: pkg("4.7.4", "2.0.0"),
      })),
    ).toBe(false);
    expect(
      canSkipBuild(["package-lock.json"], () => ({
        before: lock("4.7.3"),
        after: lock("4.7.4", "2.0.0"),
      })),
    ).toBe(false);
  });

  it("builds when any app file changed alongside docs", () => {
    for (const file of [
      "app/layout.tsx",
      "next.config.ts",
      "vercel.json",
      "i18n/messages/en.json",
      "app/docs/page.tsx",
    ]) {
      expect(canSkipBuild(["CHANGELOG.md", file], unexpectedRead)).toBe(false);
    }
  });

  it("builds a redeploy of the same commit (no changes at all)", () => {
    expect(canSkipBuild([], unexpectedRead)).toBe(false);
  });
});
