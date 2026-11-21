// Generates every square app icon from the logo sketch,
// public/kakinotes-icon.png (650x480, also the in-app logo in
// components/brand-logo.tsx and the README):
//   public/icons/icon-192.png, icon-512.png   manifest "any" icons
//   public/icons/icon-maskable-512.png        manifest "maskable" icon (sketch
//                                             shrunk into the 80% safe zone)
//   app/apple-icon.png                        iOS home-screen icon (180px)
//   app/favicon.ico                           16/32/48px browser tab icon
// Each is the sketch centred on its paper colour, full width (maskable: 72%).
//
// Run after changing the sketch, then regenerate the launch images too:
//   node scripts/generate-app-icons.mjs
//   node scripts/generate-splash-screens.mjs
// Uses sharp, already a dependency (no new package).
import { writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const source = path.join(root, "public/kakinotes-icon.png");
/** The sketch's paper colour, used to fill the square around it. */
const PAPER = "#fcf4e8";

// Opaque RGB: iOS handles transparency badly, and the App Store icon must
// have none.
async function render(size, widthShare = 1) {
  const w = Math.round(size * widthShare);
  const sketch = await sharp(source).resize({ width: w }).toBuffer();
  const { height: h } = await sharp(sketch).metadata();
  return sharp({
    create: { width: size, height: size, channels: 3, background: PAPER },
  })
    .composite([
      {
        input: sketch,
        left: Math.round((size - w) / 2),
        top: Math.round((size - h) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const out = (rel, buf) => writeFile(path.join(root, rel), buf);

await out("public/icons/icon-192.png", await render(192));
await out("public/icons/icon-512.png", await render(512));
await out("public/icons/icon-maskable-512.png", await render(512, 0.72));
await out("app/apple-icon.png", await render(180));

// ICO with embedded PNGs (supported by every current browser): a 6-byte
// header, one 16-byte directory entry per image, then the PNG bytes.
// Next.js's ICO decoder accepts only RGBA PNGs, so these get an (opaque)
// alpha channel back.
const sizes = [16, 32, 48];
const pngs = await Promise.all(
  sizes.map(async (s) =>
    sharp(await render(s))
      .ensureAlpha()
      .png()
      .toBuffer(),
  ),
);
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0); // width
  e.writeUInt8(s, 1); // height
  e.writeUInt8(0, 2); // palette colours
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
await out("app/favicon.ico", Buffer.concat([header, ...entries, ...pngs]));

console.log("Wrote app icons from public/kakinotes-icon.png");
