"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BackLink } from "@/components/back-link";
import { setStoryJourneyPlaceAction } from "./actions";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { JourneyMap } from "@/components/story/journey-map";
import {
  JourneyPlacePicker,
  capPlaceName,
  type PickedPoint,
} from "@/components/story/journey-place-picker";
import { MAX_JOURNEY_LABEL_LENGTH } from "@/lib/journey/geo";
import {
  buildMyJourneyStops,
  type MyJourneyEntry,
} from "@/lib/journey/contributor-journey";

type Draft = { storyId: string; point: PickedPoint | null; label: string };

/**
 * One journey's page (/my-stories/journey/<main story id>, supabase/
 * migrations/20261029091942_contributor_journey.sql): the main story and its
 * published sub stories, opened from the Journey map list (journey-list.tsx).
 * Its map comes first -- the same map readers see, limited to this journey
 * and redrawn as a pin is edited -- then each story with "Pin on map",
 * "Move pin" or "Remove pin". Only a New Zealand story can be pinned; a
 * published one elsewhere is greyed out with the reason (drafts never reach
 * this page). A pin is public the moment it is saved.
 */
export function JourneyStoryView({
  main,
  subs,
}: {
  main: MyJourneyEntry;
  subs: MyJourneyEntry[];
}) {
  const t = useTranslations("myJourney");
  const router = useRouter();
  const { showToast } = useToast();
  const [stories, setStories] = useState(() => [main, ...subs]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MyJourneyEntry | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const baseId = useId();

  // Current copies (a save updates `stories`), in page order.
  const mainStory = stories[0];
  const subStories = stories.slice(1);

  // The map as it would look with the draft applied.
  const previewStops = useMemo(() => {
    const withDraft = stories.map((s) =>
      draft &&
      draft.storyId === s.id &&
      draft.point &&
      draft.label.trim() !== ""
        ? {
            ...s,
            place: {
              label: capPlaceName(draft.label),
              latitude: draft.point.latitude,
              longitude: draft.point.longitude,
            },
          }
        : s,
    );
    return buildMyJourneyStops(withDraft);
  }, [stories, draft]);
  const previewKey = `${previewStops.length}:${previewStops
    .map((s) => (s.parentIndex === null ? "m" : "s"))
    .join("")}`;

  function startEditing(story: MyJourneyEntry) {
    setPanelError(null);
    setDraft({
      storyId: story.id,
      point: story.place
        ? { latitude: story.place.latitude, longitude: story.place.longitude }
        : null,
      label: story.place?.label ?? "",
    });
  }

  async function save() {
    if (!draft || !draft.point || saving) return;
    const label = capPlaceName(draft.label);
    if (label === "") {
      setPanelError(t("panel.needsName"));
      return;
    }
    setSaving(true);
    setPanelError(null);
    const result = await setStoryJourneyPlaceAction(draft.storyId, {
      label,
      latitude: draft.point.latitude,
      longitude: draft.point.longitude,
    });
    setSaving(false);
    if (!result.ok) {
      setPanelError(result.error);
      return;
    }
    setStories((prev) =>
      prev.map((s) =>
        s.id === draft.storyId ? { ...s, place: result.place } : s,
      ),
    );
    const title = stories.find((s) => s.id === draft.storyId)?.title ?? "";
    setDraft(null);
    showToast(t("toasts.saved", { story: title }));
    router.refresh();
  }

  async function remove(story: MyJourneyEntry) {
    setSaving(true);
    const result = await setStoryJourneyPlaceAction(story.id, null);
    setSaving(false);
    if (!result.ok) {
      showToast(result.error, "error");
      return;
    }
    setStories((prev) =>
      prev.map((s) => (s.id === story.id ? { ...s, place: null } : s)),
    );
    if (draft?.storyId === story.id) setDraft(null);
    showToast(t("toasts.removed", { story: story.title ?? "" }));
    router.refresh();
  }

  function renderRow(story: MyJourneyEntry, nested: boolean) {
    const editing = draft?.storyId === story.id;
    const title = story.title ?? story.slug;
    const reason = story.pinnable ? null : t("rows.notNewZealand");
    return (
      <li
        key={story.id}
        data-testid={nested ? "journey-sub-row" : "journey-main-row"}
        aria-disabled={story.pinnable ? undefined : true}
        className={`rounded-lg border border-border-subtle bg-surface ${
          story.pinnable ? "" : "opacity-70"
        }`}
      >
        {/* Phone: title (with its badge) on its own line, the place under
            it, the buttons on a row below -- side by side, the buttons
            left the title a few characters wide. One row from sm up. */}
        <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            {/* No status badge: every story on this page is published. */}
            <p className="line-clamp-2 font-medium">{title}</p>
            {story.place ? (
              <p className="text-sm text-muted-foreground">
                {t("rows.placeLabel", { place: story.place.label })}
              </p>
            ) : reason ? (
              <p className="text-sm text-muted-foreground">{reason}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("rows.noPlace")}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {story.pinnable ? (
              <button
                type="button"
                onClick={() => startEditing(story)}
                aria-expanded={editing}
                aria-label={t(
                  story.place ? "rows.changeNamed" : "rows.addNamed",
                  {
                    story: title,
                  },
                )}
                className="press min-h-[44px] rounded-full border border-border-subtle px-4 py-1.5 text-sm font-medium sm:min-h-0"
              >
                {story.place ? t("rows.change") : t("rows.add")}
              </button>
            ) : null}
            {story.place ? (
              <button
                type="button"
                onClick={() => setRemoveTarget(story)}
                disabled={saving}
                aria-label={t("rows.removeNamed", { story: title })}
                className="press min-h-[44px] rounded-full border border-border-subtle px-4 py-1.5 text-sm font-medium text-destructive sm:min-h-0"
              >
                {t("rows.remove")}
              </button>
            ) : null}
          </div>
        </div>
        {editing && draft ? (
          <div
            role="group"
            aria-label={t("panel.label", { story: title })}
            className="border-t border-border-subtle p-3 sm:p-4"
          >
            <h3 className="text-base font-semibold">
              {t("panel.title", { story: title })}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("panel.hint")}
            </p>
            <div className="mt-3">
              <JourneyPlacePicker
                value={draft.point}
                onChange={(point, placeName) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          point,
                          label:
                            placeName && d.label.trim() === ""
                              ? placeName
                              : d.label,
                        }
                      : d,
                  )
                }
              />
            </div>
            <div className="mt-4 max-w-xl">
              <label
                htmlFor={`${baseId}-label`}
                className="block text-sm font-medium"
              >
                {t("panel.nameField")}
              </label>
              <input
                id={`${baseId}-label`}
                type="text"
                value={draft.label}
                maxLength={MAX_JOURNEY_LABEL_LENGTH}
                placeholder={t("panel.namePlaceholder")}
                aria-describedby={`${baseId}-label-help`}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, label: e.target.value } : d))
                }
                className="mt-1 w-full rounded-md border border-border-subtle bg-background px-3 py-2 text-base"
              />
              <p
                id={`${baseId}-label-help`}
                className="mt-1 text-xs text-muted-foreground"
              >
                {t("panel.nameHelp", { max: MAX_JOURNEY_LABEL_LENGTH })}
              </p>
            </div>
            {panelError ? (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {panelError}
              </p>
            ) : !draft.point ? (
              <p role="status" className="mt-3 text-sm text-muted-foreground">
                {t("panel.needsPlace")}
              </p>
            ) : draft.label.trim() === "" ? (
              <p role="status" className="mt-3 text-sm text-muted-foreground">
                {t("panel.needsName")}
              </p>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">
              {t("panel.publicNote")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !draft.point || draft.label.trim() === ""}
                className="journiq-button bg-accent text-accent-foreground disabled:opacity-50"
              >
                {saving ? t("panel.saving") : t("panel.save")}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={saving}
                className="press min-h-11 rounded-full border border-border-subtle px-4 py-2 text-sm font-medium"
              >
                {t("panel.cancel")}
              </button>
            </div>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 pb-12 sm:px-6 sm:py-16">
      <JourneyHeader title={mainStory.title ?? mainStory.slug} />

      <section className="mt-3" aria-labelledby={`${baseId}-preview`}>
        <h2 id={`${baseId}-preview`} className="sr-only">
          {t("mapTitle")}
        </h2>
        {previewStops.length > 0 ? (
          <JourneyMap key={previewKey} stops={previewStops} />
        ) : (
          <p className="rounded-lg border border-dashed border-border-subtle p-4 text-sm text-muted-foreground">
            {t("mapEmpty")}
          </p>
        )}
      </section>

      <p className="mt-6 text-sm text-muted-foreground">{t("storyIntro")}</p>
      <ul className="mt-3 space-y-2" aria-label={t("listLabel")}>
        {renderRow(mainStory, false)}
        {subStories.length > 0 ? (
          <li className="list-none">
            <ul
              aria-label={t("subStoriesOf", {
                story: mainStory.title ?? mainStory.slug,
              })}
              className="ml-4 space-y-2 border-l-2 border-dotted border-border-subtle pl-3 sm:ml-6 sm:pl-4"
            >
              {subStories.map((sub) => renderRow(sub, true))}
            </ul>
          </li>
        ) : null}
      </ul>

      <ConfirmDialog
        open={removeTarget !== null}
        title={t("removeDialog.title")}
        description={
          removeTarget
            ? t("removeDialog.description", {
                story: removeTarget.title ?? removeTarget.slug,
              })
            : undefined
        }
        confirmLabel={t("removeDialog.confirm")}
        pending={saving}
        onConfirm={() => {
          if (removeTarget) void remove(removeTarget);
          setRemoveTarget(null);
        }}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

function JourneyHeader({ title }: { title: string }) {
  // The phone top bar says "← Journey map"; the heading names the journey.
  return (
    <div className="flex items-center gap-3">
      <BackLink />
      <h1 className="line-clamp-2 text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h1>
    </div>
  );
}
