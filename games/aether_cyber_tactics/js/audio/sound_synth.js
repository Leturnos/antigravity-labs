/**
 * SoundSynth - Web Audio API procedural sound synthesizer for Aether Cyber Tactics.
 * Generates futuristic cyberpunk sound effects dynamically without external audio assets.
 */
export class SoundSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isMuted = false;
  }

  /**
   * Initializes or resumes the AudioContext lazily on user gesture.
   * Respects browser autoplay policies.
   * @returns {AudioContext|null}
   */
  initContext() {
    if (this.isMuted) return null;

    if (!this.ctx) {
      const AudioCtx = typeof window !== 'undefined'
        ? (window.AudioContext || window.webkitAudioContext)
        : null;
      if (!AudioCtx) return null;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3; // Safe master volume
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    return this.ctx;
  }

  /**
   * Toggles audio mute state.
   * @returns {boolean} The new mute state.
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(
        this.isMuted ? 0 : 0.3,
        this.ctx.currentTime
      );
    }
    return this.isMuted;
  }

  /**
   * Helper to create a noise buffer.
   * @param {number} duration - Duration in seconds
   * @returns {AudioBuffer|null}
   */
  createNoiseBuffer(duration = 0.5) {
    if (!this.ctx) return null;
    const bufferSize = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  /**
   * Gentle high-tech UI pitch blip for movement or selection.
   */
  playMove() {
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.06);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.07);
  }

  /**
   * Impact bass pulse + noisy impact layer for physical/melee attacks.
   */
  playKineticPunch() {
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Sub bass impact pulse
    const bassOsc = ctx.createOscillator();
    const bassGain = ctx.createGain();

    bassOsc.type = 'triangle';
    bassOsc.frequency.setValueAtTime(180, now);
    bassOsc.frequency.exponentialRampToValueAtTime(30, now + 0.18);

    bassGain.gain.setValueAtTime(0.8, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    bassOsc.connect(bassGain);
    bassGain.connect(this.masterGain);

    bassOsc.start(now);
    bassOsc.stop(now + 0.2);

    // Noisy impact slap
    const noiseBuffer = this.createNoiseBuffer(0.12);
    if (noiseBuffer) {
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1000, now);
      filter.frequency.exponentialRampToValueAtTime(200, now + 0.1);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.5, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      noiseSource.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noiseSource.start(now);
      noiseSource.stop(now + 0.12);
    }
  }

  /**
   * Pitch-bent fast down-sweep sawtooth laser shot.
   */
  playLaser() {
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.15);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.15);
    filter.Q.value = 4;

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.16);
  }

  /**
   * Deep low-frequency noise rumble + explosive pop for mortar/heavy artillery.
   */
  playMortar() {
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Explosive pop
    const popOsc = ctx.createOscillator();
    const popGain = ctx.createGain();

    popOsc.type = 'sine';
    popOsc.frequency.setValueAtTime(130, now);
    popOsc.frequency.exponentialRampToValueAtTime(25, now + 0.25);

    popGain.gain.setValueAtTime(0.9, now);
    popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    popOsc.connect(popGain);
    popGain.connect(this.masterGain);

    popOsc.start(now);
    popOsc.stop(now + 0.3);

    // Deep low-frequency rumble
    const noiseBuffer = this.createNoiseBuffer(0.6);
    if (noiseBuffer) {
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(50, now + 0.55);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.7, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

      noiseSource.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noiseSource.start(now);
      noiseSource.stop(now + 0.6);
    }
  }

  /**
   * Digital frequency modulation arpeggio sound for hacking/cyberware actions.
   */
  playHack() {
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98]; // C5, E5, G5, C6, E6, G6
    const noteDuration = 0.04;

    notes.forEach((freq, idx) => {
      const noteTime = now + idx * noteDuration;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, noteTime);

      // Cyber FM wobble modulation
      const modOsc = ctx.createOscillator();
      const modGain = ctx.createGain();
      modOsc.frequency.setValueAtTime(30, noteTime);
      modGain.gain.setValueAtTime(15, noteTime);
      modOsc.connect(osc.frequency);

      gain.gain.setValueAtTime(0.15, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + noteDuration + 0.02);

      osc.connect(gain);
      gain.connect(this.masterGain);

      modOsc.start(noteTime);
      osc.start(noteTime);

      modOsc.stop(noteTime + noteDuration + 0.02);
      osc.stop(noteTime + noteDuration + 0.02);
    });
  }

  /**
   * High-frequency crackling noise burst + crumbling pitch drop for tile destruction.
   */
  playTileShatter() {
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // High-frequency crackle noise
    const noiseBuffer = this.createNoiseBuffer(0.35);
    if (noiseBuffer) {
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2500, now);
      filter.frequency.linearRampToValueAtTime(800, now + 0.3);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.6, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      noiseSource.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.masterGain);

      noiseSource.start(now);
      noiseSource.stop(now + 0.35);
    }

    // Crumbling pitch drop
    const crumbOsc = ctx.createOscillator();
    const crumbGain = ctx.createGain();

    crumbOsc.type = 'sawtooth';
    crumbOsc.frequency.setValueAtTime(350, now);
    crumbOsc.frequency.exponentialRampToValueAtTime(45, now + 0.35);

    crumbGain.gain.setValueAtTime(0.3, now);
    crumbGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    crumbOsc.connect(crumbGain);
    crumbGain.connect(this.masterGain);

    crumbOsc.start(now);
    crumbOsc.stop(now + 0.35);
  }

  /**
   * Cyberpunk dual-tone chime chord for turn transitions.
   */
  playTurnChange() {
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const frequencies = [440.00, 659.25, 1108.73]; // A4, E5, C#6 (A major triad chime)

    frequencies.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);

      gain.gain.setValueAtTime(0.2, now + idx * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.5);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + idx * 0.05);
      osc.stop(now + idx * 0.05 + 0.5);
    });
  }

  /**
   * Synthesized victory fanfare chord progression.
   */
  playVictory() {
    const ctx = this.initContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Victory progression: C5 -> F5 -> G5 -> C6 high triumphant synth chord
    const chords = [
      { notes: [523.25, 659.25, 783.99], timeOffset: 0.0, duration: 0.18 },   // C Major
      { notes: [698.46, 880.00, 1046.50], timeOffset: 0.2, duration: 0.18 },  // F Major
      { notes: [783.99, 987.77, 1174.66], timeOffset: 0.4, duration: 0.18 },  // G Major
      { notes: [1046.50, 1318.51, 1567.98, 2093.00], timeOffset: 0.6, duration: 0.6 } // High C Major hold
    ];

    chords.forEach((chord) => {
      chord.notes.forEach((freq) => {
        const chordTime = now + chord.timeOffset;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, chordTime);

        gain.gain.setValueAtTime(0.18, chordTime);
        gain.gain.exponentialRampToValueAtTime(0.001, chordTime + chord.duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(chordTime);
        osc.stop(chordTime + chord.duration);
      });
    });
  }
}
