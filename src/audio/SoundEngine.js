/**
 * Procedural Web Audio API Synthesizer & Deterministic Audio Telemetry Engine (`F-AUDIO-01`)
 * Implements Iron Law 3 (Heavy Auditory Anchors):
 *  1. Mechanical Reel Stop Clack (playReelClack / playReelStop)
 *  2. Dual-Layer Organic Devour Crunch (playDevourCrunch)
 *  3. Ascending Pitch Combo Chime: f = 523.25 * 2^(min(step, 24)/12) Hz (playComboChime / playComboDing)
 *  4. Chain Explosion, Revolver Gunshot, 5s Berserk Laser Sweep, Demon Misfire Backfire
 *
 * Dual-environment safe: Synthesizes real Web Audio in Browser (`AudioContext`),
 * and always records structured telemetry to `this._log` and `window.__AUDIO_LOG__`
 * in both Browser and Headless Node (`node --test`).
 */

export const BASE_CHIME_FREQ_HZ = 523.25; // C5

/**
 * Computes the exact 12-TET ascending combo chime frequency in Hz:
 *   f = 523.25 * 2^(min(max(0, comboStep), 24) / 12)
 * @param {number} [comboStep=0]
 * @returns {number}
 */
export function computeComboFrequency(comboStep = 0) {
  const stepNum = Number.isFinite(Number(comboStep)) ? Number(comboStep) : 0;
  const clampedStep = Math.max(0, Math.min(Math.floor(stepNum), 24));
  const freq = BASE_CHIME_FREQ_HZ * Math.pow(2, clampedStep / 12);
  return Math.round(freq * 100) / 100;
}

export class SoundEngine {
  constructor(options = {}) {
    this.muted = Boolean(options.muted ?? false);
    this.masterVolume = Number.isFinite(options.volume)
      ? Math.max(0, Math.min(1, options.volume))
      : 0.35;
    this.maxLogSize = Math.max(20, Number(options.maxLogSize) || 500);
    this._log = [];
    this._ctx = null;
    this._demoChimeStep = 0;
    this._muteBtnEl = null;
    this._lastEventEl = null;

    if (typeof window !== 'undefined') {
      if (!Array.isArray(window.__AUDIO_LOG__)) {
        window.__AUDIO_LOG__ = [];
      }
    }
  }

  _recordEvent(entry) {
    const record = {
      timestamp: Date.now(),
      muted: this.muted,
      ...entry,
      pitchHz: entry.frequencyHz,
    };

    this._log.push(record);
    if (this._log.length > this.maxLogSize) {
      this._log.shift();
    }

    if (typeof window !== 'undefined') {
      if (!Array.isArray(window.__AUDIO_LOG__)) {
        window.__AUDIO_LOG__ = [];
      }
      window.__AUDIO_LOG__.push(record);
      if (window.__AUDIO_LOG__.length > this.maxLogSize) {
        window.__AUDIO_LOG__.shift();
      }
    }

    if (this._lastEventEl) {
      this._lastEventEl.textContent = `${record.type.toUpperCase()} @ ${record.frequencyHz}Hz`;
    }

    return record;
  }

  _ensureContext() {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      if (!this._ctx) {
        this._ctx = new AudioCtx();
      }
      if (this._ctx.state === 'suspended' && typeof this._ctx.resume === 'function') {
        this._ctx.resume().catch(() => {});
      }
      return this._ctx;
    } catch {
      return null;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this._muteBtnEl) {
      this._muteBtnEl.setAttribute('aria-pressed', String(this.muted));
      this._muteBtnEl.textContent = this.muted ? '🔇 已静音 (Muted)' : '🔊 音效开启 (Audio ON)';
    }
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  getAudioLog() {
    return [...this._log];
  }

  getRecentEvents(count = 20) {
    return this._log.slice(-Math.max(1, count));
  }

  clearAudioLog() {
    this._log.length = 0;
    if (typeof window !== 'undefined' && Array.isArray(window.__AUDIO_LOG__)) {
      window.__AUDIO_LOG__.length = 0;
    }
    if (this._lastEventEl) {
      this._lastEventEl.textContent = 'IDLE (0Hz)';
    }
  }

