"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import {
  disconnectDriveAction,
  type DriveFormState,
} from "@/app/(contributor)/account/drive/actions";

export type DriveResultStatus =
  "connected" | "cancelled" | "failed" | "unavailable" | null;

export type DriveConnectionSummary = {
  connected: boolean;
  googleAccountEmail: string | null;
  connectedAt: string | null;
};

const initialState: DriveFormState = {};

/**
 * The "Google Drive" account tab (docs/google-drive-integration.md
 * section 11, slice 1). Four states: not configured on this deployment,
 * not connected, connected, and the one-time result banner from a just-
 * completed connect attempt (driven by /account?drive=<status>, read by
 * the Server Component page and passed in as `resultStatus`).
 *
 * No image ever touches Drive in this slice -- the explanation text below
 * says so explicitly, since "Connect Google Drive" could otherwise read
 * as "my existing photos are moving."
 */
export function DriveTab({
  configured,
  connection,
  resultStatus,
}: {
  configured: boolean;
  connection: DriveConnectionSummary;
  resultStatus: DriveResultStatus;
}) {
  const t = useTranslations("account.drive");
  const [confirmed, setConfirmed] = useState(false);
  const [state, formAction, pending] = useActionState(
    disconnectDriveAction,
    initialState,
  );

  if (!configured) {
    return (
      <div className="mt-4">
        <p role="status" className="text-sm text-foreground/65">
          {t("notAvailableHere")}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {resultStatus === "connected" && !state.success && (
        <p role="status" className="text-sm text-fern">
          {t("banners.connected")}
        </p>
      )}
      {resultStatus === "cancelled" && (
        <p role="status" className="text-sm text-foreground/65">
          {t("banners.cancelled")}
        </p>
      )}
      {resultStatus === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          {t("banners.failed")}
        </p>
      )}

      {!connection.connected ? (
        <div className="space-y-3">
          <p className="text-sm text-foreground/65">
            {t("notConnectedExplainer")}
          </p>
          <a
            href="/account/drive/connect"
            className="journiq-button inline-block bg-accent text-sm text-accent-foreground"
          >
            {t("connect")}
          </a>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-md border border-border-subtle bg-surface-muted p-4 text-sm">
            <p className="font-medium">{t("connectedTitle")}</p>
            {connection.googleAccountEmail && (
              <p className="mt-1 text-foreground/70">
                {t("connectedAs", { email: connection.googleAccountEmail })}
              </p>
            )}
            {connection.connectedAt && (
              <p className="mt-1 text-foreground/55">
                {t("connectedSince", {
                  date: new Date(connection.connectedAt).toLocaleDateString(),
                })}
              </p>
            )}
          </div>

          <form action={formAction} className="space-y-3" noValidate>
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">
                {t("warningTitle")}
              </p>
              <p className="mt-1 text-foreground/70">{t("warningBody")}</p>
              <label className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  name="confirmed"
                  value="true"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5"
                  aria-describedby="drive-disconnect-warning"
                />
                <span id="drive-disconnect-warning">{t("confirmLabel")}</span>
              </label>
            </div>

            {state.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
            {state.success && (
              <p role="status" className="text-sm text-fern">
                {state.success}
              </p>
            )}

            <button
              type="submit"
              disabled={pending || !confirmed}
              className="journiq-button bg-destructive text-sm text-destructive-foreground disabled:opacity-60"
            >
              {pending ? t("disconnecting") : t("disconnect")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
