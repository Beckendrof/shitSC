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
 * ShelfSense: pinch → capture → Claude API (direct) → AR verdict.
 *
 * In Snap **developers.snap.com**, register `https://api.anthropic.com` on the
 * Remote Service / API Spec with **max request size ≥ 1MB**.
 *
 * Remote Service Module → Api Spec Id = that spec’s UUID.
 * Inspector → `anthropicApiKey` = your `sk-ant-...` key (never commit this).
 */
@component
export class ShelfSenseQuickStart extends BaseScriptComponent {
  /** Anthropic API key (sk-ant-...). Set in Inspector — never commit to git. */
  @input anthropicApiKey: string;

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
    const key = (this.anthropicApiKey ?? '').trim();
    if (!key.startsWith('sk-ant-')) {
      shelfSenseLog('init', 'Set anthropicApiKey in Inspector (sk-ant-...).');
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
    const url = 'https://api.anthropic.com/v1/messages';

    const systemPrompt =
      'You are a food label scanner for a user with these health conditions:\n' +
      '- Peanut allergy (SEVERE — any peanut or tree nut = Avoid)\n' +
      '- Diabetic / low sugar (flag > 10g sugar per serving)\n' +
      '- Gluten-free (flag wheat, barley, rye, malt)\n' +
      '- Low sodium (flag > 140mg sodium per serving)\n\n' +
      'Respond ONLY with a JSON object in this exact shape, no markdown:\n' +
      '{"verdict":"Safe","reason":"string","ingredients_flags":[],"health_risks":[],"better_alternatives":[]}';

    const bodyStr = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: 'Analyze this food label and return the JSON verdict.' },
        ],
      }],
    });

    shelfSenseLog('net', `POST ${url} (${bodyStr.length} chars)`);

    const response = await this.internetModule.fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: bodyStr,
    } as any);

    const responseText = await response.text();
    shelfSenseLog('net', `status=${response.status} body=${responseText.slice(0, 400)}`);

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Claude API ${response.status}: ${responseText.slice(0, 200)}`);
    }

    const apiResponse = JSON.parse(responseText) as { content: { type: string; text: string }[] };
    const raw = (apiResponse.content?.[0]?.text ?? '').trim();

    // Strip markdown code fences if present
    const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    // Find the JSON object boundaries in case there's surrounding text
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start === -1 || end === -1) {
      // Claude couldn't see a label — return a Caution so the lens shows something useful
      return {
        verdict: 'Caution',
        reason: stripped.slice(0, 200) || 'No label visible — point at a food product and rescan.',
        ingredients_flags: [],
        health_risks: [],
        better_alternatives: [],
      };
    }

    return JSON.parse(stripped.slice(start, end + 1)) as QuickVerdict;
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
