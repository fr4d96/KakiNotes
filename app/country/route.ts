import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  COUNTRY_COOKIE,
  COUNTRY_COOKIE_MAX_AGE,
  COUNTRY_SLUGS,
  countryUrlPrefix,
} from "@/lib/story/countries";

const countrySchema = z.enum(COUNTRY_SLUGS);
const SETTINGS_PATH = "/settings";
// The signed-in "You" page (app/(contributor)/account) has the same picker.
const ACCOUNT_PATH = "/account";
const RETURN_PATHS: readonly string[] = [SETTINGS_PATH, ACCOUNT_PATH];

/**
 * POST /country -- remember the reader's country on this device and open
 * that country's home page. A plain form post (the first-visit picker, the
 * desktop header's flag switcher and the profile page's Country list all
 * use one), so it works before any JavaScript has loaded. The profile page
 * sends `return=/settings` to stay where it is; that one path is the only
 * other destination accepted, so this can never redirect off-site.
 *
 * Only a preference: the cookie picks where Kakinotes opens and which
 * country the tabs link to. It is never used to decide access or what a
 * query may return, so a forged post can do no more than change the
 * sender's own starting page. Anything that isn't one of our countries is
 * ignored and lands on the default home, with no cookie written.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData().catch(() => null);
  const parsed = countrySchema.safeParse(form?.get("country"));
  if (!parsed.success) {
    return NextResponse.redirect(new URL("/", request.url), 303);
  }
  const home = countryUrlPrefix(parsed.data) || "/";
  const requested = form?.get("return");
  // Only these fixed in-app paths are accepted, so this can never redirect
  // off-site: anything else lands on the country's home.
  const destination =
    typeof requested === "string" && RETURN_PATHS.includes(requested)
      ? requested
      : home;
  const response = NextResponse.redirect(
    new URL(destination, request.url),
    303,
  );
  response.cookies.set(COUNTRY_COOKIE, parsed.data, {
    path: "/",
    sameSite: "lax",
    maxAge: COUNTRY_COOKIE_MAX_AGE,
  });
  return response;
}
