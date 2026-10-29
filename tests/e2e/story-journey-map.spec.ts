import path from "node:path";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * A contributor's journey map (components/story/journey-map.tsx), shown on
 * the Journey tab of their public profile (/contributors/[slug]/journey).
 * One pin per published New Zealand story; sub stories (story folders) sit
 * inside their main story's pin; opening a pin links to the story.
 *
 * NEEDS, and skips itself without:
 *   1. .env.test.local credentials (same fixed account pool as
 *      public-discovery.spec.ts), and
 *   2. supabase/migrations/20261029091942_contributor_journey.sql APPLIED to
 *      the project those credentials point at. set_story_journey_place() is
 *      probed in beforeAll; a "function not found" answer skips the whole
 *      file instead of failing it.
 *   3. the owner account having a PUBLIC contributor profile (the tab lives
 *      on it); otherwise the file skips.
 *
 * Fixture: three stories whose titles start with `rls-test` (so
 * scripts/rls-test-cleanup.sql's existing slug scope covers them), published
 * through the same create -> submit -> approve RPC flow
 * public-discovery.spec.ts uses: a main story (Queenstown), a sub story filed
 * under it (Arrowtown), and a later standalone story (Wellington).
 */
try {
  process.loadEnvFile(path.join(__dirname, "..", ".env.test.local"));
} catch {
  // Absent -- the tests below skip themselves.
}

const SUPABASE_URL = process.env.SUPABASE_RLS_TEST_URL;
const KEY = process.env.SUPABASE_RLS_TEST_PUBLISHABLE_KEY;
const OWNER_EMAIL = process.env.SUPABASE_RLS_TEST_OWNER_EMAIL;
const OWNER_PASSWORD = process.env.SUPABASE_RLS_TEST_OWNER_PASSWORD;
const MODERATOR_EMAIL = process.env.SUPABASE_RLS_TEST_MODERATOR_EMAIL;
const MODERATOR_PASSWORD = process.env.SUPABASE_RLS_TEST_MODERATOR_PASSWORD;

const hasCredentials = Boolean(
  SUPABASE_URL &&
  KEY &&
  OWNER_EMAIL &&
  OWNER_PASSWORD &&
  MODERATOR_EMAIL &&
  MODERATOR_PASSWORD,
);

const runId = Math.random().toString(36).slice(2, 10);

let contributorSlug: string | undefined;
let mainSlug: string | undefined;
let journeyAvailable = false;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  if (!hasCredentials) return;

  const anon = () => createClient<Database>(SUPABASE_URL!, KEY!);
  const owner = anon();
  const moderator = anon();
  const { error: ownerError } = await owner.auth.signInWithPassword({
    email: OWNER_EMAIL!,
    password: OWNER_PASSWORD!,
  });
  if (ownerError) throw ownerError;
  const { error: modError } = await moderator.auth.signInWithPassword({
    email: MODERATOR_EMAIL!,
    password: MODERATOR_PASSWORD!,
  });
  if (modError) throw modError;

  const { data: termsVersion } = await owner.rpc("current_terms_version");
  if (!termsVersion) throw new Error("Could not fetch terms version");

  /** create -> submit -> approve, returning the story's id and slug. */
  async function publish(title: string) {
    const { data: created, error: createError } = await owner.rpc(
      "create_self_service_draft",
      {
        p_title: title,
        p_content_json: [
          { type: "markdown", text: "A fixture story for the journey e2e." },
        ],
      },
    );
    if (createError || !created) {
      throw new Error(`Could not create ${title}: ${createError?.message}`);
    }
    const revisionId = created[0].revision_id;
    const storyId = created[0].story_id;
    const { data: draft } = await owner.rpc("get_my_story_with_draft", {
      p_story_id: storyId,
    });
    const { error: submitError } = await owner.rpc(
      "submit_revision_with_consent",
      {
        p_revision_id: revisionId,
        p_expected_version: draft![0].version,
        p_confirmation_method: "account",
        p_publication_confirmed: true,
        p_expected_terms_version: termsVersion!,
      },
    );
    if (submitError)
      throw new Error(`Could not submit: ${submitError.message}`);
    const { data: attemptId, error: beginError } = await moderator.rpc(
      "begin_story_publication_attempt",
      { p_revision_id: revisionId },
    );
    if (beginError || !attemptId) {
      throw new Error(`Could not begin publication: ${beginError?.message}`);
    }
    const { error: finalizeError } = await moderator.rpc(
      "finalize_story_publication",
      { p_revision_id: revisionId, p_approval_attempt_id: attemptId },
    );
    if (finalizeError) {
      throw new Error(`Could not finalize: ${finalizeError.message}`);
    }
    return { storyId, slug: draft![0].slug as string };
  }

  const main = await publish(`rls-test-e2e-journey-queenstown-${runId}`);
  const sub = await publish(`rls-test-e2e-journey-arrowtown-${runId}`);
  const later = await publish(`rls-test-e2e-journey-wellington-${runId}`);
  mainSlug = main.slug;

  const pin = (storyId: string, label: string, lat: number, lng: number) =>
    owner.rpc("set_story_journey_place", {
      p_story_id: storyId,
      p_label: label,
      p_latitude: lat,
      p_longitude: lng,
    });

  const probe = await pin(main.storyId, "Near Queenstown", -45.03, 168.66);
  if (probe.error) {
    if (
      probe.error.code === "PGRST202" ||
      /could not find the function/i.test(probe.error.message)
    ) {
      return; // migration not applied: journeyAvailable stays false
    }
    throw new Error(`Could not pin: ${probe.error.message}`);
  }
  for (const result of [
    await pin(sub.storyId, "Arrowtown", -44.94, 168.83),
    await pin(later.storyId, "Wellington", -41.29, 174.78),
    await owner.rpc("set_story_parent", {
      p_story_id: sub.storyId,
      p_parent_id: main.storyId,
    }),
  ]) {
    if (result.error)
      throw new Error(`Fixture failed: ${result.error.message}`);
  }

  const { data: published } = await owner.rpc("get_published_story", {
    p_slug: main.slug,
  });
  contributorSlug = published?.[0]?.contributor_slug ?? undefined;
  journeyAvailable = true;

  await owner.auth.signOut();
  await moderator.auth.signOut();
});

