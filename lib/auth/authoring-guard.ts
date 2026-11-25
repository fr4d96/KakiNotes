import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUserRole } from "@/lib/auth/roles";
import { isReviewOnly } from "@/lib/auth/staff-menu";

/**
 * The layout of every writing area (My Stories and its folders, a new story,
 * My Photos, affirmation notes): a moderator who gets to one anyway -- an
 * old bookmark, a typed address -- is sent to Moderation.
 *
 * A convenience, not a permission. Nothing here is secret from a moderator
 * and the database still decides what any account may write; the
 * (contributor) layout above has already required a session.
 */
export async function AuthoringLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (isReviewOnly(await getCurrentUserRole())) redirect("/moderation");
  return children;
}
