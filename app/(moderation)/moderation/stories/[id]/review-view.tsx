import Link from "next/link";
import {
  parseModeratorMedia,
  type EditorialHistoryRow,
  type ModerationHistoryRow,
  type ModeratorMediaItem,
  type ModeratorStoryDetail,
  type PublishedRevisionSnapshot,
  type listReportsForStaff,
} from "@/lib/story/moderation";
import { normalizeStoryContentJson } from "@/lib/story/legacy-content";
import type { getPublishedStoryMedia } from "@/lib/story/public-queries";
import { getImageUrl } from "@/lib/story/image-url";
import { isMediaReady } from "@/lib/story/bulk-approve";
import { countryUrlPrefix, isCountrySlug } from "@/lib/story/countries";
import { formatMoneyCents } from "@/lib/i18n/format";
import { imageBlockMediaIds, storyContentText } from "@/lib/validation/story";
import {
  ContentBlockRenderer,
  type ContentBlockMediaMap,
} from "@/components/story/content-block-renderer";
import { PreviewContentBody } from "@/components/story/preview-content-body";
import { PreviewGallery } from "@/components/story/preview-gallery";
import {
  COUNTRY_LABELS,
  REVISION_STATUS_LABELS,
  SOURCE_KIND_LABELS,
  CONSENT_METHOD_LABELS,
  labelFor,
  relativeTime,
  absoluteTime,
  mediaDescription,
} from "@/lib/story/moderation-queue-view";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ChevronIcon,
} from "@/components/icons";
import {
  CHIP,
  CHIP_TONE,
  PAGE,
  PAGE_TITLE,
  PANEL,
  SECTION_HEADING,
  TEXT_LINK,
} from "../../ui";
import { ReviewControls } from "./review-controls";

/**
 * One image in the review page's media list.
 *
 * The old row printed `caption || altText || "(no caption)"`, which on a
 * story whose images carry alt text but no captions -- the common case,
 * since a caption is optional and alt text is not -- rendered a stack of
 * identical "(no caption)" lines: no way to tell one image from another,
 * and no sign of the one thing a moderator actually has to check here.
 *
 * So each row now leads with its position (matching the gallery directly
 * above it) plus a Cover marker, then whatever text the image really has:
 * the caption if there is one, otherwise the alt text labelled as alt text.
 * An image with neither is the interesting case, and gets said out loud.
 *
 * The wording for that case is careful on purpose. `decorative = true` does
 * NOT reliably mean "the contributor decided this image is decorative": it
 * is also the placeholder every freshly uploaded and every PDF-attached
 * image is born with, purely to satisfy the
 * `story_revision_media_alt_text_required` check constraint before anyone
 * has written alt text (see 20260806110100_fix_finalize_upload_alt_text_constraint.sql
 * and lib/story/pdf-page-attachment.ts). So a decorative image with no alt
 * text is reported as exactly what the data supports -- "No alt text --
 * marked decorative" -- and never as the reassuring "no description
 * needed", which would quietly hide undescribed images from the one person
 * whose job is to catch them. A NON-decorative image with no alt text is a
 * straight failure and is flagged red; that is the same condition the
 * readiness metric's `images_missing_alt_text` fires on.
 *
 * The wording itself lives in mediaDescription()
 * (lib/story/moderation-queue-view.ts) so all four cases are unit-tested;
 * this component only turns the returned `kind` into colour and an icon.
 */
function MediaRow({
  item,
  position,
}: {
  item: ModeratorMediaItem;
  position: number;
}) {
  const described = mediaDescription(item);

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-xs text-muted-foreground">
          Image {position}
        </span>
        {item.isCover && (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-bold text-foreground/70">
            Cover
          </span>
        )}
        {described.kind === "caption" ? (
          <span className="min-w-0">{described.text}</span>
        ) : described.kind === "alt-text" ? (
          <span className="min-w-0">
            {described.text}{" "}
            <span className="text-xs text-muted-foreground">(alt text)</span>
          </span>
        ) : (
          <span
            className={`flex items-center gap-1.5 ${
              described.kind === "missing-alt-text"
                ? "text-destructive"
                : "text-muted-foreground"
            }`}
          >
            <AlertCircleIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
            {described.text}
          </span>
        )}
      </span>
      {!isMediaReady(item) && (
        <span className="font-mono text-xs text-muted-foreground">
          {item.processingState}
        </span>
      )}
    </li>
  );
}

