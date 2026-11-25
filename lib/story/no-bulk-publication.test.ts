import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Prompt 7's brief forbade bulk publication outright ("every story still
// requires individual review"). The owner reversed that for the moderation
// queue on 2026-11-25: a moderator may select several stories and publish
// them at once. What this test still holds in place is the boundary around
// that one exception:
//   - nothing publishes many stories in one operation. There is still no
//     bulk RPC, so every story keeps its own consent check, publication
//     attempt and moderation record;
//   - the only bulk-named functions in lib/story/ are the check that REFUSES
//     stories and the wording of the confirmation's warnings. Neither can
//     publish anything;
//   - the queue's Server Action publishes solely through approveRevision(),
//     one story at a time, always with that check.

/** "file: name" -- add to this only by an owner decision. */
const ALLOWED = new Set([
  "bulk-approve.ts: bulkApproveBlocker",
  "moderation-queue-view.ts: bulkApproveCautions",
]);

const BULK_NAME_PATTERN =
  /\bbulk[_-]?(publish|approve|moderate)|\b(publish|approve|moderate)[_-]?bulk\b/i;

function readTextFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      readTextFiles(full, out);
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

describe("bulk publication stays one story at a time", () => {
  it("lib/story/ defines no bulk publish/approve/moderate function beyond the refusal check", () => {
    const root = path.join(__dirname, "..", "..", "lib", "story");
    const files = readTextFiles(root);
    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const exportedFunctionNames =
        content.match(/export\s+(?:async\s+)?function\s+(\w+)/g) ?? [];
      for (const match of exportedFunctionNames) {
        const entry = `${path.basename(file)}: ${match.split(/\s+/).pop()}`;
        if (BULK_NAME_PATTERN.test(match) && !ALLOWED.has(entry)) {
          offenders.push(entry);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the generated Supabase RPC surface has no bulk publish/approve/moderate function", () => {
    const typesPath = path.join(__dirname, "..", "..", "types", "database.ts");
    const content = readFileSync(typesPath, "utf8");
    const functionsSectionMatch = content.match(
      /Functions:\s*\{([\s\S]*?)\n\s{4}\}/,
    );
    expect(functionsSectionMatch).not.toBeNull();
    const functionNames =
      functionsSectionMatch![1].match(/^\s{6}(\w+):\s*\{/gm) ?? [];
    const offenders = functionNames.filter((name) =>
      BULK_NAME_PATTERN.test(name),
    );
    expect(offenders).toEqual([]);
  });

  it("the queue's bulk approve publishes only through approveRevision(), with the check", () => {
    const source = readFileSync(
      path.join(
        __dirname,
        "../../app/(moderation)/moderation/stories/actions.ts",
      ),
      "utf8",
    );
    expect(source.match(/approveRevision\(/g)).toHaveLength(1);
    expect(source).toMatch(/blocker: bulkApproveBlocker/);
    expect(source).not.toMatch(
      /finalizeStoryPublication|beginStoryPublicationAttempt|\.rpc\(|createAdminClient/,
    );
  });

  it("the refusal check itself reaches no database or storage", () => {
    const source = readFileSync(
      path.join(__dirname, "bulk-approve.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /^import (?!type)[^;]*(supabase|image-pipeline|publish-orchestration|story\/moderation")/m,
    );
  });
});
