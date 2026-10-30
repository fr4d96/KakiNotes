import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const root = path.resolve(__dirname, "..");

describe("web app manifest", () => {
  const m = manifest();

  it("installs as a standalone app rooted at /", () => {
    expect(m.name).toBe("Kakinotes");
    expect(m.short_name).toBe("Kakinotes");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("declares 192, 512 and maskable 512 icons that exist on disk", () => {
    const icons = m.icons ?? [];
    expect(icons.map((i) => `${i.sizes}:${i.purpose}`)).toEqual([
      "192x192:any",
      "512x512:any",
      "512x512:maskable",
    ]);
    for (const icon of icons) {
      expect(icon.src.startsWith("/")).toBe(true);
      expect(existsSync(path.join(root, "public", icon.src))).toBe(true);
    }
  });

  it("has the iOS home-screen icon next to it", () => {
    expect(existsSync(path.join(root, "app", "apple-icon.png"))).toBe(true);
  });
});
