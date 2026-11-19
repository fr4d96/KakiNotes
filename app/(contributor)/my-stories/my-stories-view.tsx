"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  DEFAULT_COUNTRY_SLUG,
  countryMessageSegment,
  type CountrySlug,
} from "@/lib/story/countries";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { StatusBadge } from "./status-badge";
import { StoryCoverThumbnail } from "./story-cover-thumbnail";
import { MyStoryPhotos } from "./my-story-photos";
import { LazyMount } from "./lazy-mount";
import {
  deleteDraftStoryAction,
  requestStoryTakedownAction,
  cancelStoryTakedownAction,
} from "./actions";
import { PRIMARY_ACTION_CLASS, menuItemClass } from "./action-icon-class";
import {
  StoryActionsMenu,
  StoryMenuLink,
  useStoryActionsMenu,
} from "./story-actions-menu";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useIsPhone } from "@/components/ui/use-is-phone";
import { ALL, FilterRow } from "@/components/story/filter-row";
import { StartRevisionButton } from "@/components/story/start-revision-button";
import { ReopenForEditingButton } from "@/components/story/reopen-for-editing-button";
import {
  destinationNames,
  regionNames,
  stringList,
} from "@/lib/story/card-fields";
import { isPrivateStory } from "@/lib/story/story-visibility";
import { formatDate } from "@/lib/i18n/format";
import { isLocale, type Locale } from "@/i18n/locales";
import {
  ChevronIcon,
  EditorialPencilIcon,
  EyeIcon,
  FilterIcon,
  FolderIcon,
  GalleryIcon,
  HiddenEyeIcon,
  ImportIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import type { MyStoryWithCover } from "@/lib/story/contributor-queries";

type ViewMode = "grid" | "list";

// The toolbar's secondary actions. On a phone each is a bare 40px icon --
// the label is screen-reader text plus a `title` tooltip -- so the whole
// toolbar fits one 402px row with nothing scrolling sideways; an invisible
// ::after hit-slop takes the tap target past 44px without making the row look
// heavier. From md up the label is shown and the control becomes an outlined
// pill, the desktop row it always was.
const TOOL_CLASS =
  "press relative inline-flex h-10 min-w-10 shrink-0 items-center justify-center gap-2 rounded-full text-foreground/75 transition-colors after:absolute after:-inset-0.5 after:content-[''] hover:bg-surface-muted hover:text-foreground active:bg-surface-muted md:border md:border-border-subtle md:px-3.5 md:text-sm md:font-medium";

const VIEW_STORAGE_KEY = "kaki-my-stories-view";

/**
 * Stories revealed per step. 12 divides evenly by both grid widths (2 columns
 * on a phone, 3 from `sm`), so a step never ends in a ragged half-row.
 *
 * Revealed CLIENT-side, over the stories the page already loaded: the
 * Region/Destination/Tags filter axes and the status counts are built from the
 * whole set (buildFilterAxes), so server paging would make a filter chip or a
 * count vanish just because of what happened to be on screen. What made the
 * page slow was never the one list_my_stories() round trip but every row
 * mounting its cover at once (see LazyMount); rendering a step at a time also
 * keeps the DOM and the client components under it small.
 */
const PAGE_SIZE = 12;

// Same useSyncExternalStore pattern as components/theme-toggle.tsx: the DOM
// (here, localStorage) is the source of truth, read synchronously rather
// than via a setState-in-effect round trip -- React renders
// getServerSnapshot()'s fixed value on the server and on the client's first
// (hydrating) pass, then transparently swaps to getSnapshot()'s real value
// right after, with no extra render triggered by our own code.
const viewListeners = new Set<() => void>();

// List is the default: only an explicitly stored "grid" preference opts out.
// A contributor with no stored preference (including one whose browser
// blocks localStorage) lands on the list, which is the denser, more
// readable shape for a working catalogue of your own drafts.
function getViewSnapshot(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function getServerViewSnapshot(): ViewMode {
  return "list";
}

function subscribeToView(listener: () => void) {
  viewListeners.add(listener);
  return () => viewListeners.delete(listener);
}

function setStoredView(next: ViewMode) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, next);
  } catch {
    // ignore (private browsing / storage disabled)
  }
  viewListeners.forEach((listener) => listener());
}

/** "14 Sept 2026" / "2026年9月14日", via the shared locale-aware helper. */
function formatUpdatedAt(value: string | null, locale: Locale): string | null {
  if (!value) return null;
  return formatDate(value, locale) || null;
}

/**
 * Which collapsible section a story belongs to on My Stories.
 *
 * Exhaustive over story_lifecycle_status' eight values, and deliberately
 * checked in this order:
 *
 *  - `published` FIRST, so a live story with an edit in flight stays under
 *    Published. Its `draftRevisionStatus` is 'submitted', which would
 *    otherwise pull it into "In review" and make a story readers can see
 *    right now vanish from the section that says so. The in-flight edit is
 *    already marked on the row by <UpdateChip>, which is the right place for
 *    a sub-state (Engineering Rule 11: the published version stays live
 *    throughout its update's review).
 *  - `review` is the whole-story review states -- a first submission waiting
 *    on a moderator, or an editorial draft waiting on the contributor.
 *  - `drafts` is what the contributor can still edit: a new draft, or one a
 *    moderator sent back.
 *  - `private` is a story the contributor finished and chose to keep to
 *    themselves (20260907100100_private_stories.sql). It needs its own
 *    section for the same reason `closed` does, in the opposite direction:
 *    it is neither work in progress nor a failure, and the fall-through
 *    below would otherwise file it under "Not published — archived or not
 *    approved", which reads as something having gone wrong rather than as
 *    the deliberate choice it was.
 *  - `closed` is everything terminal. It has its own section rather than
 *    being folded into Drafts, because "not approved" and "archived" are not
 *    work in progress and grouping them there would imply they are.
 */
export type StorySection =
  "drafts" | "review" | "published" | "private" | "closed";

export function storySection(story: MyStoryWithCover): StorySection {
  if (story.lifecycle_status === "published") return "published";
  if (
    story.lifecycle_status === "pending_review" ||
    story.lifecycle_status === "awaiting_contributor_approval"
  ) {
    return "review";
  }
  if (isPrivateStory(story.lifecycle_status)) return "private";
  if (
    story.lifecycle_status === "draft" ||
    story.lifecycle_status === "changes_requested"
  ) {
    return "drafts";
  }
  return "closed";
}

