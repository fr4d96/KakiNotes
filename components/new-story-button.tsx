"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { authoringMenuItems } from "@/components/auth/user-avatar-menu";
import { PlusIcon } from "@/components/icons";
import { useViewerIdentity } from "@/lib/auth/viewer-identity";

/**
 * The phone header's top-right action once signed in (2026-11-18): a +
 * that starts a new story. It took the avatar's place; the avatar and its
 * menu moved to the Profile tab (components/bottom-tab-bar.tsx). The new
 * story takes its country from the header's flag (newStoryCountry).
 *
 * Shown to the same people the avatar menu offered "New Story" to: staff
 * roles review rather than write, so they get nothing here -- presentation
 * only, /stories/new stays reachable and permitted for them.
 */
export function NewStoryButton({ className = "" }: { className?: string }) {
  const t = useTranslations("nav");
  const { role } = useViewerIdentity();
  if (authoringMenuItems(role).length === 0) return null;
  return (
    <Link
      href="/stories/new"
      aria-label={t("newStory")}
      title={t("newStory")}
      className={`press flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm ${className}`}
    >
      <PlusIcon className="h-6 w-6" strokeWidth={2} />
    </Link>
  );
}
