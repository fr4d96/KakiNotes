"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircleIcon, CloseIcon, LinkIcon } from "@/components/icons";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ResolvingImage } from "@/components/ui/resolving-image";
import { useIsPhone } from "@/components/ui/use-is-phone";
import { useToast } from "@/components/ui/toast";
import { StoryCoverFallback } from "@/components/story/story-cover-fallback";
import { POP_MOTION, useDialogMotion } from "@/components/ui/dialog-motion";

/**
 * The share sheet for a public story: a preview card (the same public cover
 * the page renders -- the caller passes it in, this component never builds an
 * image URL itself) and Copy link / WhatsApp / Email / More.
 *
 * Phones get components/ui/bottom-sheet.tsx; wider screens a centred native
 * <dialog> (showModal(): focus trapped, Escape closes, focus returns to the
 * opener -- same mechanics as components/ui/confirm-dialog.tsx).
 *
 * Only data already public on the story page goes in: title, attribution,
 * place, the canonical path and the public cover. The origin is read from
 * window.location when the sheet is open (it never renders on the server), so
 * a link copied on any deployment opens on that same deployment.
 */
export type ShareStorySheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** e.g. "Mun · Queenstown" -- already shown on the page. */
  subtitle: string;
  /** Root-relative canonical path, e.g. /stories/my-story or /cn/stories/x. */
  path: string;
  /** The page's own public cover URL, or null for the placeholder. */
  coverUrl: string | null;
};

const ACTION_CIRCLE =
  "flex h-14 w-14 items-center justify-center rounded-full transition-transform group-active:scale-95";
const ACTION_BUTTON =
  "group flex w-20 flex-col items-center gap-2 rounded-xl p-1 text-center text-sm whitespace-nowrap font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.95L2 22l5.2-1.36A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.08.8.82-3-.2-.31a8.2 8.2 0 1 1 6.96 3.84Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.22-.08-.39-.12-.55.12-.16.25-.63.8-.78.96-.14.17-.29.19-.53.06a6.7 6.7 0 0 1-3.3-2.88c-.25-.43.25-.4.71-1.32.08-.16.04-.3-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.3-.22.25-.86.84-.86 2.05s.88 2.38 1 2.55c.12.16 1.73 2.64 4.19 3.7 1.55.67 2.15.73 2.92.62.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.17-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}

function MailGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7.5 8 6 8-6" />
    </svg>
  );
}

/** Selection-based copy for webviews that block navigator.clipboard. */
function legacyCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  // Inside the open <dialog> so focus/selection stay in the top layer.
  (document.querySelector("dialog[open]") ?? document.body).appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

function MoreGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <circle cx="5.5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18.5" cy="12" r="1.8" />
    </svg>
  );
}

function ShareBody({
  title,
  subtitle,
  path,
  coverUrl,
}: Omit<ShareStorySheetProps, "open" | "onClose">) {
  const t = useTranslations("story.share");
  const tImages = useTranslations("editor.images");
  const { showToast } = useToast();
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  // Mounted only while open, i.e. always on the client.
  const origin = window.location.origin;
  const url = `${origin}${path}`;
  const host = window.location.host;
  const canShare = typeof navigator.share === "function";

  // The sheet is a modal <dialog> (top layer), so the toast region renders
  // underneath it: the button's own label is the feedback the reader sees.
  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // In-app webviews (WhatsApp, Instagram) often block the async
      // Clipboard API; the legacy selection copy still works there.
      ok = legacyCopy(url);
    }
    setCopied(ok ? "copied" : "failed");
    if (ok) showToast(t("linkCopied"));
    else showToast(t("copyFailed"), "error");
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied("idle"), 3000);
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url });
    } catch {
      // Dismissed by the reader (AbortError) or unavailable: nothing to do.
    }
  }

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`;
  const emailHref = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-3xl bg-surface-muted/60 p-4">
        <div className="flex min-h-28 overflow-hidden rounded-2xl bg-surface shadow-md">
          <div className="relative w-28 shrink-0 self-stretch overflow-hidden bg-surface-muted sm:w-36">
            {coverUrl ? (
              <ResolvingImage
                src={coverUrl}
                alt=""
                loadingLabel={tImages("loading")}
                wrapperClassName="absolute inset-0 block"
                className="h-full w-full object-cover"
              />
            ) : (
              <StoryCoverFallback sizes="144px" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-4 py-3">
            <p className="line-clamp-2 text-base leading-snug font-bold tracking-tight text-foreground">
              {title}
            </p>
            {subtitle ? (
              <p className="line-clamp-2 text-sm text-foreground/70">
                {subtitle}
              </p>
            ) : null}
            <p className="truncate text-sm font-medium text-accent">{host}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-x-2 gap-y-4 rounded-3xl bg-surface p-4">
        <button type="button" onClick={copy} className={ACTION_BUTTON}>
          <span className={`${ACTION_CIRCLE} bg-accent text-accent-foreground`}>
            {copied === "copied" ? (
              <CheckCircleIcon className="h-6 w-6" />
            ) : (
              <LinkIcon className="h-6 w-6" />
            )}
          </span>
          <span aria-live="polite">
            {copied === "copied"
              ? t("linkCopied")
              : copied === "failed"
                ? t("copyFailedShort")
                : t("copyLink")}
          </span>
        </button>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={ACTION_BUTTON}
        >
          <span className={`${ACTION_CIRCLE} bg-green-600 text-white`}>
            <WhatsAppGlyph className="h-7 w-7" />
          </span>
          <span>{t("whatsapp")}</span>
        </a>
        <a href={emailHref} className={ACTION_BUTTON}>
          <span className={`${ACTION_CIRCLE} bg-foreground text-background`}>
            <MailGlyph className="h-6 w-6" />
          </span>
          <span>{t("email")}</span>
        </a>
        {canShare ? (
          <button type="button" onClick={nativeShare} className={ACTION_BUTTON}>
            <span
              className={`${ACTION_CIRCLE} bg-surface-muted text-foreground`}
            >
              <MoreGlyph className="h-6 w-6" />
            </span>
            <span>{t("more")}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ShareDialog({ open, onClose, ...rest }: ShareStorySheetProps) {
  const t = useTranslations("story.share");
  const tCommon = useTranslations("common");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Animated open/close that also works on iPhone; see dialog-motion.ts.
  const motion = useDialogMotion(dialogRef, open, () => POP_MOTION, onClose);

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={motion.onCancel}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
      className="journiq-modal m-auto w-[min(92vw,30rem)] rounded-[28px] border border-border-subtle bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-2xl font-semibold tracking-tight">
            {t("title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon("close")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground/70 transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        {open ? <ShareBody {...rest} /> : null}
      </div>
    </dialog>
  );
}

export function ShareStorySheet(props: ShareStorySheetProps) {
  const isPhone = useIsPhone();
  const t = useTranslations("story.share");

  if (isPhone) {
    return (
      <BottomSheet open={props.open} onClose={props.onClose} title={t("title")}>
        <ShareBody
          title={props.title}
          subtitle={props.subtitle}
          path={props.path}
          coverUrl={props.coverUrl}
        />
      </BottomSheet>
    );
  }
  return <ShareDialog {...props} />;
}
