"use client";

import { useTranslations } from "next-intl";
import { signOutAction } from "@/app/(auth)/actions";

export function SignOutButton() {
  const t = useTranslations("nav");
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="journiq-button border border-border-subtle text-sm"
      >
        {t("signOut")}
      </button>
    </form>
  );
}
