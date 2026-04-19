# ShelfSense

**ShelfSense** is an XR system that reduces harmful food decisions at the exact moment they are made — not “just an AI grocery scanner.”

It targets the intersection of **chronic disease risk** (diabetes, hypertension, obesity), **life-threatening food allergies**, **health inequality** (no dietitian on every aisle), and **confusing or incomplete labeling** — by pairing **Snap Spectacles + Lens Studio** with a **Node.js** backend that reads labels, applies the shopper’s **health profile**, and returns a clear **Safe / Caution / Avoid** signal with voice and short AR copy.

### Primary user group (product default)

Optimization defaults to **people with food allergies** and **pre-diabetes / glucose-aware** profiles: the pipeline prioritizes **allergen avoidance** and **sugar–sodium signals** first. The same session model supports sodium limits, elderly-friendly short prompts, and budget-oriented meal suggestions via **`/api/meal-plan`**.

### User flow (Spectacles)

1. User looks at a product in store.  
2. **Pinch** (Spectacles Interaction Kit).  
3. **CameraModule** captures a still of the label.  
4. Backend **OCR + analysis** vs stored profile.  
5. Response: verdict, reason, risks, alternatives, cart hint.  
6. Lens shows **minimal world UI** and plays **TTS** (or graceful fallback).

### Architecture (strict separation)

| Layer | Stack | Responsibility |
|--------|--------|------------------|
| **Lens** | Lens Studio TypeScript, SIK, `CameraModule`, `InternetModule`, `RemoteMediaModule` | Pinch, capture, HTTPS calls, UI, audio playback — **no** label heuristics or OCR. |
| **Backend** | Node.js, Express, TypeScript, Zod, SQLite (optional), tesseract.js | OCR, profile parsing, vision/AI abstraction, cart, meals, TTS — **no** Spectacles UI logic. |

### Repo layout

- **`shelvesense-lens/`** — Spectacles client; entry script: **`src/ShelfSenseAgent.ts`**.  
- **`shelvesense-server/`** — REST API, OCR, Claude-powered analysis, plus deterministic mock heuristics for CI.  
- **`samples/`** — small synthetic SSAMPLE JPEGs (secondary regression only).  
- **`samples/real-products/`** — **mandatory** real packaging / shelf / motion-style frames (`npm run samples:real:fetch`).

### Run with Claude cloud API

```powershell
cd shelvesense-server
copy .env.example .env
npm install
$env:AI_ENGINE='claude'; $env:CLAUDE_API_KEY='your-key'; $env:OCR_ENABLED='true'; $env:OCR_PREPROCESS='true'; npm run dev
```

Second terminal:

```powershell
cd shelvesense-server
npm run samples:real:fetch
$env:SMOKE_URL='http://127.0.0.1:8787'; npm run verify:real
npm run verify:samples
```

Hardware: complete **one live pinch** on Spectacles with `apiBaseUrl` pointing at a **deployed HTTPS** gateway (see `shelvesense-lens/README.md`).

### Documentation

- API and env details: **`shelvesense-server/README.md`**  
- Lens wiring and SIK checklist: **`shelvesense-lens/README.md`**
