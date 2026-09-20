"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { reopenForEditingAction } from "@/app/(contributor)/stories/[id]/preview/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { EditorialPencilIcon } from "@/components/icons";

/**
 * "Edit anyway" on a story whose current revision is UNDER REVIEW
 * (revision_status "submitted") -- the editor's not-editable screen, the
 * preview page, and My Stories. Sibling of StartRevisionButton, for the one
 * case that one refuses: there IS an in-flight revision, but it is frozen for
 * a moderator, not an editable draft.
 *
 * Unlike the plain Edit link on a live draft, this one MAKES something:
 * reopen_submission_for_editing() withdraws the submitted revision -- it
 * leaves the moderation queue for good, frozen as `withdrawn` -- and copies
 * it into a brand-new draft, atomically. So it asks first, and the question
 * says the thing a contributor actually needs to know before answering it:
 * nothing they wrote is lost, but the story leaves the review queue and has
 * to be sent back in when they're done. A published story stays published
 * throughout (Engineering Rule 11) -- the isPublished variant says so.
 */
export function ReopenForEditingButton({
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
  const t = useTranslations("reopenForEditing");
  const [reopening, setReopening] = useState(false);

  async function handleConfirm() {
    setReopening(true);
    const result = await reopenForEditingAction(storyId);
    if (result.ok) {
      // Deliberately no setReopening(false) on the happy path: the dialog
      // stays busy until the reopened draft's editor takes over the screen,
      // so a slow navigation can't be confirmed twice -- and a second call
      // would fail anyway (the revision is no longer `submitted`), which is
      // a confusing way to find out you already succeeded.
      router.push(`/stories/${storyId}/edit`);
      return;
    }
    setReopening(false);
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
        pending={reopening}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
