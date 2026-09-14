import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieSet } = vi.hoisted(() => ({ cookieSet: vi.fn() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet }),
}));

import { setLocaleAction } from "@/lib/i18n/set-locale-action";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/i18n/locales";

beforeEach(() => cookieSet.mockClear());

describe("setLocaleAction", () => {
  it("sets the cookie for a supported locale", async () => {
    await expect(setLocaleAction("zh-CN")).resolves.toEqual({
      ok: true,
      locale: "zh-CN",
    });
    expect(cookieSet).toHaveBeenCalledWith(LOCALE_COOKIE, "zh-CN", {
      path: "/",
      sameSite: "lax",
      maxAge: LOCALE_COOKIE_MAX_AGE,
    });
  });

  it.each([
    ["a locale the app does not ship", "fr"],
    ["a near miss", "zh"],
    ["a path-traversal attempt", "../../etc/passwd"],
    ["an empty string", ""],
    ["a non-string", 42],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s and writes nothing", async (_label, value) => {
    await expect(setLocaleAction(value)).resolves.toEqual({ ok: false });
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
