import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The OAuth CSRF `state` cookie shared by connect/route.ts and
 * callback/route.ts (docs/google-drive-integration.md section 2). No
 * secret lives here -- it is a short-lived, single-use, random value that
 * only has to survive one redirect round trip -- so this file carries no
 * import restriction, unlike lib/drive/token-store.ts.
 */
export const DRIVE_OAUTH_STATE_COOKIE = "drive_oauth_state";

/** 32 random bytes, base64url-encoded -- unguessable, URL-safe. */
export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Constant-time comparison so a mismatched state can't be distinguished by
 * timing. Different lengths are never a match (and never fed to
 * timingSafeEqual, which throws on a length mismatch).
 */
export function statesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
