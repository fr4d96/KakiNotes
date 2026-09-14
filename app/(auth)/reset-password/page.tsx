import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/app/(auth)/reset-password/reset-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.resetPassword");
  return { title: t("metaTitle") };
}

/**
 * Requires the session /auth/callback established from the recovery link.
 * If it's missing (expired/already-used/tampered link), show a friendly
 * state instead of a broken form — never assume the link was valid.
 */
export default async function ResetPasswordPage() {
  const t = await getTranslations("auth.resetPassword");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("expiredTitle")}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">{t("expiredBody")}</p>
        <p className="mt-4 text-sm">
          <Link href="/forgot-password" className="hover:underline">
            {t("requestNew")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("title")}
      </h1>
      <ResetPasswordForm />
    </div>
  );
}
