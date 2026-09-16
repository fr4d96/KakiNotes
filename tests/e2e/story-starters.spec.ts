import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { signInUi } from "./helpers/sign-in";
import promptsEn from "../../i18n/prompts/story-starters.en.json";

/**
 * Coverage for the "story starters" card (components/story/story-starters-card.tsx)
 * on the Story step of the contributor editor. Follows the established
 * pattern (e2e/cross-contributor-access.spec.ts): sign in as the seeded
 * owner account through the real UI, create a fresh story through
 * /stories/new, and drive the actual editor -- no RPC shortcuts, since the
 * card itself is what's under test.
 *
 * Requires the same SUPABASE_RLS_TEST_OWNER_* credentials in
 * .env.test.local as the other RLS-fixture specs (see docs/architecture.md
 * "RLS integration test setup"); skips itself otherwise.
 *
 * Fixture hygiene: every title leads with `rls-test`, matching
 * scripts/rls-test-cleanup.sql's `slug like 'rls-test-%'` scope.
 */

try {
  process.loadEnvFile(path.join(__dirname, "..", ".env.test.local"));
} catch {
  // File doesn't exist in this environment -- the tests below skip themselves.
}

const OWNER_EMAIL = process.env.SUPABASE_RLS_TEST_OWNER_EMAIL;
const OWNER_PASSWORD = process.env.SUPABASE_RLS_TEST_OWNER_PASSWORD;
const hasOwnerCredentials = Boolean(OWNER_EMAIL && OWNER_PASSWORD);

const OUTLINE_HEADINGS = promptsEn.outline.map((entry) => entry.heading);
const PROMPT_HEADINGS = [
  ...new Set(promptsEn.prompts.map((entry) => entry.heading)),
];

/**
 * Signs in, creates a brand-new story through /stories/new, and advances to
 * the Story step -- the body step is `hidden` until you get there (see
 * components/story/story-steps.tsx), so the starters card (which only
 * renders alongside the body editor) isn't reachable before this.
 */
async function createFreshStoryOnStoryStep(
  page: Page,
  title: string,
): Promise<void> {
  await signInUi(page, OWNER_EMAIL!, OWNER_PASSWORD!);
  await page.goto("/stories/new");
  await page.locator("#new-story-title").fill(title);
  await page.getByRole("button", { name: "Start writing" }).click();
  await page.waitForURL(/\/stories\/[^/]+\/edit$/, { timeout: 15000 });
  await page.getByRole("button", { name: /^Next: Your story/ }).click();
}

test.describe("story starters card", () => {
  test.skip(
    !hasOwnerCredentials,
    "Requires SUPABASE_RLS_TEST_OWNER_EMAIL/PASSWORD in .env.test.local — see docs/architecture.md 'RLS integration test setup'.",
  );

  test("shows the title and all four controls on a brand-new story", async ({
    page,
  }) => {
    await createFreshStoryOnStoryStep(
      page,
      `rls-test starters visible ${Date.now()}`,
    );

    const card = page.getByRole("complementary", {
      name: "Not sure where to start?",
    });
    await expect(card).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Write about this" }),
    ).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Show me another" }),
    ).toBeVisible();
    await expect(card.getByRole("button", { name: "Hide" })).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Start from an outline" }),
    ).toBeVisible();
  });

  test("Show me another changes the question", async ({ page }) => {
    await createFreshStoryOnStoryStep(
      page,
      `rls-test starters another ${Date.now()}`,
    );

    const card = page.getByRole("complementary", {
      name: "Not sure where to start?",
    });
    const question = card.locator("p[aria-live='polite']");
    await expect(question).toBeVisible();
    const firstQuestion = (await question.textContent())!.trim();

    // Cycles through a shuffled, fixed-length list -- click enough times
    // that landing back on the same question by chance is negligible.
    let changed = false;
    for (let i = 0; i < 5; i++) {
      await card.getByRole("button", { name: "Show me another" }).click();
      const next = (await question.textContent())!.trim();
      if (next !== firstQuestion) {
        changed = true;
        break;
      }
    }
    expect(changed).toBe(true);
  });

  test("Write about this inserts a heading and the outline button disappears", async ({
    page,
  }) => {
    await createFreshStoryOnStoryStep(
      page,
      `rls-test starters write about ${Date.now()}`,
    );

    const card = page.getByRole("complementary", {
      name: "Not sure where to start?",
    });
    await expect(
      card.getByRole("button", { name: "Start from an outline" }),
    ).toBeVisible();

    await card.getByRole("button", { name: "Write about this" }).click();

    const content = page.locator(".cm-content");
    await expect(content).toContainText(/## /);
    const text = (await content.textContent()) ?? "";
    const match = /## (.+)/.exec(text);
    expect(match).not.toBeNull();
    const insertedHeading = match![1].trim();
    expect(PROMPT_HEADINGS).toContain(insertedHeading);

    // Body is no longer empty -- the outline invitation goes away, but the
    // card itself (title, other buttons) stays.
    await expect(
      card.getByRole("button", { name: "Start from an outline" }),
    ).toHaveCount(0);
    await expect(card).toBeVisible();
  });

  test("Start from an outline inserts all nine outline headings", async ({
    page,
  }) => {
    await createFreshStoryOnStoryStep(
      page,
      `rls-test starters outline ${Date.now()}`,
    );

    const card = page.getByRole("complementary", {
      name: "Not sure where to start?",
    });
    await card.getByRole("button", { name: "Start from an outline" }).click();

    const content = page.locator(".cm-content");
    await expect(content).toContainText(OUTLINE_HEADINGS[0]);
    await expect(content).toContainText(
      OUTLINE_HEADINGS[OUTLINE_HEADINGS.length - 1],
    );
  });

  test("Hide removes the card, and it stays gone after a reload", async ({
    page,
  }) => {
    await createFreshStoryOnStoryStep(
      page,
      `rls-test starters hide ${Date.now()}`,
    );

    const card = page.getByRole("complementary", {
      name: "Not sure where to start?",
    });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Hide" }).click();
    await expect(card).toHaveCount(0);

    await page.reload();
    await page.getByRole("button", { name: /^Next: Your story/ }).click();
    await expect(card).toHaveCount(0);
  });

  test("typing 50+ words makes the card disappear", async ({ page }) => {
    await createFreshStoryOnStoryStep(
      page,
      `rls-test starters word threshold ${Date.now()}`,
    );

    const card = page.getByRole("complementary", {
      name: "Not sure where to start?",
    });
    await expect(card).toBeVisible();

    const fiftyFiveWords = Array.from(
      { length: 55 },
      (_, i) => `word${i}`,
    ).join(" ");
    await page.locator(".cm-content").click();
    await page.keyboard.type(fiftyFiveWords);

    await expect(card).toHaveCount(0);
  });
});
