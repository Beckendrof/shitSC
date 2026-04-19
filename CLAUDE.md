# CLAUDE.md — ShelfSense Project Prompt File

> Paste this entire file at the start of any new Claude conversation to give full context.
> Then describe what you want changed and Claude will know exactly where everything lives.

---

## What This Project Is

**ShelfSense** is an XR grocery assistant running on **Snap Spectacles** (AR glasses).

The user looks at a food product, performs a pinch gesture, and the glasses capture the label, send it **directly to the Claude API** (no server, no backend), and display a **Safe / Caution / Avoid** verdict in AR text — in real-time, in the aisle.

**Target users:** people with food allergies, pre-diabetes, hypertension, or glucose-sensitivity who need a health filter at the point of purchase — without carrying a dietitian.

---

## Architecture (Current — Serverless)

```
[Snap Spectacles Hardware]
        |
   Pinch Gesture
        |
   CameraModule ──→ Still JPEG (base64 encoded, LowQuality)
        |
   InternetModule (fetch)
        |
   HTTPS POST directly to api.anthropic.com/v1/messages
        |
        ▼
   Claude API (claude-opus-4) — vision model reads the label image
        |
   JSON verdict returned
        |
        ▼
   [Lens renders AR UI]
   headlineText → "✅ Safe" / "⚠️ Caution" / "🚫 Avoid"
                → reason sentence
                → flagged ingredients
   Logger       → full verdict detail for debugging
```

**There is no local server. No Node.js. No ngrok. No Tesseract. No SQLite.**
The glasses call the Anthropic API directly.

---

## What Was Removed (and Why)

The original architecture had a Node.js/Express backend doing OCR and analysis locally. That entire layer was eliminated:

| Removed | Replacement | Reason |
|---|---|---|
| Node.js / Express server | Nothing — direct API call | Eliminates local dev dependency |
| ngrok tunnel | Nothing — API is public HTTPS | No laptop needed during use |
| Tesseract.js OCR | Claude vision | Claude reads the raw label image directly |
| sharp image preprocessing | LowQuality JPEG compression in lens | Good enough for Claude; keeps payload small |
| edge-tts / TTS audio | *(not yet re-implemented)* | Was server-side; needs rethinking for serverless |
| SQLite cart tracking | *(not yet re-implemented)* | Was server-side; needs rethinking for serverless |
| Session header pattern | *(removed)* | No server to hold session state |
| `/api/analyze-label` endpoint | `https://api.anthropic.com/v1/messages` | Direct call |
| `/api/cart/update` endpoint | *(not yet re-implemented)* | Future work |
| `/api/speech` endpoint | *(not yet re-implemented)* | Future work |
| `AI_ENGINE=mock` mode | *(removed)* | No backend to toggle |

---

## Tech Stack (Current)

### XR Client (Lens Studio) — the only active layer

