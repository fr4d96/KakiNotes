import Link from "next/link";
import { useTranslations } from "next-intl";

// Renders inside the root layout (where the skip link lives), so it needs
// its own #main-content target.
export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <main
      id="main-content"
      className="mx-auto max-w-5xl px-4 py-16 text-center"
    >
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("notFoundTitle")}
      </h1>
      <p className="mt-4 text-muted-foreground">{t("notFoundBody")}</p>
      <Link href="/" className="mt-6 inline-block underline">
        {t("goHome")}
      </Link>
    </main>
  );
}
