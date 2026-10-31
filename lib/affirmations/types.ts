/**
 * Row shapes for the affirmation-notes RPCs
 * (supabase/migrations/20261031084021_affirmation_notes.sql), derived from the
 * generated `types/database.ts` so they cannot drift from it.
 *
 * One deliberate override: Postgres `RETURNS TABLE` columns carry no
 * nullability, so the generator types `label` / `author_name` / `link_label` /
 * `recipient_name` as plain `string` although they are nullable at runtime
 * (the underlying columns are nullable, and the writing RPC left-joins the
 * owner's public name). Those fields are re-widened to `string | null` below;
 * everything else is taken from the generated types as-is.
 */
import type { Database } from "@/types/database";

type Fns = Database["public"]["Functions"];

export type AffirmationLink = Omit<
  Fns["list_my_affirmation_links"]["Returns"][number],
  "label"
> & { label: string | null };

export type AffirmationNote = Omit<
  Fns["list_my_affirmation_notes"]["Returns"][number],
  "author_name" | "link_label"
> & { author_name: string | null; link_label: string | null };

/** What the anonymous writing page is allowed to know about a link. */
export type AffirmationWritingTarget = Omit<
  Fns["get_affirmation_link_for_writing"]["Returns"][number],
  "label" | "recipient_name"
> & { label: string | null; recipient_name: string | null };
