import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { isDriveConfigured } from "@/lib/env.server";
import { getMyDriveConnectionStatus } from "@/lib/drive/connection-status";
import { listMyPhotos } from "@/lib/story/my-photos";
import { MyPhotosView } from "./my-photos-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("myPhotos");
  return { title: t("metaTitle") };
}

/**
 * My Photos (docs/google-drive-integration.md section 7). Signed-in only:
 * the (contributor) layout and proxy.ts gate the route, and
 * list_my_photos() returns only the caller's own photos.
 */
export default async function MyPhotosPage() {
  const driveConnected = isDriveConfigured()
    ? (await getMyDriveConnectionStatus()).connected
    : false;
  const stories = await listMyPhotos({ driveConnected });
  return <MyPhotosView stories={stories} driveConnected={driveConnected} />;
}
