#!/usr/bin/env node
/**
 * SPIKE (throwaway) — docs/google-drive-integration.md, build slice 2.
 *
 * Question: can a browser PUT a file straight to a Google Drive resumable
 * upload session URI that OUR SERVER started? (CORS — section 4a.) The answer
 * picks the upload path: Option D (browser → Drive) if yes, Option A
 * (browser shrinks, POSTs to our server) if no.
 *
 * Not part of the app. No dependencies. Runs its own tiny server on the
 * origin of GOOGLE_DRIVE_OAUTH_REDIRECT_URI (http://localhost:3000), which is
 * the one registered with Google. Stop anything else on that port first.
 *
 *   node scripts/spike-drive-cors.mjs
 *
 * Then open http://localhost:3000, connect a TEST Google account, and press
 * "Run all tests". Every file it creates in Drive is deleted again at the end
 * of each test. The access token lives only in this process's memory; it is
 * never written to disk, logged, or sent to the browser.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

// --- env (.env.local, parsed here so the spike needs no dotenv) -----------
function loadEnvLocal() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
      }
    }
  } catch {
    // No .env.local: fall through to the missing-vars check below.
  }
}
loadEnvLocal();

const REQUIRED = [
  "GOOGLE_DRIVE_OAUTH_CLIENT_ID",
  "GOOGLE_DRIVE_OAUTH_CLIENT_SECRET",
  "GOOGLE_DRIVE_OAUTH_REDIRECT_URI",
];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing in .env.local: ${missing.join(", ")}`);
  process.exit(1);
}
const CLIENT_ID = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI;
const redirect = new URL(REDIRECT_URI);
if (redirect.hostname !== "localhost") {
  console.error(
    "GOOGLE_DRIVE_OAUTH_REDIRECT_URI must be a localhost URL for this spike.",
  );
  process.exit(1);
}
const ORIGIN = redirect.origin;
const PORT = Number(redirect.port || 80);
const SCOPE = "https://www.googleapis.com/auth/drive.file";

// --- in-memory state ------------------------------------------------------
let accessToken = null;
let oauthState = null;
const createdFileIds = new Set();

const log = (event, data = {}) =>
  console.log(JSON.stringify({ spike: "drive-cors", event, ...data }));

// --- Google calls (server side only) ---------------------------------------
async function exchangeCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token)
    throw new Error(`token exchange failed: ${res.status} ${json.error ?? ""}`);
  return json.access_token;
}

/** Starts a resumable session. `withOrigin` is the variable under test. */
async function startSession({ name, size, type, withOrigin, reservation }) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": type,
    "X-Upload-Content-Length": String(size),
  };
  if (withOrigin) headers.Origin = ORIGIN;
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name,
        mimeType: type,
        appProperties: {
          kakinotes_stage: "raw",
          kakinotes_reservation: reservation,
          kakinotes_spike: "1",
        },
      }),
    },
  );
  const location = res.headers.get("location");
  if (!res.ok || !location)
    throw new Error(`session start failed: ${res.status} ${await res.text()}`);
  return location;
}

/** What the real finalize step would do: never trust the browser's file id. */
async function verifyFile(fileId, reservation) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,size,appProperties`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) return { ok: false, reason: `metadata ${res.status}` };
  const meta = await res.json();
  const ok =
    meta.appProperties?.kakinotes_reservation === reservation &&
    meta.appProperties?.kakinotes_stage === "raw";
  return { ok, size: Number(meta.size), appProperties: meta.appProperties };
}

async function deleteFile(fileId) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (res.ok || res.status === 404) createdFileIds.delete(fileId);
  return res.status;
}

// --- HTTP ----------------------------------------------------------------
async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return JSON.parse(body || "{}");
}
function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN);
  try {
    if (req.method === "GET" && url.pathname === "/") {
      return send(
        res,
        200,
        page(Boolean(accessToken)),
        "text/html; charset=utf-8",
      );
    }
    if (req.method === "GET" && url.pathname === "/connect") {
      oauthState = randomBytes(16).toString("hex");
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.search = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: "code",
        scope: SCOPE,
        state: oauthState,
        prompt: "consent",
      }).toString();
      res.writeHead(302, { Location: auth.toString() });
      return res.end();
    }
    if (req.method === "GET" && url.pathname === redirect.pathname) {
      const state = url.searchParams.get("state");
      if (!oauthState || state !== oauthState)
        return send(res, 400, "State mismatch. Start again.", "text/plain");
      oauthState = null;
      if (url.searchParams.get("error")) {
        log("oauth_denied", { error: url.searchParams.get("error") });
        return send(
          res,
          200,
          "You said no, so nothing was connected. Close this tab.",
          "text/plain",
        );
      }
      accessToken = await exchangeCode(url.searchParams.get("code"));
      log("oauth_connected");
      res.writeHead(302, { Location: "/" });
      return res.end();
    }
    if (!accessToken) return send(res, 401, { error: "not connected" });

    if (req.method === "POST" && url.pathname === "/session") {
      const { name, size, type, withOrigin } = await readJson(req);
      const reservation = randomBytes(8).toString("hex");
      const sessionUri = await startSession({
        name,
        size,
        type,
        withOrigin,
        reservation,
      });
      return send(res, 200, { sessionUri, reservation });
    }
    if (req.method === "POST" && url.pathname === "/finalize") {
      const { fileId, reservation, forge } = await readJson(req);
      if (fileId) createdFileIds.add(fileId);
      const result = await verifyFile(
        fileId,
        forge ? "not-the-real-reservation" : reservation,
      );
      const deleted = fileId ? await deleteFile(fileId) : null;
      return send(res, 200, { ...result, deleteStatus: deleted });
    }
    if (req.method === "POST" && url.pathname === "/result") {
      log("result", await readJson(req));
      return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: "not found" });
  } catch (err) {
    log("error", { message: String(err.message ?? err) });
    return send(res, 500, { error: String(err.message ?? err) });
  }
});

async function shutdown() {
  if (accessToken && createdFileIds.size) {
    log("cleanup_on_exit", { files: createdFileIds.size });
    for (const id of [...createdFileIds]) await deleteFile(id).catch(() => {});
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, "localhost", () => {
  log("listening", { url: ORIGIN });
});

// --- the page ---------------------------------------------------------------
function page(connected) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Drive CORS spike</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:0 auto;padding:16px;background:#fff;color:#111}
  button,a.btn{font:inherit;padding:.5rem 1rem;border:1px solid #333;border-radius:6px;background:#f4f4f4;color:#111;text-decoration:none;cursor:pointer}
  li{margin:.5rem 0} .pass{color:#0a6b2d} .fail{color:#a40e26} code{background:#f0f0f0;padding:0 .25rem}
</style></head><body>
<h1>Drive CORS spike</h1>
<p>Can a browser upload straight to a Drive upload session our server started?</p>
${
  connected
    ? `<p>Connected. Use a <strong>test</strong> account only.</p>
