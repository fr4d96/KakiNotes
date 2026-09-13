"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startStoryRevisionAction } from "@/app/(contributor)/stories/[id]/preview/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { EditorialPencilIcon } from "@/components/icons";

/**
 * "Edit" on a story with nothing in flight — a published story the
 * contributor wants to correct, or one a moderator sent back asking for
 * changes. Used from My Stories (icon) and from the private preview page
 * (labelled button).
 *
 * Unlike the plain Edit link on a live draft, this one MAKES something:
 * create_next_draft_revision() copies the published (or last sent-back)
 * revision into a brand new draft. So it asks first, and the question says
 * the thing a contributor actually needs to know before answering it — the
 * version readers can see right now stays up, untouched, until a moderator
 * approves the replacement (Engineering Rule 11; the lifecycle functions
 * enforce it, this copy just explains it).
 */
export function StartRevisionButton({
  storyId,
  storyTitle,
  isPublished,
  variant = "button",
  className,
}: {
  storyId: string;
  storyTitle: string;
  /** Published stories get the "your live story stays live" reassurance. */
  isPublished: boolean;
  variant?: "icon" | "button";
  className?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const t = useTranslations("startRevision");
  const [starting, setStarting] = useState(false);

  async function handleConfirm() {
    setStarting(true);
    const result = await startStoryRevisionAction(storyId);
    if (result.ok) {
      // Deliberately no setStarting(false) on the happy path: the dialog
      // stays busy until the new draft's editor takes over the screen, so a
      // slow navigation can't be confirmed twice — and a second call would
      // fail anyway ("already has an active draft"), which is a confusing
      // way to find out you already succeeded.
      router.push(`/stories/${storyId}/edit`);
      return;
    }
    setStarting(false);
    setConfirmOpen(false);
    showToast(result.error, "error");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        title={t("editTitle", { title: storyTitle })}
        aria-label={
          variant === "icon" ? t("editTitle", { title: storyTitle }) : undefined
        }
        className={className}
      >
        <EditorialPencilIcon className="h-4 w-4" aria-hidden="true" />
        {variant === "button" && <span>{t("edit")}</span>}
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title={isPublished ? t("publishedTitle") : t("draftTitle")}
        description={
          isPublished
            ? t("publishedBody", { title: storyTitle })
            : t("draftBody", { title: storyTitle })
        }
        confirmLabel={t("confirm")}
        pending={starting}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
