"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CardsBigIcon, CardsSmallIcon } from "@/components/icons";
import { saveCardSize, type CardSize } from "@/lib/story/card-size";

/**
 * Big cards | small cards, on the Stories tab. Saves the choice in a cookie
 * (lib/story/card-size.ts) and refreshes the server-rendered list, so the
 * cards themselves stay Server Components. The pill moves at once; the
 * cards follow when the refreshed list arrives. Same sliding-pill look as
 * My Stories' grid | list switch.
 */
export function CardSizeSwitch({ size }: { size: CardSize }) {
  const t = useTranslations("stories.cardSize");
  const router = useRouter();
  const [chosen, setChosen] = useState(size);
  const [pending, startTransition] = useTransition();

  function choose(next: CardSize) {
    if (next === chosen) return;
    setChosen(next);
    saveCardSize(next);
    startTransition(() => router.refresh());
  }

  return (
    <div
      role="group"
      aria-label={t("label")}
      aria-busy={pending || undefined}
      className="relative isolate flex shrink-0 rounded-full border border-border-subtle p-0.5"
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0.5 left-0.5 -z-10 w-[calc(50%-0.125rem)] rounded-full bg-surface-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${
          chosen === "small" ? "translate-x-full" : "translate-x-0"
        }`}
      />
      {(
        [
          ["big", t("big"), <CardsBigIcon key="b" className="h-4 w-4" />],
          ["small", t("small"), <CardsSmallIcon key="s" className="h-4 w-4" />],
        ] as const
      ).map(([mode, label, icon]) => (
        <button
          key={mode}
          type="button"
          onClick={() => choose(mode)}
          aria-pressed={chosen === mode}
          aria-label={label}
          title={label}
          className={`press relative flex h-9 w-9 items-center justify-center rounded-full after:absolute after:-inset-1 after:content-[''] ${
            chosen === mode
              ? "text-foreground"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
