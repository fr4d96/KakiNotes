"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signUpAction, type AuthFormState } from "@/app/(auth)/actions";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

const initialState: AuthFormState = {};

export function SignUpForm() {
  const t = useTranslations("auth.signUp");
  const [state, formAction, pending] = useActionState(
    signUpAction,
    initialState,
  );

  if (state.success) {
    return (
      <p role="status" className="mt-8 text-sm text-muted-foreground">
        {state.success}
      </p>
    );
  }

  return (
    <div className="mt-8">
      <form action={formAction} className="space-y-5" noValidate>
        <div>
          <label htmlFor="displayName" className="block text-sm font-medium">
            {t("displayNameLabel")}
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            autoComplete="name"
            maxLength={120}
            className="mt-1 w-full rounded-md border border-border-subtle px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            {t("emailLabel")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-1 w-full rounded-md border border-border-subtle px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            className="mt-1 w-full rounded-md border border-border-subtle px-3 py-2"
          />
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-accent px-3 py-2 text-accent-foreground hover:opacity-90 disabled:opacity-60"
        >
          {pending ? t("submitting") : t("submit")}
        </button>

        <p className="text-sm text-muted-foreground">
          {t("haveAccount")}{" "}
          <Link href="/sign-in" className="hover:underline">
            {t("signInLink")}
          </Link>
        </p>
      </form>

      <GoogleSignInButton next="/account" />
    </div>
  );
}
