/**
 * Typed access to the "story starter" writing prompts shown on the Story
 * step of the editor (see docs/story-starters-research.md).
 *
 * The prompt copy itself lives in i18n/prompts/story-starters.<locale>.json,
 * NOT as string constants in this file or in i18n/messages/<locale>.json.
 * That is deliberate: these questions are editorial content that has to
 * clear the same "personal experience, not advice" moderation boundary as
 * a contributor's own story (Engineering Rule 17, moderation-guidelines.md)
 * -- so they get reviewed like content, by whoever owns that boundary, not
 * like code. Keeping them in their own per-locale JSON file makes that
 * review a small, readable diff instead of a change buried in a UI string
 * bundle.
 */
import { z } from "zod";
import type { Locale } from "@/i18n/locales";
import en from "@/i18n/prompts/story-starters.en.json";
import zhCN from "@/i18n/prompts/story-starters.zh-CN.json";

const trimmedNonEmpty = z.string().trim().min(1);

const topicSlug = trimmedNonEmpty.regex(
  /^[a-z-]+$/,
  "topic must be a lowercase, hyphenated slug",
);

const promptId = trimmedNonEmpty.regex(
  /^[a-z-]+-\d+$/,
  "id must be <topic>-<n>",
);

const outlineEntrySchema = z.object({
  topic: topicSlug,
  heading: trimmedNonEmpty,
});

const promptSchema = z.object({
  id: promptId,
  topic: topicSlug,
  heading: trimmedNonEmpty,
  question: trimmedNonEmpty,
});

export const storyStartersSchema = z
  .object({
    outline: z.array(outlineEntrySchema),
    prompts: z.array(promptSchema),
  })
  .refine(
    (data) =>
      new Set(data.outline.map((o) => o.topic)).size === data.outline.length,
    { message: "outline topics must be unique" },
  )
  .refine(
    (data) => {
      const topics = new Set(data.outline.map((o) => o.topic));
      return data.prompts.every((p) => topics.has(p.topic));
    },
    { message: "every prompt.topic must exist in outline" },
  );

export type StoryStarterTopic = z.infer<typeof outlineEntrySchema>;
export type StoryStarterPrompt = z.infer<typeof promptSchema>;
export type StoryStarters = z.infer<typeof storyStartersSchema>;

const RAW_STARTERS: Record<Locale, unknown> = {
  en,
  "zh-CN": zhCN,
};

const parsedCache = new Map<Locale, StoryStarters>();

/**
 * Parses and validates the story starter data for a locale, once. Throws
 * if the JSON for that locale fails validation -- a bad prompt file should
 * fail loudly (build/tests), not render a broken card.
 */
export function getStoryStarters(locale: Locale): StoryStarters {
  const cached = parsedCache.get(locale);
  if (cached) return cached;

  const parsed = storyStartersSchema.parse(RAW_STARTERS[locale]);
  parsedCache.set(locale, parsed);
  return parsed;
}

/**
 * Renders the nine outline headings as Markdown, in order, ready to insert
 * into an empty story body ("Start from an outline", Layer 2).
 */
export function outlineMarkdown(outline: StoryStarters["outline"]): string {
  return outline.map((h) => `## ${h.heading}`).join("\n\n") + "\n";
}

/**
 * Fisher-Yates shuffle. Returns a new array and never mutates `items`, so
 * callers can shuffle the prompt library once per session without
 * disturbing the original order.
 */
export function shuffleStarters<T>(
  items: readonly T[],
  random: () => number = Math.random,
): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
