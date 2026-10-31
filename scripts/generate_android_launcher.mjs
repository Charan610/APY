// Render the website's ATT / PERY vector mark into Android launcher assets.
// Requires sharp (npm install --prefix /tmp/apy-icon-tools sharp).
// NODE_PATH=/tmp/apy-icon-tools/node_modules node scripts/generate_android_launcher.mjs
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const sharp = createRequire(import.meta.url)('sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const res = path.join(root, 'apy-android/android/app/src/main/res');
const assets = path.join(root, 'apy-android/resources');
await mkdir(assets, { recursive: true });

const mark = `<path d="M18 51 C32 51 40 46 51 46 C63 46 72 56 84 54" fill="none" stroke="#ff8dd6" stroke-width="2.4" stroke-linecap="round"/>
<g fill="#fcffff" font-family="Georgia" font-weight="bold" text-anchor="middle">
<text x="50" y="42" font-size="24" letter-spacing="2.5">ATT</text>
<text x="50" y="72" font-size="20.5" letter-spacing="2">PERY</text></g>`;
const defs = `<defs><linearGradient id="blue" x2="1" y2="1"><stop stop-color="#16abd2"/><stop offset=".55" stop-color="#007da9"/><stop offset="1" stop-color="#00698e"/></linearGradient><linearGradient id="shine" x2=".7" y2="1"><stop stop-color="white" stop-opacity=".3"/><stop offset=".5" stop-color="white" stop-opacity=".03"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient></defs>`;
const svg = (body, size = 100) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}${body}</svg>`;
const full = svg(`<rect width="100" height="100" rx="22" fill="url(#blue)"/><rect x="1" y="1" width="98" height="98" rx="21" fill="url(#shine)" stroke="#d5f7ff" stroke-opacity=".5" stroke-width=".7"/>${mark}`);
const round = svg(`<circle cx="50" cy="50" r="49" fill="url(#blue)"/><circle cx="50" cy="50" r="48" fill="url(#shine)" stroke="#d5f7ff" stroke-opacity=".5" stroke-width=".7"/>${mark}`);
// Only the lettering and wave are foreground; keep them inside Android's
// central safe zone so round/squircle masks cannot crop the brand.
const foreground = svg(`<g transform="translate(14 12) scale(.8)">${mark}</g>`, 108);
await writeFile(path.join(assets, 'launcher-icon.svg'), full);
await writeFile(path.join(assets, 'launcher-foreground.svg'), foreground);
await sharp(Buffer.from(full)).resize(512, 512).png().toFile(path.join(assets, 'launcher-preview.png'));
for (const [density, scale] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
  const folder = path.join(res, `mipmap-${density}`);
  await mkdir(folder, { recursive: true });
  for (const [name, source, size] of [['ic_launcher', full, 48], ['ic_launcher_round', round, 48], ['ic_launcher_foreground', foreground, 108]]) {
    await sharp(Buffer.from(source)).resize(size * scale, size * scale).png().toFile(path.join(folder, `${name}.png`));
  }
}
await writeFile(path.join(res, 'values/ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#007DA9</color>\n</resources>\n');
// Replace the stock Capacitor splash with the same mark at every existing size.
for (const directory of await readdir(res)) {
  if (!directory.startsWith('drawable')) continue;
  const file = path.join(res, directory, 'splash.png');
  let dimensions;
  try { dimensions = await sharp(file).metadata(); } catch { continue; }
  const { width, height } = dimensions;
  const size = Math.round(Math.min(width, height) * .24);
  const badge = full.replace('<svg ', `<svg x="${(width - size) / 2}" y="${(height - size) / 2}" `).replace('width="100" height="100" viewBox', `width="${size}" height="${size}" viewBox`);
  const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#057eaa"/>${badge}</svg>`;
  const bytes = await sharp(Buffer.from(splash)).png().toBuffer();
  await writeFile(file, bytes);
}
console.log('Android launcher: five densities, round icons, and safe-zone adaptive foreground generated.');
