"use client";

import { useTranslations } from "next-intl";

// Renders inside the root layout (where the skip link lives), so it needs
// its own #main-content target. Never renders error.message — that could
// leak internal details; only a generic message plus the error digest (safe,
// meant for support reference) is shown.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  return (
    <main
      id="main-content"
      className="mx-auto max-w-5xl px-4 py-16 text-center"
    >
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("somethingWentWrong")}
      </h1>
      <p className="mt-4 text-muted-foreground">
        {t("tryAgainWithReference", {
          reference: error.digest ?? t("noReference"),
        })}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
      >
        {t("tryAgain")}
      </button>
    </main>
  );
}
