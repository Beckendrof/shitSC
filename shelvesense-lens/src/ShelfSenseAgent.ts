import { ScanStore } from './state/scanStore';
import { fetchJson } from './utils/network';
import type { Delayer } from './utils/network';
import { CooldownGate } from './utils/cooldown';
import { shelfSenseLog } from './utils/logger';
import { applyLoadingIndicator, applyStatusRing } from './ui/statusUI';
import { clearTexts, renderCartPanel, renderVerdictTexts, showError } from './ui/resultRenderer';
import type { CartState, HealthProfile, LabelAnalysis, SpeechPayload } from './types';

/** Spectacles still-image request — static `createImageRequest` lives on the CameraModule class constructor. */
function createStillImageRequest(cameraAsset: CameraModule): CameraModule.ImageRequest {
  const ctor = cameraAsset.constructor as typeof CameraModule;
  if (typeof ctor.createImageRequest === 'function') {
    return ctor.createImageRequest();
  }
  const legacy = require('LensStudio:CameraModule') as unknown;
  const asAny = legacy as { createImageRequest?: () => CameraModule.ImageRequest };
  if (typeof asAny.createImageRequest === 'function') {
    return asAny.createImageRequest();
  }
  throw new Error('CameraModule.createImageRequest is not available on this build target.');
}

const MOCK_PROFILE: HealthProfile = {
  cholesterol: 'high',
  bloodSugar: 'at-risk',
  allergies: ['peanut'],
  deficiencies: ['vitamin D'],
  sodiumSensitivity: 'limit',
  sugarSensitivity: 'elevated',
  dietaryConstraints: ['dairy: sensitive', 'avoid ultra-processed snacks'],
  notes: 'Demo profile — GET /api/profile after POST /api/profile/parse (or OCR + parse).',
};

/**
 * Spectacles-first flow: pinch → CameraModule still → gateway fetch → verdict + cart + optional TTS.
 * Wire this component in Lens Studio; no API keys ship in the lens.
 *
 * If the lens closes immediately on device: every @input below must be assigned in the Inspector,
 * and the project must enable Spectacles **Camera** + **Internet** capabilities (see README).
 */
@component
export class ShelfSenseAgent extends BaseScriptComponent {
  @input cameraModule: CameraModule;

  /** Spectacles: assign InternetModule. Target must be allow-listed for Remote Service / gateway. */
  @input remoteService: InternetModule;

  @input remoteMedia: RemoteMediaModule;

  /** Example: https://your-gateway.example.com/api (no trailing slash). */
  @input apiBaseUrl: string;

  /** Spectacles Interaction Kit / gaze object: pinch while focused. */
  @input pinchInteractor: InteractionComponent;

  @input headlineText: Text;
  @input detailsText: Text;
  @input alternativesText: Text;
  @input cartSummaryText: Text;

  @input loadingIndicator: SceneObject;
  @input statusRing: SceneObject;
  @input resultPanel: SceneObject;
  @input audioPlayer: AudioComponent;

  /** Optional world anchor (SIK rig root) — parent `resultPanel` for stable placement. */
  @input scanAnchor: SceneObject;

  private readonly store = new ScanStore();

  private readonly cooldown = new CooldownGate(2200);

  private isScanning = false;

  /** False when required Inspector wiring is missing — avoids native crashes on first frame. */
  private inputsReady = false;

  private delayer: Delayer = (ms) =>
    new Promise((resolve) => {
      const ev = this.createEvent('DelayedCallbackEvent');
      ev.bind(() => resolve());
      ev.reset(ms / 1000);
    });

  onAwake(): void {
    try {
      if (!this.ensureRequiredInputs()) {
        return;
      }
      this.inputsReady = true;

      if (!isNull(this.audioPlayer)) {
        this.audioPlayer.playbackMode = Audio.PlaybackMode.Immediate;
      }

      if (!isNull(this.scanAnchor) && !isNull(this.resultPanel)) {
        this.resultPanel.setParent(this.scanAnchor);
      }

      this.pinchInteractor.onPinchStart.add(() => {
        void this.onPinchStart();
      });

      this.pinchInteractor.onFocusEnd.add(() => {
        this.onFocusLost();
      });

      /** Defer network so startup never blocks the first frame (reduces watchdog kills on device). */
      const boot = this.createEvent('DelayedCallbackEvent');
      boot.bind(() => {
        void this.bootstrapProfile();
      });
      boot.reset(0.05);
    } catch (e) {
      shelfSenseLog('init', `onAwake failed: ${e}`);
    }
  }

