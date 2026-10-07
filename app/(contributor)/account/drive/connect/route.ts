import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getDriveEnv, isDriveConfigured } from "@/lib/env.server";
import {
  DRIVE_OAUTH_STATE_COOKIE,
  generateOAuthState,
} from "@/lib/drive/oauth-state";

/**
 * Starts the Google Drive connect flow (docs/google-drive-integration.md
 * section 2). proxy.ts already redirects a signed-out visitor away from
 * every /account/* path before this runs, but Engineering Rule 2 means
 * this handler re-derives the caller itself rather than trusting that --
 * belt and braces, same as every other (contributor) route.
 *
 * Only the narrow `drive.file` scope is requested (never the broad
 * `drive` scope -- see the design doc for why). `access_type=offline` +
 * `prompt=consent` are both required to guarantee Google actually returns
 * a refresh_token: without `prompt=consent`, a contributor who has
 * already granted this app any scope before gets silently re-authorized
 * with no refresh_token in the response at all.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (!isDriveConfigured()) {
    return NextResponse.redirect(
      new URL("/account?drive=unavailable#drive", request.url),
    );
  }

  const driveEnv = getDriveEnv();
  const state = generateOAuthState();

  const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizeUrl.searchParams.set(
    "client_id",
    driveEnv.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
  );
  // Explicit from env, never derived from the request's Host header --
  // otherwise a spoofed Host could redirect the OAuth flow elsewhere.
  authorizeUrl.searchParams.set(
    "redirect_uri",
    driveEnv.GOOGLE_DRIVE_OAUTH_REDIRECT_URI,
  );
  authorizeUrl.searchParams.set("response_type", "code");
  // drive.file ONLY -- see docs/google-drive-integration.md section 2 for
  // why the broader `drive` scope is never requested. The display email
  // shown in the UI is fetched later, in callback/route.ts, from Drive's
  // own `about` endpoint, which the Drive API reference lists as reachable
  // with this exact scope -- no userinfo/email scope needed.
  authorizeUrl.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/drive.file",
  );
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("prompt", "consent");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(DRIVE_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/account/drive",
    maxAge: 60 * 10, // 10 minutes -- long enough for a slow consent screen.
  });
  return response;
}
