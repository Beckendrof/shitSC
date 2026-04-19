# ShelfSense lens (Lens Studio + Spectacles)

> **If the lens “shuts down” on Spectacles, start here: [`SETUP.md`](./SETUP.md).**
> The default project in this repo has an **empty scene**, no **SIK** installed, and no **ScriptComponent** attached — the lens cannot run on device until you follow the 10 steps in `SETUP.md`.


TypeScript client for **ShelfSense** — XR guidance at the shelf so people with **allergies**, **glucose or sodium risk**, or **limited label literacy** get an immediate **Safe / Caution / Avoid** signal (see repo root **`README.md`**).

**Primary script (wire this in Lens Studio):** `src/ShelfSenseAgent.ts` — pinch → `CameraModule` still → `POST /api/analyze-label` → `POST /api/cart/update` → `POST /api/speech` → minimal UI + audio.

This folder is **not** bundled by Node — copy `shelvesense-lens/src` into your Lens Studio project (for example `Assets/ShelfSense/Scripts/`) or symlink it, then add the script component to a Scene Object.

## Lens closes immediately on Spectacles (“app shutting down”)

1. **Inspector wiring** — On the Scene Object with `ShelfSenseAgent`, assign **every** required `@input`: `cameraModule`, `remoteService`, `remoteMedia`, `apiBaseUrl`, `pinchInteractor`, all four `Text` fields, `loadingIndicator`, `statusRing`, `resultPanel`, `audioPlayer`. Missing **any** of these dereferences native objects on the first frame and the OS will kill the lens.
2. **Device capabilities** — In Lens Studio **Project Settings → Capabilities** (or the Spectacles device section), enable **Internet** and **Camera** for this lens. Without them, camera or fetch APIs can fail at runtime.
3. **Target device** — Use a **Spectacles** preview / deployed build. `CameraModule.requestImage` is wearable-only; running a Spectacles-only script on the wrong target can crash.
4. **Logs** — After the latest script update, missing inputs print `[ShelfSense:init] …` in **Logger** before exit; read those lines first.
5. **`apiBaseUrl`** — Must be a real **HTTPS** URL the glasses can reach (allow-listed Remote Service domain). Wrong or empty URL still boots if inputs are wired, but profile fetch will fall back to the demo profile.

## Hardware-ready checklist

1. **Remote Service / gateway** — HTTPS endpoint that proxies to this repo’s API; domain allow-listed in Snap tooling. For demos, **`apiBaseUrl` must be the same deployed origin** you used when passing `npm run verify:real` on the server — not `localhost` (Spectacles cannot reach your laptop).
2. **`apiBaseUrl`** — set to `https://your-gateway.example.com/api` (no trailing slash). The lens never embeds API keys.
3. **`InternetModule` + `RemoteMediaModule`** — required for JSON fetch and optional MP3 playback from `/api/speech`.
4. **`CameraModule`** still capture — pinch triggers `requestImage`, JPEG encode, then `POST /api/analyze-label`.
5. **Session header** — responses include `x-shelvesense-session`; the client persists it for cart + profile continuity.
6. **SIK / pinch** — assign `InteractionComponent`; unfocus hides the result panel to save battery and reduce clutter in AR.

## Real-world QA (required before judging “done”)

On the server repo: `npm run samples:real:fetch` → `npm run verify:real` (see `shelvesense-server/README.md`).  
On device: complete **one live pinch capture** through this lens against a real shelf or package and confirm the verdict + (optional) TTS behave like the verified API.

## Lens Studio steps

1. Enable **TypeScript** in Project Settings.
2. Copy `src/**` into your project’s Script assets (paths above).
3. Add a Script component and choose **`ShelfSenseAgent`**.
4. Wire `@input` fields: camera, `InternetModule`, `RemoteMediaModule`, API base URL, pinch interactor, text meshes, UI scene objects, `AudioComponent`, optional `scanAnchor`.

### `ShelfSenseAgent` inputs

| Input | Role |
|--------|------|
| `cameraModule` | `CameraModule` for live stills |
| `remoteService` | `InternetModule` for `fetch` |
| `remoteMedia` | `RemoteMediaModule` for decoding TTS audio |
| `apiBaseUrl` | Gateway root ending in `/api` |
| `pinchInteractor` | SIK / gaze pinch |
| `headlineText` / `detailsText` / `alternativesText` / `cartSummaryText` | World-space UI |
| `loadingIndicator` / `statusRing` / `resultPanel` | Lightweight feedback |
| `audioPlayer` | Plays returned MP3 when bytes are present |
| `scanAnchor` | Optional parent for panel placement |

## Compile note

Lens Studio uses its own TypeScript toolchain — keep imports compatible with Lens Studio’s provided typings (`BaseScriptComponent`, `@component`, `@input`, etc.).

## Logging

`print()` logs use the `shelfSenseLog` helper — watch the Logger panel.
