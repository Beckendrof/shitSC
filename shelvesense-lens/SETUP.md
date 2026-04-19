# ShelfSense lens — Spectacles setup (from empty project)

Your current `RealityShift SC` Lens Studio project contains only the default **Camera Object**, **Lighting**, and **Envmap**. None of the `shelvesense-lens/src/*.ts` files have been imported yet, **Spectacles Interaction Kit (SIK) is not installed**, and there is **no `ShelfSenseAgent` script component in the scene**. That is why the lens appears to “shut down” on Spectacles — there is nothing to run.

Follow these steps **in order** in Lens Studio. Do not skip any.

---

## 0. Prove the lens can actually run code (Hello test)

Before anything else, make sure the lens is reaching Spectacles and loading TypeScript at all.

1. Open `RealityShift SC.esproj`. In the Asset Browser you should now see **`Assets/ShelfSense/Scripts/`** with files like `ShelfSenseAgent.ts`, `ShelfSenseHello.ts`, `types.ts`, etc. (they are already committed to this repo).
2. In the Scene Hierarchy, click **`Camera Object`** → Inspector → **Add Component → Script**.
3. In the Script field, choose **`ShelfSenseHello`**. It has **no inputs**, so it cannot fail from missing wiring.
4. Pair Spectacles, open **Logger**, send lens to device.
5. You should see in Logger:
   ```
   [ShelfSenseHello] alive t=0.05
   [ShelfSenseHello] heartbeat ticks=120 t=...
   ```
   - **If you see those lines** → the lens is running, scripts load, permissions are fine. Move on to step 1.
   - **If you see nothing** → the lens is not loading scripts. Usually: TypeScript disabled in Project Settings, wrong device target, or the script component was never added. Fix that before continuing.

Once confirmed, you can delete the `ShelfSenseHello` ScriptComponent — the real agent is `ShelfSenseAgent`.

## 1. Open the project and verify device target

1. Open `RealityShift SC.esproj` in **Lens Studio 5.x**.
2. Top toolbar → device dropdown → set to **Spectacles (2024)**.
3. **Project Settings → Publishing → Device** must include **Spectacles**.

## 2. Install Spectacles Interaction Kit (SIK)

1. **Window → Asset Library** (or **Asset Library** tab).
2. Search: **`Spectacles Interaction Kit`** → **Install**.
3. After install, confirm `Packages/SpectaclesInteractionKit` exists on disk.

SIK is what makes **pinch** work. Without it nothing is interactive.

## 3. ShelfSense TypeScript is already imported

The scripts live at **`Assets/ShelfSense/Scripts/`** and are committed to the repo, so you do **not** need to drag anything in:

```
Assets/ShelfSense/Scripts/ShelfSenseAgent.ts   ← main component
Assets/ShelfSense/Scripts/ShelfSenseHello.ts   ← zero-input sanity script (Step 0)
Assets/ShelfSense/Scripts/types.ts
Assets/ShelfSense/Scripts/state/scanStore.ts
Assets/ShelfSense/Scripts/ui/resultRenderer.ts
Assets/ShelfSense/Scripts/ui/statusUI.ts
Assets/ShelfSense/Scripts/utils/colors.ts
Assets/ShelfSense/Scripts/utils/cooldown.ts
Assets/ShelfSense/Scripts/utils/logger.ts
Assets/ShelfSense/Scripts/utils/network.ts
```

If Lens Studio shows red errors, make sure Project Settings → **TypeScript** is **enabled** (Lens Studio 5 enables this by default).

## 4. Enable device capabilities

**Project Settings → Capabilities** (Spectacles panel):

- ✅ **Internet** (required for `InternetModule.fetch`)
- ✅ **Camera** (required for still-image `CameraModule.requestImage`)
- ✅ **Microphone** is **not** required

Without **Internet** or **Camera** the lens will be terminated the first time it uses those APIs and you will see the “shuts down instantly” behavior.

## 5. Allow-list your HTTPS API (Remote Service)

Spectacles can only reach explicitly allow-listed domains.

1. **Project Settings → Remote Service / Internet Access**.
2. Add the HTTPS origin of your deployed ShelfSense gateway, e.g. `https://shelfsense.example.com` or your ngrok/cloud tunnel `https://abc123.ngrok.app`.
3. The URL you set later in `apiBaseUrl` must start with **exactly** this origin (path `/api` is fine).

> Localhost is **not** reachable from Spectacles. Use a public HTTPS URL.

## 6. Build the scene objects

In the **Scene Hierarchy**, create:

