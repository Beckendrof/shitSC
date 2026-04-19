/**
 * Downloads CC / PD retail photos into ../../samples/real-products/
 * Sources: Wikimedia Commons — see generated ATTRIBUTION.md
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', '..', 'samples', 'real-products');

const assets = [
  {
    out: 'cereal_box.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Aisles_4_and_5_in_Publix_Super_Market_at_Carrollwood_Square%2C_Tampa%2C_Florida%2C_Jan_2025.jpg',
    title: 'File:Aisles 4 and 5 in Publix Super Market at Carrollwood Square, Tampa, Florida, Jan 2025.jpg',
    /** Wide aisle shot — crop to end-cap region so Tesseract sees larger type. */
    crop: { relLeft: 0.12, relTop: 0.18, relWidth: 0.76, relHeight: 0.55 },
  },
  {
    out: 'snack_chips.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/34/Frito_Lay.JPG',
    title: 'File:Frito Lay.JPG',
  },
  {
    out: 'sauce_ketchup.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/57/Chef%E2%80%99s_Quality_Tomato_Ketchup_Packet.jpg',
    title: "File:Chef's Quality Tomato Ketchup Packet.jpg",
  },
  {
    out: 'dairy_milk_carton.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/18/Informasi_Nilai_Gizi.jpg',
    title: 'File:Informasi Nilai Gizi.jpg',
  },
  {
    out: 'allergen_peanut_butter.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/94/Jif_Peanut_Butter_-_14938583767.jpg',
    title: 'File:Jif Peanut Butter - 14938583767.jpg',
  },
  {
    out: 'shelf_blurry_angle.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/b/b7/Extra_Coop_Supermarket%2C_Amfi_Shopping_mall%2C_Os%C3%B8yro%2C_Hordaland%2C_Norway%2C_Distorted%2C_blurred_panorama_2018-03-22._Vegetables_and_fruits%2C_apples%2C_pears%2C_bananas%2C_aisle%2C_display%2C_mirrors%2C_employee%2C_etc._%28gr%C3%B8nnsaks-_og_fruktavdeling%29_A.jpg',
    title:
      'File:Extra Coop Supermarket, Amfi Shopping mall, Osøyro, Hordaland, Norway, Distorted, blurred panorama 2018-03-22...',
  },
  {
    out: 'dashcam_retail_motion.jpg',
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/4a/Douglas_Square_Publix_pharmacy_drive-through%2C_Douglas_dashcam.jpg',
    title: 'File:Douglas Square Publix pharmacy drive-through, Douglas dashcam.jpg',
  },
];

async function download(url, dest) {
  const headers = {
    'User-Agent': 'ShelfSenseSamples/1.0 (https://github.com; educational fixture fetch; respects 429)',
    'Accept': 'image/jpeg,image/*;q=0.8,*/*;q=0.5',
  };
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1200 * attempt));
    const res = await fetch(url, { redirect: 'follow', headers });
    if (res.status === 429) {
      lastErr = new Error(`GET ${url} -> 429`);
      continue;
    }
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    return;
  }
  throw lastErr ?? new Error(`GET ${url} failed`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const a of assets) {
    const dest = path.join(outDir, a.out);
    process.stdout.write(`Fetching ${a.out} …\n`);
    await download(a.url, dest);
    if (a.crop) {
      const img = sharp(dest);
      const meta = await img.metadata();
      const w0 = meta.width ?? 1;
      const h0 = meta.height ?? 1;
      const left = Math.max(0, Math.floor(w0 * a.crop.relLeft));
      const top = Math.max(0, Math.floor(h0 * a.crop.relTop));
      const w = Math.min(w0 - left, Math.floor(w0 * a.crop.relWidth));
      const h = Math.min(h0 - top, Math.floor(h0 * a.crop.relHeight));
      await sharp(dest)
        .extract({ left, top, width: w, height: h })
        .resize({ width: 1900, height: 1900, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 93, mozjpeg: true })
        .toFile(dest + '.tmp');
      fs.renameSync(dest + '.tmp', dest);
    }
    await new Promise((r) => setTimeout(r, 900));
  }

  const attribution = `# Real-product sample images (Wikimedia Commons)

These JPEGs are **real photographs** (packaging, shelves, dashcam retail) used for OCR + offline mock heuristics.
They are **not** synthetic text-on-white fixtures.

| File | Commons |
|------|---------|
${assets.map((a) => `| ${a.out} | ${a.title} |`).join('\n')}

Download each file’s **license** from its Commons description page before redistribution.
Re-fetch anytime with \`npm run samples:real:fetch\` from \`shelvesense-server/\`.
`;

  fs.writeFileSync(path.join(outDir, 'ATTRIBUTION.md'), attribution, 'utf8');
  fs.writeFileSync(
    path.join(outDir, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), assets }, null, 2),
    'utf8',
  );
  console.log('Done. Wrote', outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
