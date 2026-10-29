"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { isDriveConfigured } from "@/lib/env.server";
import {
  deleteDriveConnection,
  readDriveConnection,
} from "@/lib/drive/token-store";
import { disconnectDriveSchema } from "@/lib/validation/drive";
import { firstIssueMessage } from "@/lib/validation/issue-messages";

export type DriveFormState = {
  error?: string;
  success?: string;
};

const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

/**
 * Disconnects Google Drive for the signed-in caller
 * (docs/google-drive-integration.md section 8). `confirmed` only arrives
 * as `"true"` when the UI's warning checkbox was ticked -- the form
 * literally does not include the field otherwise, and
 * disconnectDriveSchema rejects anything else, so a replayed/forged
 * request without that field never reaches the revoke/delete steps.
 *
 * user_id is taken from the server-known session, never from the form
 * (Engineering Rule 2).
 */
export async function disconnectDriveAction(
  _prevState: DriveFormState,
  formData: FormData,
): Promise<DriveFormState> {
  const [t, tv, tCommon] = await Promise.all([
    getTranslations("account.drive"),
    getTranslations("validation"),
    getTranslations("common"),
  ]);

  const user = await getCurrentUser();
  if (!user) {
    return { error: tCommon("mustBeSignedIn") };
  }

  if (!isDriveConfigured()) {
    return { error: t("errors.notAvailable") };
  }

  const parsed = disconnectDriveSchema.safeParse({
    confirmed: formData.get("confirmed"),
  });
  if (!parsed.success) {
    return {
      error: firstIssueMessage(parsed.error, tv, "common.invalidInput"),
    };
  }

  // Best-effort revoke at Google -- a failure here still deletes the local
  // row (the contributor asked to disconnect; we never leave a token
  // sitting that this app can no longer use anyway), but the failure is
  // logged (never the token value) rather than silently swallowed.
  try {
    const existing = await readDriveConnection(user.id);
    if (existing) {
      const revokeResponse = await fetch(REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: existing.refreshToken }),
      });
      if (!revokeResponse.ok) {
        console.error("Drive token revoke failed", {
          status: revokeResponse.status,
        });
      }
    }
  } catch (err) {
    console.error("Drive token revoke request failed", err);
  }

  await deleteDriveConnection(user.id);

  revalidatePath("/account");
  return { success: t("disconnected") };
}
