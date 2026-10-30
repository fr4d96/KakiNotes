import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import config from "./splash-devices.json";
import { appleStartupImages, splashImagePath } from "./splash-screens";

describe("appleStartupImages", () => {
  const images = appleStartupImages();

  it("has a light and a dark launch image for every iPhone size", () => {
    expect(images).toHaveLength(config.devices.length * 2);
  });

  it("matches the iPhone 17 exactly, per colour scheme", () => {
    const iphone17 = images.filter((i) =>
      i.url.startsWith("/splash/1206x2622"),
    );
    expect(iphone17.map((i) => i.media)).toEqual([
      "screen and (device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: dark)",
      "screen and (device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait) and (prefers-color-scheme: light)",
    ]);
  });

  it("points only at images that exist (rerun the generator if this fails)", () => {
    for (const device of config.devices) {
      for (const scheme of ["light", "dark"] as const) {
        const file = path.join(
          process.cwd(),
          "public",
          splashImagePath(device, scheme),
        );
        expect(existsSync(file), file).toBe(true);
      }
    }
  });
});
