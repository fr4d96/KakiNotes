"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signInAction, type AuthFormState } from "@/app/(auth)/actions";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

const initialState: AuthFormState = {};

export function SignInForm({ next }: { next: string }) {
  const t = useTranslations("auth.signIn");
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialState,
  );

  return (
    <div className="mt-8">
      <form action={formAction} className="space-y-5" noValidate>
        <input type="hidden" name="next" value={next} />

        <div>
          <label htmlFor="identifier" className="block text-sm font-medium">
            {t("identifierLabel")}
          </label>
          {/*
            type="text", not type="email" — the browser's built-in email
            validation would reject a perfectly valid username before the
            form ever submits. autoComplete="username" is correct for both
            shapes: it is the standard token for "the account identifier",
            not for "a username specifically", and password managers fill
            a saved email into it happily.
          */}
          <input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            required
            className="mt-1 w-full rounded-md border border-border-subtle px-3 py-2"
          />
          <p className="mt-1 text-xs text-foreground/55">
            {t("identifierHint")}
          </p>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
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
          <Link href="/forgot-password" className="hover:underline">
            {t("forgotPassword")}
          </Link>
        </p>
        <p className="text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href="/sign-up" className="hover:underline">
            {t("signUpLink")}
          </Link>
        </p>
      </form>

      <GoogleSignInButton next={next} />
    </div>
  );
}
