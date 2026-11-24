// Vercel's "Ignored Build Step" (vercel.json#ignoreCommand).
// Exit 0 = skip this deployment, exit 1 = build it.
//
// Every production deployment empties the CDN's photo cache, so each photo
// is fetched from Drive and resized again. One release used to make three:
// the code push, the release bot's version bump, and the rewritten changelog.
// The last two change nothing a visitor can see.
//
// The comparison is against the last SUCCESSFUL deployment of this branch
// (VERCEL_GIT_PREVIOUS_SHA), never HEAD^: a push of "code commit, then docs
// commit" has a docs-only last commit and must still deploy. It also means a
// build that failed or was cancelled can never be lost behind a docs commit.
//
// Anything unclear builds. A needless build is cheap; a missed one is not.
// See docs/architecture.md#hosting-vercel.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const IGNORED_FILES = new Set([
  "CHANGELOG.md",
  "CLAUDE.md",
  "DESIGN.md",
  "PRODUCT.md",
  "README.md",
]);
const IGNORED_FOLDERS = ["docs/", ".github/"];
const VERSION_FILES = new Set(["package.json", "package-lock.json"]);

function withoutVersion(json) {
  const parsed = JSON.parse(json);
  delete parsed.version;
  // package-lock.json repeats the app's own version here.
  if (parsed.packages?.[""]) delete parsed.packages[""].version;
  return JSON.stringify(parsed);
}

/**
 * @param {string[]} changedFiles
 * @param {(file: string) => { before: string, after: string }} readBoth
 */
export function canSkipBuild(changedFiles, readBoth) {
  // No difference at all is a redeploy of the same commit, usually to pick up
  // a changed environment variable.
  if (changedFiles.length === 0) return false;

  return changedFiles.every((file) => {
    if (IGNORED_FILES.has(file)) return true;
    if (IGNORED_FOLDERS.some((folder) => file.startsWith(folder))) return true;
    if (VERSION_FILES.has(file)) {
      const { before, after } = readBoth(file);
      return withoutVersion(before) === withoutVersion(after);
    }
    return false;
  });
}

function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function main() {
  const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;
  if (!previous || !/^[0-9a-f]{40}$/.test(previous)) {
    console.log("Building: no previous successful deployment to compare with.");
    return 1;
  }

  try {
    // Throws when the shallow clone does not reach back to `previous`.
    const changed = git(
      "diff",
      "--name-only",
      "--no-renames",
      "-z",
      previous,
      "HEAD",
    )
      .split("\0")
      .filter(Boolean);
    const skip = canSkipBuild(changed, (file) => ({
      before: git("show", `${previous}:${file}`),
      after: git("show", `HEAD:${file}`),
    }));
    console.log(
      skip
        ? `Skipping: only docs, changelog or version changes since ${previous}.`
        : `Building: the app may have changed since ${previous}.`,
    );
    return skip ? 0 : 1;
  } catch (error) {
    console.log(
      `Building: could not compare with ${previous}:`,
      error instanceof Error ? error.message : error,
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(main());
}
