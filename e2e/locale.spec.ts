import { test, expect, type Page } from "@playwright/test";

/**
 * The language toggle, end to end: it flips <html lang>, changes what the
 * chrome says, survives a reload (the cookie), and reaches a page whose
 * copy is rendered on the server.
 *
 * No fixtures and no sign-in: everything asserted here is on anonymous
 * public routes, so this runs in any environment the other public specs do.
 *
 * Mobile first (CLAUDE.md rule 18) -- the toggle is a 36px control added to
 * a header row that was already tight at 375px, so the phone layout is the
 * one that can break.
 */

const MOBILE = { width: 375, height: 812 };

/** The header's own toggle, in whichever of the two rows is visible. */
function localeToggle(page: Page) {
  return page
    .getByRole("button", { name: /Switch to Chinese|切换到英文/ })
    .first();
}

async function switchToChinese(page: Page) {
  await expect(localeToggle(page)).toHaveText("中");
  await localeToggle(page).click();
  // router.refresh() re-renders the route; wait for the label to flip rather
  // than for a navigation, because there is none.
  await expect(localeToggle(page)).toHaveText("EN");
}

test.describe("language toggle", () => {
  test("switches the site to Chinese and back at 375px", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await switchToChinese(page);

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    // The footer is server-rendered, so this proves the SERVER saw the
    // cookie -- not just that a client component re-rendered.
    await expect(
      page.getByRole("link", { name: "隐私" }).first(),
    ).toBeVisible();

    await localeToggle(page).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("link", { name: "Privacy" }).first(),
    ).toBeVisible();
  });

  test("persists across a reload and across routes", async ({ page }) => {
    await page.goto("/");
    await switchToChinese(page);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

    // A different route, loaded fresh from the server with no client state.
    await page.goto("/stories");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(
      page.getByRole("heading", { level: 1, name: "故事" }),
    ).toBeVisible();
  });

  test("translates the header nav on desktop", async ({ page }) => {
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "Stories" })).toBeVisible();

    await switchToChinese(page);

    // aria-label is translated too, so the nav is addressed by its new name.
    const zhNav = page.getByRole("navigation", { name: "主导航" });
    await expect(zhNav.getByRole("link", { name: "故事" })).toHaveAttribute(
      "href",
      "/stories",
    );
    await expect(zhNav.getByRole("button", { name: "登录" })).toBeVisible();
  });

  test("renders the sign-in page in Chinese, with its labels still bound", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await switchToChinese(page);

    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: "登录" }),
    ).toBeVisible();
    // getByLabel, not getByText: a translated <label> must still point at
    // its input (Engineering Rule 19).
    await expect(main.getByLabel("邮箱或用户名")).toHaveAttribute(
      "name",
      "identifier",
    );
    await expect(main.getByLabel("密码")).toHaveAttribute("name", "password");
    await expect(page).toHaveTitle(/登录/);
  });

  test("the toggle is a real button with a translated accessible name", async ({
    page,
  }) => {
    await page.goto("/");
    const toggle = localeToggle(page);
    await expect(toggle).toHaveAttribute("type", "button");
    await expect(toggle).toHaveAttribute("title", "Switch to Chinese");

    // Keyboard-operable: focus it and press Enter rather than clicking.
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    // The accessible name is now in the language being spoken.
    await expect(localeToggle(page)).toHaveAttribute("title", "切换到英文");
  });

  test("does not introduce horizontal overflow at 375px", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");
    await switchToChinese(page);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(overflow.scrollWidth).toBe(overflow.innerWidth);
  });
});
