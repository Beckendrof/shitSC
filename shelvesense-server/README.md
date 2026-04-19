# ShelfSense backend

Node.js + Express + TypeScript intelligence layer for **ShelfSense** — an XR system that reduces harmful food decisions at the point of choice (see the repo root **`README.md`** for problem framing and architecture).

Snap Spectacles grocery / label assistant: OCR, profile logic, optional cloud vision, TTS, and cart intelligence live **only** in this service; the lens is a thin client.

## Repo layout

- **`shelvesense-server/`** — this Node API package (use this path in docs and CI).
- **`shelvesense-lens/`** — Lens Studio TypeScript for Spectacles (SIK pinch, `InternetModule`, `CameraModule`).
- **`samples/`** — synthetic SSAMPLE JPEGs (`npm run samples:generate`, `npm run verify:samples`) **plus** `samples/real-products/` for real packaging (`npm run samples:real:fetch`, `npm run verify:real`).

If a legacy **`server/`** folder still appears from an older checkout, close any process that has files open inside it (or that listens on your `PORT`), then remove the duplicate so only `shelvesense-server/` remains.

## Prerequisites

- Node.js 20+
- **Required for cloud AI** `CLAUDE_API_KEY` — default mode `AI_ENGINE=claude` uses Claude for text + vision. Use `AI_ENGINE=mock` only for offline CI/dev heuristics.
- **SQLite** (default) stores session profile + cart under `./data/` — disable with `SQLITE_ENABLED=false` for RAM-only.
- **OCR** (`OCR_ENABLED=true`, default) is required for mock-mode label fixtures under `../samples/`.

## Setup

```bash
cd shelvesense-server
cp .env.example .env
# Edit .env — see .env.example (AI_ENGINE, TTS_ENGINE, SQLite, OCR)
npm install
npm run dev
```

### Smoke tests (requires server running)

```bash
npm run smoke
```

### Sample label verification (deterministic)

Uses JPEG fixtures in the repo **`samples/`** directory (generate with Sharp):

```bash
npm run samples:generate
```

In a **second** terminal, run the API with Claude AI and OCR on:

```bash
# macOS / Linux
AI_ENGINE=claude CLAUDE_API_KEY=your-key OCR_ENABLED=true npm run dev

# Windows PowerShell
$env:AI_ENGINE='claude'; $env:CLAUDE_API_KEY='your-key'; $env:OCR_ENABLED='true'; npm run dev
```

Then:

```bash
npm run verify:samples
```

**What it checks**

- `POST /api/analyze-label` on three fixtures: **Safe** (healthy), **Caution** vs **Avoid** (high sodium/sugar, profile-dependent), **Avoid** (allergen + peanut profile).
- `POST /api/speech` returns either non-trivial `audioBase64` **or** `fallback: "browser_tts_hint"` (same contract the Spectacles lens tolerates).

### Real packaging + shelf verification (primary)

Uses **Wikimedia Commons** retail JPEGs under `samples/real-products/` (not text-on-white fixtures):

```bash
npm run samples:real:fetch
```

With the same `AI_ENGINE=claude OCR_ENABLED=true` server (keep **`OCR_PREPROCESS=true`**, the default, so retail photos get a sharp pass before Tesseract — same path as Spectacles uploads):

```bash
npm run verify:real
```

**What it checks**

- Each asset has enough **OCR text** and expected **product-language cues** (e.g. `PEANUT`, `MILK`, `KETCH`, `PUBL`…).
- `POST /api/analyze-label` returns verdicts aligned with the paired **health profile** (allergen → **Avoid**, sodium/sugar-aware → **Caution** / **Avoid**, blurry shelf + dashcam → **Caution**).
- `POST /api/speech` still returns audio or **`browser_tts_hint`**.

**Spectacles / Lens Studio:** after this passes on disk, do one **live pinch capture** on hardware with `apiBaseUrl` set to your **deployed HTTPS** gateway (document the URL you used in your demo notes).

Production build:

```bash
npm run build
npm start
```

Default port: **8787** (`PORT` env).

## Try voice in the browser (local)

With the server running, open **`http://localhost:8787/demo.html`**.  
Enter a short line, click **Generate & play audio** — it calls **`POST /api/speech`** (same contract as the Spectacles lens) and plays the MP3 while showing the echoed text.

### Speech synthesis mode

