import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { resolveSafeReturnTo } from "@/lib/validation/safe-redirect";
import { SignInForm } from "@/components/auth/sign-in-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signIn");
  return { title: t("title") };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  // Deliberately no fallback baked in here: an empty `next` tells
  // signInAction/the OAuth callback "nothing specific was requested," so
  // they can land staff roles on their own dashboard instead of always
  // defaulting to /account (see lib/auth/post-login-redirect.ts). A real
  // `?next=` (e.g. bounced here from a protected page) still always wins.
  const next = params.next ? resolveSafeReturnTo(params.next, "") : "";
  const t = await getTranslations("auth.signIn");

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("title")}
      </h1>
      {params.error === "invalid_link" && (
        <p
          role="alert"
          className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {t("invalidLink")}
        </p>
      )}
      <SignInForm next={next} />
    </div>
  );
}
