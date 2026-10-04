import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const webPublic = path.join(repoRoot, "apps/web/public");
const apiAssets = path.join(repoRoot, "apps/api/src/common/mail/assets");

async function generate() {
  const emblemPath = path.join(webPublic, "tectomi-emblem.png");
  if (!fs.existsSync(emblemPath)) {
    throw new Error(`Emblem not found at ${emblemPath}`);
  }

  // 1. Generate 512x512 and 192x192 square icon
  const emblemMeta = await sharp(emblemPath).metadata();
  const emblemW = emblemMeta.width;
  const emblemH = emblemMeta.height;

  // Fit emblem nicely inside 512x512 with ~14% padding
  const iconTargetH = Math.round(512 * 0.78);
  const iconTargetW = Math.round(emblemW * (iconTargetH / emblemH));

  const resizedEmblemForIcon = await sharp(emblemPath)
    .resize(iconTargetW, iconTargetH, { fit: "contain" })
    .toBuffer();

  const icon512 = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: resizedEmblemForIcon,
        left: Math.round((512 - iconTargetW) / 2),
        top: Math.round((512 - iconTargetH) / 2),
      },
    ])
    .png()
    .toBuffer();

  await sharp(icon512).toFile(path.join(webPublic, "icon.png"));
  await sharp(icon512).toFile(path.join(webPublic, "tectomi-icon.png"));
  console.log("Generated apps/web/public/icon.png and tectomi-icon.png (512x512 transparent)");

  // 2. Wordmark dimensions: 800 x 200
  const canvasW = 800;
  const canvasH = 200;

  // Wordmark emblem size: height ~144px
  const wordmarkEmblemH = 144;
  const wordmarkEmblemW = Math.round(emblemW * (wordmarkEmblemH / emblemH));
  const emblemTop = Math.round((canvasH - wordmarkEmblemH) / 2);
  const emblemLeft = 36;

  const resizedWordmarkEmblem = await sharp(emblemPath)
    .resize(wordmarkEmblemW, wordmarkEmblemH, { fit: "contain" })
    .toBuffer();

  const textStartX = emblemLeft + wordmarkEmblemW + 24;
  const badgeX = textStartX + 395;

  // Wordmark for light backgrounds (slate text)
  const lightBgSvg = `
  <svg width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">
    <text x="${textStartX}" y="132" 
          font-family="-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif" 
          font-size="82" 
          font-weight="800" 
          letter-spacing="2" 
          fill="#0F172A">TECTOMI</text>
          
    <g transform="translate(${badgeX}, 74)">
      <rect width="130" height="58" rx="16" fill="#0284C7" fill-opacity="0.12" stroke="#0284C7" stroke-width="2.5" />
      <text x="65" y="40" 
            font-family="-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif" 
            font-size="30" 
            font-weight="800" 
            letter-spacing="4" 
            text-anchor="middle" 
            fill="#0284C7">ERP</text>
    </g>
  </svg>
  `;

  // Wordmark for dark backgrounds (white text)
  const darkBgSvg = `
  <svg width="${canvasW}" height="${canvasH}" viewBox="0 0 ${canvasW} ${canvasH}" xmlns="http://www.w3.org/2000/svg">
    <text x="${textStartX}" y="132" 
          font-family="-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif" 
          font-size="82" 
          font-weight="800" 
          letter-spacing="2" 
          fill="#FFFFFF">TECTOMI</text>
          
    <g transform="translate(${badgeX}, 74)">
      <rect width="130" height="58" rx="16" fill="#38BDF8" fill-opacity="0.2" stroke="#38BDF8" stroke-width="2.5" />
      <text x="65" y="40" 
            font-family="-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif" 
            font-size="30" 
            font-weight="800" 
            letter-spacing="4" 
            text-anchor="middle" 
            fill="#38BDF8">ERP</text>
    </g>
  </svg>
  `;

  // Composite dark text version (for light backgrounds -> logo-white.png)
  const lightBgLogo = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: resizedWordmarkEmblem, left: emblemLeft, top: emblemTop },
      { input: Buffer.from(lightBgSvg), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  // Composite light text version (for dark backgrounds -> logo-white-inverted.png)
  const darkBgLogo = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: resizedWordmarkEmblem, left: emblemLeft, top: emblemTop },
      { input: Buffer.from(darkBgSvg), left: 0, top: 0 },
    ])
    .png()
    .toBuffer();

  // Save web assets
  await sharp(lightBgLogo).toFile(path.join(webPublic, "logo-white.png"));
  await sharp(darkBgLogo).toFile(path.join(webPublic, "logo-white-inverted.png"));

  // Save API assets
  if (fs.existsSync(apiAssets)) {
    await sharp(lightBgLogo).toFile(path.join(apiAssets, "logo-white.png"));
    await sharp(darkBgLogo).toFile(path.join(apiAssets, "logo-white-inverted.png"));
    await sharp(icon512).toFile(path.join(apiAssets, "icon.png"));
  }

  console.log("Successfully generated all Tectomi ERP brand assets with transparent background!");
}

generate().catch(console.error);
