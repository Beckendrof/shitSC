# ShelfSense

An XR grocery assistant for **Snap Spectacles**. Look at a food product, pinch, and get an instant **Safe / Caution / Avoid** verdict overlaid in AR — powered by Claude vision — before it goes in your cart.

**Target users:** people managing food allergies, pre-diabetes, hypertension, or glucose sensitivity who need a health filter at the point of purchase.

---

## How it works

1. User looks at a product label and pinches
2. Spectacles capture a JPEG via `CameraModule`
3. The lens POSTs the image **directly to `api.anthropic.com/v1/messages`** (Claude Haiku, vision)
4. Claude returns a structured JSON verdict
5. The lens renders the verdict as AR text

```
[Snap Spectacles]
        |
   Pinch → CameraModule → JPEG base64
        |
   InternetModule.fetch → POST api.anthropic.com/v1/messages
        → Claude Haiku (vision) + health profile system prompt
        |
   JSON verdict → AR overlay  (Safe / Caution / Avoid)
```

No backend is required for the core scan flow.

---

## Repo layout

```
shelfsense/
├── Assets/                            ← Lens Studio project files
│   └── ShelfSense/Scripts/
│       ├── ShelfSenseQuickStart.ts    ← active scan script (pinch → verdict)
│       ├── ShelfSenseAgent.ts         ← richer agent UI (not yet wired)
│       └── utils/                     ← logger, cooldown, colors
├── shelvesense-server/                ← Express API (deployed to Railway)
│   └── src/                           ← profile parsing, cart, TTS, OCR
├── samples/                           ← synthetic + real product label fixtures
│   └── real-products/
└── CLAUDE.md                          ← full project context for AI assistants
```

---

## Lens setup

### Prerequisites

- [Lens Studio](https://ar.snap.com/lens-studio) (latest)
- Snap Spectacles with SIK support
- Anthropic API key (`sk-ant-...`) — get one at [console.anthropic.com](https://console.anthropic.com)

### 1. Register the Remote Service (required)

Outbound HTTPS from Spectacles is gated by Snap's Remote Service system:

1. Go to **developers.snap.com** → Remote Service → API Spec
2. Register `https://api.anthropic.com` as the allowed origin
3. Set **max request size to at least 1 MB** (the default truncates the image payload and causes 400 errors)
4. Copy the **Api Spec Id** into Lens Studio → Remote Service Module → **Api Spec Id**

### 2. Set Inspector fields

Open the `ShelfSenseQuickStart` scene object in Lens Studio and wire up:

| Field | Value |
|---|---|
| `anthropicApiKey` | Your `sk-ant-...` key — set here only, never commit |
| `headlineText` | Drag in the screen Text SceneObject |
| `cameraModule` | Drag in the Camera Module asset |
| `internetModule` | Drag in the Internet Module asset |

### Health profile

The active health profile is hardcoded in `ShelfSenseQuickStart.ts` as `HEALTH_PROFILE`. Current defaults:

- Peanut allergy (severe — any nut triggers Avoid)
- Diabetic / low sugar (flags > 10 g sugar per serving)
- Gluten-free (flags wheat, barley, rye, malt)
- Low sodium (flags > 140 mg sodium per serving)

Edit the `HEALTH_PROFILE` constant at the top of that file to change it.

### Verdict logic

| Verdict | Condition |
|---|---|
| **Avoid** | Severe allergy or gluten present |
| **Caution** | Soft limit exceeded (sugar or sodium), or image unreadable |
| **Safe** | No conditions triggered |

Auto-resets after 10 seconds. There is a 3-second cooldown between scans.

---

## Backend server (`shelvesense-server/`)

The Express API handles profile parsing, cart tracking, TTS, and OCR. It is deployed to Railway but not required for the core scan flow.

See [`shelvesense-server/README.md`](shelvesense-server/README.md) for full setup and API reference.

Quick start:

```bash
cd shelvesense-server
cp .env.example .env   # add ANTHROPIC_API_KEY
npm install
npm run dev            # starts on port 8787
```

Key endpoints:

| Method | Path | Description |
|---|---|---|
| POST | `/api/analyze-label` | Vision analysis against a health profile |
| POST | `/api/profile/parse` | Parse lab text into a structured profile |
| POST | `/api/cart/update` | Merge a scan into cart intelligence |
| POST | `/api/speech` | TTS — returns `audioBase64` or `browser_tts_hint` |
| POST | `/api/meal-plan` | Three budget-aware meal suggestions |

---

## Security

- **Never commit your API key.** Set it in Lens Studio Inspector only. Rotate immediately at [console.anthropic.com](https://console.anthropic.com) if it leaks.

---

## What's not done yet

- Voice readout — server has `/api/speech`; not wired from the lens
- Cart tracking — `/api/cart/update` exists; lens does not send cart state yet
- Dynamic health profile — currently hardcoded in the lens
- `ShelfSenseAgent.ts` — richer UI, not attached in the default scene
