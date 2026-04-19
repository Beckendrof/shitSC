# CLAUDE.md — ShelfSense Project Prompt File

> Paste this entire file at the start of any new Claude conversation to give full context.
> Then describe what you want changed and Claude will know exactly where everything lives.

---

## What This Project Is

**ShelfSense** is an XR grocery assistant running on **Snap Spectacles** (AR glasses).

The user looks at a food product, performs a pinch gesture, and the glasses capture the label, send it **directly to the Claude API** (vision), then the lens shows a **Safe / Caution / Avoid** verdict in AR — in real time in the aisle.

**Target users:** people with food allergies, pre-diabetes, hypertension, or glucose-sensitivity who need a health filter at the point of purchase — without carrying a dietitian.

---

## Architecture (Current — Direct Claude API)

```
[Snap Spectacles]
        |
   Pinch → CameraModule → JPEG base64 (MaximumCompression)
        |
   InternetModule.fetch → POST https://api.anthropic.com/v1/messages
        → Claude vision (Haiku) with system prompt + image
        |
   JSON verdict → lens maps to AR text + Logger
```

**No backend server required** for the scan flow. The API key is set in the Lens Studio Inspector (`anthropicApiKey` field) and never committed to git.

---

## Snap Remote Service (required)

Outbound HTTPS from Spectacles is gated by **developers.snap.com** Remote Service / API Spec registration, not only the Lens Studio Remote Service Module field.

1. Register **`https://api.anthropic.com`** as the allowed origin.
2. Set **max request size** to at least **1 MB** (defaults like **1000 bytes** truncate ~300KB+ JSON and cause **400** / empty bodies).
3. Copy the **Api Spec Id** into Lens Studio → **Remote Service Module** → **Api Spec Id**.
4. In Lens Studio Inspector on `ShelfSenseQuickStart`, set **`anthropicApiKey`** to your `sk-ant-...` key.

---

## Tech Stack (Current)

### XR Client (Lens Studio)

| Tech | Use |
|---|---|
| Lens Studio | AR lens for Spectacles |
| TypeScript (Lens flavor) | `ShelfSenseQuickStart.ts` |
| SIK | Pinch detection |
| CameraModule | Still JPEG of the label |
| InternetModule | `fetch` directly to `api.anthropic.com/v1/messages` |
| Base64 | JPEG encoding |

### Backend (`shelvesense-server/`) — active, deployed to Railway

