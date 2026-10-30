"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BackLink } from "@/components/back-link";
import { setStoryJourneyPlaceAction } from "./actions";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "../status-badge";
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
 * The contributor's journey page (supabase/migrations/
 * 20261029091942_contributor_journey.sql). Their stories, grouped like story
 * folders (a main story with its sub stories indented under it, standalone
 * stories alone), each with a place to pin on the map -- "Add place",
 * "Change place" or "Remove". Only a published New Zealand story can be
 * pinned; any other row is shown greyed out with the reason. A pin is public
 * the moment it is saved. The preview below the list is the same map readers
 * see on the profile's Journey tab, redrawn as the draft changes.
 */
export function JourneyView({
  stories: initialStories,
}: {
  stories: MyJourneyEntry[];
}) {
  const t = useTranslations("myJourney");
  const router = useRouter();
  const { showToast } = useToast();
  const [stories, setStories] = useState(initialStories);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MyJourneyEntry | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const baseId = useId();

  const ids = useMemo(() => new Set(stories.map((s) => s.id)), [stories]);
  // Top level: no parent, or a parent that is not in this list.
  const topLevel = stories.filter(
    (s) => !s.parentStoryId || !ids.has(s.parentStoryId),
  );
  const childrenOf = useMemo(() => {
    const map = new Map<string, MyJourneyEntry[]>();
    for (const s of stories) {
      if (!s.parentStoryId || !ids.has(s.parentStoryId)) continue;
      const list = map.get(s.parentStoryId) ?? [];
      list.push(s);
      map.set(s.parentStoryId, list);
    }
    return map;
  }, [stories, ids]);

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

  if (stories.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <JourneyHeader />
        <p className="mt-6 text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  function renderRow(story: MyJourneyEntry, nested: boolean) {
    const editing = draft?.storyId === story.id;
    const title = story.title ?? story.slug;
    const reason = story.pinnable
      ? null
      : !story.isNewZealand
        ? t("rows.notNewZealand")
        : t("rows.notPublished");
    return (
      <li
        key={story.id}
        data-testid={nested ? "journey-sub-row" : "journey-main-row"}
        aria-disabled={story.pinnable ? undefined : true}
        className={`rounded-lg border border-border-subtle bg-surface ${
          story.pinnable ? "" : "opacity-70"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{title}</p>
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
          <StatusBadge status={story.lifecycleStatus} />
          <div className="flex flex-wrap gap-2">
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
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <JourneyHeader />
      <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>

      <ul className="mt-6 space-y-3" aria-label={t("listLabel")}>
        {topLevel.map((story) => {
          const subs = childrenOf.get(story.id) ?? [];
          return (
            <li key={story.id} className="list-none">
              <ul className="space-y-2">
                {renderRow(story, false)}
                {subs.length > 0 ? (
                  <li className="list-none">
                    <ul
                      aria-label={t("subStoriesOf", {
                        story: story.title ?? story.slug,
                      })}
                      className="ml-4 space-y-2 border-l-2 border-dotted border-border-subtle pl-3 sm:ml-6 sm:pl-4"
                    >
                      {subs.map((sub) => renderRow(sub, true))}
                    </ul>
                  </li>
                ) : null}
              </ul>
            </li>
          );
        })}
      </ul>

      <section className="mt-10" aria-labelledby={`${baseId}-preview`}>
        <h2 id={`${baseId}-preview`} className="text-lg font-semibold">
          {t("previewTitle")}
        </h2>
        {previewStops.length > 0 ? (
          <JourneyMap key={previewKey} stops={previewStops} />
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("previewEmpty")}
          </p>
        )}
      </section>

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

function JourneyHeader() {
  const t = useTranslations("myJourney");
  return (
    <div className="flex items-center gap-3">
      <BackLink />
      <h1 className="journiq-heading text-[2rem] max-md:sr-only">
        {t("title")}
      </h1>
    </div>
  );
}
