import { redirect } from "next/navigation";

/**
 * There is no journey list any more (2026-11-15): Story folders is the main
 * view, and a trip's journey opens only from its folder's journey icon
 * (./[storyId]). This address used to be the Journey tab, so it forwards to
 * the folders instead of 404ing for old links and bookmarks.
 */
export default function MyJourneyPage() {
  redirect("/my-stories/map");
}
