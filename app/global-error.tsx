"use client";

// Replaces the ENTIRE root layout when the root layout itself throws, so it
// must render its own <html>/<body> — the root layout's skip link and shell
// are not present here. Never renders error.message.
//
// DELIBERATELY NOT TRANSLATED, and lang stays "en". NextIntlClientProvider
// is rendered BY the root layout, so it is gone here too: useTranslations()
// would throw inside the error boundary that exists to catch a throw. And
// the root layout is where the locale is read at all (getLocale() ->
// i18n/request.ts), so a failure in that very code path is one of the
// things this file has to survive. Six words of English in the last-resort
// fallback is the right trade against a blank screen. See
// docs/implementation-status.md (2026-09-14).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main
          id="main-content"
          style={{
            maxWidth: 640,
            margin: "4rem auto",
            padding: "0 1rem",
            textAlign: "center",
          }}
        >
          <h1>Something went wrong</h1>
          <p>
            Please try again. If this keeps happening, contact us and mention
            this reference: {error.digest ?? "n/a"}.
          </p>
          <button type="button" onClick={() => reset()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
