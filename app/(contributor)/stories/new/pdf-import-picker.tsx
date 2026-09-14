"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  MAX_PDF_IMPORT_INPUT_BYTES,
  isPdfMagicBytes,
} from "@/lib/story/pdf-validation";
import { MAX_IMAGES_PER_REVISION } from "@/lib/story/image-validation";

type PreviewPage = {
  pageNumber: number;
  width: number;
  height: number;
  dataUrl: string;
};

const MAX_MB = Math.round(MAX_PDF_IMPORT_INPUT_BYTES / (1024 * 1024));

/**
 * Contributor-facing twin of
 * app/(editor)/editorial/new/pdf-import-picker.tsx — same two-phase upload
 * -> pick pages -> attach flow, against the contributor-only
 * /stories/new/pdf-preview and /stories/new/pdf-attach routes instead of the
 * editorial ones, and with only a Title field (no contributor-selection
 * fields — the signed-in contributor is the story's author). Lands directly
 * in the contributor's own editor at /stories/:id/edit on success.
 */
export function PdfImportPicker() {
  const t = useTranslations("pdfImport");
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pages, setPages] = useState<PreviewPage[] | null>(null);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [altText, setAltText] = useState<Record<number, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const limitReached = selectedPages.length >= MAX_IMAGES_PER_REVISION;
  const allAltTextFilled = selectedPages.every(
    (p) => (altText[p] ?? "").trim().length > 0,
  );
  const canSubmit =
    title.trim().length > 0 &&
    selectedPages.length > 0 &&
    allAltTextFilled &&
    !submitting;

  function resetPreviewState() {
    setPages(null);
    setSelectedPages([]);
    setAltText({});
    setPreviewError(null);
    setSubmitError(null);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    resetPreviewState();
    setFile(e.target.files?.[0] ?? null);
  }

  async function handlePreview() {
    setSubmitError(null);
    if (!file) {
      setPreviewError(t("errors.chooseFileFirst"));
      return;
    }
    const isPdfExtension = /\.pdf$/i.test(file.name);
    const isPdfType = file.type === "application/pdf" || file.type === "";
    if (!isPdfExtension || !isPdfType) {
      setPreviewError(t("errors.chooseFile"));
      return;
    }
    if (file.size > MAX_PDF_IMPORT_INPUT_BYTES) {
      setPreviewError(t("errors.fileTooLarge", { max: MAX_MB }));
      return;
    }
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (!isPdfMagicBytes(head)) {
      setPreviewError(t("errors.notAPdf"));
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/stories/new/pdf-preview", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as {
        pageCount?: number;
        pages?: PreviewPage[];
        error?: string;
      };
      if (!response.ok || !body.pages) {
        setPreviewError(body.error ?? t("errors.couldNotRead"));
        return;
      }
      setPages(body.pages);
      setSelectedPages([]);
      setAltText({});
    } catch {
      setPreviewError(t("errors.uploadFailed"));
    } finally {
      setPreviewLoading(false);
    }
  }

  function toggleSelect(pageNumber: number) {
    setSelectedPages((prev) => {
      if (prev.includes(pageNumber)) {
        return prev.filter((p) => p !== pageNumber);
      }
      if (prev.length >= MAX_IMAGES_PER_REVISION) return prev;
      return [...prev, pageNumber];
    });
  }

  async function handleAttachSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    if (!title.trim()) {
      setSubmitError(t("errors.titleFirst"));
      return;
    }
    if (!file) {
      setSubmitError(t("errors.chooseFileFirst"));
      return;
    }
    if (selectedPages.length === 0) {
      setSubmitError(t("errors.selectPage"));
      return;
    }
    if (!allAltTextFilled) {
      setSubmitError(t("errors.altTextRequired"));
      return;
    }

    const formData = new FormData();
    formData.set("title", title.trim());
    formData.set("file", file);
    formData.set("pageNumbers", JSON.stringify(selectedPages));
    formData.set(
      "altText",
      JSON.stringify(
        Object.fromEntries(
          selectedPages.map((p) => [String(p), (altText[p] ?? "").trim()]),
        ),
      ),
    );

    setSubmitting(true);
    try {
      const response = await fetch("/stories/new/pdf-attach", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as {
        storyId?: string;
        error?: string;
      };
      if (!response.ok || !body.storyId) {
        setSubmitError(body.error ?? t("errors.createFailed"));
        setSubmitting(false);
        return;
      }
      router.push(`/stories/${body.storyId}/edit`);
    } catch {
      setSubmitError(t("errors.requestFailed"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleAttachSubmit} className="mt-6 space-y-6">
      {submitError && (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      )}

      <div>
        <label htmlFor="pdf-import-title" className="block text-sm font-medium">
          {t("titleLabel")}
        </label>
        <input
          id="pdf-import-title"
          type="text"
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded-md border border-border-subtle px-3 py-2 dark:bg-transparent"
        />
      </div>

      <div>
        <label htmlFor="pdf-import-file" className="block text-sm font-medium">
          {t("fileLabel")}
        </label>
        <input
          id="pdf-import-file"
          type="file"
          accept=".pdf,application/pdf"
          onChange={onFileChange}
          className="mt-1 w-full rounded-md border border-border-subtle px-3 py-2 text-sm dark:bg-transparent"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t("fileHint", { max: MAX_MB })}
        </p>
        <button
          type="button"
          onClick={handlePreview}
          disabled={!file || previewLoading}
          className="mt-2 rounded-md border border-border-subtle px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        >
          {previewLoading ? t("reading") : t("uploadAndPreview")}
        </button>
        {previewError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {previewError}
          </p>
        )}
      </div>

      {pages && pages.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t("selectPages")}</h2>
            <p
              aria-live="polite"
              className={`text-sm ${limitReached ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
            >
              {t("selectedOf", {
                selected: selectedPages.length,
                max: MAX_IMAGES_PER_REVISION,
              })}
              {limitReached ? t("limitReached") : ""}
            </p>
          </div>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pages.map((page) => {
              const selected = selectedPages.includes(page.pageNumber);
              const disabled = !selected && limitReached;
              return (
                <li key={page.pageNumber} className="space-y-2">
                  <button
                    type="button"
                    onClick={() => toggleSelect(page.pageNumber)}
                    disabled={disabled}
                    aria-pressed={selected}
                    aria-label={
                      disabled
                        ? t("pageLabelDisabled", {
                            page: page.pageNumber,
                            max: MAX_IMAGES_PER_REVISION,
                          })
                        : selected
                          ? t("pageLabelSelected", { page: page.pageNumber })
                          : t("pageLabel", { page: page.pageNumber })
                    }
                    title={
                      disabled
                        ? `Limit of ${MAX_IMAGES_PER_REVISION} pages reached`
                        : undefined
                    }
                    className={`relative aspect-[3/4] w-full overflow-hidden rounded-md border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected
                        ? "border-accent ring-2 ring-accent"
                        : "border-border-subtle hover:bg-surface-muted"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a base64 data URL, not an optimizable static asset */}
                    <img
                      src={page.dataUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                      {page.pageNumber}
                    </span>
                    {selected && (
                      <span className="absolute right-1 top-1 rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-accent-foreground">
                        ✓
                      </span>
                    )}
                  </button>

                  {selected && (
                    <div>
                      <label
                        htmlFor={`pdf-alt-text-${page.pageNumber}`}
                        className="block text-xs font-medium"
                      >
                        {t("altTextLabel", { page: page.pageNumber })}
                      </label>
                      <input
                        id={`pdf-alt-text-${page.pageNumber}`}
                        type="text"
                        required
                        value={altText[page.pageNumber] ?? ""}
                        onChange={(e) =>
                          setAltText((prev) => ({
                            ...prev,
                            [page.pageNumber]: e.target.value,
                          }))
                        }
                        maxLength={500}
                        placeholder={t("describePage")}
                        className="mt-1 w-full rounded border border-border-subtle px-2 py-1 text-xs dark:bg-transparent"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center justify-center rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
      >
        {submitting ? t("creating") : t("createStory")}
      </button>
    </form>
  );
}
