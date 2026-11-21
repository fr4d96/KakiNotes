import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { isDriveConfigured } from "@/lib/env.server";
import { getMyDriveConnectionStatus } from "@/lib/drive/connection-status";
import { listMyPhotos } from "@/lib/story/my-photos";
import {
  COUNTRY_COOKIE,
  DEFAULT_COUNTRY_SLUG,
  countryFromCookieValue,
} from "@/lib/story/countries";
import { MyPhotosView } from "./my-photos-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("myPhotos");
  return { title: t("metaTitle") };
}

/**
 * My Photos (docs/google-drive-integration.md section 7). Signed-in only:
 * the (contributor) layout and proxy.ts gate the route, and
 * list_my_photos() returns only the caller's own photos.
 *
 * Only the photos of stories in the country chosen in the top bar (the
 * kakinotes-country cookie, New Zealand when none), like My Stories and
 * Story folders. A preference only -- it narrows the caller's own photos and
 * never widens what the RPC returns (Engineering Rule 2).
 */
export default async function MyPhotosPage() {
  const countrySlug =
    countryFromCookieValue((await cookies()).get(COUNTRY_COOKIE)?.value) ??
    DEFAULT_COUNTRY_SLUG;
  const driveConnected = isDriveConfigured()
    ? (await getMyDriveConnectionStatus()).connected
    : false;
  const stories = await listMyPhotos({ driveConnected, countrySlug });
  return <MyPhotosView stories={stories} driveConnected={driveConnected} />;
}