/**
 * Section order is the contributor's own workflow, not the enum's: what you
 * are still writing, then what someone else is holding, then what is live,
 * then what is over. Each carries a plain-language hint because "In review"
 * alone does not say who is waiting on whom.
 */
const SECTIONS: { key: StorySection }[] = [
  { key: "drafts" },
  { key: "review" },
  { key: "published" },
  // Beside Published rather than beside Drafts: both are finished stories
  // that came out the way the contributor wanted. Only the terminal states
  // sit after them.
  { key: "private" },
  { key: "closed" },
];

/**
 * A story awaiting THIS contributor's approval still has
 * current_draft_revision_id set (mark_editorial_draft_awaiting_approval()
 * doesn't clear it), but the revision itself is frozen
 * (_revision_is_editable() excludes this lifecycle status), and the same
 * is true while a submitted revision is pending_review -- an "Edit" link
 * in either case would lead to a save that always fails. Show a "Review"
 * CTA for the former. For the latter, plain "Edit" is still hidden, but it
 * is not a dead end: ReopenForEditingButton (canReopen below) offers to pull
 * the submitted revision back out of the queue and reopen it as an editable
 * draft, so a contributor can only ever reach an edit that would actually
 * work, without being stuck until a moderator gets to it.
 */
function storyStatusFlags(story: MyStoryWithCover) {
  const awaitingApproval =
    story.lifecycle_status === "awaiting_contributor_approval";
  // "In review" has two shapes. A FIRST submission moves the whole story to
  // pending_review. An edit to an ALREADY-PUBLISHED story deliberately
  // leaves lifecycle_status = 'published' from submit right through
  // approval -- that is exactly what keeps the live version live
  // (Engineering Rule 11) -- so there it shows up only as a submitted
  // in-flight revision.
  const inReview =
    story.lifecycle_status === "pending_review" ||
    story.draftRevisionStatus === "submitted";
  const editable =
    Boolean(story.current_draft_revision_id) && !awaitingApproval && !inReview;
  // Client-side gate matching delete_draft_story()'s precondition EXACTLY
  // (lifecycle_status 'draft' or 'private', never published, AND exactly
  // one story_revisions row ever) -- the RPC itself is still the real
  // safety boundary, but the button no longer offers an action it is
  // always going to refuse. A story that was submitted and then rejected/
  // withdrawn/sent back for changes and is now editable again as a plain
  // draft satisfies the first two conditions but has TWO OR MORE revisions
  // (a fresh one is created for the retry -- the earlier one is immutable
  // once it leaves 'draft'), which is exactly the case that used to show
  // Delete and then fail with "has prior reviewed revision history" —
  // see supabase/migrations/20260926110804_list_my_stories_revision_count.sql
  // for the `revisionCount` column this reads, and this file's
  // deleteDraftErrorMessage() (actions.ts) for the translated message a
  // stale page would still surface if this were somehow bypassed.
  //
  // 'private' belongs here for the same reason 'draft' does, and leaving it
  // out would have been a quiet regression: nothing about a private story
  // is public or reviewed, so choosing "keep this to myself" must not also
  // take away the ability to throw it away. delete_draft_story() was
  // widened to match in 20260907100100_private_stories.sql.
  const deletable =
    (story.lifecycle_status === "draft" ||
      isPrivateStory(story.lifecycle_status)) &&
    story.published_revision_id === null &&
    story.revisionCount === 1;
  // Withdrawal ("Take down") is the OTHER destructive action, and the
  // opposite case to deletable above: a story that is live to the public
  // right now. revoke_publication_consent() only has anything to do on a
  // published story (it archives one; on anything else it would just set a
  // terminal consent flag on content nobody can see), and it is terminal --
  // no function ever grants consent again, so this is deliberately not
  // offered anywhere the contributor could reach it by accident. The two
  // can never appear together: deletable requires lifecycle 'draft' and no
  // published revision, which is exactly what this excludes.
  const withdrawable = story.lifecycle_status === "published";
  // Nothing is in flight, but there IS something to revise: a published
  // story the contributor wants to correct, or one a moderator sent back
  // asking for changes. Both need a new draft to be created first
  // (create_next_draft_revision()), which is why this is a confirm-then-act
  // button rather than a link. Mirrors that RPC's own preconditions:
  // it refuses a story that already has an in-flight revision, and an
  // archived one.
  const canStartRevision =
    !story.current_draft_revision_id &&
    (story.lifecycle_status === "published" ||
      story.lifecycle_status === "changes_requested");
  // A published story with work in flight keeps its "Published" badge --
  // because it genuinely is still published -- so the in-flight edit needs
  // its own small marker, or the page looks identical either way.
  const updateInFlight =
    story.published_revision_id !== null &&
    Boolean(story.current_draft_revision_id);
  // The other side of `editable` being false while `inReview` is true: the
  // in-flight revision is submitted and sitting with a moderator, not yet
  // acted on. Mirrors reopen_submission_for_editing()'s own precondition
  // (supabase/migrations -- the RPC refuses anything but a `submitted`
  // revision), so this can never offer a reopen the RPC would reject just
  // because the story moved on since the page loaded; the RPC re-checks
  // regardless (Engineering Rule 2).
  const canReopen = story.draftRevisionStatus === "submitted";
  return {
    awaitingApproval,
    editable,
    deletable,
    withdrawable,
    canStartRevision,
    canReopen,
    inReview,
    updateInFlight,
  };
}

/**
 * The marker described above: shown only on a published story that has an
 * edit in flight, saying whether that edit is still the contributor's to
 * work on or is now sitting with a moderator.
 */
function UpdateChip({ inReview }: { inReview: boolean }) {
  const t = useTranslations("myStories");
  return (
    <span className="inline-flex items-center rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-bold text-foreground/65">
      {inReview ? t("updateInReview") : t("updateInProgress")}
    </span>
  );
}

