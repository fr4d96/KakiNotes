import { test, expect } from "@playwright/test";

test("home page loads with title, heading, and working public nav", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBeLessThan(400);

  await expect(page).toHaveTitle(/Kakinotes/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /real stories from across aotearoa/i,
    }),
  ).toBeVisible();

  const navLinks = [
    { name: "Stories", href: "/stories" },
    { name: "Contributors", href: "/contributors" },
    { name: "About", href: "/about" },
  ];

  for (const link of navLinks) {
    const anchor = page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", {
        name: link.name,
      });
    await expect(anchor).toHaveAttribute("href", link.href);

    const navResponse = await page.request.get(link.href);
    expect(navResponse.status()).toBeLessThan(400);
  }

  // Sign in / Share your story are buttons that open the header's auth
  // modal (components/site-header.tsx), not plain links -- the real
  // /sign-in and /sign-up pages still exist and are covered separately by
  // e2e/auth.spec.ts.
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(
    nav.getByRole("button", { name: "Share your story" }),
  ).toBeVisible();
});

test("latest-stories shelf links to real stories", async ({ page }) => {
  await page.goto("/");

  const heading = page.getByRole("heading", { name: "Latest stories" });
  if ((await heading.count()) === 0) {
    // No published stories in this environment's data -- the section is
    // conditionally rendered, so there's nothing further to assert.
    return;
  }

  const shelf = heading.locator("xpath=ancestor::section[1]");
  const storyLink = shelf.locator('a[href^="/stories/"]').first();
  const href = await storyLink.getAttribute("href");
  expect(href).toMatch(/^\/stories\//);

  const storyResponse = await page.request.get(href!);
  expect(storyResponse.status()).toBeLessThan(400);
});

test("hero search lands on the stories index with the query applied", async ({
  page,
}) => {
  await page.goto("/");

  const search = page.getByRole("searchbox", { name: "Search stories" });
  await search.fill("Otago");
  await search.press("Enter");

  await expect(page).toHaveURL(/\/stories\?q=Otago/);
});

test("destination quiz walks through to a result linking into /stories", async ({
  page,
}) => {
  await page.goto("/");

  const quizSection = page.locator("#match");
  if ((await quizSection.count()) === 0) {
    // Conditionally rendered when there are no published stories.
    return;
  }

  // The quiz sits collapsed behind its <summary> row until the reader asks.
  await quizSection.locator("summary").click();
  const quiz = quizSection;
  // Bounded generously above the quiz's actual question count (5, see
  // components/home/destination-quiz.tsx's QUESTIONS array) -- the loop
  // itself already stops as soon as no more answer buttons are rendered
  // (i.e. the result screen is showing).
  for (let i = 0; i < 10; i += 1) {
    const answers = quiz.getByTestId("quiz-answer");
    if ((await answers.count()) === 0) break;
    await answers.first().click();
  }

  const exploreLink = page.getByRole("link", { name: "Explore stories" });
  const browseAllLink = page.getByRole("link", { name: "Browse all stories" });
  await expect(exploreLink.or(browseAllLink)).toBeVisible();
});

test("region explorer links navigate into the filtered stories index", async ({
  page,
}) => {
  await page.goto("/");

  const heading = page.getByRole("heading", {
    name: "Browse by place",
  });
  if ((await heading.count()) === 0) return;

  const section = heading.locator("xpath=ancestor::section[1]");
  const regionLink = section.getByRole("link").first();
  const href = await regionLink.getAttribute("href");
  expect(href).toMatch(/^\/stories\?region=/);

  const response = await page.request.get(href!);
  expect(response.status()).toBeLessThan(400);
});

test("theme toggle switches and persists across a reload", async ({ page }) => {
  await page.goto("/");

  const toggle = page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: /Switch to (dark|light) mode/ });

  const initialTheme = await page.evaluate(
    () => document.documentElement.dataset.theme,
  );
  await toggle.click();
  const toggledTheme = await page.evaluate(
    () => document.documentElement.dataset.theme,
  );
  expect(toggledTheme).not.toBe(initialTheme);

  await page.reload();
  const persistedTheme = await page.evaluate(
    () => document.documentElement.dataset.theme,
  );
  expect(persistedTheme).toBe(toggledTheme);
});

test("staff routes fail closed with a not-found response", async ({ page }) => {
  for (const path of ["/editorial", "/moderation", "/admin"]) {
    const response = await page.request.get(path);
    expect(response.status()).toBe(404);
  }
});
