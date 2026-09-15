import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookieGet } = vi.hoisted(() => ({
  cookieGet: vi.fn<(name: string) => { value: string } | undefined>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: cookieGet }),
}));

// The real getRequestConfig wraps the callback in next-intl's request-scoped
// cache; here we only want the callback itself, so it runs as written.
vi.mock("next-intl/server", () => ({
  getRequestConfig: (fn: unknown) => fn,
}));

import requestConfig from "@/i18n/request";
import en from "@/i18n/messages/en.json";
import zhCN from "@/i18n/messages/zh-CN.json";

type Config = { locale: string; messages: unknown; timeZone: string };
const resolve = () => (requestConfig as unknown as () => Promise<Config>)();

beforeEach(() => cookieGet.mockReset());

describe("i18n/request", () => {
  it("renders English when there is no cookie at all", async () => {
    cookieGet.mockReturnValue(undefined);
    const config = await resolve();
    expect(config.locale).toBe("en");
    expect(config.messages).toEqual(en);
  });

  it("renders Chinese when the cookie asks for it", async () => {
    cookieGet.mockReturnValue({ value: "zh-CN" });
    const config = await resolve();
    expect(config.locale).toBe("zh-CN");
    expect(config.messages).toEqual(zhCN);
  });

  it.each(["", "fr", "zh", "ZH-CN", "../../package", "en.json"])(
    "falls back to English for a cookie holding %j",
    async (value) => {
      cookieGet.mockReturnValue({ value });
      const config = await resolve();
      expect(config.locale).toBe("en");
      expect(config.messages).toEqual(en);
    },
  );

  it("pins the New Zealand time zone so server and client formatters agree", async () => {
    cookieGet.mockReturnValue(undefined);
    expect((await resolve()).timeZone).toBe("Pacific/Auckland");
  });
});