/**
 * Where clicking the story itself (its thumbnail/title, not one of the
 * explicit Edit/Preview/Review icon actions) should go: a plain draft goes
 * straight to editing, anything past that (in review, published, or
 * otherwise) goes to the read-only preview -- matching editable's own
 * "current_draft_revision_id can actually be saved" rule would be more
 * precise, but the simpler "draft vs everything else" split is what was
 * asked for and covers the common case (edit while drafting, read
 * afterward).
 */
function primaryStoryHref(story: MyStoryWithCover): string {
  return story.lifecycle_status === "draft"
    ? `/stories/${story.id}/edit`
    : `/stories/${story.id}/preview`;
}

/**
 * The card's one visible action: a pill with an icon AND text. The accessible
 * name carries the story title (the visible text is its prefix) so a list of
 * identical "Edit" pills stays distinguishable to a screen reader.
 */
function PrimaryActionLink({
  href,
  label,
  text,
  children,
}: {
  href: string;
  label: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={`${PRIMARY_ACTION_CLASS} text-accent`}
    >
      {children}
      <span>{text}</span>
    </Link>
  );
}

/**
 * Delete, gated behind a real confirmation dialog (ConfirmDialog, the same
 * <dialog>-based shell as the sign-in/sign-up modal) rather than a bare
 * click -- deletion is permanent, delete_draft_story() hard-deletes the
 * story row and everything under it (Engineering rule: only ever a
 * never-published, never-submitted draft, so nothing public is at stake).
 */