/**
 * One fact in the review sidebar. `ok` drives an icon and colour, so a
 * moderator can scan the column for red rather than read six sentences;
 * `ok: null` means "informational, there is nothing to pass or fail here".
 */
function Check({
  label,
  value,
  ok,
}: {
  label: string;
  value: React.ReactNode;
  ok?: boolean | null;
}) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      {ok === true && (
        <CheckCircleIcon
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-accent"
        />
      )}
      {ok === false && (
        <AlertCircleIcon
          aria-hidden="true"
          className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
        />
      )}
      {(ok === undefined || ok === null) && (
        <span
          aria-hidden="true"
          className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground"
        />
      )}
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd
          className={`text-sm ${ok === false ? "font-semibold text-destructive" : ""}`}
        >
          {value}
        </dd>
      </div>
    </div>
  );
}

/**
 * The review screen, drawn from data the page has already fetched. Photos
 * first, then the words, then the checks and the decision: the order a
 * reader meets the story in, so a moderator judges what will actually
 * appear. (Photos used to sit in a closed drawer under the text, which let a
 * story be approved without its pictures ever being seen.)
 */
export function ReviewView({
  detail,
  countrySlug,
  currency,
  publishedSnapshot,
  publishedMedia,
  moderationHistory,
  editorialHistory,
  reports,
  nextRevisionId,
  now,
}: {
  detail: ModeratorStoryDetail;
  countrySlug: string | null;
  /** The revision's own currency; null when it could not be read. */
  currency: string | null;
  publishedSnapshot: PublishedRevisionSnapshot | null;
  publishedMedia: Awaited<ReturnType<typeof getPublishedStoryMedia>>;
  moderationHistory: ModerationHistoryRow[];
  editorialHistory: EditorialHistoryRow[];
  reports: Awaited<ReturnType<typeof listReportsForStaff>>;
  /** The next submission waiting, for moving on after a decision. */
  nextRevisionId: string | null;
  now: Date;
}) {
  const isReplacement = publishedSnapshot !== null;

  const parsedContent = normalizeStoryContentJson(detail.content_json);
  const parsedPublishedContent = publishedSnapshot
    ? normalizeStoryContentJson(publishedSnapshot.content_json)
    : null;

  // Two DIFFERENT failures were previously collapsed into one dead-end
  // message ("Could not render submitted content."), which is why a
  // moderator hitting the queue saw it over and over with nothing to do
  // about it:
  //
  //   * The revision genuinely has no content -- content_json is `[]`, the
  //     shape create_self_service_draft() starts every story with. That is
  //     not a rendering failure at all; it is a complete, reviewable fact
  //     about the submission, and the right response is "request changes".
  //     (submit_revision_with_consent() refuses these as of migration
  //     20260902090000, but revisions submitted before that migration are
  //     still sitting in the queue and must remain reviewable.)
  //   * The revision HAS content that today's storyContentSchema cannot
  //     read back even after legacy conversion -- a real, rare defect worth
  //     naming as one.
  const rawContentIsEmpty =
    !Array.isArray(detail.content_json) || detail.content_json.length === 0;
  const contentIsEmpty =
    rawContentIsEmpty ||
    (parsedContent !== null && storyContentText(parsedContent).trim() === "");
  const contentFailedToParse = !contentIsEmpty && parsedContent === null;

  const publishedContentMedia: ContentBlockMediaMap = {};
  if (parsedPublishedContent) {
    const inlineIds = new Set(imageBlockMediaIds(parsedPublishedContent));
    for (const m of publishedMedia) {
      if (!inlineIds.has(m.media_id)) continue;
      const url = getImageUrl({
        id: m.media_id,
        storage_backend: m.storage_backend ?? "supabase",
        public_url: m.public_url,
      });
      if (url) {
        publishedContentMedia[m.media_id] = {
          url,
          altText: m.alt_text,
          decorative: m.decorative,
        };
      }
    }
  }

  const media = parseModeratorMedia(detail.media);
  // Surfaced on the collapsed <summary> itself: the description list starts
  // closed, so undescribed images would otherwise be invisible to a
  // moderator who never opens it.
  //
  // Counts images with NO caption and NO alt text, decorative ones
  // included, because `decorative` is the placeholder every upload starts
  // life with rather than a statement about the image (see MediaRow). The
  // readiness metric's stricter `not decorative` version of this count is
  // measuring something else -- constraint compliance, not whether a
  // reader would be told what is in the picture.
  const undescribedCount = media.filter(
    (m) => !m.altText?.trim() && !m.caption?.trim(),
  ).length;
  // Judged photo by photo. The RPC's own media_processed flag means "already
  // public", which is false for every first submission, so it showed a red
  // "Some still processing" on stories that were perfectly ready.
  const notReadyCount = media.filter((m) => !isMediaReady(m)).length;
  const openReports = reports.filter(
    (r) => r.status === "open" || r.status === "reviewing",
  );
  const regionNames = detail.region_names ?? [];
  const tagNames = detail.tag_names ?? [];
  const submittedRelative = relativeTime(detail.submitted_at, now);
  const country = labelFor(COUNTRY_LABELS, countrySlug);
  const livePath =
    isReplacement && countrySlug && isCountrySlug(countrySlug)
      ? `${countryUrlPrefix(countrySlug)}/stories/${detail.slug}`
      : null;

  // The body the moderator is actually deciding on, rendered once and
  // reused by both the single-column and side-by-side layouts below.
  const submittedBody = contentIsEmpty ? (
    <div className="rounded-2xl bg-destructive/10 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertCircleIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
        This submission has no story content.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        The contributor submitted a title without writing the story. Nothing
        here can be published as-is — request changes with a note asking them to
        write the story, and it will come back to this queue.
      </p>
    </div>
  ) : contentFailedToParse ? (
    <div className="rounded-2xl bg-destructive/10 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertCircleIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
        This revision&rsquo;s stored content could not be read.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        It is not empty, but it does not match any content shape this app can
        render. Do not approve it — this is a defect worth reporting rather than
        a contributor mistake.
      </p>
    </div>
  ) : (
    <PreviewContentBody blocks={parsedContent!} media={media} />
  );

  return (
    <div className={`${PAGE} lg:max-w-6xl`}>
      <Link
        href="/moderation/stories"
        transitionTypes={["nav-back"]}
        className={`${TEXT_LINK} gap-1.5 max-md:hidden`}
      >
        <ArrowLeftIcon aria-hidden="true" className="h-4 w-4" />
        Stories queue
      </Link>

      <header className="mt-1">
        <h1 className={PAGE_TITLE}>{detail.title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">
            {detail.contributor_display_name ?? "Unknown contributor"}
          </span>
          {submittedRelative && (
            <>
              {" · submitted "}
              <span title={absoluteTime(detail.submitted_at) ?? undefined}>
                {submittedRelative}
              </span>
            </>
          )}
        </p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          <li className={`${CHIP} ${CHIP_TONE.tag}`}>
            {labelFor(REVISION_STATUS_LABELS, detail.revision_status)}
          </li>
          {country && (
            <li className={`${CHIP} ${CHIP_TONE.neutral}`}>{country}</li>
          )}
          {isReplacement && (
            <li className={`${CHIP} ${CHIP_TONE.tag}`}>
              Replaces a live story
            </li>
          )}
          {detail.revision_number > 1 && (
            <li className={`${CHIP} ${CHIP_TONE.neutral}`}>
              Version {detail.revision_number}
            </li>
          )}
          {detail.source_kind === "editorial_import" && (
            <li className={`${CHIP} ${CHIP_TONE.neutral}`}>
              {labelFor(SOURCE_KIND_LABELS, detail.source_kind)}
            </li>
          )}
        </ul>
        {livePath && (
          <Link
            href={livePath}
            target="_blank"
            rel="noopener noreferrer"
            className={TEXT_LINK}
          >
            See the live story
            <span className="sr-only"> (opens in a new tab)</span>
          </Link>
        )}
      </header>

      {openReports.length > 0 && (
        <section className="mt-5 rounded-[20px] bg-destructive/10 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-destructive">
            <AlertCircleIcon aria-hidden="true" className="h-5 w-5 shrink-0" />
            Open reports ({openReports.length})
          </h2>
          <ul className="mt-1 divide-y divide-border-subtle">
            {openReports.map((r) => (
              <li key={r.id} className="py-2.5 text-sm">
                <p className="font-semibold">
                  {r.category.replaceAll("_", " ")}
                </p>
                <p className="text-muted-foreground">
                  {r.status}, {absoluteTime(r.created_at)}
                </p>
                {r.details && <p className="mt-1">{r.details}</p>}
                <Link
                  href={`/moderation/reports/${r.id}?storyId=${detail.story_id}`}
                  className={TEXT_LINK}
                >
                  Open this report
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {detail.contributor_note && (
        <section className={`mt-5 ${PANEL}`}>
          <h2 className={SECTION_HEADING}>Note from the contributor</h2>
          <p className="mt-1.5 text-base whitespace-pre-wrap">
            {detail.contributor_note}
          </p>
        </section>
      )}

      {/*
        Two columns from `lg` -- the story to read on the left, the facts to
        check on the right. Below `lg` this is a single column in reading
        order, with the decision last: after the story AND the checks.
      */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:gap-x-8">
        <div className="min-w-0">
          {media.length > 0 && (
            <section aria-label="Photos" className="mb-5">
              <PreviewGallery media={media} />
              <details className="group/photos mt-3 rounded-[20px] bg-surface shadow-sm">
                <summary className="press flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-base font-medium [&::-webkit-details-marker]:hidden">
                  <span className="flex-1">
                    Photo descriptions ({media.length})
                    {undescribedCount > 0 && (
                      <span className="block text-sm text-destructive">
                        {undescribedCount} with no description
                      </span>
                    )}
                  </span>
                  <ChevronIcon
                    aria-hidden="true"
                    className="h-4 w-4 text-muted-foreground transition-transform group-open/photos:rotate-90 motion-reduce:transition-none"
                  />
                </summary>
                <ul className="divide-y divide-border-subtle px-4 pb-2 text-sm">
                  {media.map((m, index) => (
                    <MediaRow key={m.mediaId} item={m} position={index + 1} />
                  ))}
                </ul>
              </details>
            </section>
          )}

          {isReplacement ? (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              <section className={PANEL}>
                <h2 className="text-sm font-bold text-accent">
                  Submitted, under review
                </h2>
                <p className="mt-1 text-lg font-semibold">{detail.title}</p>
                <div className="mt-3">{submittedBody}</div>
              </section>
              <section className={PANEL}>
                <h2 className={SECTION_HEADING}>Live now</h2>
                <p className="mt-1 text-lg font-semibold">
                  {publishedSnapshot.title}
                </p>
                <div className="mt-3">
                  {parsedPublishedContent ? (
                    <ContentBlockRenderer
                      anchorHeadings={false}
                      blocks={parsedPublishedContent}
                      media={publishedContentMedia}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      The published version has no readable content.
                    </p>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <section aria-label="Submitted story" className={PANEL}>
              {submittedBody}
            </section>
          )}
        </div>

        <aside className="min-w-0 space-y-5 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <section className={PANEL}>
            <h2 className={SECTION_HEADING}>Consent &amp; rights</h2>
            <dl className="mt-1 divide-y divide-border-subtle">
              <Check
                label="Consent on file"
                value={detail.consent_valid ? "Valid" : "Missing or invalid"}
                ok={detail.consent_valid}
              />
              <Check
                label="Attributed as"
                value={`${detail.attribution_value ?? "—"} (${detail.attribution_type ?? "unknown"})`}
              />
              <Check
                label="Confirmed by"
                value={
                  labelFor(CONSENT_METHOD_LABELS, detail.confirmation_method) ??
                  "—"
                }
              />
              <Check
                label="Photo rights"
                value={
                  detail.image_rights_confirmed_at
                    ? (absoluteTime(detail.image_rights_confirmed_at) ??
                      "Confirmed")
                    : media.length === 0
                      ? "No photos attached"
                      : "Not confirmed"
                }
                ok={
                  media.length === 0
                    ? null
                    : Boolean(detail.image_rights_confirmed_at)
                }
              />
              <Check
                label="Identifiable people"
                value={
                  detail.identifiable_people_state?.replaceAll("_", " ") ?? "—"
                }
                ok={
                  media.length === 0
                    ? null
                    : detail.identifiable_people_state === "confirmed" ||
                      detail.identifiable_people_state === "not_applicable"
                }
              />
              <Check
                label="Photos ready"
                value={
                  media.length === 0
                    ? "No photos attached"
                    : notReadyCount === 0
                      ? "All ready"
                      : `${notReadyCount} still processing or failed`
                }
                ok={media.length === 0 ? null : notReadyCount === 0}
              />
            </dl>
          </section>

          <section className={PANEL}>
            <h2 className={SECTION_HEADING}>What this story claims</h2>
            <dl className="mt-1 divide-y divide-border-subtle">
              <Check label="Country" value={country ?? "Not available"} />
              <Check
                label="Places"
                value={
                  regionNames.length > 0 ? regionNames.join(", ") : "None set"
                }
                ok={regionNames.length > 0 ? null : false}
              />
              <Check
                label="Tags"
                value={tagNames.length > 0 ? tagNames.join(", ") : "None set"}
                ok={tagNames.length > 0 ? null : false}
              />
              <Check
                label="Trip"
                value={
                  detail.trip_start_date && detail.trip_end_date
                    ? `${calendarDate(detail.trip_start_date)} to ${calendarDate(detail.trip_end_date)}`
                    : (detail.trip_year?.toString() ?? "Not given")
                }
              />
              {detail.total_expense_nzd_cents !== null && (
                <Check
                  label="Total cost"
                  value={
                    currency
                      ? formatMoneyCents(
                          detail.total_expense_nzd_cents,
                          currency,
                          "en",
                        )
                      : // Never guess a currency: a China story's amount is
                        // yuan, and a wrong dollar sign reads as a fact.
                        (detail.total_expense_nzd_cents / 100).toLocaleString(
                          "en-NZ",
                        )
                  }
                />
              )}
            </dl>
          </section>

          <section className={PANEL}>
            <h2 className={SECTION_HEADING}>Moderation history</h2>
            {moderationHistory.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No prior moderation decisions.
              </p>
            ) : (
              <ul className="mt-2 space-y-3 text-sm">
                {moderationHistory.map((h) => (
                  <li key={h.action_id}>
                    <span className="font-semibold">
                      {labelFor(REVISION_STATUS_LABELS, h.new_status)}
                    </span>
                    <p className="text-sm text-muted-foreground">
                      {absoluteTime(h.created_at)}
                    </p>
                    {h.user_facing_reason && (
                      <p className="mt-1 text-muted-foreground">
                        {h.user_facing_reason}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {editorialHistory.length > 0 && (
            <section className={PANEL}>
              <h2 className={SECTION_HEADING}>Editorial history</h2>
              <ul className="mt-2 space-y-3 text-sm">
                {editorialHistory.map((h) => (
                  <li key={h.id}>
                    <span className="font-semibold">
                      {h.action_type.replaceAll("_", " ")}
                    </span>
                    <p className="text-sm text-muted-foreground">
                      {absoluteTime(h.created_at)}
                    </p>
                    <p className="mt-1 text-muted-foreground">{h.summary}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        <div className="min-w-0 lg:col-start-1">
          <ReviewControls
            revisionId={detail.revision_id}
            storyId={detail.story_id}
            storyVersion={detail.story_version}
            revisionStatus={detail.revision_status}
            contentIsEmpty={contentIsEmpty || contentFailedToParse}
            isReplacement={isReplacement}
            nextRevisionId={nextRevisionId}
          />
        </div>
      </div>
    </div>
  );
}

/** "5 Mar 2026" from a calendar date (Engineering Rule 9): no time zone. */
function calendarDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
