// Generates the iPhone launch images (apple-touch-startup-image) into
// public/splash/: one PNG per device in lib/pwa/splash-devices.json, in a
// light and a dark version. Each is the app's background colour with the
// app icon as a rounded tile in the exact centre -- the same size and spot
// the in-app splash (components/app-splash.tsx) draws it, so the hand-over
// from iOS's launch image to the page is seamless.
//
// Run after changing the icon, the colours or the device list:
//   node scripts/generate-splash-screens.mjs
// Uses sharp, already a dependency (no new package).
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const config = JSON.parse(
  await readFile(path.join(root, "lib/pwa/splash-devices.json"), "utf8"),
);
const outDir = path.join(root, "public/splash");
await mkdir(outDir, { recursive: true });

const iconSource = path.join(root, "public/icons/icon-512.png");

async function roundedIcon(size) {
  // iOS app-icon corner: about 22.5% of the side.
  const r = Math.round(size * 0.225);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`,
  );
  return sharp(iconSource)
    .resize(size, size)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

let written = 0;
for (const device of config.devices) {
  const w = device.width * device.ratio;
  const h = device.height * device.ratio;
  const iconPx = config.iconSize * device.ratio;
  const icon = await roundedIcon(iconPx);
  for (const scheme of ["light", "dark"]) {
    const file = path.join(outDir, `${w}x${h}-${scheme}.png`);
    await sharp({
      create: {
        width: w,
        height: h,
        channels: 3,
        background: config.background[scheme],
      },
    })
      .composite([
        {
          input: icon,
          left: Math.round((w - iconPx) / 2),
          top: Math.round((h - iconPx) / 2),
        },
      ])
      .png({ compressionLevel: 9, palette: true, quality: 90 })
      .toFile(file);
    written += 1;
  }
}
console.log(`Wrote ${written} launch images to public/splash/`);
