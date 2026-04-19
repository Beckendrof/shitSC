'use strict';
/**
 * Writes OCR-friendly JPEG fixtures to repo-root `samples/`.
 * Run from package dir: `npm run samples:generate`
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const samplesDir = path.join(__dirname, '..', '..', 'samples');

function svgBody(lines) {
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tspans = lines
    .map((line, i) => `<tspan x="40" dy="${i === 0 ? '0' : '52'}">${esc(line)}</tspan>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="40" y="100" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#000" font-weight="700">
    ${tspans}
  </text>
  <text x="40" y="560" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#444">
    ShelfSense synthetic fixture — not a real product
  </text>
</svg>`;
}

async function writeJpeg(name, lines) {
  const buf = Buffer.from(svgBody(lines), 'utf8');
  await sharp(buf).jpeg({ quality: 95, mozjpeg: true }).toFile(path.join(samplesDir, name));
}

(async () => {
  fs.mkdirSync(samplesDir, { recursive: true });
  await writeJpeg('label-healthy.jpg', [
    'SSAMPLE HEALTH',
    'ORGANIC OATS',
    'INGREDIENTS ROLLED OATS',
    'FIBER 5G SUGAR 2G SODIUM 10MG',
  ]);
  await writeJpeg('label-high-sodium-sugar.jpg', [
    'SNAP CRISP SNACKS',
    'SSAMPLE SALT',
    'ADDED SUGARS 22G PER SERVING',
    'SODIUM 780MG',
  ]);
  await writeJpeg('label-allergen-peanut.jpg', [
    'SSAMPLE ALLERGEN',
    'CONTAINS PEANUT AND WHEAT',
    'MAY CONTAIN MILK',
  ]);
  // eslint-disable-next-line no-console
  console.log('Wrote fixtures to', samplesDir);
})().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