```
ShelfSense (SceneObject)
├── ShelfSenseAgent         (has ScriptComponent → ShelfSenseAgent.ts)
├── PinchInteractor         (from SIK prefab: e.g. "Gaze Hover Interactor" or SIK Interactor)
├── StatusRing              (small sphere / plane used as busy indicator)
├── LoadingIndicator        (optional tiny mesh)
├── ResultPanel             (parent for the four Text objects; disabled by default)
│   ├── HeadlineText        (Text — large, verdict)
│   ├── DetailsText         (Text — wrap, short reason)
│   ├── AlternativesText    (Text — smaller, multi-line)
│   └── CartSummaryText     (Text — smallest)
├── AudioPlayer             (AudioComponent)
└── ScanAnchor              (optional — parent the panel here for stable world placement)
```

**For `PinchInteractor`:** drag in the SIK **Interactor** prefab on the object you want to pinch-focus. The `InteractionComponent` that ships with SIK emits `onPinchStart` and `onFocusEnd` — those are what `ShelfSenseAgent` listens to.

## 7. Add the ScriptComponent and wire inputs

1. Select `ShelfSenseAgent` SceneObject → **Add Component → Script** → drag `ShelfSenseAgent.ts`.
2. In the Inspector, fill **every** field — **none can be empty** or the lens will be killed on first frame:

| Input              | What to drag in                                                                 |
|--------------------|----------------------------------------------------------------------------------|
| `cameraModule`     | **Asset Browser → + → Camera Module** (create if missing), then drag the asset. |
| `remoteService`    | **Asset Browser → + → Internet Module**, drag the asset.                        |
| `remoteMedia`      | **Asset Browser → + → Remote Media Module**, drag the asset.                    |
| `apiBaseUrl`       | Your deployed API root, e.g. `https://abc123.ngrok.app/api`.                    |
| `pinchInteractor`  | The `InteractionComponent` on `PinchInteractor`.                                |
| `headlineText`     | `HeadlineText` → **Text** component.                                            |
| `detailsText`      | `DetailsText` → **Text** component.                                             |
| `alternativesText` | `AlternativesText` → **Text** component.                                        |
| `cartSummaryText`  | `CartSummaryText` → **Text** component.                                         |
| `loadingIndicator` | `LoadingIndicator` SceneObject.                                                 |
| `statusRing`       | `StatusRing` SceneObject.                                                       |
| `resultPanel`      | `ResultPanel` SceneObject.                                                      |
| `audioPlayer`      | `AudioPlayer` → **AudioComponent**.                                             |
| `scanAnchor`       | `ScanAnchor` (optional — leave empty if not used).                              |

If you miss any required input, the **Logger** will print:

```
[ShelfSense:init] Assign <field> on ShelfSenseAgent.
```

…and the agent refuses to run instead of crashing the whole lens.

## 8. Run in Lens Studio preview first

1. Top bar → Preview dropdown → choose **Spectacles (2024)**.
2. Open **Logger**.
3. You should see `[ShelfSense:profile] …` and no `[ShelfSense:init]` error.
4. Pinch while focused on the result panel → you should see scanning / analyzing states and eventually a verdict.

## 9. Push to Spectacles

1. Pair Spectacles (**Snap Camera Kit / Spectacles app**).
2. **Send to Device** → choose the paired pair of Spectacles.
3. On device, open the lens from your **My Lenses**.
4. Pinch to scan a product.

## 10. If it still closes on device

Read **Logger** on the connected device (Lens Studio → device tab) and compare against this list:

| Symptom                                                  | Likely cause                                              |
|----------------------------------------------------------|-----------------------------------------------------------|
| Immediately closes, no `[ShelfSense:*]` logs at all      | Script not attached / scene empty / SIK not installed.    |
| `[ShelfSense:init] Assign …`                             | An `@input` is unassigned — set it in Inspector.          |
| `[ShelfSense:init] Set apiBaseUrl …`                     | `apiBaseUrl` blank or too short.                          |
| Pinch does nothing                                       | No **Interactor** on `PinchInteractor`, or SIK missing.   |
| First scan fails with network error                      | Domain not allow-listed (step 5) / API not HTTPS.         |
| `[ShelfSense:tts] server TTS unavailable — show text only` | Fine — server returned `fallback: browser_tts_hint`.     |
| `[ShelfSense:scan] error HTTP 4xx/5xx`                   | Check backend logs (`shelvesense-server`).                |

---

## Sanity checks you can run without Spectacles

- **Backend real-product suite** (from `shelvesense-server/`):
  ```powershell
  $env:AI_ENGINE='mock'; $env:OCR_ENABLED='true'; $env:OCR_PREPROCESS='true'; npm run dev
  # second terminal:
  $env:SMOKE_URL='http://127.0.0.1:PORT'; npm run verify:real
  ```
- **Live demo page** (browser): open `http://localhost:PORT/demo.html` → Generate & play audio (tests `/api/speech`).

Both of these should pass **before** you try the lens on hardware, so you know the API half is healthy and only the Lens Studio wiring can be at fault on device.
