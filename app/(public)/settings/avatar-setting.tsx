"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { AvatarPicker } from "@/components/account/avatar-picker";
import { setViewerAvatar, useViewerIdentity } from "@/lib/auth/viewer-identity";
import { setAvatarAction } from "./actions";

/**
 * Settings → Profile → Avatar (moved from Account → Contributor identity,
 * 2026-11-18). Only drawn for a signed-in viewer: Settings itself is public,
 * and a signed-out reader has no avatar to choose. Whether it is drawn is
 * display only -- setAvatarAction re-checks the session and RLS decides
 * which row it may touch.
 *
 * Saves on tap, like the theme and language above it. The header avatar
 * changes at once (optimistically, through the shared viewer store) and
 * goes back if the save fails.
 */
export function AvatarSetting() {
  const t = useTranslations("settings");
  const viewer = useViewerIdentity();
  const headingId = useId();
  const [saving, startSaving] = useTransition();
  const [failed, setFailed] = useState(false);

  if (viewer.status !== "signed-in") return null;

  const current = viewer.avatarEmoji ?? "";

  function choose(next: string) {
    const previous = viewer.avatarEmoji;
    setFailed(false);
    setViewerAvatar(next || null);
    startSaving(async () => {
      const result = await setAvatarAction(next);
      if (!result.ok) {
        setViewerAvatar(previous);
        setFailed(true);
      }
    });
  }

  return (
    <section id="avatar" aria-labelledby={headingId} className="scroll-mt-28">
      <h2 className="px-1 text-sm font-bold text-muted-foreground">
        {t("profile")}
      </h2>
      <div className="mt-2 rounded-2xl bg-surface p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border-subtle text-2xl"
          >
            {current || "·"}
          </span>
          <div className="min-w-0">
            <p id={headingId} className="text-base font-bold">
              {t("avatar")}
            </p>
            <p className="text-sm text-muted-foreground">{t("avatarHelp")}</p>
          </div>
        </div>
        <div className="mt-4" aria-busy={saving || undefined}>
          <AvatarPicker
            value={current}
            onChange={choose}
            disabled={saving}
            labelledBy={headingId}
          />
        </div>
        {failed ? (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {t("avatarFailed")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
