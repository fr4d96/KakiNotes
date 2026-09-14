import type { z } from "zod";

/**
 * How Zod messages get translated.
 *
 * The reader- and contributor-facing schemas in this folder (auth, profile,
 * username, story, discovery, pdf-import) no longer carry English prose as
 * their `message`; they carry a KEY into the `validation` namespace of
 * messages/<locale>.json -- `"auth.emailRequired"`, `"story.titleRequired"`.
 * A schema is data, not UI, so it does not know the visitor's language;
 * the Server Action or Client Component that reports the failure does,
 * and it is that trust boundary that turns the key into text via the two
 * helpers below. Nothing in lib/validation imports React or next-intl.
 *
 * Numbers a message needs (`{min}`, `{max}`) come from the ISSUE, not from
 * the message: a `z.string().min(6, "auth.passwordTooShort")` failure
 * carries `minimum: 6`, so the constant in the schema and the number in the
 * sentence cannot drift apart.
 *
 * A message that is NOT a known key -- Zod's own defaults ("Invalid input:
 * expected string, received undefined"), or the staff-only schemas that
 * still carry English (admin, moderation, readiness -- out of scope) --
 * passes through untouched, which is exactly what those boundaries showed
 * before.
 */

/**
 * next-intl's translator, typed structurally and loosely: its real type is
 * generic over the literal keys of the namespace, which is exactly what the
 * dynamic `issue.message` lookup below cannot satisfy. `never` parameters
 * accept any translator (contravariance) while keeping `any` out of the
 * public signature; a test can pass a plain object.
 */
export type ValidationTranslator = {
  (key: never, values?: never): string;
  has(key: never): boolean;
};

type Values = Record<string, string | number>;

function issueValues(issue: z.core.$ZodIssue): Values {
  const values: Values = {};
  if ("minimum" in issue && typeof issue.minimum === "number") {
    values.min = issue.minimum;
  }
  if ("maximum" in issue && typeof issue.maximum === "number") {
    values.max = issue.maximum;
  }
  return values;
}

/** One issue -> one sentence in the translator's language. */
export function translateIssue(
  issue: z.core.$ZodIssue,
  t: ValidationTranslator,
): string {
  const key = issue.message as never;
  return t.has(key) ? t(key, issueValues(issue) as never) : issue.message;
}

/**
 * The first issue's sentence, or the fallback key's when there is none --
 * the shape every `parsed.error.issues[0]?.message ?? "Invalid input."`
 * call site had, now translated.
 */
export function firstIssueMessage(
  error: z.ZodError,
  t: ValidationTranslator,
  fallbackKey: string,
): string {
  const issue = error.issues[0];
  return issue ? translateIssue(issue, t) : t(fallbackKey as never);
}

/**
 * `flatten().fieldErrors`, translated -- for forms that show a message
 * beside each field rather than one at the top.
 */
export function translateFieldErrors(
  error: z.ZodError,
  t: ValidationTranslator,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "");
    (out[field] ??= []).push(translateIssue(issue, t));
  }
  return out;
}
