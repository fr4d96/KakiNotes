import { z } from "zod";

/**
 * Affirmation notes (supabase/migrations/20261031084021_affirmation_notes.sql).
 *
 * The limits mirror that migration's CHECK constraints -- duplicated on the
 * same terms as lib/validation/profile.ts (Zod for a friendly message, the
 * DB constraint as the non-bypassable source of truth, Engineering Rule 3).
 * Messages are keys into the `validation.affirmation` namespace
 * (lib/validation/issue-messages.ts translates them at the boundary).
 *
 * PLAIN TEXT ONLY. Nothing here strips or allows HTML because nothing ever
 * renders it as HTML: notes are shown as React text with `white-space:
 * pre-wrap` (Engineering Rule 7).
 */
export const AFFIRMATION_NOTE_MAX = 1000;
export const AFFIRMATION_AUTHOR_NAME_MAX = 60;
export const AFFIRMATION_LABEL_MAX = 80;
/** Links per owner; enforced by create_affirmation_link(), repeated here for the UI. */
export const AFFIRMATION_LINK_MAX = 20;

/** The hidden field a person never fills in and a form-stuffing bot does. */
export const AFFIRMATION_HONEYPOT_FIELD = "website";

/** What create_affirmation_link() generates: two UUIDs, hyphens removed. */
export const AFFIRMATION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export const affirmationTokenSchema = z
  .string()
  .regex(AFFIRMATION_TOKEN_PATTERN, "affirmation.tokenInvalid");

/** Trimmed; "" is allowed and means "no value". */
function optionalText(max: number, tooLongKey: string) {
  return z
    .string()
    .trim()
    .max(max, tooLongKey)
    .optional()
    .transform((value) => (value ? value : undefined));
}

export const affirmationLabelSchema = optionalText(
  AFFIRMATION_LABEL_MAX,
  "affirmation.labelTooLong",
);

export const createAffirmationLinkSchema = z.object({
  label: affirmationLabelSchema,
});

export const renameAffirmationLinkSchema = z.object({
  linkId: z.uuid("common.invalidInput"),
  label: affirmationLabelSchema,
});

export const toggleAffirmationLinkSchema = z.object({
  linkId: z.uuid("common.invalidInput"),
  isActive: z.boolean(),
});

export const deleteAffirmationLinkSchema = z.object({
  linkId: z.uuid("common.invalidInput"),
});

export const deleteAffirmationNoteSchema = z.object({
  noteId: z.uuid("common.invalidInput"),
});

export const submitAffirmationNoteSchema = z.object({
  token: affirmationTokenSchema,
  body: z
    .string()
    .trim()
    .min(1, "affirmation.bodyRequired")
    .max(AFFIRMATION_NOTE_MAX, "affirmation.bodyTooLong"),
  authorName: optionalText(
    AFFIRMATION_AUTHOR_NAME_MAX,
    "affirmation.authorNameTooLong",
  ),
});

export type SubmitAffirmationNoteInput = z.infer<
  typeof submitAffirmationNoteSchema
>;