function skipUnlessReady() {
  test.skip(!hasCredentials, "requires .env.test.local");
  test.skip(!journeyAvailable, "requires the contributor_journey migration");
  test.skip(!contributorSlug, "requires a public contributor profile");
}

test.describe("contributor journey (mobile viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the profile offers a Journey tab that shows the pins in trip order", async ({
    page,
  }) => {
    skipUnlessReady();

    await page.goto(`/contributors/${contributorSlug}`);
    const tabs = page.getByRole("navigation", { name: "Profile sections" });
    await tabs.getByRole("link", { name: "Journey" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/contributors/${contributorSlug}/journey$`),
    );
    await expect(tabs.getByRole("link", { name: "Journey" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const journey = page.getByRole("region", { name: "The journey" });
    await expect(journey).toBeVisible();
    // Main pins only at first; the sub story sits inside Queenstown.
    const items = journey
      .getByRole("list", { name: "Stops" })
      .getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("Near Queenstown");
    await expect(items.nth(1)).toContainText("Wellington");
    await expect(journey).not.toContainText("Arrowtown");
    await expect(journey).toContainText("+1 place");
    // Readers see labels, never coordinates.
    await expect(journey).not.toContainText("-45.03");
  });

  test("a pin opens its story, and the story links back to the journey", async ({
    page,
  }) => {
    skipUnlessReady();

    await page.goto(`/contributors/${contributorSlug}/journey`);
    const journey = page.getByRole("region", { name: "The journey" });
    await journey.getByRole("button", { name: "Pause" }).click();
    await journey
      .getByRole("button", { name: "Stop 1: Near Queenstown" })
      .focus();
    await page.keyboard.press("Enter");
    await journey
      .locator('li[aria-current="step"]')
      .getByRole("link", { name: /Read this story/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/stories/${mainSlug}$`));

    await page.getByRole("link", { name: /See this on .* journey/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/contributors/${contributorSlug}/journey$`),
    );
  });

  test("opens a main pin to show the sub story inside, and goes back", async ({
    page,
  }) => {
    skipUnlessReady();

    await page.goto(`/contributors/${contributorSlug}/journey`);
    const journey = page.getByRole("region", { name: "The journey" });
    const row = journey.getByRole("button", { name: /^Near Queenstown/ });
    await expect(row).toHaveAttribute("aria-expanded", "false");
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
    const inside = journey.getByRole("list", {
      name: "Places inside Near Queenstown",
    });
    await expect(inside).toContainText("Arrowtown");
    await expect(
      inside.getByRole("link", { name: /Read this story/ }),
    ).toHaveCount(1);

    await journey
      .getByRole("button", { name: "Back to whole journey" })
      .click();
    await expect(inside).toHaveCount(0);
  });
});

test.describe("contributor journey (reduced motion)", () => {
  test.use({
    contextOptions: { reducedMotion: "reduce" },
    viewport: { width: 390, height: 844 },
  });

  test("keeps the route and list but offers no animation controls", async ({
    page,
  }) => {
    skipUnlessReady();

    await page.goto(`/contributors/${contributorSlug}/journey`);
    const journey = page.getByRole("region", { name: "The journey" });
    await expect(
      journey.getByRole("list", { name: "Stops" }).getByRole("listitem"),
    ).toHaveCount(2);
    await expect(
      journey.getByRole("button", { name: /^(Pause|Play the journey)$/ }),
    ).toHaveCount(0);
    await expect(page.getByTestId("journey-campervan")).toHaveCount(0);
  });
});