  /**
   * 1. Mechanical Reel Stop / Cylinder Ratchet Clack (`type: 'clack'`)
   * @param {number} [reelIndex=0]
   * @param {number} [totalReels=3]
   */
  playReelClack(reelIndex = 0, totalReels = 3) {
    const safeIdx = Number.isFinite(Number(reelIndex)) ? Math.max(0, Math.floor(Number(reelIndex))) : 0;
    const safeTotal = Number.isFinite(Number(totalReels)) ? Math.max(1, Math.floor(Number(totalReels))) : 3;
    const frequencyHz = Math.round((950 + safeIdx * 120) * 100) / 100;

    const ctx = this._ensureContext();
    if (ctx) {
      try {
        const now = ctx.currentTime;
        // Sub-thud triangle oscillator (140Hz -> 45Hz in 35ms)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140 + safeIdx * 15, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.035);
        gain.gain.setValueAtTime(this.masterVolume * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.045);

        // Bandpass click impulse
        const clickOsc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const clickGain = ctx.createGain();
        clickOsc.type = 'square';
        clickOsc.frequency.setValueAtTime(frequencyHz, now);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(frequencyHz, now);
        filter.Q.setValueAtTime(6.0, now);
        clickGain.gain.setValueAtTime(this.masterVolume * 0.45, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
        clickOsc.connect(filter);
        filter.connect(clickGain);
        clickGain.connect(ctx.destination);
        clickOsc.start(now);
        clickOsc.stop(now + 0.03);
      } catch {}
    }

    return this._recordEvent({
      type: 'clack',
      reelIndex: safeIdx,
      totalReels: safeTotal,
      frequencyHz,
    });
  }

  playReelStop(reelIndex = 0, totalReels = 3) {
    return this.playReelClack(reelIndex, totalReels);
  }

  playCylinderSpin() {
    return this.playReelClack(0, 6);
  }

  /**
   * 2. Dual-Layer Organic Devour Crunch (`type: 'crunch'`)
   * @param {number} [devourStep=1]
   * @param {number} [tier=2]
   */
  playDevourCrunch(devourStep = 1, tier = 2) {
    const safeStep = Number.isFinite(Number(devourStep)) ? Math.max(1, Math.floor(Number(devourStep))) : 1;
    const safeTier = Number.isFinite(Number(tier)) ? Math.max(1, Math.min(4, Math.floor(Number(tier)))) : 2;
    const frequencyHz = Math.round((320 + safeStep * 45 + safeTier * 30) * 100) / 100;

    const ctx = this._ensureContext();
    if (ctx) {
      try {
        const now = ctx.currentTime;
        // Layer A: Chitin/Bone snap sawtooth sweep (2400Hz -> 420Hz)
        const oscA = ctx.createOscillator();
        const filterA = ctx.createBiquadFilter();
        const gainA = ctx.createGain();
        oscA.type = 'sawtooth';
        oscA.frequency.setValueAtTime(frequencyHz, now);
        oscA.frequency.exponentialRampToValueAtTime(110, now + 0.065);
        filterA.type = 'lowpass';
        filterA.frequency.setValueAtTime(2400, now);
        filterA.frequency.exponentialRampToValueAtTime(420, now + 0.065);
        filterA.Q.setValueAtTime(5.0, now);
        gainA.gain.setValueAtTime(this.masterVolume * 0.75, now);
        gainA.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        oscA.connect(filterA);
        filterA.connect(gainA);
        gainA.connect(ctx.destination);
        oscA.start(now);
        oscA.stop(now + 0.075);

        // Layer B: Gulp sub-drop (180Hz -> 55Hz over 90ms)
        const oscB = ctx.createOscillator();
        const gainB = ctx.createGain();
        oscB.type = 'sine';
        oscB.frequency.setValueAtTime(180 + safeTier * 20, now + 0.015);
        oscB.frequency.exponentialRampToValueAtTime(55, now + 0.105);
        gainB.gain.setValueAtTime(this.masterVolume * 0.85, now + 0.015);
        gainB.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
        oscB.connect(gainB);
        gainB.connect(ctx.destination);
        oscB.start(now + 0.015);
        oscB.stop(now + 0.115);
      } catch {}
    }

    return this._recordEvent({
      type: 'crunch',
      devourStep: safeStep,
      tier: safeTier,
      frequencyHz,
    });
  }

  /**
   * 3. Ascending Pitch Combo Chime: f = 523.25 * 2^(min(comboStep, 24) / 12) (`type: 'chime'`)
   * @param {number} [comboStep=0]
   */
  playComboChime(comboStep = 0) {
    const stepNum = Number.isFinite(Number(comboStep)) ? Number(comboStep) : 0;
    const clampedStep = Math.max(0, Math.min(Math.floor(stepNum), 24));
    const frequencyHz = computeComboFrequency(clampedStep);

    const ctx = this._ensureContext();
    if (ctx) {
      try {
        const now = ctx.currentTime;
        const carrier = ctx.createOscillator();
        const harmonic = ctx.createOscillator();
        const gain = ctx.createGain();

        carrier.type = 'triangle';
        carrier.frequency.setValueAtTime(frequencyHz, now);

        harmonic.type = 'sine';
        harmonic.frequency.setValueAtTime(frequencyHz * 2, now);

        gain.gain.setValueAtTime(this.masterVolume * 0.65, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

        carrier.connect(gain);
        harmonic.connect(gain);
        gain.connect(ctx.destination);

        carrier.start(now);
        harmonic.start(now);
        carrier.stop(now + 0.19);
        harmonic.stop(now + 0.19);
      } catch {}
    }

    return this._recordEvent({
      type: 'chime',
      comboStep: clampedStep,
      comboIndex: clampedStep,
      pitchSemitones: clampedStep,
      frequencyHz,
    });
  }

  playComboDing(comboStep = 0) {
    return this.playComboChime(comboStep);
  }

  /**
   * 4. Chain Explosion & Jackpot Blast (`type: 'explosion'`)
   * @param {number} [intensity=1]
   */
  playChainExplosion(intensity = 1) {
    const safeIntensity = Number.isFinite(Number(intensity))
      ? Math.max(0.5, Math.min(10, Number(intensity)))
      : 1;
    const frequencyHz = Math.round((90 / Math.sqrt(safeIntensity)) * 100) / 100;

    const ctx = this._ensureContext();
    if (ctx) {
      try {
        const now = ctx.currentTime;
        const sub = ctx.createOscillator();
        const gain = ctx.createGain();
        sub.type = 'sawtooth';
        sub.frequency.setValueAtTime(90, now);
        sub.frequency.exponentialRampToValueAtTime(22, now + 0.35);
        gain.gain.setValueAtTime(Math.min(1, this.masterVolume * 0.95), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
        sub.connect(gain);
        gain.connect(ctx.destination);
        sub.start(now);
        sub.stop(now + 0.37);
      } catch {}
    }

    return this._recordEvent({
      type: 'explosion',
      intensity: safeIntensity,
      frequencyHz,
    });
  }

  playExplosion(intensity = 1) {
    return this.playChainExplosion(intensity);
  }

  playJackpotFanfare() {
    this.playComboChime(12);
    return this.playChainExplosion(3);
  }

  /**
   * 5. Revolver Gunshot (`type: 'gunshot'`)
   * @param {boolean} [isHeavy=false]
   */
  playGunshot(isHeavy = false) {
    const heavy = Boolean(isHeavy);
    const frequencyHz = heavy ? 160 : 280;

    const ctx = this._ensureContext();
    if (ctx) {
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(frequencyHz, now);
        osc.frequency.exponentialRampToValueAtTime(38, now + (heavy ? 0.16 : 0.09));
        gain.gain.setValueAtTime(this.masterVolume * (heavy ? 0.9 : 0.7), now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.17 : 0.1));
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + (heavy ? 0.18 : 0.11));
      } catch {}
    }

    return this._recordEvent({
      type: 'gunshot',
      isHeavy: heavy,
      frequencyHz,
    });
  }