<p><label>Optional real photo: <input type="file" id="file" accept="image/*"></label></p>
<p><button id="run">Run all tests</button></p>
<ol id="out" aria-live="polite"></ol>`
    : `<p><a class="btn" href="/connect">Connect a test Google account</a></p>`
}
<script>
const out = document.getElementById("out");
const add = (ok, text) => { const li = document.createElement("li"); li.className = ok ? "pass" : "fail"; li.textContent = (ok ? "PASS  " : "FAIL  ") + text; out.append(li); };
const post = (path, body) => fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json());
const sixMb = () => { const b = new Uint8Array(6 * 1024 * 1024); for (let i = 0; i < b.length; i += 65536) crypto.getRandomValues(b.subarray(i, i + 65536)); return new Blob([b], { type: "application/octet-stream" }); };

async function uploadTest(label, blob, { withOrigin = true, chunked = false, forge = false } = {}) {
  const type = blob.type || "application/octet-stream";
  const s = await post("/session", { name: "kakinotes-spike-" + Date.now(), size: blob.size, type, withOrigin });
  if (!s.sessionUri) { add(false, label + ": server could not start a session (" + (s.error || "?") + ")"); return null; }
  let res, fileId = null;
  try {
    if (chunked) {
      const half = 256 * 1024 * Math.floor(blob.size / 2 / (256 * 1024));
      const first = await fetch(s.sessionUri, { method: "PUT", headers: { "Content-Range": "bytes 0-" + (half - 1) + "/" + blob.size }, body: blob.slice(0, half) });
      if (first.status !== 308) throw new Error("first chunk got " + first.status + " not 308");
      res = await fetch(s.sessionUri, { method: "PUT", headers: { "Content-Range": "bytes " + half + "-" + (blob.size - 1) + "/" + blob.size }, body: blob.slice(half) });
    } else {
      res = await fetch(s.sessionUri, { method: "PUT", body: blob });
    }
  } catch (e) {
    add(false, label + ": browser blocked the PUT (" + e.message + ") — this is what a CORS failure looks like");
    await post("/result", { test: label, ok: false, error: String(e.message) });
    return false;
  }
  let readable = false;
  try { const j = await res.json(); fileId = j.id; readable = Boolean(fileId); } catch {}
  const f = await post("/finalize", { fileId, reservation: s.reservation, forge });
  const ok = res.ok && readable && (forge ? f.ok === false : f.ok === true && f.size === blob.size);
  add(ok, label + ": HTTP " + res.status + ", browser could " + (readable ? "" : "NOT ") + "read the file id" + (forge ? ", forged reservation " + (f.ok ? "WAS ACCEPTED (bad)" : "rejected (good)") : ", server verify " + (f.ok ? "ok" : "failed") + ", size " + f.size) + ", cleanup " + f.deleteStatus);
  await post("/result", { test: label, ok, status: res.status, readable, verify: f.ok, deleteStatus: f.deleteStatus });
  return ok;
}

document.getElementById("run")?.addEventListener("click", async (ev) => {
  ev.target.disabled = true; out.textContent = "";
  const big = sixMb();
  await uploadTest("1. 6 MB single PUT, session started WITH Origin", big);
  await uploadTest("2. 6 MB single PUT, session started WITHOUT Origin", big, { withOrigin: false });
  await uploadTest("3. 6 MB in two chunks (resumable), WITH Origin", big, { chunked: true });
  await uploadTest("4. Forged reservation is rejected by the server check", big, { forge: true });
  const picked = document.getElementById("file").files[0];
  if (picked) await uploadTest("5. Your photo (" + picked.type + ", " + picked.size + " bytes), WITH Origin", picked);
  add(true, "Done. Results are also in the terminal.");
  ev.target.disabled = false;
});
</script></body></html>`;
}
