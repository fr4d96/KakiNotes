import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import {
  getEditableStoryWithDraft,
  getStoryPreview,
  getRevisionSelections,
} from "@/lib/story/contributor-queries";
import {
  listActiveRegions,
  listActiveDestinations,
  listActiveTags,
  listActiveExpenseCategories,
} from "@/lib/story/active-lookups";
import { StoryEditForm } from "@/components/story/story-edit-form";
import { normalizeStoryContentJson } from "@/lib/story/legacy-content";
import { STORY_STEPS, type StoryStepId } from "@/lib/story/steps";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [draft, t] = await Promise.all([
    getEditableStoryWithDraft(id),
    getTranslations("editor"),
  ]);
  return {
    // revision_number === 1 means this story has never been through a
    // submit/changes-requested/resubmit cycle -- same signal the page
    // component uses below for its "New Story" vs "Edit Story" heading, so
    // the browser tab title always agrees with what's on the page.
    title:
      draft && draft.revision_number === 1 ? t("newStory") : t("editStory"),
    robots: { index: false, follow: false },
  };
}

/**
 * `?step=` is how the preview page (step 6 of the same timeline) sends a
 * contributor back to a specific step -- validated against the real step
 * list rather than cast, so a hand-typed value can only ever resolve to a
 * step that exists. "review" is excluded on purpose: it is this page's
 * sibling route, not one of its panes, so asking for it here means the
 * first step, not a blank screen.
 */
function resolveStep(raw: string | undefined): StoryStepId {
  const match = STORY_STEPS.find((s) => s.id === raw && s.id !== "review");
  return match?.id ?? "title";
}

export default async function EditStoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const [{ id }, { step }, t, tStatus] = await Promise.all([
    params,
    searchParams,
    getTranslations("editStory"),
    getTranslations("storyStatus"),
  ]);
  const draft = await getEditableStoryWithDraft(id);
  if (!draft) notFound();

  if (draft.revision_status !== "draft") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("notEditableTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t("notEditableBody", {
            // The revision's own status word, shown through the shared
            // storyStatus messages rather than a de-underscored enum value.
            status: tStatus.has(draft.revision_status as never)
              ? tStatus(draft.revision_status as never)
              : draft.revision_status.replace(/_/g, " "),
          })}
        </p>
        <Link
          href={`/stories/${id}/preview`}
          className="mt-4 inline-block underline underline-offset-2"
        >
          {t("viewPreview")}
        </Link>
      </div>
    );
  }

  const [selections, preview, regions, destinations, tags, expenseCategories] =
    await Promise.all([
      getRevisionSelections(draft.revision_id),
      getStoryPreview(id),
      listActiveRegions(),
      listActiveDestinations(),
      listActiveTags(),
      listActiveExpenseCategories(),
    ]);

  const parsedContent = normalizeStoryContentJson(draft.content_json);

  return (
    <StoryEditForm
      storyId={id}
      revisionId={draft.revision_id}
      initialVersion={draft.version}
      initialTitle={draft.title}
      initialExcerpt={draft.excerpt ?? ""}
      initialContentJson={parsedContent ?? []}
      initialTripStartDate={draft.trip_start_date}
      initialTripEndDate={draft.trip_end_date}
      initialTripYear={draft.trip_year}
      initialTravelStyle={draft.travel_style}
      initialTotalExpenseNzdCents={draft.total_expense_nzd_cents}
      initialContributorNote={draft.contributor_note ?? ""}
      initialLocations={selections.locations}
      initialTags={selections.tags}
      initialExpenses={selections.expenses}
      initialMedia={preview?.media ?? []}
      regions={regions}
      destinations={destinations}
      tags={tags}
      expenseCategories={expenseCategories}
      isNewStory={draft.revision_number === 1}
      initialStep={resolveStep(step)}
    />
  );
}
