/**
 * Procedural Web Audio API Synthesizer & Deterministic Audio Telemetry Engine (`F-AUDIO-01` & `F-R2-02`)
 * Implements Iron Law 3 (Heavy Auditory Anchors) with Master Dynamics Bus & Anti-Clipping Scheduling:
 *  1. Mechanical Reel Stop Clack (`playReelClack` / `playReelStop` — brass latch thud + ratchet + noise transient)
 *  2. Dual-Layer Organic Devour Crunch (`playDevourCrunch` — crispy teeth-snap noise + chitin sweep + gulp sub)
 *  3. Ascending Pitch Combo Chime: f = 523.25 * 2^(min(step, 24)/12) Hz (`playComboChime` — 3-harmonic celesta + `55ms` micro-arpeggiator)
 *  4. Chain Explosion, Revolver Gunshot, full 5.0s Unison Plasma Laser Sweep, Demon Backfire, plus Relic/Victory/Defeat stingers.
 *
 * Dual-environment & `T5-05` `SpyAudioContext`-safe:
 *  - Routes voices through `GainNode -> [WaveShaperNode] -> [DynamicsCompressorNode] -> destination` (each feature-detected).
 *  - Caches procedural white & pink noise `AudioBuffer`s per `AudioContext` instance.
 *  - Records 100% synchronous telemetry to `this._log` and `window.__AUDIO_LOG__` with unchanged `frequencyHz` formulas.
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

const SPEAKER_ICON_SVG =
  '<svg class="audio-btn-svg" viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><polygon points="3,7.5 7,7.5 12,3.5 12,16.5 7,12.5 3,12.5" fill="#f3cf7a" /><path d="M14.5,6 C16.8,8.2 16.8,11.8 14.5,14" fill="none" stroke="#06d6a0" stroke-width="1.8" /></svg>';

const CLACK_ICON_SVG =
  '<svg class="audio-btn-svg" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx="2" fill="#241c15" stroke="#c89b3c" stroke-width="1.6" /><line x1="7.5" y1="4" x2="7.5" y2="16" stroke="#f3cf7a" stroke-width="1.4" /><line x1="12.5" y1="4" x2="12.5" y2="16" stroke="#f3cf7a" stroke-width="1.4" /></svg>';

const CRUNCH_ICON_SVG =
  '<svg class="audio-btn-svg" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="#321117" stroke="#f77f00" stroke-width="1.6" /><polygon points="6,7 8.5,10.5 10,7 11.5,10.5 14,7 13,13.5 7,13.5" fill="#fff3d6" /></svg>';

const CHIME_ICON_SVG =
  '<svg class="audio-btn-svg" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><polygon points="10,2.5 12.4,7.6 18,8.3 13.8,12.1 14.9,17.5 10,14.8 5.1,17.5 6.2,12.1 2,8.3 7.6,7.6" fill="#ffd166" /></svg>';

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

    this._masterBus = null;
    this._masterGain = null;
    this._busCtx = null;
    this._whiteNoiseBuffer = null;
    this._pinkNoiseBuffer = null;
    this._noiseCtx = null;
    this._nextChimeSlotTime = 0;
    this._nextCrunchSlotTime = 0;
    this._lastScheduledChimeTime = 0;
    this._activeLaserNodes = [];
    this._unlockBound = null;

    if (typeof window !== 'undefined') {
      if (!Array.isArray(window.__AUDIO_LOG__)) {
        window.__AUDIO_LOG__ = [];
      }
    }

    this._installAutoplayUnlock();
  }

  _installAutoplayUnlock() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    if (this._unlockBound) return;
    const unlock = () => {
      if (this.muted) return;
      const ctx = this._ensureContext();
      if (ctx && ctx.state === 'running') {
        this._removeAutoplayUnlock();
      }
    };
    this._unlockBound = unlock;
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  _removeAutoplayUnlock() {
    if (!this._unlockBound || typeof window === 'undefined' || typeof window.removeEventListener !== 'function') {
      return;
    }
    window.removeEventListener('pointerdown', this._unlockBound);
    window.removeEventListener('keydown', this._unlockBound);
    this._unlockBound = null;
  }

  dispose() {
    this._stopActiveLaser();
    this._removeAutoplayUnlock();
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

  _ensureMasterBus(ctx) {
    if (!ctx) return null;
    if (this._busCtx === ctx && this._masterBus) return this._masterBus;
    this._busCtx = ctx;
    this._nextChimeSlotTime = 0;
    this._nextCrunchSlotTime = 0;
    try {
      const now = Number(ctx.currentTime) || 0;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(this.muted ? 0.0001 : this.masterVolume, now);
      let tail = masterGain;

      if (typeof ctx.createWaveShaper === 'function') {
        const shaper = ctx.createWaveShaper();
        const samples = 256;
        const curve = new Float32Array(samples);
        const drive = 1.55;
        const norm = Math.tanh(drive);
        for (let i = 0; i < samples; i++) {
          const x = (i * 2) / (samples - 1) - 1;
          curve[i] = Math.tanh(x * drive) / norm;
        }
        shaper.curve = curve;
        shaper.oversample = '2x';
        tail.connect(shaper);
        tail = shaper;
      }

      if (typeof ctx.createDynamicsCompressor === 'function') {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold?.setValueAtTime?.(-10, now);
        comp.knee?.setValueAtTime?.(12, now);
        comp.ratio?.setValueAtTime?.(6, now);
        comp.attack?.setValueAtTime?.(0.003, now);
        comp.release?.setValueAtTime?.(0.14, now);
        tail.connect(comp);
        tail = comp;
      }

      tail.connect(ctx.destination);
      this._masterGain = masterGain;
      this._masterBus = masterGain;
      return this._masterBus;
    } catch {
      this._masterGain = null;
      this._masterBus = ctx.destination;
      return ctx.destination;
    }
  }

  _getOutputNode(ctx) {
    return this._ensureMasterBus(ctx) || ctx.destination;
  }

  _ensureNoiseBuffers(ctx) {
    if (!ctx || typeof ctx.createBuffer !== 'function') return false;
    if (this._noiseCtx === ctx && this._whiteNoiseBuffer && this._pinkNoiseBuffer) {
      return true;
    }
    try {
      const sampleRate = Math.max(8000, Number(ctx.sampleRate) || 44100);
      const length = Math.floor(sampleRate * 0.5);
      const whiteBuf = ctx.createBuffer(1, length, sampleRate);
      const pinkBuf = ctx.createBuffer(1, length, sampleRate);
      const whiteData = whiteBuf.getChannelData(0);
      const pinkData = pinkBuf.getChannelData(0);

      let seed = 0x5107b00d;
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        const w = ((seed >>> 0) / 0xffffffff) * 2 - 1;
        whiteData[i] = w;

        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        const p = (b0 + b1 + b2 + w * 0.1848) * 0.22;
        pinkData[i] = Math.max(-0.95, Math.min(0.95, p));
      }

      this._noiseCtx = ctx;
      this._whiteNoiseBuffer = whiteBuf;
      this._pinkNoiseBuffer = pinkBuf;
      return true;
    } catch {
      return false;
    }
  }

  _spawnNoiseBurst(
    ctx,
    {
      pink = false,
      startTime = 0,
      durationSec = 0.03,
      filterType = 'bandpass',
      freqStart = 1400,
      freqEnd = null,
      Q = 2.5,
      gainPeak = 0.4,
      loop = false,
    } = {}
  ) {
    if (!ctx || typeof ctx.createBufferSource !== 'function' || !this._ensureNoiseBuffers(ctx)) {
      return null;
    }
    try {
      const src = ctx.createBufferSource();
      src.buffer = pink ? this._pinkNoiseBuffer : this._whiteNoiseBuffer;
      if (loop) src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(Math.max(20, freqStart), startTime);
      if (freqEnd !== null && freqEnd !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + durationSec);
      }
      filter.Q.setValueAtTime(Q, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.002, gainPeak), startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this._getOutputNode(ctx));

      src.start(startTime);
      src.stop(startTime + durationSec + 0.005);
      return src;
    } catch {
      return null;
    }
  }

  _stopActiveLaser() {
    while (this._activeLaserNodes.length > 0) {
      const handle = this._activeLaserNodes.pop();
      try {
        handle?.stop?.();
      } catch {}
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.muted) {
      this._stopActiveLaser();
    }
    if (this._masterGain && this._ctx) {
      try {
        const now = Number(this._ctx.currentTime) || 0;
        this._masterGain.gain.setValueAtTime(this.muted ? 0.0001 : this.masterVolume, now);
      } catch {}
    }
    if (this._muteBtnEl) {
      this._muteBtnEl.setAttribute('aria-pressed', String(this.muted));
      this._muteBtnEl.textContent = this.muted ? '已静音 (Muted)' : '音效开启 (Audio ON)';
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
        const out = this._getOutputNode(ctx);
        const startTime = (Number(ctx.currentTime) || 0) + Math.min(safeIdx, 5) * 0.055;

        // Layer 1: Heavy brass latch sub-thud
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(165 + safeIdx * 15, startTime);
        osc.frequency.exponentialRampToValueAtTime(48, startTime + 0.04);
        gain.gain.setValueAtTime(0.82, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.044);
        osc.connect(gain);
        gain.connect(out);
        osc.start(startTime);
        osc.stop(startTime + 0.048);

        // Layer 2: Crisp mechanical ratchet ping
        const clickOsc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const clickGain = ctx.createGain();
        clickOsc.type = 'square';
        clickOsc.frequency.setValueAtTime(frequencyHz, startTime);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(frequencyHz, startTime);
        filter.Q.setValueAtTime(6.5, startTime);
        clickGain.gain.setValueAtTime(0.42, startTime);
        clickGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.025);
        clickOsc.connect(filter);
        filter.connect(clickGain);
        clickGain.connect(out);
        clickOsc.start(startTime);
        clickOsc.stop(startTime + 0.03);

        // Layer 3: Physical click noise transient
        this._spawnNoiseBurst(ctx, {
          pink: false,
          startTime,
          durationSec: 0.018,
          filterType: 'bandpass',
          freqStart: 2200 + safeIdx * 180,
          Q: 4.0,
          gainPeak: 0.48,
        });
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
        const out = this._getOutputNode(ctx);
        const now = Number(ctx.currentTime) || 0;
        const startTime = Math.min(now + 0.88, Math.max(now, this._nextCrunchSlotTime));
        this._nextCrunchSlotTime = startTime + 0.055;

        // Dual crispy teeth-snap noise bursts
        this._spawnNoiseBurst(ctx, {
          pink: true,
          startTime,
          durationSec: 0.024,
          filterType: 'bandpass',
          freqStart: 1650,
          freqEnd: 520,
          Q: 3.2,
          gainPeak: 0.62,
        });
        this._spawnNoiseBurst(ctx, {
          pink: false,
          startTime: startTime + 0.026,
          durationSec: 0.028,
          filterType: 'bandpass',
          freqStart: 2450,
          freqEnd: 680,
          Q: 3.8,
          gainPeak: 0.52,
        });

        // Layer A: Chitin/Bone snap sawtooth sweep
        const oscA = ctx.createOscillator();
        const filterA = ctx.createBiquadFilter();
        const gainA = ctx.createGain();
        oscA.type = 'sawtooth';
        oscA.frequency.setValueAtTime(frequencyHz, startTime);
        oscA.frequency.exponentialRampToValueAtTime(105, startTime + 0.068);
        filterA.type = 'lowpass';
        filterA.frequency.setValueAtTime(2600, startTime);
        filterA.frequency.exponentialRampToValueAtTime(380, startTime + 0.068);
        filterA.Q.setValueAtTime(5.2, startTime);
        gainA.gain.setValueAtTime(0.68, startTime);
        gainA.gain.exponentialRampToValueAtTime(0.001, startTime + 0.072);
        oscA.connect(filterA);
        filterA.connect(gainA);
        gainA.connect(out);
        oscA.start(startTime);
        oscA.stop(startTime + 0.076);

        // Layer B: Abyssal swallow sub-drop
        const oscB = ctx.createOscillator();
        const gainB = ctx.createGain();
        oscB.type = 'sine';
        oscB.frequency.setValueAtTime(195 + safeTier * 22, startTime + 0.018);
        oscB.frequency.exponentialRampToValueAtTime(50, startTime + 0.112);
        gainB.gain.setValueAtTime(0.84, startTime + 0.018);
        gainB.gain.exponentialRampToValueAtTime(0.001, startTime + 0.116);
        oscB.connect(gainB);
        gainB.connect(out);
        oscB.start(startTime + 0.018);
        oscB.stop(startTime + 0.122);
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
   * Schedules rapid synchronous loop calls across a `55ms` micro-arpeggiator so multi-hit chains
   * bloom into a crystalline ascending run rather than clipping at `t = 0`.
   * @param {number} [comboStep=0]
   */
  playComboChime(comboStep = 0) {
    const stepNum = Number.isFinite(Number(comboStep)) ? Number(comboStep) : 0;
    const clampedStep = Math.max(0, Math.min(Math.floor(stepNum), 24));
    const frequencyHz = computeComboFrequency(clampedStep);

    const ctx = this._ensureContext();
    if (ctx) {
      try {
        const out = this._getOutputNode(ctx);
        const now = Number(ctx.currentTime) || 0;
        const startTime = Math.min(now + 0.88, Math.max(now, this._nextChimeSlotTime));
        this._nextChimeSlotTime = startTime + 0.055;
        this._lastScheduledChimeTime = startTime;

        // 1. Fundamental triangle bell
        const carrier = ctx.createOscillator();
        const carrierGain = ctx.createGain();
        carrier.type = 'triangle';
        carrier.frequency.setValueAtTime(frequencyHz, startTime);
        carrierGain.gain.setValueAtTime(0.002, startTime);
        carrierGain.gain.linearRampToValueAtTime(0.62, startTime + 0.004);
        carrierGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);
        carrier.connect(carrierGain);
        carrierGain.connect(out);

        // 2. Octave shimmer
        const harmonic = ctx.createOscillator();
        const harmGain = ctx.createGain();
        harmonic.type = 'sine';
        harmonic.frequency.setValueAtTime(Math.min(16000, frequencyHz * 2), startTime);
        harmGain.gain.setValueAtTime(0.28, startTime);
        harmGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.19);
        harmonic.connect(harmGain);
        harmGain.connect(out);

        // 3. Bell twelfth harmonic tine
        const tine = ctx.createOscillator();
        const tineGain = ctx.createGain();
        tine.type = 'sine';
        tine.frequency.setValueAtTime(Math.min(16000, frequencyHz * 2.9966), startTime);
        tineGain.gain.setValueAtTime(0.13, startTime);
        tineGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.11);
        tine.connect(tineGain);
        tineGain.connect(out);

        carrier.start(startTime);
        harmonic.start(startTime);
        tine.start(startTime);
        carrier.stop(startTime + 0.26);
        harmonic.stop(startTime + 0.2);
        tine.stop(startTime + 0.12);
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
        const out = this._getOutputNode(ctx);
        const now = Number(ctx.currentTime) || 0;

        // Sub-bass cannon shockwave
        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(115, now);
        sub.frequency.exponentialRampToValueAtTime(24, now + 0.44);
        subGain.gain.setValueAtTime(0.92, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        sub.connect(subGain);
        subGain.connect(out);
        sub.start(now);
        sub.stop(now + 0.46);

        // Mid-punch distortion body
        const body = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const bodyGain = ctx.createGain();
        body.type = 'sawtooth';
        body.frequency.setValueAtTime(92, now);
        body.frequency.exponentialRampToValueAtTime(28, now + 0.34);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(640, now);
        filter.frequency.exponentialRampToValueAtTime(95, now + 0.34);
        filter.Q.setValueAtTime(3.0, now);
        bodyGain.gain.setValueAtTime(0.62, now);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        body.connect(filter);
        filter.connect(bodyGain);
        bodyGain.connect(out);
        body.start(now);
        body.stop(now + 0.36);

        // Pink-noise roaring blast wave
        this._spawnNoiseBurst(ctx, {
          pink: true,
          startTime: now,
          durationSec: 0.42,
          filterType: 'lowpass',
          freqStart: 2800,
          freqEnd: 130,
          Q: 1.8,
          gainPeak: Math.min(0.95, 0.54 + safeIntensity * 0.08),
        });
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
        const out = this._getOutputNode(ctx);
        const now = Number(ctx.currentTime) || 0;

        // Supersonic powder crack noise
        this._spawnNoiseBurst(ctx, {
          pink: false,
          startTime: now,
          durationSec: heavy ? 0.055 : 0.032,
          filterType: 'bandpass',
          freqStart: heavy ? 1900 : 2800,
          freqEnd: 450,
          Q: 1.6,
          gainPeak: heavy ? 0.88 : 0.7,
        });

        // Chest-thump barrel punch
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(frequencyHz, now);
        osc.frequency.exponentialRampToValueAtTime(36, now + (heavy ? 0.18 : 0.1));
        gain.gain.setValueAtTime(heavy ? 0.86 : 0.68, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.19 : 0.11));
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + (heavy ? 0.2 : 0.12));

        // Brushed-brass cylinder ring
        const ring = ctx.createOscillator();
        const ringGain = ctx.createGain();
        ring.type = 'sine';
        ring.frequency.setValueAtTime(heavy ? 2150 : 2680, now);
        ringGain.gain.setValueAtTime(0.15, now);
        ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        ring.connect(ringGain);
        ringGain.connect(out);
        ring.start(now);
        ring.stop(now + 0.095);
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
   * Sustains unison plasma oscillators across the full `durationMs` (up to `5.0s`).
   * @param {number} [durationMs=5000]
   */
  playLaserSweep(durationMs = 5000) {
    const safeDuration = Number.isFinite(Number(durationMs))
      ? Math.max(100, Math.min(15000, Number(durationMs)))
      : 5000;
    const frequencyHz = 880;

    this._stopActiveLaser();
    const ctx = this._ensureContext();
    if (ctx) {
      try {
        const out = this._getOutputNode(ctx);
        const now = Number(ctx.currentTime) || 0;
        const durSec = Math.min(safeDuration / 1000, 5.0);

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(440, now);
        osc1.frequency.linearRampToValueAtTime(frequencyHz, now + durSec * 0.35);
        osc1.frequency.linearRampToValueAtTime(660, now + durSec * 0.7);
        osc1.frequency.linearRampToValueAtTime(920, now + durSec);

        // Detune via direct frequency ratio (* 1.0058 = +10 cents) — zero osc.detune dependency!
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(440 * 1.0058, now);
        osc2.frequency.linearRampToValueAtTime(frequencyHz * 1.0058, now + durSec * 0.35);
        osc2.frequency.linearRampToValueAtTime(660 * 1.0058, now + durSec * 0.7);
        osc2.frequency.linearRampToValueAtTime(920 * 1.0058, now + durSec);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(750, now);
        filter.frequency.linearRampToValueAtTime(2400, now + durSec * 0.45);
        filter.frequency.linearRampToValueAtTime(1250, now + durSec);
        filter.Q.setValueAtTime(3.8, now);

        const fadeStart = Math.max(now + 0.02, now + durSec - 0.08);
        gain.gain.setValueAtTime(0.46, now);
        gain.gain.setValueAtTime(0.42, fadeStart);
        gain.gain.exponentialRampToValueAtTime(0.001, now + durSec);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(out);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + durSec + 0.02);
        osc2.stop(now + durSec + 0.02);

        const sizzleSrc = this._spawnNoiseBurst(ctx, {
          pink: false,
          startTime: now,
          durationSec: durSec,
          filterType: 'bandpass',
          freqStart: 3400,
          Q: 3.5,
          gainPeak: 0.14,
          loop: true,
        });

        this._activeLaserNodes.push({
          stop: () => {
            try { osc1.stop(); } catch {}
            try { osc2.stop(); } catch {}
            try { sizzleSrc?.stop?.(); } catch {}
          },
        });
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
        const out = this._getOutputNode(ctx);
        const now = Number(ctx.currentTime) || 0;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'square';
        osc1.frequency.setValueAtTime(195, now);
        osc1.frequency.setValueAtTime(frequencyHz, now + 0.08);

        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(277, now);
        osc2.frequency.setValueAtTime(155, now + 0.08);

        gain.gain.setValueAtTime(0.72, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(out);
        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.25);
        osc2.stop(now + 0.25);

        this._spawnNoiseBurst(ctx, {
          pink: false,
          startTime: now,
          durationSec: 0.08,
          filterType: 'bandpass',
          freqStart: 950,
          Q: 2.8,
          gainPeak: 0.45,
        });
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
   * 8. Relic Draft Pick Celestial Brass Arpeggio (`type: 'relic'`)
   */
  playRelicPick() {
    const frequencyHz = 1046.5; // C6
    const ctx = this._ensureContext();
    if (ctx) {
      try {
        const out = this._getOutputNode(ctx);
        const now = Number(ctx.currentTime) || 0;
        const notes = [1046.5, 1318.51, 1567.98, 2093.0];
        for (let i = 0; i < notes.length; i++) {
          const t = now + i * 0.05;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = i === 3 ? 'sine' : 'triangle';
          osc.frequency.setValueAtTime(notes[i], t);
          gain.gain.setValueAtTime(0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
          osc.connect(gain);
          gain.connect(out);
          osc.start(t);
          osc.stop(t + 0.25);
        }
      } catch {}
    }
    return this._recordEvent({ type: 'relic', frequencyHz });
  }

  /**
   * 9. Run Victory Major Fanfare (`type: 'victory'`)
   */
  playVictoryFanfare() {
    const frequencyHz = 1046.5;
    const ctx = this._ensureContext();
    if (ctx) {
      try {
        const out = this._getOutputNode(ctx);
        const now = Number(ctx.currentTime) || 0;
        const seq = [
          { f: 523.25, dt: 0, dur: 0.18 },
          { f: 659.25, dt: 0.085, dur: 0.18 },
          { f: 783.99, dt: 0.17, dur: 0.2 },
          { f: 1046.5, dt: 0.26, dur: 0.52 },
        ];
        for (const n of seq) {
          const t = now + n.dt;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(n.f, t);
          gain.gain.setValueAtTime(0.55, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + n.dur);
          osc.connect(gain);
          gain.connect(out);
          osc.start(t);
          osc.stop(t + n.dur + 0.01);
        }
      } catch {}
    }
    return this._recordEvent({ type: 'victory', frequencyHz });
  }

  /**
   * 10. Run Defeat Doom Brass Stinger (`type: 'defeat'`)
   */
  playDefeatStinger() {
    const frequencyHz = 130.81; // C3
    const ctx = this._ensureContext();
    if (ctx) {
      try {
        const out = this._getOutputNode(ctx);
        const now = Number(ctx.currentTime) || 0;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(261.63, now);
        osc.frequency.exponentialRampToValueAtTime(185.0, now + 0.18);
        osc.frequency.exponentialRampToValueAtTime(frequencyHz, now + 0.46);
        gain.gain.setValueAtTime(0.68, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.5);
      } catch {}
    }
    return this._recordEvent({ type: 'defeat', frequencyHz });
  }

  /**
   * Renders the interactive Audio & Math Lab soundboard inside `containerEl`
   * with all required `data-testid` attributes (`PROJECT.md:279`) and zero raw OS emojis.
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
          <h3>${SPEAKER_ICON_SVG}<span>重度听觉锚点合成台 (Procedural Web Audio Synthesizer)</span></h3>
          <button
            type="button"
            class="btn-arcade btn-audio-mute"
            data-testid="audio-mute-toggle"
            aria-pressed="${String(this.muted)}"
          >
            ${this.muted ? '已静音 (Muted)' : '音效开启 (Audio ON)'}
          </button>
        </div>
        <div class="audio-lab-buttons">
          <button type="button" class="btn-arcade" data-testid="audio-test-clunk">
            ${CLACK_ICON_SVG}
            <span>停轮机械卡顿 (Reel Clack)</span>
          </button>
          <button type="button" class="btn-arcade" data-testid="audio-test-devour">
            ${CRUNCH_ICON_SVG}
            <span>吞噬清脆咀嚼 (Devour Crunch)</span>
          </button>
          <button type="button" class="btn-arcade" data-testid="audio-test-chime">
            ${CHIME_ICON_SVG}
            <span>连线半音升调 (Combo Chime 叮—)</span>
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
