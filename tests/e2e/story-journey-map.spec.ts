import path from "node:path";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * The public story journey map (components/story/journey-map.tsx).
 *
 * NEEDS, and skips itself without:
 *   1. .env.test.local credentials (same fixed account pool as
 *      public-discovery.spec.ts), and
 *   2. supabase/migrations/20261029042052_story_revision_stops.sql APPLIED to
 *      the project those credentials point at. set_revision_stops() is probed
 *      in beforeAll; a "function not found" answer skips the whole file
 *      instead of failing it, so this spec is safe to merge ahead of the
 *      migration.
 *
 * Fixture: a story whose title starts with `rls-test` (so
 * scripts/rls-test-cleanup.sql's existing slug scope covers it), published
 * through the same create -> stops -> submit -> approve RPC flow
 * public-discovery.spec.ts uses.
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
const storyTitle = `rls-test-e2e-journey-${runId}`;

let fixtureSlug: string | undefined;
let stopsAvailable = false;

test.beforeAll(async () => {
  test.setTimeout(60_000);
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

  const { data: created, error: createError } = await owner.rpc(
    "create_self_service_draft",
    {
      p_title: storyTitle,
      p_content_json: [
        {
          type: "markdown",
          text: "## Cromwell\n\nA fixture story for the journey map e2e spec.\n\n## Queenstown\n\nMore fixture text.",
        },
      ],
    },
  );
  if (createError || !created) {
    throw new Error(`Could not create fixture draft: ${createError?.message}`);
  }
  const revisionId = created[0].revision_id;
  const storyId = created[0].story_id;

  const { data: draft } = await owner.rpc("get_my_story_with_draft", {
    p_story_id: storyId,
  });
  fixtureSlug = draft![0].slug;
  let version = draft![0].version;

  // Not in the generated types until the migration is applied and the types
  // are regenerated -- hence the cast.
  const { error: stopsError } = await (
    owner.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { code?: string; message: string } | null }>
  )("set_revision_stops", {
    p_revision_id: revisionId,
    p_expected_version: version,
    p_stops: [
      { latitude: -36.85, longitude: 174.76, label: "Near Auckland" },
      { latitude: -41.29, longitude: 174.78, label: "Wellington" },
      {
        latitude: -45.03,
        longitude: 169.2,
        label: "Near Queenstown",
        section_anchor: "queenstown",
      },
      // Two places INSIDE the last main stop (parent_index = array position).
      {
        latitude: -44.94,
        longitude: 168.83,
        label: "Arrowtown",
        parent_index: 2,
      },
      {
        latitude: -44.85,
        longitude: 168.39,
        label: "Glenorchy",
        parent_index: 2,
      },
    ],
  });
  if (stopsError) {
    if (
      stopsError.code === "PGRST202" ||
      /could not find the function/i.test(stopsError.message)
    ) {
      return; // migration not applied: stopsAvailable stays false
    }
    throw new Error(`Could not set stops: ${stopsError.message}`);
  }
  stopsAvailable = true;
  version += 1;

  const { error: submitError } = await owner.rpc(
    "submit_revision_with_consent",
    {
      p_revision_id: revisionId,
      p_expected_version: version,
      p_confirmation_method: "account",
      p_publication_confirmed: true,
      p_expected_terms_version: termsVersion,
    },
  );
  if (submitError) throw new Error(`Could not submit: ${submitError.message}`);

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

  await owner.auth.signOut();
  await moderator.auth.signOut();
});

test.describe("story journey map (mobile viewport)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows the route, an ordered stop list, and links a stop to its section", async ({
    page,
  }) => {
    test.skip(!hasCredentials, "requires .env.test.local");
    test.skip(!stopsAvailable, "requires the story_revision_stops migration");

    await page.goto(`/stories/${fixtureSlug}`);
    const journey = page.getByRole("region", { name: "The journey" });
    await expect(journey).toBeVisible();

    // Only the three MAIN stops at first; the places inside stay hidden.
    const items = journey.getByRole("listitem");
    await expect(items).toHaveCount(3);
    await expect(journey).not.toContainText("Arrowtown");
    await expect(journey).toContainText("+2 places");
    await expect(items.nth(0)).toContainText("Near Auckland");
    await expect(items.nth(2)).toContainText("Near Queenstown");

    // Readers see labels, never coordinates.
    await expect(journey).not.toContainText("-36.85");

    // Pause the drive, then jump to the last stop with the keyboard-reachable pin.
    await journey.getByRole("button", { name: "Pause" }).click();
    await journey
      .getByRole("button", { name: "Stop 3: Near Queenstown" })
      .focus();
    await page.keyboard.press("Enter");
    const card = journey.locator('li[aria-current="step"]');
    await expect(card).toContainText("Near Queenstown");
    await card.getByRole("link", { name: "Read this part" }).click();
    await expect(page).toHaveURL(/#section-queenstown$/);
    await expect(
      page.getByRole("heading", { level: 2, name: "Queenstown" }),
    ).toBeInViewport();
  });

  test("opens a main stop to show its places inside, and goes back", async ({
    page,
  }) => {
    test.skip(!hasCredentials, "requires .env.test.local");
    test.skip(!stopsAvailable, "requires the story_revision_stops migration");

    await page.goto(`/stories/${fixtureSlug}`);
    const journey = page.getByRole("region", { name: "The journey" });
    const row = journey.getByRole("button", { name: /^Near Queenstown/ });
    await expect(row).toHaveAttribute("aria-expanded", "false");
    await row.click();

    await expect(row).toHaveAttribute("aria-expanded", "true");
    const inside = journey.getByRole("list", {
      name: "Places inside Near Queenstown",
    });
    await expect(inside.getByRole("listitem")).toHaveCount(2);
    await expect(inside).toContainText("Arrowtown");
    await expect(inside).toContainText("Glenorchy");
    await expect(
      journey.getByRole("button", { name: "Place 3a: Arrowtown" }),
    ).toBeVisible();
    // The drive is paused while a stop is open.
    await expect(
      journey.getByRole("button", { name: "Play the journey" }),
    ).toBeVisible();

    await journey
      .getByRole("button", { name: "Back to whole journey" })
      .click();
    await expect(inside).toHaveCount(0);
    await expect(journey).not.toContainText("Arrowtown");

    // Escape closes it too.
    await row.click();
    await expect(inside).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(inside).toHaveCount(0);
  });
});

test.describe("story journey map (reduced motion)", () => {
  test.use({
    contextOptions: { reducedMotion: "reduce" },
    viewport: { width: 390, height: 844 },
  });

  test("keeps the route and list but offers no animation controls", async ({
    page,
  }) => {
    test.skip(!hasCredentials, "requires .env.test.local");
    test.skip(!stopsAvailable, "requires the story_revision_stops migration");

    await page.goto(`/stories/${fixtureSlug}`);
    const journey = page.getByRole("region", { name: "The journey" });
    await expect(journey.getByRole("listitem")).toHaveCount(3);
    // Opening a main stop still works, instantly.
    await journey.getByRole("button", { name: /^Near Queenstown/ }).click();
    await expect(
      journey.getByRole("list", { name: "Places inside Near Queenstown" }),
    ).toBeVisible();
    await journey
      .getByRole("button", { name: "Back to whole journey" })
      .click();
    await expect(
      journey.getByRole("button", { name: /^(Pause|Play the journey)$/ }),
    ).toHaveCount(0);
    await expect(page.getByTestId("journey-campervan")).toHaveCount(0);
  });
});
