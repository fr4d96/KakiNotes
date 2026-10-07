import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getDriveEnv, isDriveConfigured } from "@/lib/env.server";
import { DRIVE_OAUTH_STATE_COOKIE, statesMatch } from "@/lib/drive/oauth-state";
import { saveDriveConnection } from "@/lib/drive/token-store";
import { driveCallbackQuerySchema } from "@/lib/validation/drive";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
// Reachable with the drive.file scope alone -- see connect/route.ts's
// comment. Returns only the fields we ask for.
const ABOUT_ENDPOINT =
  "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)";

function redirectToAccount(request: NextRequest, status: string) {
  const url = new URL(`/account?drive=${status}#drive`, request.url);
  const response = NextResponse.redirect(url);
  // Single-use: cleared whether the state check passed or failed.
  response.cookies.delete({
    name: DRIVE_OAUTH_STATE_COOKIE,
    path: "/account/drive",
  });
  return response;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  error?: string;
};

type AboutResponse = {
  user?: { emailAddress?: string; permissionId?: string };
};

/**
 * Finishes the Google Drive connect flow
 * (docs/google-drive-integration.md section 2). Re-derives the signed-in
 * user server-side (Rule 2) -- never trusts anything about identity from
 * the query string, which is entirely attacker-controlled input from a
 * redirect.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (!isDriveConfigured()) {
    return redirectToAccount(request, "unavailable");
  }

  const { searchParams } = new URL(request.url);
  const parsedQuery = driveCallbackQuerySchema.safeParse({
    code: searchParams.get("code") ?? undefined,
    state: searchParams.get("state") ?? undefined,
    error: searchParams.get("error") ?? undefined,
  });

  if (!parsedQuery.success) {
    return redirectToAccount(request, "failed");
  }
  const { code, state, error: oauthError } = parsedQuery.data;

  // 1. CSRF check first, before anything else -- including before looking
  // at `error`, so a forged callback can't skip the state check by
  // claiming access_denied.
  const cookieState = request.cookies.get(DRIVE_OAUTH_STATE_COOKIE)?.value;
  if (!cookieState || !state || !statesMatch(cookieState, state)) {
    return redirectToAccount(request, "failed");
  }

  // 2. The user said no. Nothing is written to the database.
  if (oauthError) {
    return redirectToAccount(request, "cancelled");
  }

  if (!code) {
    return redirectToAccount(request, "failed");
  }

  const driveEnv = getDriveEnv();

  let tokenJson: TokenResponse;
  try {
    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: driveEnv.GOOGLE_DRIVE_OAUTH_CLIENT_ID,
        client_secret: driveEnv.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET,
        redirect_uri: driveEnv.GOOGLE_DRIVE_OAUTH_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    tokenJson = (await tokenResponse.json()) as TokenResponse;
    if (!tokenResponse.ok) {
      // Never log tokenJson -- it may carry a partial/short-lived token on
      // some error shapes. Log only the fact of failure.
      console.error("Drive token exchange failed", {
        status: tokenResponse.status,
      });
      return redirectToAccount(request, "failed");
    }
  } catch (err) {
    console.error("Drive token exchange request failed", err);
    return redirectToAccount(request, "failed");
  }

  if (!tokenJson.refresh_token || !tokenJson.access_token) {
    // No refresh_token usually means the contributor had already granted
    // this app access before and Google silently re-authorized without
    // prompting -- connect/route.ts's prompt=consent is meant to prevent
    // this, but fail safe anyway rather than storing a connection we can
    // never refresh.
    return redirectToAccount(request, "failed");
  }

  let googleAccountEmail: string | null = null;
  let googleAccountSub: string | null = null;
  try {
    const aboutResponse = await fetch(ABOUT_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (aboutResponse.ok) {
      const aboutJson = (await aboutResponse.json()) as AboutResponse;
      googleAccountEmail = aboutJson.user?.emailAddress ?? null;
      googleAccountSub = aboutJson.user?.permissionId ?? null;
    } else {
      // Not fatal: the connection is still useful without a display email.
      // DEVIATION TO REPORT: if this endpoint turns out not to be reachable
      // with drive.file alone in practice, this silently stores no email
      // rather than widening the OAuth scope to get one -- per the task
      // instructions, that is the intended fallback, not a bug.
      console.error("Drive about.get failed", { status: aboutResponse.status });
    }
  } catch (err) {
    console.error("Drive about.get request failed", err);
  }

  try {
    await saveDriveConnection({
      userId: user.id,
      refreshToken: tokenJson.refresh_token,
      googleAccountEmail,
      googleAccountSub,
    });
  } catch (err) {
    // token-store's error messages never include token values.
    console.error("Drive connection save failed", err);
    return redirectToAccount(request, "failed");
  }

  return redirectToAccount(request, "connected");
}
