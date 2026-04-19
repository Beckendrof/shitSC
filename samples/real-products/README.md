# Real-world ShelfSense verification set

This folder holds **real retail photography** (packaging, shelves, dashcam) — not the synthetic `SSAMPLE_*` text fixtures in `samples/*.jpg`.

## Required assets

| File | Role |
|------|------|
| `cereal_box.jpg` | Packaged cereal / breakfast product |
| `snack_chips.jpg` | Snack or chip-style bag |
| `sauce_ketchup.jpg` | Sauce / condiment (bottle or squeeze) |
| `dairy_milk_carton.jpg` | Dairy carton |
| `allergen_peanut_butter.jpg` | Allergen-forward label (peanut) |
| `shelf_blurry_angle.jpg` | Blurred or angled grocery shelf |
| `dashcam_retail_motion.jpg` | Frame-like capture from motion (dashcam retail scene) |

## Populate

From `shelvesense-server/` (needs network):

```bash
npm run samples:real:fetch
```

That downloads Wikimedia Commons JPEGs and writes `ATTRIBUTION.md` + `manifest.json`. Check each file’s **license** on Commons before redistributing.

## Verify (API must be running)

```bash
AI_ENGINE=mock OCR_ENABLED=true npm run dev
# second terminal:
npm run verify:real
```

## Live Spectacles / Lens Studio

Hardware capture is **manual**: pinch-scan on device with `apiBaseUrl` pointed at your **deployed HTTPS** gateway (not localhost). Log the verdict + OCR snippet in Lens Studio’s Logger for your hackathon checklist.

## Synthetic fixtures

The white-background `SSAMPLE_*` JPEGs under `samples/` remain a **small** regression check only (`npm run verify:samples`). Primary quality gating is `npm run verify:real`.
