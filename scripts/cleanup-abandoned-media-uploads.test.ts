// @vitest-environment node
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Runs the real script against a fake Supabase on 127.0.0.1. What matters is
 * the order and the targets: nothing is deleted from the public bucket before
 * a claim, and only the path the claim returned.
 */
const run = promisify(execFile);
const script = path.join(__dirname, "cleanup-abandoned-media-uploads.mjs");

let server: Server;
let url: string;
let calls: string[];
let unresolved: unknown[];
let listed: unknown[];
let claimed: string | null;
let removeStatus: number;

beforeEach(async () => {
  calls = [];
  unresolved = [];
  listed = [
    { copy_attempt_id: "copy-1", media_id: "media-1", public_path: "s/m/old" },
  ];
  claimed = "s/m/claimed.jpg";
  removeStatus = 200;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const pathname = req.url!.split("?")[0];
      let status = 200;
      let reply: unknown = [];
      if (pathname.endsWith("/story_media_public_copy_attempts")) {
        reply = unresolved;
      } else if (pathname.includes("/rpc/")) {
        const name = pathname.split("/rpc/")[1];
        calls.push(name);
        if (name === "maintenance_list_abandoned_public_copies") reply = listed;
        else if (name === "maintenance_claim_abandoned_public_copy")
          reply = claimed;
        else reply = null;
      } else if (pathname.includes("/storage/")) {
        calls.push(`${req.method} ${pathname.split("/object/")[1]} ${body}`);
        status = removeStatus;
        if (status !== 200) reply = { message: "storage down" };
      }
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => new Promise((done) => server.close(done)));

async function runScript(...args: string[]) {
  return run(process.execPath, [script, ...args], {
    env: {
      ...process.env,
      SUPABASE_MAINTENANCE_URL: url,
      SUPABASE_MAINTENANCE_PROJECT_REF: "127.0.0.1",
      SUPABASE_MAINTENANCE_SERVICE_ROLE_KEY: "fake-key",
      SUPABASE_MAINTENANCE_CONFIRM: "i-confirm-cleanup-127.0.0.1",
    },
  });
}

const LIST = "maintenance_list_abandoned_public_copies";
const CLAIM = "maintenance_claim_abandoned_public_copy";
const RECORD = "maintenance_record_public_copy_removed";
const REMOVE = 'DELETE story-images-public {"prefixes":["s/m/claimed.jpg"]}';

describe("cleanup-abandoned-media-uploads: public copies", () => {
  it("only reports in a dry run", async () => {
    const { stdout } = await runScript();
    expect(stdout).toContain("copy attempt copy-1");
    expect(calls).toEqual([LIST]);
  });

  it("claims, deletes exactly the claimed path, then records it", async () => {
    await runScript("--execute");
    expect(calls).toEqual([LIST, CLAIM, REMOVE, RECORD]);
  });

  it("deletes nothing when the claim is refused", async () => {
    claimed = null;
    const { stdout } = await runScript("--execute");
    expect(stdout).toContain("skipped: now in use");
    expect(calls).toEqual([LIST, CLAIM]);
  });

  it("does not record a delete that failed", async () => {
    removeStatus = 500;
    const { stderr } = await runScript("--execute");
    expect(stderr).toContain("could not delete public object");
    expect(calls.at(-1)).toBe(REMOVE);
    expect(calls).not.toContain(RECORD);
  });

  it("only resolves an unresolved copy, never deletes its object", async () => {
    listed = [];
    unresolved = [
      {
        id: "copy-2",
        media_id: "media-2",
        public_path: "s/m2/live.jpg",
        status: "verified",
      },
    ];
    await runScript("--execute");
    expect(calls).toEqual(["maintenance_resolve_orphaned_copy_attempt", LIST]);
  });
});
