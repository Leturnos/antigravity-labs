/**
 * SoundSynth - Web Audio API Procedural Synthesizer for Aether Flowfield TD.
 *
 * Generates all game sound effects dynamically in real-time without external audio assets.
 * Defensive against headless / Node.js environments and browser autoplay restrictions.
 */
export class SoundSynth {
  /**
   * @param {AudioContext|null} [audioContext=null] - Optional injected AudioContext (e.g. for testing).
   */
  constructor(audioContext = null) {
    this.ctx = audioContext;
    this.masterGain = null;
    this.isMuted = false;
    this.volume = 0.3;

    if (this.ctx) {
      this._setupMasterGain();
    }
  }

  /**
   * Internal helper to initialize master gain node and destination routing.
   * @private
   */
  _setupMasterGain() {
    if (!this.ctx || this.masterGain) return;
    try {
      this.masterGain = this.ctx.createGain();
      const currentVal = this.isMuted ? 0 : this.volume;
      this.masterGain.gain.setValueAtTime(currentVal, this.ctx.currentTime || 0);
      this.masterGain.connect(this.ctx.destination);
    } catch {
      this.masterGain = null;
    }
  }

  /**
   * Initializes or resumes the AudioContext lazily on user gesture.
   * Tolerant to browser autoplay policies and Node.js headless runtime.
   * @returns {AudioContext|null}
   */
  initContext() {

    if (!this.ctx) {
      const AudioCtx = typeof window !== 'undefined'
        ? (window.AudioContext || window.webkitAudioContext)
        : null;
      if (!AudioCtx) return null;

      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }

    this._setupMasterGain();

    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        const resumePromise = this.ctx.resume();
        if (resumePromise && typeof resumePromise.catch === 'function') {
          resumePromise.catch(() => {});
        }
      } catch {}
    }

    return this.ctx;
  }

  /**
   * Updates audio mute state.
   * @param {boolean} isMuted
   * @returns {boolean} Current mute state
   */
  setMute(isMuted) {
    this.isMuted = Boolean(isMuted);
    if (this.masterGain && this.ctx) {
      try {
        const now = this.ctx.currentTime || 0;
        this.masterGain.gain.setValueAtTime(
          this.isMuted ? 0 : this.volume,
          now
        );
      } catch {}
    }
    return this.isMuted;
  }

  /**
   * Toggles audio mute state.
   * @returns {boolean}
   */
  toggleMute() {
    return this.setMute(!this.isMuted);
  }

  /**
   * Sets master audio volume (clamped between 0.0 and 1.0).
   * @param {number} volume
   * @returns {number} The clamped volume
   */
  setVolume(volume) {
    const parsed = Number(volume);
    this.volume = Math.max(0, Math.min(1, Number.isFinite(parsed) ? parsed : 0));
    if (this.masterGain && this.ctx && !this.isMuted) {
      try {
        const now = this.ctx.currentTime || 0;
        this.masterGain.gain.setValueAtTime(this.volume, now);
      } catch {}
    }
    return this.volume;
  }

  /**
   * Procedurally generates a mono white noise AudioBuffer.
   * @param {number} [duration=0.4] - Duration in seconds
   * @returns {AudioBuffer|null}
   */
  createNoiseBuffer(duration = 0.4) {
    if (!this.ctx) return null;
    try {
      const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      return buffer;
    } catch {
      return null;
    }
  }

  /**
   * Computes a non-linear sigmoid overdrive curve for WaveShaper distortion.
   * @private
   * @param {number} amount - Distortion intensity
   * @param {number} nSamples - Curve resolution
   * @returns {Float32Array}
   */
  _getDistortionCurve(amount = 20, nSamples = 256) {
    const curve = new Float32Array(nSamples);
    const deg = Math.PI / 180;
    const k = typeof amount === 'number' ? amount : 20;
    for (let i = 0; i < nSamples; ++i) {
      const x = (i * 2) / nSamples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  }

  /**
   * Checks if audio can be played and returns the active AudioContext.
   * Returns null if muted or in unsupported/headless environment.
   * @private
   * @returns {AudioContext|null}
   */
  _canPlay() {
    if (this.isMuted) return null;
    return this.initContext();
  }

  /**
   * Gatling single-target laser beam: fast pitch-falling sawtooth pulse.
   */
  playLaser() {
    const ctx = this._canPlay();
    if (!ctx) return;

    const now = ctx.currentTime || 0;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.12);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4000, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.12);
    if (filter.Q && typeof filter.Q.setValueAtTime === 'function') {
      filter.Q.setValueAtTime(3, now);
    }

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain || ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  /**
   * Plasma Mortar AoE explosion: sub-bass rumble + filtered white noise buffer.
   * @param {number} [intensity=1.0] - Scale factor for explosion magnitude
   */
  playExplosion(intensity = 1.0) {
    const ctx = this._canPlay();
    if (!ctx) return;

    const safeIntensity = Math.max(0.1, Math.min(2.5, Number(intensity) || 1.0));
    const now = ctx.currentTime || 0;
    const duration = 0.35 * Math.min(safeIntensity, 1.8);

    // 1. Sub-bass rumble
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();

    bassOsc.type = 'sine';
    bassOsc.frequency.setValueAtTime(130 * Math.min(1.2, safeIntensity), now);
    bassOsc.frequency.exponentialRampToValueAtTime(25, now + duration * 0.85);

    const initialBassGain = Math.min(0.9, 0.6 * safeIntensity);
    bassGain.gain.setValueAtTime(initialBassGain, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    bassOsc.connect(bassGain);
    bassGain.connect(this.masterGain || ctx.destination);

    bassOsc.start(now);
    bassOsc.stop(now + duration);

    // 2. Filtered noise layer
    const noiseBuffer = this.createNoiseBuffer(duration);
    if (noiseBuffer) {
      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(Math.min(1200, 550 * safeIntensity), now);
      filter.frequency.exponentialRampToValueAtTime(40, now + duration * 0.95);

      const noiseGain = ctx.createGain();
      const initialNoiseGain = Math.min(0.8, 0.5 * safeIntensity);
      noiseGain.gain.setValueAtTime(initialNoiseGain, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noiseSrc.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain || ctx.destination);

      noiseSrc.start(now);
      noiseSrc.stop(now + duration);
    }
  }

  /**
   * Stasis Field aura: ethereal resonance sine pulse modulated by LFO.
   */
  playStasisPulse() {
    const ctx = this._canPlay();
    if (!ctx) return;

    const now = ctx.currentTime || 0;
    const duration = 0.45;

    // Carrier sine oscillator
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.setValueAtTime(480, now);
    carrier.frequency.exponentialRampToValueAtTime(260, now + duration);

    // LFO modulating carrier frequency for ethereal resonance
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(14, now);

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(35, now);
    lfoGain.gain.exponentialRampToValueAtTime(5, now + duration);

    lfo.connect(lfoGain);
    lfoGain.connect(carrier.frequency);

    // Resonant bandpass filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    if (filter.Q && typeof filter.Q.setValueAtTime === 'function') {
      filter.Q.setValueAtTime(4, now);
    }

    // Dynamic amplitude envelope
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.01, now);
    amp.gain.linearRampToValueAtTime(0.3, now + 0.05);
    amp.gain.exponentialRampToValueAtTime(0.001, now + duration);

    carrier.connect(filter);
    filter.connect(amp);
    amp.connect(this.masterGain || ctx.destination);

    lfo.start(now);
    carrier.start(now);
    lfo.stop(now + duration);
    carrier.stop(now + duration);
  }

  /**
   * Breach Mode alert: urgent dual-tone emergency klaxon siren.
   */
  playBreachAlarm() {
    const ctx = this._canPlay();
    if (!ctx) return;

    const now = ctx.currentTime || 0;
    const pulseDuration = 0.16;
    const tones = [587.33, 880.00]; // High-urgency interval (D5, A5)

    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startTime = now + idx * 0.08;
      const stopTime = startTime + pulseDuration;

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.linearRampToValueAtTime(freq * 1.2, stopTime);

      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, stopTime);

      osc.connect(gain);
      gain.connect(this.masterGain || ctx.destination);

      osc.start(startTime);
      osc.stop(stopTime);
    });
  }

  /**
   * Core damage: heavy crunch distortion / bass impact shockwave.
   */
  playCoreDamage() {
    const ctx = this._canPlay();
    if (!ctx) return;

    const now = ctx.currentTime || 0;
    const duration = 0.35;

    // Deep bass impact
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();

    bassOsc.type = 'triangle';
    bassOsc.frequency.setValueAtTime(140, now);
    bassOsc.frequency.exponentialRampToValueAtTime(25, now + duration);

    bassGain.gain.setValueAtTime(0.85, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    bassOsc.connect(bassGain);
    bassGain.connect(this.masterGain || ctx.destination);

    bassOsc.start(now);
    bassOsc.stop(now + duration);

    // Distortion crunch layer
    const shaper = ctx.createWaveShaper();
    shaper.curve = this._getDistortionCurve(35);
    shaper.oversample = '4x';

    const crunchOsc = ctx.createOscillator();
    crunchOsc.type = 'sawtooth';
    crunchOsc.frequency.setValueAtTime(180, now);
    crunchOsc.frequency.exponentialRampToValueAtTime(30, now + 0.22);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, now);
    filter.frequency.exponentialRampToValueAtTime(250, now + 0.22);

    const crunchGain = ctx.createGain();
    crunchGain.gain.setValueAtTime(0.45, now);
    crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    crunchOsc.connect(shaper);
    shaper.connect(filter);
    filter.connect(crunchGain);
    crunchGain.connect(this.masterGain || ctx.destination);

    crunchOsc.start(now);
    crunchOsc.stop(now + 0.22);
  }

  /**
   * Wave start: energetic sci-fi upward arpeggio.
   */
  playWaveStart() {
    const ctx = this._canPlay();
    if (!ctx) return;

    const now = ctx.currentTime || 0;
    const notes = [329.63, 415.30, 493.88, 659.25, 987.77]; // E4, G#4, B4, E5, B5
    const noteStep = 0.055;
    const noteDuration = 0.12;

    notes.forEach((freq, idx) => {
      const noteTime = now + idx * noteStep;
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(freq * 3, noteTime);

      gain.gain.setValueAtTime(0.22, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + noteDuration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain || ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + noteDuration);
    });
  }

  /**
   * Wave clear: harmonious victory chime chord.
   */
  playWaveClear() {
    const ctx = this._canPlay();
    if (!ctx) return;

    const now = ctx.currentTime || 0;
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.50]; // Major 7th chime
    const noteStep = 0.06;
    const chimeDuration = 0.55;

    notes.forEach((freq, idx) => {
      const chimeTime = now + idx * noteStep;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, chimeTime);

      gain.gain.setValueAtTime(0.2, chimeTime);
      gain.gain.exponentialRampToValueAtTime(0.001, chimeTime + chimeDuration);

      osc.connect(gain);
      gain.connect(this.masterGain || ctx.destination);

      osc.start(chimeTime);
      osc.stop(chimeTime + chimeDuration);
    });
  }
}
