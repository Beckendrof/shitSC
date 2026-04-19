import { shelfSenseLog } from './utils/logger';
import { CooldownGate } from './utils/cooldown';
import { SIK } from 'SpectaclesInteractionKit.lspkg/SIK';

// ── Health profile sent with each request (must match server healthProfileSchema) ──
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

// ── Verdict result shape (subset of server LabelAnalysis) ─────────────────
interface QuickVerdict {
  verdict: 'Safe' | 'Caution' | 'Avoid';
  reason: string;
  ingredients_flags: string[];
  health_risks: string[];
  better_alternatives: { name: string; why_better: string }[];
}

// ── Auto-reset delay (ms) ───────────────────────────────────────────────
const RESET_DELAY_MS = 10000;

/**
 * ShelfSense: pinch → capture → ShelfSense API on Railway → AR verdict.
 *
 * In Snap **developers.snap.com**, register your Railway **public HTTPS host**
 * (e.g. `https://your-service.up.railway.app`) on the Remote Service / API Spec,
 * with **max request size ≥ 1MB** (default 1000 bytes will break label scans).
 *
 * Remote Service Module → Api Spec Id = that spec’s UUID.
 * Inspector → `apiBaseUrl` = same origin + `/api`, e.g. `https://your-service.up.railway.app/api`
 */
@component
export class ShelfSenseQuickStart extends BaseScriptComponent {
  /** Backend base URL ending in `/api`, e.g. https://xxx.up.railway.app/api */
  @input apiBaseUrl: string;

  /** Text component for displaying the verdict in AR. */
  @input headlineText: Text;

  /** Camera Module asset from the Asset Browser. */
  @input cameraModule: CameraModule;

  /** InternetModule asset — required for fetch() on Spectacles. */
  @input internetModule: InternetModule;

  private readonly cooldown = new CooldownGate(3000);
  private isScanning = false;

  onAwake(): void {
    try {
      if (!this.validateInputs()) return;

      this.setHeadline('ShelfSense ready\nPinch to scan a label');
      shelfSenseLog('init', 'ShelfSenseQuickStart ready');

      const handInputData = SIK.HandInputData;
      handInputData.getHand('right').onPinchDown.add(() => {
        shelfSenseLog('pinch', 'right hand pinch');
        void this.onPinch();
      });
      handInputData.getHand('left').onPinchDown.add(() => {
        shelfSenseLog('pinch', 'left hand pinch');
        void this.onPinch();
      });
      shelfSenseLog('init', 'SIK pinch registered (both hands)');
    } catch (e) {
      shelfSenseLog('init', `onAwake failed: ${e}`);
    }
  }

  private validateInputs(): boolean {
    const url = (this.apiBaseUrl ?? '').trim();
    if (url.length < 16 || !url.startsWith('https://')) {
      shelfSenseLog('init', 'Set apiBaseUrl in Inspector (https://…up.railway.app/api).');
      return false;
    }
    if (isNull(this.cameraModule)) {
      shelfSenseLog('init', 'Assign cameraModule in Inspector.');
      return false;
    }
    if (isNull(this.headlineText)) {
      shelfSenseLog('init', 'Assign headlineText in Inspector.');
      return false;
    }
    if (isNull(this.internetModule)) {
      shelfSenseLog('init', 'Assign internetModule in Inspector.');
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
      const imageRequest = CameraModule.createImageRequest();
      const frame = await this.cameraModule.requestImage(imageRequest);

      this.setHeadline('Analyzing label...');
      const b64 = await this.encodeTexture(frame.texture);
      shelfSenseLog('scan', `encoded image: ${b64.length} chars`);

      const verdict = await this.analyzeLabel(b64);
      shelfSenseLog('verdict', JSON.stringify(verdict));

      this.displayVerdict(verdict);

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
    const base = this.apiBaseUrl.replace(/\/$/, '');
    const url = `${base}/analyze-label`;
    const body = {
      imageBase64,
      imageMimeType: 'image/jpeg',
      healthProfile: HEALTH_PROFILE,
    };
    const bodyStr = JSON.stringify(body);
    shelfSenseLog('net', `POST ${url} (${bodyStr.length} chars)`);

    const response = await this.internetModule.fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: bodyStr,
    } as any);

    const responseText = await response.text();
    shelfSenseLog('net', `status=${response.status} body=${responseText.slice(0, 400)}`);

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`API ${response.status}: ${responseText.slice(0, 200)}`);
    }

    const parsed = JSON.parse(responseText) as Record<string, unknown>;
    if (parsed && typeof parsed.error === 'object' && parsed.error !== null) {
      const msg =
        typeof (parsed.error as { message?: string }).message === 'string'
          ? (parsed.error as { message: string }).message
          : 'Server error';
      throw new Error(msg);
    }

    return parsed as unknown as QuickVerdict;
  }

  private displayVerdict(v: QuickVerdict): void {
    const emoji =
      v.verdict === 'Safe' ? '\u2705' :
      v.verdict === 'Caution' ? '\u26A0\uFE0F' :
      '\uD83D\uDEAB';

    let display = `${emoji} ${v.verdict}\n${v.reason}`;

    if (v.ingredients_flags?.length > 0) {
      display += `\nFlagged: ${v.ingredients_flags.join(', ')}`;
    }
    if (v.health_risks?.length > 0) {
      display += `\nRisks: ${v.health_risks.join(', ')}`;
    }

    this.setHeadline(display);

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
