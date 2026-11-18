"use client";

import { useTranslations } from "next-intl";
import { AVATAR_EMOJI_OPTIONS } from "@/lib/avatar";

/**
 * The emoji avatar chooser: the fixed set from lib/avatar.ts as a grid of
 * round buttons. Controlled -- the caller owns the value and decides what a
 * pick does. Settings (app/(public)/settings/avatar-setting.tsx) saves on
 * tap, like the rest of that page; it used to sit inside Account's
 * contributor form as a hidden form field.
 *
 * Tapping the chosen avatar again clears it (`""`), which the hint says.
 * aria-pressed per button rather than a radiogroup because "none" is a
 * valid state reached by un-pressing, not an option of its own.
 */
export function AvatarPicker({
  value,
  onChange,
  disabled = false,
  labelledBy,
}: {
  /** The chosen emoji, or "" for none. */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** Id of the visible heading that names the picker. */
  labelledBy?: string;
}) {
  const t = useTranslations("account.avatar");

  return (
    <div>
      <div
        role="group"
        aria-labelledby={labelledBy}
        className="grid grid-cols-6 gap-2 sm:grid-cols-8"
      >
        {AVATAR_EMOJI_OPTIONS.map((emoji) => {
          const selected = value === emoji;
          return (
            <button
              key={emoji}
              type="button"
              disabled={disabled}
              onClick={() => onChange(selected ? "" : emoji)}
              aria-pressed={selected}
              aria-label={t("use", { emoji })}
              className={`press flex aspect-square min-h-11 items-center justify-center rounded-full border text-xl transition-colors disabled:opacity-60 ${
                selected
                  ? "border-accent bg-accent/15"
                  : "border-border-subtle hover:bg-surface-muted"
              }`}
            >
              {emoji}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {value ? t("tapToRemove") : t("defaultHint")}
      </p>
    </div>
  );
}