function DeleteDraftAction({
  story,
  title,
}: {
  story: MyStoryWithCover;
  title: string;
}) {
  const t = useTranslations("myStories");
  const { isPhone } = useStoryActionsMenu();
  const router = useRouter();
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleConfirm() {
    setDeleting(true);
    const result = await deleteDraftStoryAction(story.id, story.version);
    if (result.ok) {
      showToast(t("deleteDialog.toast", { title }));
      router.refresh();
      return;
    }
    setDeleting(false);
    setConfirmOpen(false);
    showToast(result.error, "error");
  }

  return (
    <>
      <button
        type="button"
        role="menuitem"
        onClick={() => setConfirmOpen(true)}
        className={menuItemClass(isPhone, "danger")}
      >
        <TrashIcon className="h-4 w-4" aria-hidden="true" />
        <span>{t("actions.deleteShort")}</span>
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title={t("deleteDialog.title")}
        description={t("deleteDialog.description", { title })}
        confirmLabel={t("deleteDialog.confirm")}
        danger
        pending={deleting}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

/** One row of list_my_takedown_requests(), as the page hands it over. */
export type TakedownRequestRow = {
  request_id: string;
  story_id: string;
  status: string;
  requested_at: string;
  decided_at: string | null;
  decision_note: string | null;
};

/**
 * "Take down" — the contributor ASKS for a story that is live right now to
 * be removed (docs/content-governance.md, "Corrections, withdrawal, and
 * deletion"). Sits beside DeleteDraftAction above and is deliberately NOT
 * the same control:
 *
 *   - Delete applies to a never-published draft, and destroys it, now.
 *   - Take down applies to a PUBLISHED story, asks a moderator, and destroys
 *     nothing; the writing and images stay in the contributor's account.
 *
 * The honest part, which the copy leads with rather than buries: the story
 * STAYS PUBLIC until someone reviews the request. A contributor who has just
 * asked for their story to come down will reasonably assume it is already
 * gone, and it is not. Saying so plainly is the difference between a queue
 * and a broken promise.
 *
 * No reason is asked for. Taking your own story down is your call, not one
 * you owe an explanation for -- the optional note is framed as context for
 * whoever picks it up, and the RPC accepts null.
 */
function TakedownAction({
  story,
  title,
  request,
}: {
  story: MyStoryWithCover;
  title: string;
  request: TakedownRequestRow | null;
}) {
  const t = useTranslations("myStories");
  const { isPhone } = useStoryActionsMenu();
  const router = useRouter();
  const { showToast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const awaitingReview = request?.status === "pending";

  async function handleRequest() {
    setPending(true);
    const result = await requestStoryTakedownAction(story.id, story.version);
    if (result.ok) {
      showToast(t("takedownDialog.toast", { title }));
      router.refresh();
      return;
    }
    setPending(false);
    setConfirmOpen(false);
    showToast(result.error, "error");
  }

  async function handleCancel() {
    if (!request) return;
    setPending(true);
    const result = await cancelStoryTakedownAction(request.request_id);
    if (result.ok) {
      showToast(t("cancelTakedownDialog.toast", { title }));
      router.refresh();
      return;
    }
    setPending(false);
    setCancelOpen(false);
    showToast(result.error, "error");
  }

  if (awaitingReview) {
    return (
      <>
        <button
          type="button"
          role="menuitem"
          onClick={() => setCancelOpen(true)}
          title={t("actions.takedownPending", { title })}
          className={menuItemClass(isPhone, "muted")}
        >
          <HiddenEyeIcon className="h-4 w-4" aria-hidden="true" />
          <span>{t("actions.cancelTakedownShort")}</span>
        </button>
        <ConfirmDialog
          open={cancelOpen}
          title={t("cancelTakedownDialog.title")}
          description={t("cancelTakedownDialog.description", { title })}
          confirmLabel={t("cancelTakedownDialog.confirm")}
          pending={pending}
          onConfirm={handleCancel}
          onCancel={() => setCancelOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        role="menuitem"
        onClick={() => setConfirmOpen(true)}
        className={menuItemClass(isPhone, "danger")}
      >
        <HiddenEyeIcon className="h-4 w-4" aria-hidden="true" />
        <span>{t("actions.takeDownShort")}</span>
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title={t("takedownDialog.title")}
        description={t("takedownDialog.description", { title })}
        confirmLabel={t("takedownDialog.confirm")}
        danger
        pending={pending}
        onConfirm={handleRequest}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

/**
 * Runs a real button component (ReopenForEditingButton) as a menu row: it
 * owns its own confirm dialog and has no role prop, so the wrapper stamps
 * role="menuitem" on its trigger and passes the row classes down.
 */
function MenuItemHost({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="none"
      ref={(el) => {
        el?.querySelector(":scope > button")?.setAttribute("role", "menuitem");
      }}
    >
      {children}
    </div>
  );
}

/**
 * Every action on one story card: ONE visible primary action, and the rest
 * in the "..." menu (destructive ones last). Which action leads:
 *
 *   editable         -> Edit (link to the editor)
 *   canStartRevision -> Edit (confirm, then create the next draft)
 *   awaitingApproval -> Review
 *   otherwise        -> Preview (nothing else is sensible but viewing)
 *
 * The menu holds Preview/Review (when it is not already primary), "Edit
 * anyway" (reopen a submitted revision), then Delete / Take down / Cancel
 * takedown. With nothing left over there is no menu button at all.
 */
function StoryActions({
  story,
  title,
  takedown,
}: {
  story: MyStoryWithCover;
  title: string;
  takedown: TakedownRequestRow | null;
}) {
  const t = useTranslations("myStories");
  const {
    awaitingApproval,
    editable,
    deletable,
    withdrawable,
    canStartRevision,
    canReopen,
  } = storyStatusFlags(story);
  const editLeads = editable || canStartRevision;
  const viewLabel = awaitingApproval
    ? t("actions.review", { title })
    : t("actions.preview", { title });
  const viewText = awaitingApproval
    ? t("actions.reviewShort")
    : t("actions.previewShort");
  const previewHref = `/stories/${story.id}/preview`;
  const hasMenu = editLeads || canReopen || deletable || withdrawable;

  return (
    <div className="flex items-center justify-between gap-2">
      {editable ? (
        <PrimaryActionLink
          href={`/stories/${story.id}/edit`}
          label={t("actions.edit", { title })}
          text={t("actions.editShort")}
        >
          <EditorialPencilIcon className="h-4 w-4" aria-hidden="true" />
        </PrimaryActionLink>
      ) : canStartRevision ? (
        <StartRevisionButton
          storyId={story.id}
          storyTitle={title}
          isPublished={story.lifecycle_status === "published"}
          label={t("actions.editShort")}
          className={`${PRIMARY_ACTION_CLASS} text-accent`}
        />
      ) : (
        <PrimaryActionLink href={previewHref} label={viewLabel} text={viewText}>
          <EyeIcon className="h-4 w-4" aria-hidden="true" />
        </PrimaryActionLink>
      )}
      {hasMenu && (
        <StoryActionsMenu title={title}>
          {editLeads && (
            <StoryMenuLink
              href={previewHref}
              icon={<EyeIcon className="h-4 w-4" aria-hidden="true" />}
            >
              {viewText}
            </StoryMenuLink>
          )}
          {canReopen && <MenuItemHostReopen story={story} title={title} />}
          {deletable && <DeleteDraftAction story={story} title={title} />}
          {withdrawable && (
            <TakedownAction story={story} title={title} request={takedown} />
          )}
        </StoryActionsMenu>
      )}
    </div>
  );
}

function MenuItemHostReopen({
  story,
  title,
}: {
  story: MyStoryWithCover;
  title: string;
}) {
  const { isPhone } = useStoryActionsMenu();
  return (
    <MenuItemHost>
      <ReopenForEditingButton
        storyId={story.id}
        storyTitle={title}
        isPublished={story.published_revision_id !== null}
        className={menuItemClass(isPhone)}
      />
    </MenuItemHost>
  );
}

function GridIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

// Client-side filtering over the contributor's already-loaded stories --
// the same shape the landing page's old catalogue index used: each axis is built only from values
// present in this list, and an axis earns its row only if it can actually
// split the list (more than one value, or a single value that not every
// story carries), so a chip can never lead to an empty result and a
// do-nothing control is never rendered.
//
// That "earns its row" rule is why adding an axis is cheap: a contributor
// who has never tagged anything simply does not get a Tags row.
type FilterAxis = {
  key: "region" | "destination" | "tag";
  label: string;
  read: (story: MyStoryWithCover) => string[];
  options: string[];
};

function buildFilterAxes(
  stories: MyStoryWithCover[],
  // The axis KEY is stable; only its label is translated. Region and
  // destination OPTION values are localized too, since 20260914092322 sends
  // each name's Simplified Chinese twin along with it -- the filter list
  // then matches the names printed on the cards beside it. Tags are NOT
  // localized: a tag may be one the contributor typed.
  labels: Record<FilterAxis["key"], string>,
  locale: Locale,
): FilterAxis[] {
  const defs: Array<Pick<FilterAxis, "key" | "label" | "read">> = [
    {
      key: "region",
      label: labels.region,
      read: (s) => regionNames(s.regions, locale),
    },
    {
      key: "destination",
      label: labels.destination,
      read: (s) => destinationNames(s.regions, locale),
    },
    // list_my_stories()'s `tags` is already a flat array of resolved names
    // (20260907110000), each one either a `tags` lookup row's name or the
    // label the contributor typed themselves -- so a self-authored tag
    // filters exactly like a seeded one, which on this product is most of
    // them.
    { key: "tag", label: labels.tag, read: (s) => stringList(s.tags) },
  ];

  const axes: FilterAxis[] = [];
  for (const def of defs) {
    const counts = new Map<string, number>();
    for (const story of stories) {
      for (const value of new Set(def.read(story))) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    const options = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value]) => value);
    const partitions =
      options.length > 1 ||
      (options.length === 1 && (counts.get(options[0]) ?? 0) < stories.length);
    if (partitions) axes.push({ ...def, options });
  }
  return axes;
}

/**
 * The square-cover grid, for one section's stories. Extracted from the page
 * body when My Stories gained collapsible status sections -- both views now
 * render once per section instead of once for the whole list.
 */
function StoryGrid({
  stories,
  takedownByStory,
}: {
  stories: MyStoryWithCover[];
  takedownByStory: Map<string, TakedownRequestRow>;
}) {
  const t = useTranslations("myStories");
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {stories.map((story) => {
        const { inReview, updateInFlight } = storyStatusFlags(story);
        const title = story.title ?? t("untitled");
        const href = primaryStoryHref(story);
        return (
          <li
            key={story.id}
            className="relative transition-transform duration-150 ease-out [@media(hover:hover)]:motion-safe:has-[a[data-card-link]:active]:scale-[0.97]"
          >
            {/* The title link's ::after stretches over the whole card (cover,
                title, status), so the card is one big tap target and presses
                as one (the has() scale above, same dip as .press); the cover
                link is a duplicate of it and the action row sits above the
                overlay (relative z-10). */}
            {/* More than one photo: a swipeable strip (MyStoryPhotos), whose
                photos are themselves links to the story -- so the frame is a
                plain div then, never a link wrapping links. One photo or
                none: the frame is the link, as before. */}
            <CoverFrame
              href={href}
              swipeable={story.mediaIds.length > 1}
              className="relative block aspect-square overflow-hidden rounded-md border border-border-subtle"
            >
              <LazyMount>
                {story.mediaIds.length > 1 ? (
                  <MyStoryPhotos
                    mediaIds={story.mediaIds}
                    href={href}
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                  />
                ) : (
                  <StoryCoverThumbnail
                    mediaId={story.coverMediaId}
                    altText={story.coverAltText}
                  />
                )}
              </LazyMount>
              {/* An OPAQUE pill exactly the badge's own size. Two things were
                  wrong before: `p-0.5` drew a 2px ring of plain surface
                  around the tinted badge, reading as a grey halo, and
                  `bg-surface/90` let the photo through -- so a badge whose
                  own fill is only a 15% tint (bg-fern/15 for Published) went
                  muddy and lost its contrast over a busy cover.
                  `bg-background`, not `bg-surface`, because that is what the
                  same badge sits on in the list view, so the composited
                  colour matches between the two views.

                  `flex` is load-bearing too: the badge is inline-flex, so a
                  block wrapper adds ~4px of line-box leading around it and
                  the rounded wrapper ends up a taller pill than the badge --
                  a faint halo again, in a different disguise. */}
              <div className="pointer-events-none absolute right-2 top-2 z-20 flex rounded-full bg-background shadow-sm">
                <StatusBadge status={story.lifecycle_status} />
              </div>
            </CoverFrame>
            <div className="mt-2">
              <Link
                href={href}
                data-card-link=""
                className="block truncate text-sm font-medium after:absolute after:inset-0 after:content-['']"
              >
                {title}
              </Link>
              {updateInFlight && (
                <p className="mt-1">
                  <UpdateChip inReview={inReview} />
                </p>
              )}
              <div className="relative z-10 mt-1.5">
                <StoryActions
                  story={story}
                  title={title}
                  takedown={takedownByStory.get(story.id) ?? null}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The ruled-row list, for one section's stories. Styled after the landing
 * page's former catalogue index: hairline-ruled
 * rows (.nf-entry), a mono tabular numeral, and a cover thumbnail beside the
 * title. Unlike that index, a row here can't be one big <Link> -- each story
 * carries its own Edit/Preview actions -- so the thumbnail and title are the
 * linked targets and the actions sit alongside.
 *
 * The numeral counts within the section, not across the page: sections
 * collapse independently, so a continuous run would renumber every row below
 * whenever one folded.
 */
function StoryList({
  stories,
  takedownByStory,
}: {
  stories: MyStoryWithCover[];
  takedownByStory: Map<string, TakedownRequestRow>;
}) {
  const t = useTranslations("myStories");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  return (
    <ul className="flex flex-col gap-3">
      {stories.map((story, index) => {
        const { inReview, updateInFlight } = storyStatusFlags(story);
        const updated = formatUpdatedAt(story.updated_at, locale);
        const places = destinationNames(story.regions, locale).join(", ");
        const title = story.title ?? t("untitled");
        const href = primaryStoryHref(story);
        return (
          <li
            key={story.id}
            className="relative rounded-2xl border border-border-subtle bg-surface transition-colors [@media(hover:hover)]:hover:bg-surface-muted/60 [@media(hover:hover)]:has-[a[data-card-link]:active]:bg-accent/10 has-[:focus-visible]:bg-surface-muted/60"
          >
            {/* One grid, two shapes. Mobile: [thumb | stacked content],
            numeral hidden (display:none claims no track). From sm up
            the inner wrapper becomes `display: contents` so its
            children drop into the parent grid as real columns
            [numeral | thumb | title+meta | actions]. */}
            <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-stretch gap-x-3.5 p-3 sm:grid-cols-[2rem_7.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-5 sm:px-4">
              <span
                aria-hidden="true"
                className="hidden font-mono text-sm text-foreground/40 tabular-nums sm:block"
              >
                {String(index + 1).padStart(2, "0")}
              </span>

              {/* Phone: the cover is a full-height panel down the row's left
                  edge (items-stretch above), cropped to fill, instead of a
                  64x48 stamp in the corner of a ~110px row. From sm up the
                  row centres and the cover is a fixed 7rem x 5rem frame.
                  With more than one photo it swipes, as in the grid. */}
              <CoverFrame
                href={href}
                swipeable={story.mediaIds.length > 1}
                className="relative block aspect-[4/3] h-full min-h-24 w-[6.5rem] overflow-hidden rounded-xl border border-border-subtle bg-surface-muted sm:h-[5.625rem] sm:min-h-0 sm:w-[7.5rem]"
              >
                <LazyMount>
                  {story.mediaIds.length > 1 ? (
                    <MyStoryPhotos
                      mediaIds={story.mediaIds}
                      href={href}
                      sizes="112px"
                    />
                  ) : (
                    <StoryCoverThumbnail
                      mediaId={story.coverMediaId}
                      altText={null}
                    />
                  )}
                </LazyMount>
              </CoverFrame>

              <div className="sm:contents">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* ::after stretches this link over the whole row (the
                        li is .nf-entry, already position: relative), so the
                        row is one tap target; the action icons sit above it. */}
                    <Link
                      href={href}
                      data-card-link=""
                      className="font-medium underline-offset-2 after:absolute after:inset-0 after:content-[''] hover:text-accent hover:underline"
                    >
                      {title}
                    </Link>
                    <StatusBadge status={story.lifecycle_status} />
                    {updateInFlight && <UpdateChip inReview={inReview} />}
                  </div>
                  {story.excerpt && (
                    <p className="mt-1 line-clamp-2 text-sm text-foreground/70">
                      {story.excerpt}
                    </p>
                  )}
                  {(places || updated) && (
                    <p className="mt-1.5 text-xs text-foreground/55">
                      {places}
                      {places && updated ? " · " : null}
                      {updated && (
                        <span className="font-mono tabular-nums">
                          {t("updatedAt", { date: updated })}
                        </span>
                      )}
                    </p>
                  )}
                </div>

                <div className="relative z-10 mt-2 border-t border-border-subtle/60 pt-2 sm:mt-0 sm:border-t-0 sm:pt-0">
                  <StoryActions
                    story={story}
                    title={title}
                    takedown={takedownByStory.get(story.id) ?? null}
                  />
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A card's photo frame. A single cover is itself a link to the story (kept
 * out of the tab order: the title link is the card's one stop). A swipeable
 * strip is a plain box instead, because each photo in it is already a link
 * -- a link may not contain links.
 */
function CoverFrame({
  href,
  swipeable,
  className,
  children,
}: {
  href: string;
  swipeable: boolean;
  className: string;
  children: React.ReactNode;
}) {
  if (swipeable) return <div className={className}>{children}</div>;
  return (
    <Link href={href} tabIndex={-1} aria-hidden="true" className={className}>
      {children}
    </Link>
  );
}

export function MyStoriesView({
  stories,
  takedownRequests = [],
  country = DEFAULT_COUNTRY_SLUG,
  hasStoriesElsewhere = false,
}: {
  stories: MyStoryWithCover[];
  takedownRequests?: TakedownRequestRow[];
  /** The country chosen in the top bar; `stories` are already only its own. */
  country?: CountrySlug;
  /** The contributor has stories, just none in `country`. */
  hasStoriesElsewhere?: boolean;
}) {
  const t = useTranslations("myStories");
  const tCountry = useTranslations("countryContent");
  const newStoryHref =
    country === DEFAULT_COUNTRY_SLUG
      ? "/stories/new"
      : `/stories/new?country=${country}`;
  const rawViewLocale = useLocale();
  const locale = isLocale(rawViewLocale) ? rawViewLocale : "en";
  // Keyed once here rather than scanned per row: the list pages twelve at a
  // time and every row asks this question.
  const takedownByStory = useMemo(
    () => new Map(takedownRequests.map((r) => [r.story_id, r])),
    [takedownRequests],
  );
  const view = useSyncExternalStore(
    subscribeToView,
    getViewSnapshot,
    getServerViewSnapshot,
  );

  const axes = useMemo(
    () =>
      buildFilterAxes(
        stories,
        {
          region: t("filters.region"),
          destination: t("filters.destination"),
          tag: t("filters.tag"),
        },
        locale,
      ),
    [stories, t, locale],
  );
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(
    {},
  );
  const filtered = useMemo(
    () =>
      stories.filter((story) =>
        axes.every((axis) => {
          const value = activeFilters[axis.key];
          return !value || value === ALL || axis.read(story).includes(value);
        }),
      ),
    [stories, axes, activeFilters],
  );
  const isFiltered = axes.some(
    (axis) => activeFilters[axis.key] && activeFilters[axis.key] !== ALL,
  );

  // Grouped from the FILTERED set, so a section's count always matches what
  // its rows would show. Sections replaced the twelve-per-page pager that
  // used to live here: paging across groups is incoherent (a section can be
  // empty on page 2 and full on page 1), and collapsing a group you are not
  // working on controls length better than paging ever did at this
  // product's scale.
  const grouped = useMemo(() => {
    const buckets: Record<StorySection, MyStoryWithCover[]> = {
      drafts: [],
      review: [],
      published: [],
      private: [],
      closed: [],
    };
    for (const story of filtered) buckets[storySection(story)].push(story);
    return buckets;
  }, [filtered]);

  // Tracks what is CLOSED rather than what is open, so a section added later
  // is never accidentally hidden by a stale key.
  //
  // Drafts starts collapsed on purpose: it is the pile that grows without
  // bound -- every abandoned start stays there forever -- so leaving it open
  // pushes Published, the section a contributor actually wants to see, below
  // the fold. The count in its header still says how many are inside, so
  // nothing is hidden, only folded.
  //
  // Component state, like the filters above it, and deliberately not
  // persisted: a reload returns to this same known layout instead of
  // whatever someone left open three visits ago. (The grid/list toggle IS
  // persisted; that is a preference, this is a starting position.)
  const [closedSections, setClosedSections] = useState<
    Partial<Record<StorySection, boolean>>
  >({ drafts: true });
  // The status chips narrow the list to one section (or "all" for grouped).
  const [activeSection, setActiveSection] = useState<StorySection | "all">(
    "all",
  );
  // How many rows of OPEN sections are on screen; grows by PAGE_SIZE.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const nonEmptySections = SECTIONS.filter(
    ({ key }) => grouped[key].length > 0,
  );
  // A chip whose section has since emptied (a delete, a filter) falls back to
  // "all" rather than showing an empty page.
  const selectedSection =
    activeSection !== "all" && grouped[activeSection].length > 0
      ? activeSection
      : "all";

  const { shownBySection, hiddenCount } = useMemo(() => {
    let budget = visibleCount;
    let hidden = 0;
    const shown = {} as Record<StorySection, MyStoryWithCover[]>;
    for (const { key } of SECTIONS) {
      const rows = grouped[key];
      const open =
        selectedSection === key ||
        (selectedSection === "all" && !closedSections[key]);
      if (selectedSection !== "all" && selectedSection !== key) {
        shown[key] = [];
      } else if (open) {
        const take = Math.min(rows.length, budget);
        budget -= take;
        hidden += rows.length - take;
        shown[key] = rows.slice(0, take);
      } else {
        // Folded away: rows stay in the DOM (a <details> keeps its content)
        // but are capped, don't spend the budget, and their covers never
        // mount while the box has no layout (LazyMount).
        shown[key] = rows.slice(0, PAGE_SIZE);
      }
    }
    return { shownBySection: shown, hiddenCount: hidden };
  }, [grouped, visibleCount, selectedSection, closedSections]);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (
      !node ||
      hiddenCount === 0 ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => count + PAGE_SIZE);
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // Re-observe after each step: if the sentinel is still on screen once the
    // new rows render, a fresh observation fires again and loads the next.
  }, [hiddenCount, visibleCount]);

  function selectSection(next: StorySection | "all") {
    setActiveSection(next);
    setVisibleCount(PAGE_SIZE);
  }

  function toggleSection(key: StorySection, open: boolean) {
    setClosedSections((current) => ({ ...current, [key]: !open }));
  }

  // Any change to what is being filtered starts again from page 1 -- page 3
  // of the old result set means nothing in the new one.
  function changeFilter(key: string, value: string) {
    setActiveFilters((current) => ({ ...current, [key]: value }));
    setVisibleCount(PAGE_SIZE);
  }

  function clearFilters() {
    setActiveFilters({});
    setVisibleCount(PAGE_SIZE);
  }

  function changeView(next: ViewMode) {
    setStoredView(next);
  }

  const activeFilterCount = axes.filter(
    (axis) => activeFilters[axis.key] && activeFilters[axis.key] !== ALL,
  ).length;
  // Phones get the filter chips in a bottom sheet behind one toolbar button
  // instead of three sideways-scrolling chip rows above the list -- those rows
  // were what pushed the first story below the fold. The sheet only mounts on
  // a phone (useIsPhone), and the inline rows are display:none there, so
  // exactly one set of chip groups is ever exposed.
  const isPhone = useIsPhone();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filterRows = (wrap: boolean) =>
    axes.map((axis) => (
      <FilterRow
        key={axis.key}
        label={axis.label}
        options={[ALL, ...axis.options]}
        active={activeFilters[axis.key] ?? ALL}
        onChange={(value) => changeFilter(axis.key, value)}
        allLabel={t("filters.all")}
        groupLabel={t("filters.filterBy", {
          axis: axis.label.toLowerCase(),
        })}
        wrap={wrap}
      />
    ));

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4 pb-12 sm:px-6 sm:py-16">
      {/* Title bar (md and up): the page name and its ONE primary action,
          New Story. On a phone the header already names the page
          (components/header-brand.tsx), so the <h1> is screen-reader-only,
          this pill is hidden, and New Story moves into the toolbar as an
          accent "+" -- where iOS puts a screen's add action. */}
      <div className="flex items-center justify-between gap-3">
        {/* Not .journiq-heading: that class is unlayered in globals.css, so
            its clamp() size and `text-wrap: balance` beat these utilities
            and broke "My Stories" onto two lines beside New Story. Same
            weight, tracking and family; phone-sized here, and from sm up the
            heading's own clamp(), so desktop is unchanged. */}
        <h1 className="min-w-0 font-sans text-[1.75rem] leading-none font-extrabold tracking-[-0.035em] whitespace-nowrap max-md:sr-only sm:text-[clamp(2.35rem,5vw,4.7rem)] sm:leading-[0.98]">
          {t("title")}
        </h1>
        <Link
          href="/stories/new"
          className="press inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent pr-4 pl-3 text-sm font-bold text-accent-foreground hover:opacity-90 max-md:hidden"
        >
          <PlusIcon className="h-5 w-5" />
          {t("newStory")}
        </Link>
      </div>

      {/* Toolbar: one row, never scrolls. Places and tools on the left, how
          the list is shown (filters, grid/list) on the right. */}
      <div className="flex items-center justify-between gap-2 md:mt-4">
        <div className="flex items-center gap-1 md:gap-2">
          <Link
            href="/stories/new"
            aria-label={t("newStory")}
            title={t("newStory")}
            className="press relative mr-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground after:absolute after:-inset-0.5 after:content-[''] hover:opacity-90 md:hidden"
          >
            <PlusIcon className="h-5 w-5" />
          </Link>
          {/* Phones reach Folders from the bottom tab bar, so the toolbar
              shows it from md up only, where there is no tab bar and this
              is the one way in. */}
          <Link
            href="/my-stories/map"
            className={`${TOOL_CLASS} max-md:hidden`}
            title={t("storyMapLink")}
          >
            <FolderIcon className="h-5 w-5" />
            <span className="sr-only md:not-sr-only">{t("storyMapLink")}</span>
          </Link>
          <Link
            href="/my-photos"
            className={TOOL_CLASS}
            title={t("myPhotosLink")}
          >
            <GalleryIcon className="h-5 w-5" />
            <span className="sr-only md:not-sr-only">{t("myPhotosLink")}</span>
          </Link>
          <Link
            href="/stories/new/import"
            className={TOOL_CLASS}
            title={t("import")}
          >
            <ImportIcon className="h-5 w-5" />
            <span className="sr-only md:not-sr-only">{t("import")}</span>
          </Link>
        </div>

        {stories.length > 0 && (
          <div className="flex items-center gap-1 md:gap-2">
            {axes.length > 0 && (
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                aria-haspopup="dialog"
                aria-label={
                  activeFilterCount > 0
                    ? t("filters.buttonActive", { count: activeFilterCount })
                    : t("filters.button")
                }
                title={t("filters.button")}
                className={`${TOOL_CLASS} sm:hidden ${
                  activeFilterCount > 0 ? "text-accent" : ""
                }`}
              >
                <FilterIcon className="h-5 w-5" />
                {activeFilterCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] leading-none font-bold text-accent-foreground tabular-nums"
                  >
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}
            <div
              role="group"
              aria-label={t("viewLabel")}
              className="relative isolate flex shrink-0 rounded-full border border-border-subtle p-0.5"
            >
              {/* The selected pill slides between the two buttons (a
                  transform, so it costs nothing to paint) instead of swapping
                  background colours. It is exactly one button wide: the
                  group's padding box is two buttons plus the 2px padding
                  either side. */}
              <span
                aria-hidden="true"
                className={`absolute inset-y-0.5 left-0.5 -z-10 w-[calc(50%-0.125rem)] rounded-full bg-surface-muted transition-transform duration-200 ease-out motion-reduce:transition-none ${
                  view === "list" ? "translate-x-full" : "translate-x-0"
                }`}
              />
              {(
                [
                  ["grid", t("gridView"), <GridIcon key="g" />],
                  ["list", t("listView"), <ListIcon key="l" />],
                ] as const
              ).map(([mode, label, icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeView(mode)}
                  aria-pressed={view === mode}
                  aria-label={label}
                  title={label}
                  className={`press relative flex h-9 w-9 items-center justify-center rounded-full after:absolute after:-inset-1 after:content-[''] ${
                    view === mode
                      ? "text-foreground"
                      : "text-foreground/60 hover:text-foreground"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {stories.length === 0 ? (
        <p className="mt-8 text-foreground/65">
          {hasStoriesElsewhere
            ? t("emptyInCountry", {
                country: tCountry(`${countryMessageSegment(country)}.name`),
              })
            : t("emptyBefore")}{" "}
          <Link
            href={newStoryHref}
            className="text-accent underline underline-offset-2"
          >
            {t("emptyStartLink")}
          </Link>{" "}
          {t("emptyOr")}{" "}
          <Link
            href="/stories/new/import"
            className="text-accent underline underline-offset-2"
          >
            {t("emptyImportLink")}
          </Link>
          .
        </p>
      ) : (
        <>
          {axes.length > 0 && (
            <div className="mt-8 hidden flex-col gap-4 border-b border-border-subtle pb-6 sm:flex">
              {filterRows(false)}
            </div>
          )}

          {axes.length > 0 && isPhone && (
            <BottomSheet
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              title={t("filters.button")}
              footer={
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen(false)}
                    className="press inline-flex min-h-12 flex-1 items-center justify-center rounded-full bg-accent px-5 text-sm font-black text-accent-foreground"
                  >
                    {t("filters.showResults", { count: filtered.length })}
                  </button>
                  {isFiltered && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="press inline-flex min-h-12 items-center justify-center rounded-full border border-border-subtle px-5 text-sm font-bold"
                    >
                      {t("clearFilters")}
                    </button>
                  )}
                </div>
              }
            >
              <div className="flex flex-col gap-5">{filterRows(true)}</div>
            </BottomSheet>
          )}

          {nonEmptySections.length > 1 && (
            <div
              role="group"
              aria-label={t("statusTabsLabel")}
              className="nf-scroll-x -mx-4 mt-5 flex snap-x gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
            >
              {(
                [
                  ["all", t("filters.all"), filtered.length],
                  ...nonEmptySections.map(
                    ({ key }) =>
                      [key, t(`sections.${key}`), grouped[key].length] as const,
                  ),
                ] as const
              ).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => selectSection(key)}
                  aria-pressed={selectedSection === key}
                  className={`press relative inline-flex h-11 shrink-0 snap-start items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap ${
                    selectedSection === key
                      ? "border-foreground bg-foreground text-background"
                      : "border-border-subtle text-foreground/75 hover:bg-surface-muted"
                  }`}
                >
                  {label}
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      selectedSection === key
                        ? "text-background/75"
                        : "text-foreground/55"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>
          )}

          {axes.length > 0 && (
            <p
              className="mt-5 font-mono text-xs tracking-wider text-foreground/50 tabular-nums"
              aria-live="polite"
            >
              {t("storyCount", {
                count:
                  selectedSection === "all"
                    ? filtered.length
                    : grouped[selectedSection].length,
              })}
              {isFiltered ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="underline underline-offset-4 hover:text-accent"
                  >
                    {t("clear")}
                  </button>
                </>
              ) : null}
            </p>
          )}

          {filtered.length === 0 ? (
            <p className="mt-8 text-foreground/65">
              {t("noMatchesBefore")}{" "}
              <button
                type="button"
                onClick={clearFilters}
                className="text-accent underline underline-offset-2"
              >
                {t("clearFilters")}
              </button>
              .
            </p>
          ) : (
            <div className={axes.length > 0 ? "mt-4" : "mt-8"}>
              {SECTIONS.map(({ key }) => {
                const label = t(`sections.${key}`);
                const hint = t(`sections.${key}Hint`);
                const rows = shownBySection[key];
                const total = grouped[key].length;
                // An empty section is not drawn at all. A contributor who has
                // never had anything rejected should not be told so.
                if (total === 0) return null;
                if (selectedSection !== "all" && selectedSection !== key)
                  return null;
                const open = selectedSection !== "all" || !closedSections[key];
                return (
                  <details
                    key={key}
                    open={open}
                    onToggle={(event) =>
                      toggleSection(key, event.currentTarget.open)
                    }
                    className="border-b border-border-subtle last:border-b-0"
                    // <details> exposes role="group", whose accessible name
                    // comes from aria-label -- NOT from <summary>, which is
                    // the disclosure control and names itself. Without this
                    // a screen reader announces four unnamed groups.
                    aria-label={label}
                  >
                    {/* Native <details>/<summary>: the disclosure keyboard
                        behaviour, the expanded/collapsed state and the
                        screen-reader announcement all come free and correct,
                        which a hand-rolled button + aria-expanded would have
                        to reproduce (Engineering Rule 19). The default
                        triangle is hidden two ways because one is not enough:
                        `list-none` covers Firefox and Chrome, the
                        ::-webkit-details-marker variant covers Safari. */}
                    <summary className="flex cursor-pointer list-none items-center gap-3 py-3 outline-offset-4 sm:py-4 [&::-webkit-details-marker]:hidden">
                      <ChevronIcon
                        className={`h-4 w-4 shrink-0 text-foreground/40 transition-transform ${
                          open ? "rotate-90" : ""
                        }`}
                      />
                      {/* Plain sans, the app's own sub-heading step
                          (text-lg font-semibold tracking-tight, as used
                          throughout /moderation). This deliberately does NOT
                          set Georgia: app/globals.css records that serif as
                          belonging to the retired Field Journal palette, and
                          .journiq-heading -- the "My Stories" title right
                          above these -- is heavy sans. A serif here was the
                          only serif on the page. */}
                      <span className="text-lg font-semibold tracking-tight">
                        {label}
                      </span>
                      <span className="font-mono text-xs text-foreground/45 tabular-nums">
                        {total}
                      </span>
                      <span className="ml-auto hidden text-sm text-foreground/45 sm:block">
                        {hint}
                      </span>
                    </summary>
                    <div className="pb-6">
                      {view === "grid" ? (
                        <StoryGrid
                          stories={rows}
                          takedownByStory={takedownByStory}
                        />
                      ) : (
                        <StoryList
                          stories={rows}
                          takedownByStory={takedownByStory}
                        />
                      )}
                    </div>
                  </details>
                );
              })}
              {hiddenCount > 0 && (
                <div
                  ref={sentinelRef}
                  className="flex justify-center pt-2 pb-4"
                >
                  <button
                    type="button"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                    className="press inline-flex min-h-11 items-center justify-center rounded-full border border-border-subtle px-6 text-sm font-semibold hover:bg-surface-muted"
                  >
                    {t("showMore", { count: hiddenCount })}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