  /**
   * 6. 5-Second Berserk Hyper Laser Sweep (`type: 'laser'`)
   * @param {number} [durationMs=5000]
   */
  playLaserSweep(durationMs = 5000) {
    const safeDuration = Number.isFinite(Number(durationMs))
      ? Math.max(100, Math.min(15000, Number(durationMs)))
      : 5000;
    const frequencyHz = 880;

    const ctx = this._ensureContext();
    if (ctx) {
      try {
        const now = ctx.currentTime;
        const durSec = Math.min(safeDuration / 1000, 1.2);
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(frequencyHz, now + durSec * 0.5);
        osc.frequency.linearRampToValueAtTime(660, now + durSec);
        gain.gain.setValueAtTime(this.masterVolume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + durSec);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + durSec + 0.02);
      } catch {}
    }

    return this._recordEvent({
      type: 'laser',
      durationMs: safeDuration,
      frequencyHz,
    });
  }

  playLaserBeam(durationMs = 5000) {
    return this.playLaserSweep(durationMs);
  }

  playLaserHum(durationMs = 5000) {
    return this.playLaserSweep(durationMs);
  }

  /**
   * 7. Demon Bullet Chamber Backfire / Misfire (`type: 'backfire'`)
   */
  playMisfireBackfire() {
    const frequencyHz = 110;

    const ctx = this._ensureContext();
    if (ctx) {
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(195, now);
        osc.frequency.setValueAtTime(frequencyHz, now + 0.08);
        gain.gain.setValueAtTime(this.masterVolume * 0.8, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.23);
      } catch {}
    }

    return this._recordEvent({
      type: 'backfire',
      frequencyHz,
    });
  }

  playMisfireAlarm() {
    return this.playMisfireBackfire();
  }

  /**
   * Renders the interactive Audio & Math Lab soundboard inside `containerEl`
   * with all required `data-testid` attributes (`PROJECT.md:279`).
   * @param {HTMLElement} containerEl
   */
  renderSoundboard(containerEl) {
    if (!containerEl || typeof containerEl.innerHTML === 'undefined') {
      return null;
    }

    const lastEvt = this._log[this._log.length - 1];
    const lastText = lastEvt
      ? `${lastEvt.type.toUpperCase()} @ ${lastEvt.frequencyHz}Hz`
      : 'READY (523.25Hz C5)';

    containerEl.innerHTML = `
      <div class="audio-lab-panel" data-testid="audio-lab-panel">
        <div class="audio-lab-header">
          <h3>🎧 重度听觉锚点合成台 (Procedural Web Audio Synthesizer)</h3>
          <button
            type="button"
            class="btn-arcade btn-audio-mute"
            data-testid="audio-mute-toggle"
            aria-pressed="${String(this.muted)}"
          >
            ${this.muted ? '🔇 已静音 (Muted)' : '🔊 音效开启 (Audio ON)'}
          </button>
        </div>
        <div class="audio-lab-buttons">
          <button type="button" class="btn-arcade" data-testid="audio-test-clunk">
            🎰 停轮机械卡顿 (Reel Clack)
          </button>
          <button type="button" class="btn-arcade" data-testid="audio-test-devour">
            🦖 吞噬清脆咀嚼 (Devour Crunch)
          </button>
          <button type="button" class="btn-arcade" data-testid="audio-test-chime">
            🔔 连线半音升调 (Combo Chime 叮—)
          </button>
        </div>
        <div class="audio-lab-telemetry">
          <span>最新声学遥测 (Last Audio Event): </span>
          <strong data-testid="audio-last-event">${lastText}</strong>
        </div>
      </div>
    `;

    if (typeof containerEl.querySelector === 'function') {
      this._muteBtnEl = containerEl.querySelector('[data-testid="audio-mute-toggle"]');
      this._lastEventEl = containerEl.querySelector('[data-testid="audio-last-event"]');
      const clunkBtn = containerEl.querySelector('[data-testid="audio-test-clunk"]');
      const devourBtn = containerEl.querySelector('[data-testid="audio-test-devour"]');
      const chimeBtn = containerEl.querySelector('[data-testid="audio-test-chime"]');

      if (this._muteBtnEl && typeof this._muteBtnEl.addEventListener === 'function') {
        this._muteBtnEl.addEventListener('click', () => this.toggleMute());
      }
      if (clunkBtn && typeof clunkBtn.addEventListener === 'function') {
        clunkBtn.addEventListener('click', () => this.playReelClack(0, 3));
      }
      if (devourBtn && typeof devourBtn.addEventListener === 'function') {
        devourBtn.addEventListener('click', () => this.playDevourCrunch(1, 2));
      }
      if (chimeBtn && typeof chimeBtn.addEventListener === 'function') {
        chimeBtn.addEventListener('click', () => {
          this.playComboChime(this._demoChimeStep);
          this._demoChimeStep = (this._demoChimeStep + 1) % 25;
        });
      }
    }

    return containerEl;
  }
}

export function createSoundEngine(options = {}) {
  return new SoundEngine(options);
}

export const soundEngine = new SoundEngine();

export default SoundEngine;
