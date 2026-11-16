// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

function post(body: Record<string, string>) {
  return POST(
    new NextRequest("https://kakinotes.test/country", {
      method: "POST",
      body: new URLSearchParams(body),
    }),
  );
}

describe("POST /country", () => {
  it.each([
    ["new-zealand", "https://kakinotes.test/"],
    ["china", "https://kakinotes.test/cn"],
  ])("remembers %s for a year and opens its home", async (country, home) => {
    const response = await post({ country });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(home);
    const cookie = response.cookies.get("kakinotes-country");
    expect(cookie?.value).toBe(country);
    expect(cookie?.maxAge).toBe(60 * 60 * 24 * 365);
    expect(cookie?.path).toBe("/");
  });

  it.each<Record<string, string>>([{ country: "atlantis" }, {}])(
    "ignores anything that isn't one of our countries (%j)",
    async (body) => {
      const response = await post(body);
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("https://kakinotes.test/");
      expect(response.cookies.get("kakinotes-country")).toBeUndefined();
    },
  );
});
