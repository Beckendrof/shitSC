# CLAUDE.md — ShelfSense Project Prompt File

> Paste this entire file at the start of any new Claude conversation to give full context.
> Then describe what you want changed and Claude will know exactly where everything lives.

---

## What This Project Is

**ShelfSense** is an XR grocery assistant running on **Snap Spectacles** (AR glasses).

The user looks at a food product, performs a pinch gesture, and the glasses capture the label, send it to a **Node.js API on Railway**, which calls **Claude vision**, then the lens shows a **Safe / Caution / Avoid** verdict in AR — in real time in the aisle.

**Target users:** people with food allergies, pre-diabetes, hypertension, or glucose-sensitivity who need a health filter at the point of purchase — without carrying a dietitian.

---

## Architecture (Current — Railway + Claude on server)

```
[Snap Spectacles]
        |
   Pinch → CameraModule → JPEG base64 (MaximumCompression)
        |
   InternetModule.fetch → POST https://<railway>/api/analyze-label
        |
   shelvesense-server (Express on Railway)
        → Claude vision (API key stays on server)
        |
   JSON LabelAnalysis → lens maps to AR text + Logger
```

**Hosting:** **Railway** (`*.up.railway.app`) — not behind Cloudflare in the same way as Render/Workers, so Spectacles can reach it once Snap’s **Remote Service** allowlist and **request size limits** are set correctly.

**Do not point the lens at Cloudflare-fronted hosts** (e.g. `*.onrender.com`, `*.workers.dev`) for this use case unless you confirm Snap allows them — past testing showed **`status=0`** / no POST reaching the server.

---

## Snap Remote Service (required)

Outbound HTTPS from Spectacles is gated by **developers.snap.com** Remote Service / API Spec registration, not only the Lens Studio Remote Service Module field.

1. Register your **Railway public origin** (same host you put in `apiBaseUrl`, without path if the form asks for host only — follow Snap’s UI).
2. Set **max request size** to at least **1 MB** (defaults like **1000 bytes** truncate ~300KB+ JSON and cause **400** / empty bodies before Express runs).
3. Copy the **Api Spec Id** into Lens Studio → **Remote Service Module** → **Api Spec Id**.

---

## Tech Stack (Current)

### XR Client (Lens Studio)

| Tech | Use |
|---|---|
| Lens Studio | AR lens for Spectacles |
| TypeScript (Lens flavor) | `ShelfSenseQuickStart.ts` |
| SIK | Pinch detection |
| CameraModule | Still JPEG of the label |
| InternetModule | `fetch` to Railway `/api/analyze-label` |
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
| `apiBaseUrl` | string | Railway API root, e.g. `https://your-service.up.railway.app/api` (no trailing slash) |
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

### JSON Verdict Shape (server `LabelAnalysis` — fields the lens displays)

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

### Change the Claude model (server-side)
> "In `shelvesense-server` config / Railway env, set the vision model to Haiku for lower latency."

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
- **Anthropic API key:** Railway env vars only (`ANTHROPIC_API_KEY` / names in `.env.example`) — **never** in the lens or git
- **Railway URL:** Pasted into `apiBaseUrl` in Lens Studio (Inspector on `ShelfSenseQuickStart`)

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
