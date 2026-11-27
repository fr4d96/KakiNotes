"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/**
 * This story | Total Trip Cost, above a main story's cost breakdown.
 *
 * Both panels arrive already rendered by the server (PublicExpenses); this
 * only decides which one is visible, so the arithmetic and the donut stay
 * Server Components and nothing is fetched on tap. Same sliding-pill look as
 * the Stories tab's card size switch (card-size-switch.tsx).
 */
export type ExpenseScope = "story" | "family";

export function ExpenseScopeSwitch({
  thisStory,
  withSubStories,
  initialScope = "story",
}: {
  thisStory: ReactNode;
  withSubStories: ReactNode;
  initialScope?: ExpenseScope;
}) {
  const t = useTranslations("story.expenses");
  const [scope, setScope] = useState<ExpenseScope>(initialScope);
  const baseId = useId();
  const panelIds = {
    story: `${baseId}-story`,
    family: `${baseId}-family`,
  } as const;

  return (
    <>
      <div
        role="group"
        aria-label={t("scopeLabel")}
        className="relative isolate mt-3 inline-grid grid-cols-2 rounded-full border border-border-subtle p-0.5"
      >
        <span
          aria-hidden="true"
          className={`absolute inset-y-0.5 left-0.5 -z-10 w-[calc(50%-0.125rem)] rounded-full bg-surface-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${
            scope === "family" ? "translate-x-full" : "translate-x-0"
          }`}
        />
        {(
          [
            ["story", t("scopeThisStory")],
            ["family", t("scopeWithSubStories")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setScope(value)}
            aria-pressed={scope === value}
            aria-controls={panelIds[value]}
            // Two equal grid columns (each as wide as the longer label), so the
            // pill slides exactly one button's width in either language.
            className={`press relative min-h-9 whitespace-nowrap rounded-full px-3.5 text-sm font-medium after:absolute after:-inset-1 after:content-[''] ${
              scope === value
                ? "text-foreground"
                : "text-foreground/60 hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div id={panelIds.story} hidden={scope !== "story"}>
        {thisStory}
      </div>
      <div id={panelIds.family} hidden={scope !== "family"}>
        {withSubStories}
      </div>
    </>
  );
}