| Tech | Use |
|---|---|
| Lens Studio (Snap's IDE) | AR lens development for Spectacles |
| TypeScript (Lens flavor) | All lens scripts |
| Spectacles Interaction Kit (SIK) | Pinch gesture detection via PinchInteractor |
| CameraModule | Captures still JPEG frame of the food label |
| InternetModule / fetch() | Makes HTTPS call directly to Anthropic API |
| Base64 (Lens built-in) | Encodes captured texture to JPEG base64 |
| Anthropic API (claude-opus-4) | Vision model — reads label, returns JSON verdict |

### Backend — DEPRECATED, do not modify

The `shelvesense-server/` folder still exists in the repo but is fully unused. Do not suggest changes to it.

---

## Project Structure

```
shelfsense/
├── CLAUDE.md                          ← this file
├── shelvesense-lens/                  ← Lens Studio project (runs ON the glasses)
│   └── Assets/ShelfSense/Scripts/
│       ├── ShelfSenseQuickStart.ts    ← THE ACTIVE SCRIPT ✅
│       ├── ShelfSenseAgent.ts         ← full agent — exists, NOT attached (future)
│       ├── ShelfSenseHello.ts         ← sanity test script (not in use)
│       ├── types.ts
│       ├── state/scanStore.ts
│       ├── ui/resultRenderer.ts
│       ├── ui/statusUI.ts
│       └── utils/                     ← colors, cooldown, logger, network helpers
└── shelvesense-server/                ← DEPRECATED — do not use or modify
```

---

## The Active Script: ShelfSenseQuickStart.ts

This is the only script doing real work. Everything else is either deprecated or not yet wired up.

### Flow (step by step)

1. User pinches → `onPinch()` fires
2. `CameraModule.requestImage()` captures a JPEG from the glasses camera
3. `Base64.encodeTextureAsync()` encodes it at `LowQuality` (keeps payload small, reduces latency)
4. `fetch()` POSTs to `https://api.anthropic.com/v1/messages` with:
   - A **system prompt** containing the hardcoded health profile
   - A **vision message** with the base64 image block
   - A user text message asking for the JSON verdict
5. Claude returns a JSON object — parsed and validated
6. AR text updates on screen + full detail printed to Logger
7. After 6 seconds, auto-resets to idle (ready to scan again)

### @input Fields (set in Lens Studio Inspector)

| Field | Type | Value |
|---|---|---|
| `apiKey` | string | Your `sk-ant-...` Anthropic API key |
| `headlineText` | Component.Text | A Text SceneObject in the scene |
| `cameraModule` | Asset.CameraModule | Camera Module from Asset Browser |
| `pinchInteractor` | Component.ScriptComponent | SIK PinchInteractor SceneObject |

### Hardcoded Health Profile (const in the script)

Located at the top of `ShelfSenseQuickStart.ts` as `HEALTH_PROFILE`:

```
- Peanut allergy (SEVERE — any peanut or tree nut = Avoid)
- Diabetic / low sugar (flag > 10g sugar per serving)
- Gluten-free (flag wheat, barley, rye, malt)
- Low sodium (flag > 140mg sodium per serving)
```

### Claude API Config (const in the script)

```typescript
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL   = "claude-opus-4-20250514";
```

### JSON Verdict Shape Claude Returns

```json
{
  "verdict": "Safe" | "Caution" | "Avoid",
  "reason": "One concise sentence explaining the verdict",
  "flagged": ["ingredient or nutrient that triggered the flag"],
  "alternatives": ["optional: 1-2 safer product suggestions"]
}
```

### Verdict Logic (enforced in the system prompt)

| Verdict | Condition |
|---|---|
| `"Avoid"` | Severe condition triggered — allergy or gluten present |
| `"Caution"` | Soft limit exceeded (sugar > 10g or sodium > 140mg), no severe issue |
| `"Safe"` | No conditions triggered |
| `"Caution"` | Blurry image or non-label photo — prompts user to rescan |

---

## Lens Studio Scene Hierarchy

```
Scene:
├── Camera Object              ← nothing attached (ShelfSenseAgent was removed from here)
├── Lighting                   ← untouched
├── Envmap                     ← untouched
├── Light                      ← untouched
├── ShelfSenseQuickStart       ← ShelfSenseQuickStart.ts attached here ✅
└── [Screen Text SceneObject]  ← dragged into headlineText @input
```

---

## What Is Not Done Yet (Future Work)

These features existed in the original backend but were not re-implemented after the server was removed. They need a serverless-compatible approach:

- **Voice / TTS** — original used `edge-tts` on the server. Serverless options: Lens Studio's `VoiceML` module, or a direct call to a TTS API (ElevenLabs, etc.)
- **Cart tracking** — original tracked a running session health score in SQLite. Serverless option: Lens Studio's `PersistentStorageSystem`, or encode state inside the lens
- **Dynamic health profile** — currently hardcoded. Could be made user-editable via a companion app or an `@input` string field
- **`ShelfSenseAgent.ts`** — fully written but not wired up. Needs 14 `@input` fields and a full scene with `ResultPanel`, `StatusRing`, `LoadingIndicator`, `AudioPlayer` — none of those scene objects exist yet

---

## How to Ask Claude to Make Changes

Paste this entire file, then describe your change. Examples:

### Change the health profile
> "Update `HEALTH_PROFILE` in `ShelfSenseQuickStart.ts` — remove low sodium, add shellfish allergy."

### Change the Claude model
> "Switch from `claude-opus-4-20250514` to `claude-haiku-4-5-20251001` to reduce latency."

### Change the auto-reset timer
> "Change the 6-second auto-reset to 10 seconds."

### Change AR text format
> "Show only the verdict word and emoji in AR text. Move reason and flagged items to Logger only."

### Add voice readout
> "After displaying the verdict, read it aloud using Lens Studio's VoiceML module. No external API."

### Add cart tracking
> "Add a scan counter using Lens Studio's PersistentStorageSystem — track how many Avoid vs Safe items scanned this session."

### Add scan cooldown
> "Add a 3-second cooldown between pinches so the user can't accidentally double-scan."

### Wire up ShelfSenseAgent
> "Help me wire up `ShelfSenseAgent.ts`. List every scene object I need to create first and what components they need."

---

## Environment Notes

- **Lens Studio version:** [fill in your version]
- **Spectacles OS:** [fill in if known]
- **SIK (Spectacles Interaction Kit) version:** [fill in if known]
- **API key location:** Pasted into the `apiKey` @input field in Lens Studio Inspector — never put it in this file or commit it to git

---

## Hard Constraints for Claude

When making changes, always respect these — they are non-negotiable for Lens Studio:

1. **TypeScript only** — Lens Studio does not support plain `.js` files
2. **No npm packages** — only Lens Studio built-ins and SIK are available in the lens
3. **No Node.js APIs** — no `fs`, `path`, `process`, `Buffer`, `require()`
4. **No `localStorage` or `XMLHttpRequest`** — use Lens Studio's `fetch()` and `InternetModule`
5. **`@input` field types must use Lens Studio strings** — e.g. `"Component.Text"`, `"Asset.CameraModule"`, not TypeScript types
6. **`Base64`, `CameraModule`, `InternetModule` are Lens Studio globals** — do not import them
7. **`shelvesense-server/` is dead** — never suggest changes to it
8. **`ShelfSenseAgent.ts` is untouched** — do not modify it unless explicitly asked
