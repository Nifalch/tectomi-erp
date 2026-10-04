// One-off script: read the bundled black-on-transparent brand logo
// (apps/web/public/logo-white.png) and produce a white-on-transparent
// version (apps/web/public/logo-white-inverted.png).
//
// We can't reliably invert the logo at runtime via CSS filter or client-side
// canvas, because html2canvas-pro silently drops both during PDF capture. By
// pre-baking the white version into the bundle, the captured PDF always sees
// a regular <img> with a fully-decoded RGBA PNG.
//
// Run: node apps/web/scripts/generate-white-logo.mjs

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const root = path.dirname(new URL(import.meta.url).pathname);
const repoRoot = path.resolve(root, "../../..");
const srcPng = path.join(repoRoot, "apps/web/public/logo-white.png");
const outPng = path.join(repoRoot, "apps/web/public/logo-white-inverted.png");

if (!fs.existsSync(srcPng)) {
  console.error("Missing source PNG:", srcPng);
  process.exit(1);
}

// Strategy: load the source, downscale to a sane display-size resolution
// (the source is 1584×396 — far larger than any place we display it; the
// huge dimensions can choke html2canvas-pro's image decoder in some
// browsers), normalize to RGBA, then paint every opaque pixel pure white
// while preserving the alpha channel.
const meta = await sharp(srcPng).metadata();
const targetWidth = 800;
const { data, info } = await sharp(srcPng)
  .resize({ width: targetWidth })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const pixels = Buffer.from(data);
for (let i = 0; i < pixels.length; i += 4) {
  if (pixels[i + 3] > 0) {
    pixels[i] = 255;
    pixels[i + 1] = 255;
    pixels[i + 2] = 255;
  }
}
await sharp(pixels, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png({ compressionLevel: 9 })
  .toFile(outPng);

console.log(`wrote ${outPng} (${meta.width}x${meta.height} -> ${info.width}x${info.height})`);