  /**
   * Every referenced @input must exist before touching native APIs (Spectacles will hard-close on null deref).
   */
  private ensureRequiredInputs(): boolean {
    if (isNull(this.cameraModule)) {
      shelfSenseLog('init', 'Assign cameraModule (CameraModule asset) on ShelfSenseAgent.');
      return false;
    }
    if (isNull(this.remoteService)) {
      shelfSenseLog('init', 'Assign remoteService (InternetModule) on ShelfSenseAgent.');
      return false;
    }
    if (isNull(this.remoteMedia)) {
      shelfSenseLog('init', 'Assign remoteMedia (RemoteMediaModule) on ShelfSenseAgent.');
      return false;
    }
    if (isNull(this.audioPlayer)) {
      shelfSenseLog('init', 'Assign audioPlayer (AudioComponent) on ShelfSenseAgent.');
      return false;
    }
    if (isNull(this.pinchInteractor)) {
      shelfSenseLog('init', 'Assign pinchInteractor (SIK InteractionComponent) on ShelfSenseAgent.');
      return false;
    }
    if (!this.apiBaseUrl || this.apiBaseUrl.length < 12) {
      shelfSenseLog('init', 'Set apiBaseUrl to your HTTPS gateway + /api (e.g. https://abc.ngrok.app/api).');
      return false;
    }
    return true;
  }

  private onFocusLost(): void {
    if (!this.inputsReady) {
      return;
    }
    this.store.setState('IDLE');
    this.store.resetResult();
    this.store.lastImageFingerprint = null;
    clearTexts(this.headlineText, this.detailsText, this.alternativesText, this.cartSummaryText);
    if (!isNull(this.resultPanel)) {
      this.resultPanel.enabled = false;
    }
    applyLoadingIndicator(this.loadingIndicator, 'IDLE');
    applyStatusRing(this.statusRing, 'IDLE');
  }

  private async bootstrapProfile(): Promise<void> {
    if (!this.inputsReady || isNull(this.remoteService)) {
      return;
    }
    try {
      const { json, sessionHeader } = await fetchJson<{ profile: HealthProfile | null }>(
        this.remoteService,
        this.apiBaseUrl,
        { method: 'GET', path: '/profile', sessionId: this.store.sessionId },
        this.delayer,
      );
      this.store.applySessionHeader(sessionHeader);
      this.store.profile = json.profile ?? MOCK_PROFILE;
      shelfSenseLog('profile', json.profile ? 'loaded server profile' : 'using demo profile');
      renderCartPanel(this.store.cart, this.cartSummaryText);
    } catch (_e) {
      this.store.profile = MOCK_PROFILE;
      shelfSenseLog('profile', 'profile fetch failed — demo profile');
    }
  }