Set **`TTS_ENGINE=auto`** (default) or **`TTS_ENGINE=edge`**. This backend currently uses **Edge TTS** (`edge-tts`) for `/api/speech`, while Claude handles text/vision analysis. **Some networks block Edge TTS (403)** — the API still returns **200** with `fallback: "browser_tts_hint"` and an empty `audioBase64`; the demo page then uses **Web Speech**.

**Note:** `edge-tts` is unofficial vs Microsoft’s product terms; for production, budget a supported managed TTS provider.

## Session model

Pass `x-shelvesense-session` on each request to keep cart + parsed profile together. If omitted, the server creates one and echoes it in the `x-shelvesense-session` response header (the Spectacles lens stores it automatically).

## API

Base path: `/api`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/profile` | Returns `{ profile }` for the session (may be `null`). |
| POST | `/profile/parse` | Parses lab OCR/text → structured profile, stores on session. |
| POST | `/profile/ocr` | Multipart **`image`** → raw text via **tesseract.js** (then send text to `/profile/parse`). |
| POST | `/analyze-label` | Vision analysis vs profile (JSON or multipart). |
| POST | `/alternatives` | Three swap suggestions. |
| POST | `/cart/update` | Merges latest scan into cart intelligence. |
| POST | `/meal-plan` | Three budget-aware meals. |
| POST | `/speech` | TTS → JSON with `audioBase64` **or** `fallback: browser_tts_hint` if synthesis fails. |

### Example: parse lab text

```bash
curl -sS -X POST "http://localhost:8787/api/profile/parse" \
  -H "Content-Type: application/json" \
  -d "{\"rawText\":\"LDL 165 mg/dL. HbA1c 6.1%. Allergy: peanut. Patient advised low sodium diet.\"}" \
  -D - | head
```

### Example: analyze label (JSON image)

```bash
IMG_B64="$(printf '%s' '' | base64 -w0 2>/dev/null || true)"
# Replace IMG_B64 with a real small JPEG base64 string from a file:
# IMG_B64=$(base64 -w0 label.jpg)

curl -sS -X POST "http://localhost:8787/api/analyze-label" \
  -H "Content-Type: application/json" \
  -H "x-shelvesense-session: demo-session-1" \
  -d "{\"imageBase64\":\"$IMG_B64\",\"imageMimeType\":\"image/jpeg\",\"healthProfile\":{\"cholesterol\":\"high\",\"bloodSugar\":\"normal\",\"allergies\":[\"peanut\"],\"deficiencies\":[],\"sodiumSensitivity\":\"limit\",\"sugarSensitivity\":\"limit\",\"dietaryConstraints\":[],\"notes\":\"\"}}"
```

### Example: multipart (curl)

```bash
curl -sS -X POST "http://localhost:8787/api/analyze-label" \
  -H "x-shelvesense-session: demo-session-1" \
  -F "image=@./label.jpg" \
  -F "healthProfile={\"cholesterol\":\"high\",\"bloodSugar\":\"normal\",\"allergies\":[\"peanut\"],\"deficiencies\":[],\"sodiumSensitivity\":\"limit\",\"sugarSensitivity\":\"limit\",\"dietaryConstraints\":[],\"notes\":\"\"}"
```

### Example: cart update

```bash
curl -sS -X POST "http://localhost:8787/api/cart/update" \
  -H "Content-Type: application/json" \
  -H "x-shelvesense-session: demo-session-1" \
  -d "{\"latestItem\":{\"verdict\":\"Caution\",\"ingredients_flags\":[\"added sugar\"],\"health_risks\":[\"sugar load\"]},\"cart\":null}"
```

### Example: speech

```bash
curl -sS -X POST "http://localhost:8787/api/speech" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"Caution. Watch sodium and added sugar.\"}" | head
```

## CORS

Set `CORS_ORIGINS=https://your-tunnel,...` in production. Development defaults to permissive CORS.

## Security

- Never ship `CLAUDE_API_KEY` in the lens.
- Register your HTTPS gateway domain with Snap Remote Service configuration so `InternetModule.fetch` can reach this API from Spectacles.

## Tunables (optional env)

- `SHELFSENSE_AI_MAX_RETRIES`, `SHELFSENSE_AI_BACKOFF_MS`, `SHELFSENSE_AI_MAX_BACKOFF_MS`, `SHELFSENSE_AI_TIMEOUT_MS`
- `SHELFSENSE_MAX_IMAGE_BYTES` — max upload size for label images
