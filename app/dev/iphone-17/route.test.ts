import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("GET /dev/iphone-17", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is a 404 outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it("serves the device frame in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain('id="app"');
  });
});