  private async onPinchStart(): Promise<void> {
    if (!this.inputsReady) {
      return;
    }
    if (this.isScanning) {
      return;
    }
    if (!this.cooldown.tryEnter(getTime() * 1000)) {
      shelfSenseLog('scan', 'cooldown active');
      return;
    }

    this.isScanning = true;
    this.store.setState('SCANNING');
    this.store.lastError = null;
    applyLoadingIndicator(this.loadingIndicator, 'SCANNING');
    applyStatusRing(this.statusRing, 'SCANNING');
    if (!isNull(this.resultPanel)) {
      this.resultPanel.enabled = true;
    }

    try {
      const imageRequest = createStillImageRequest(this.cameraModule);
      const frame = await this.cameraModule.requestImage(imageRequest);
      const b64 = await this.encodeTextureJpeg(frame.texture);
      const fingerprint = `${b64.length}:${b64.substring(0, 96)}`;
      if (this.store.lastImageFingerprint === fingerprint && this.store.lastAnalysis) {
        shelfSenseLog('scan', 'duplicate frame — keeping last verdict');
        renderVerdictTexts(
          this.store.lastAnalysis,
          this.headlineText,
          this.detailsText,
          this.alternativesText,
          this.cartSummaryText,
        );
        renderCartPanel(this.store.cart, this.cartSummaryText);
        this.store.setState('DISPLAYING');
        return;
      }
      this.store.lastImageFingerprint = fingerprint;

      this.store.setState('ANALYZING');
      applyLoadingIndicator(this.loadingIndicator, 'ANALYZING');
      applyStatusRing(this.statusRing, 'ANALYZING');

      const profile = this.store.profile ?? MOCK_PROFILE;
      const cartContext =
        this.store.cart !== null
          ? { trendSummary: this.store.cart.trendSummary }
          : undefined;

      const analyzed = await fetchJson<LabelAnalysis>(
        this.remoteService,
        this.apiBaseUrl,
        {
          path: '/analyze-label',
          body: {
            imageBase64: b64,
            imageMimeType: 'image/jpeg',
            healthProfile: profile,
            cartContext,
          },
          sessionId: this.store.sessionId,
        },
        this.delayer,
      );
      this.store.applySessionHeader(analyzed.sessionHeader);
      const analysis = analyzed.json;
      this.store.lastAnalysis = analysis;

      const cartRes = await fetchJson<{
        cart: CartState;
        healthTrendSummary: string;
        riskAlerts: string[];
      }>(
        this.remoteService,
        this.apiBaseUrl,
        {
          path: '/cart/update',
          body: {
            latestItem: {
              verdict: analysis.verdict,
              productName: undefined,
              ingredients_flags: analysis.ingredients_flags,
              health_risks: analysis.health_risks,
            },
            cart: this.store.cart,
          },
          sessionId: this.store.sessionId,
        },
        this.delayer,
      );
      this.store.applySessionHeader(cartRes.sessionHeader);
      this.store.cart = cartRes.json.cart;

      const speechLine = `${analysis.verdict}. ${analysis.reason}`.slice(0, 220);
      const speech = await fetchJson<SpeechPayload>(
        this.remoteService,
        this.apiBaseUrl,
        {
          path: '/speech',
          body: { text: speechLine },
          sessionId: this.store.sessionId,
        },
        this.delayer,
      );
      this.store.applySessionHeader(speech.sessionHeader);

      renderVerdictTexts(
        analysis,
        this.headlineText,
        this.detailsText,
        this.alternativesText,
        this.cartSummaryText,
      );
      renderCartPanel(this.store.cart, this.cartSummaryText);
      void this.playInlineSpeech(speech.json);

      this.store.setState('DISPLAYING');
    } catch (e) {
      this.store.setState('ERROR');
      const msg =
        (e as Error).message?.includes('422') || (e as Error).message?.includes('UNREADABLE')
          ? 'Label unreadable — pinch to rescan closer.'
          : 'Network or server error — try again.';
      showError(this.detailsText, msg);
      shelfSenseLog('scan', 'error', `${e}`);
    } finally {
      this.isScanning = false;
      applyLoadingIndicator(this.loadingIndicator, this.store.uiState);
      applyStatusRing(this.statusRing, this.store.uiState);
    }
  }

  private encodeTextureJpeg(tex: Texture): Promise<string> {
    return new Promise((resolve, reject) => {
      Base64.encodeTextureAsync(
        tex,
        (encoded) => resolve(encoded),
        () => reject(new Error('encode failed')),
        CompressionQuality.IntermediateQuality,
        EncodingType.Jpg,
      );
    });
  }

  private playInlineSpeech(payload: SpeechPayload): void {
    try {
      if (isNull(this.remoteService) || isNull(this.remoteMedia) || isNull(this.audioPlayer)) {
        return;
      }
      if (!payload.audioBase64 || payload.audioBase64.length < 16) {
        shelfSenseLog(
          'tts',
          payload.fallback === 'browser_tts_hint' ? 'server TTS unavailable — show text only' : 'no audio bytes',
        );
        return;
      }
      const bytes = Base64.decode(payload.audioBase64);
      const blob = new Blob([bytes], { type: payload.mimeType });
      const resource = this.remoteService.makeResourceFromBlob(blob);
      this.remoteMedia.loadResourceAsAudioTrackAsset(
        resource,
        (track) => {
          this.audioPlayer.stop(true);
          this.audioPlayer.audioTrack = track;
          this.audioPlayer.play(1);
        },
        (err) => {
          shelfSenseLog('tts', `audio load failed: ${err}`);
        },
      );
    } catch (e) {
      shelfSenseLog('tts', `play failed: ${e}`);
    }
  }
}
