import { shelfSenseLog } from './utils/logger';
import { CooldownGate } from './utils/cooldown';
import { SIK } from 'SpectaclesInteractionKit.lspkg/SIK';

// ── Health profile sent with each request ──────────────────────────
const HEALTH_PROFILE = {
  cholesterol: 'high',
  bloodSugar: 'at-risk',
  allergies: ['peanut'],
  deficiencies: ['vitamin D'],
  sodiumSensitivity: 'limit',
  sugarSensitivity: 'elevated',
  dietaryConstraints: ['dairy: sensitive', 'avoid ultra-processed snacks'],
  notes: '',
};

// ── Verdict result shape ───────────────────────────────────────────
interface QuickVerdict {
  verdict: 'Safe' | 'Caution' | 'Avoid';
  reason: string;
  ingredients_flags: string[];
  health_risks: string[];
  better_alternatives: { name: string; why_better: string }[];
}

// ── Auto-reset delay (ms) ──────────────────────────────────────────
const RESET_DELAY_MS = 10000;

/**
 * ShelfSense: pinch → capture → backend API → AR verdict.
 *
 * Calls your shelvesense-server (which calls Claude).
 * Set `apiBaseUrl` to your ngrok/deployed HTTPS URL + /api.
 */
@component
export class ShelfSenseQuickStart extends BaseScriptComponent {
  /** Backend URL, e.g. https://abc123.ngrok-free.app/api (no trailing slash). */
  @input apiBaseUrl: string;

  /** Text component for displaying the verdict in AR. */
  @input headlineText: Text;

  /** Camera Module asset from the Asset Browser. */
  @input cameraModule: CameraModule;

  /** InternetModule asset — required for fetch() on Spectacles. */
  @input internetModule: InternetModule;

  private readonly cooldown = new CooldownGate(3000);
  private isScanning = false;
  private sessionId: string | null = null;

  onAwake(): void {
    try {
      if (!this.validateInputs()) return;

      this.setHeadline('ShelfSense ready\nPinch to scan a label');
      shelfSenseLog('init', 'ShelfSenseQuickStart ready');

      // SIK pinch detection via HandInputData (works on Spectacles)
      const handInputData = SIK.HandInputData;
      const rightHand = handInputData.getHand('right');
      const leftHand = handInputData.getHand('left');

      rightHand.onPinchDown.add(() => {
        shelfSenseLog('pinch', 'right hand pinch');
        void this.onPinch();
      });
      leftHand.onPinchDown.add(() => {
        shelfSenseLog('pinch', 'left hand pinch');
        void this.onPinch();
      });
      shelfSenseLog('init', 'SIK pinch registered (both hands)');
    } catch (e) {
      shelfSenseLog('init', `onAwake failed: ${e}`);
    }
  }

  private validateInputs(): boolean {
    if (!this.apiBaseUrl || this.apiBaseUrl.length < 12) {
      shelfSenseLog('init', 'Set apiBaseUrl in Inspector (e.g. https://abc.ngrok-free.app/api).');
      return false;
    }
    if (isNull(this.cameraModule)) {
      shelfSenseLog('init', 'Assign cameraModule (CameraModule asset) in Inspector.');
      return false;
    }
    if (isNull(this.headlineText)) {
      shelfSenseLog('init', 'Assign headlineText (Text component) in Inspector.');
      return false;
    }
    if (isNull(this.internetModule)) {
      shelfSenseLog('init', 'Assign internetModule (InternetModule asset) in Inspector.');
      return false;
    }
    return true;
  }

  private async onPinch(): Promise<void> {
    if (this.isScanning) return;
    if (!this.cooldown.tryEnter(getTime() * 1000)) {
      shelfSenseLog('scan', 'cooldown active — wait before scanning again');
      return;
    }

    this.isScanning = true;
    this.setHeadline('Scanning...');
    shelfSenseLog('scan', 'pinch detected — capturing image');

    try {
      // 1. Capture still image
      const imageRequest = CameraModule.createImageRequest();
      const frame = await this.cameraModule.requestImage(imageRequest);

      // 2. Encode to base64 JPEG
      this.setHeadline('Analyzing label...');
      const b64 = await this.encodeTexture(frame.texture);
      shelfSenseLog('scan', `encoded image: ${b64.length} chars`);

      // 3. Call backend /api/analyze-label
      const analysis = await this.analyzeLabel(b64);
      shelfSenseLog('verdict', JSON.stringify(analysis));

      // 4. Display result
      this.displayVerdict(analysis);

      // 5. Auto-reset after delay
      const resetEvent = this.createEvent('DelayedCallbackEvent');
      resetEvent.bind(() => {
        this.setHeadline('ShelfSense ready\nPinch to scan a label');
      });
      resetEvent.reset(RESET_DELAY_MS / 1000);
    } catch (e) {
      const msg = `${e}`;
      shelfSenseLog('scan', `error: ${msg}`);
      this.setHeadline('Error — pinch to retry\n' + msg.slice(0, 120));
    } finally {
      this.isScanning = false;
    }
  }

  private encodeTexture(tex: Texture): Promise<string> {
    return new Promise((resolve, reject) => {
      Base64.encodeTextureAsync(
        tex,
        (encoded) => resolve(encoded),
        () => reject(new Error('JPEG encode failed')),
        CompressionQuality.MaximumCompression,
        EncodingType.Jpg,
      );
    });
  }

  private async analyzeLabel(imageBase64: string): Promise<QuickVerdict> {
    const url = `${this.apiBaseUrl.replace(/\/api\/?$/, '')}/debug`;
    const body = {
      imageBase64,
      imageMimeType: 'image/jpeg',
      healthProfile: HEALTH_PROFILE,
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.sessionId) {
      headers['x-shelvesense-session'] = this.sessionId;
    }

    const bodyStr = JSON.stringify(body);
    shelfSenseLog('net', `sending ${bodyStr.length} chars to ${url}`);

    const response = await this.internetModule.fetch(url, {
      method: 'POST',
      headers,
      body: bodyStr,
    } as any);

    // Capture session ID from response
    const newSession = response.headers.get('x-shelvesense-session');
    if (newSession) {
      this.sessionId = newSession;
    }

    const responseText = await response.text();
    shelfSenseLog('net', `status=${response.status} body=${responseText.slice(0, 500)}`);
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`API ${response.status}: ${responseText.slice(0, 400)}`);
    }

    return JSON.parse(responseText) as QuickVerdict;
  }

  private displayVerdict(v: QuickVerdict): void {
    const emoji =
      v.verdict === 'Safe' ? '\u2705' :
      v.verdict === 'Caution' ? '\u26A0\uFE0F' :
      '\uD83D\uDEAB';

    let display = `${emoji} ${v.verdict}\n${v.reason}`;

    if (v.ingredients_flags && v.ingredients_flags.length > 0) {
      display += `\nFlagged: ${v.ingredients_flags.join(', ')}`;
    }

    if (v.health_risks && v.health_risks.length > 0) {
      display += `\nRisks: ${v.health_risks.join(', ')}`;
    }

    this.setHeadline(display);

    // Full detail to Logger
    shelfSenseLog('display', `verdict=${v.verdict} reason=${v.reason}`);
    if (v.ingredients_flags?.length) shelfSenseLog('display', `flagged=${v.ingredients_flags.join(', ')}`);
    if (v.better_alternatives?.length) {
      shelfSenseLog('display', `alternatives=${v.better_alternatives.map(a => a.name).join(', ')}`);
    }
  }

  private setHeadline(text: string): void {
    if (!isNull(this.headlineText)) {
      this.headlineText.text = text;
    }
  }
}
