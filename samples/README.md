# ShelfSense sample label images

## Primary: real products (`real-products/`)

For hackathon-grade checks, use **`samples/real-products/`** — real packaging, shelves, and motion-style retail photos. See `real-products/README.md` and `npm run verify:real` from `shelvesense-server/`.

## Secondary: synthetic SSAMPLE fixtures (this folder)

Synthetic JPEG fixtures for **small regression** checks on `/api/analyze-label` when `AI_ENGINE=mock` and `OCR_ENABLED=true`.

| File | Embedded cue | Expected verdict (see `shelvesense-server/scripts/verify-samples.ts`) |
|------|----------------|----------------------------------------------------------------------|
| `label-healthy.jpg` | `SSAMPLE HEALTH` | **Safe** (relaxed profile) |
| `label-high-sodium-sugar.jpg` | `SSAMPLE SALT` | **Caution** or **Avoid** depending on combined sodium/sugar profile |
| `label-allergen-peanut.jpg` | `SSAMPLE ALLERGEN` + peanut wording | **Avoid** when profile lists peanut allergy |

## Regenerate

From `shelvesense-server/`:

```bash
npm run samples:generate
```

Requires the `sharp` dev dependency (installed with `npm install` in that package). After generation you can commit the three `.jpg` files so CI machines can run `npm run verify:samples` without re-running Sharp.