| Tech | Use |
|---|---|
| Node.js + Express | REST API under `/api/...` |
| Claude (vision) | Label reading + verdict JSON (see `visionService`, `config`) |
| Env on Railway | `ANTHROPIC_API_KEY`, model IDs, `PORT`, etc. (see `shelvesense-server/.env.example`) |

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
└── shelvesense-server/                ← Express API — deploy to Railway
```

---

## The Active Script: ShelfSenseQuickStart.ts

This is the only script wired for pinch-to-scan in the default scene. `ShelfSenseAgent.ts` is optional / future.

### Flow (step by step)

1. User pinches → `onPinch()` fires
2. `CameraModule.requestImage()` captures a JPEG
3. `Base64.encodeTextureAsync()` encodes with `MaximumCompression` to keep the JSON body smaller for proxies
4. `internetModule.fetch()` POSTs JSON to `{apiBaseUrl}/analyze-label` with `imageBase64`, `imageMimeType`, `healthProfile`
5. Server returns `LabelAnalysis` JSON — lens uses verdict fields for AR
6. AR text + Logger; auto-reset after **10 s** (`RESET_DELAY_MS`)

### @input Fields (set in Lens Studio Inspector)

| Field | Type | Value |
|---|---|---|
| `anthropicApiKey` | string | Your `sk-ant-...` Anthropic API key — set in Inspector, never commit to git |
| `headlineText` | Component.Text | Text SceneObject for verdict |
| `cameraModule` | Asset.CameraModule | Camera Module asset |
| `internetModule` | Asset.InternetModule | Internet Module asset |

### Hardcoded Health Profile (const in the script)

Located at the top of `ShelfSenseQuickStart.ts` as `HEALTH_PROFILE`:

```
- Peanut allergy (SEVERE — any peanut or tree nut = Avoid)
- Diabetic / low sugar (flag > 10g sugar per serving)
- Gluten-free (flag wheat, barley, rye, malt)
- Low sodium (flag > 140mg sodium per serving)
```

### JSON Verdict Shape (returned by Claude — fields the lens displays)

```json
{
  "verdict": "Safe" | "Caution" | "Avoid",
  "reason": "string",
  "ingredients_flags": ["string"],
  "macro_breakdown": { "calories": "", "protein": "", "carbs": "", "fat": "", "sugar": "", "sodium": "" },
  "health_risks": ["string"],
  "better_alternatives": [{ "name": "", "why_better": "" }],
  "cart_impact": { "summary": "", "running_score": "" },
  "meal_plan_hint": ""
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

- **Voice / TTS** — server has `/api/speech`; not wired from this quick-start lens
- **Cart tracking** — `/api/cart/update` + session headers exist on server; lens does not send cart state yet
- **Dynamic health profile** — `HEALTH_PROFILE` is hardcoded in the lens; could be an `@input` or profile API
- **`ShelfSenseAgent.ts`** — richer UI; not attached in the minimal scene

---

## How to Ask Claude to Make Changes

Paste this entire file, then describe your change. Examples:

### Change the health profile
> "Update `HEALTH_PROFILE` in `ShelfSenseQuickStart.ts` — remove low sodium, add shellfish allergy."

### Change the Claude model
> "In `ShelfSenseQuickStart.ts` `analyzeLabel()`, change the model string to `claude-haiku-4-5-20251001` for lower latency."

### Change the auto-reset timer
> "Change the 6-second auto-reset to 10 seconds."

### Change AR text format
> "Show only the verdict word and emoji in AR text. Move reason and flagged items to Logger only."

### Add voice readout
> "Call `/api/speech` from the lens after verdict, or use Lens Studio VoiceML."

### Add cart tracking
> "Wire `x-shelvesense-session` from responses and POST `/api/cart/update` after each scan."

### Add scan cooldown
> "Add a 3-second cooldown between pinches so the user can't accidentally double-scan."

### Wire up ShelfSenseAgent
> "Help me wire up `ShelfSenseAgent.ts`. List every scene object I need to create first and what components they need."

---

## Environment Notes

- **Lens Studio version:** [fill in your version]
- **Spectacles OS:** [fill in if known]
- **SIK (Spectacles Interaction Kit) version:** [fill in if known]
- **Anthropic API key:** Set as `anthropicApiKey` in Lens Studio Inspector — **never** commit the `.lsproj` file publicly if it contains the key. Rotate in the Anthropic Console if exposed.
- **Railway server:** Still exists in `shelvesense-server/` but is **not used** by the active scan flow. Can be used for future features (cart, speech, profile API).

---

## Hard Constraints for Claude

When making changes, always respect these — they are non-negotiable for Lens Studio:

1. **TypeScript only** — Lens Studio does not support plain `.js` files
2. **No npm packages** — only Lens Studio built-ins and SIK are available in the lens
3. **No Node.js APIs** — no `fs`, `path`, `process`, `Buffer`, `require()`
4. **No `localStorage` or `XMLHttpRequest`** — use Lens Studio's `fetch()` and `InternetModule`
5. **`@input` field types must use Lens Studio strings** — e.g. `"Component.Text"`, `"Asset.CameraModule"`, not TypeScript types
6. **`Base64`, `CameraModule`, `InternetModule` are Lens Studio globals** — do not import them
7. **`shelvesense-server/` is the Railway backend** — API keys and model config live there, not in the lens
8. **`ShelfSenseAgent.ts` is untouched** — do not modify it unless explicitly asked
