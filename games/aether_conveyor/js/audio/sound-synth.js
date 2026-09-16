/**
 * SoundSynth — Web Audio API Procedural Synthesizer for Aether Conveyor
 *
 * Generates all game sound effects dynamically without external audio assets.
 * Defensive against browser autoplay policies and Node.js testing environments.
 */

export class SoundSynth {
  /**
   * @param {AudioContext|null} [audioContext=null]
   */
  constructor(audioContext = null) {
    this.ctx = audioContext;
    this.masterGain = null;
    this.isMuted = false;
    this.volume = 0.25;

    if (this.ctx) {
      this._setupMasterGain();
    }
  }

  _setupMasterGain() {
    if (!this.ctx || this.masterGain) return;
    try {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime || 0);
      this.masterGain.connect(this.ctx.destination);
    } catch {
      this.masterGain = null;
    }
  }

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
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.volume, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  /**
   * UI button click.
   */
  playClick() {
    if (this.isMuted || !this.initContext()) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.05);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch {}
  }

  /**
   * Building placement lock sound.
   */
  playPlace() {
    if (this.isMuted || !this.initContext()) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.08);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {}
  }

  /**
   * Scrap metal deconstruction sound.
   */
  playDemolish() {
    if (this.isMuted || !this.initContext()) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {}
  }

  /**
   * Subtle pneumatic servo sound for inserters.
   */
  playInserter() {
    if (this.isMuted || !this.initContext()) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(330, now + 0.06);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.06);
    } catch {}
  }

  /**
   * Item delivery ping into Tech Hub.
   */
  playItemDelivered() {
    if (this.isMuted || !this.initContext()) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(980, now);
      osc.frequency.exponentialRampToValueAtTime(1470, now + 0.09);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch {}
  }

  /**
   * Critical power alarm siren.
   */
  playAlarm() {
    if (this.isMuted || !this.initContext()) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.linearRampToValueAtTime(320, now + 0.2);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch {}
  }

  /**
   * Sector complete victory chord.
   */
  playVictory() {
    if (this.isMuted || !this.initContext()) return;
    try {
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const now = this.ctx.currentTime + idx * 0.1;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.4);
      });
    } catch {}
  }

  /**
   * Technology research unlocked chime.
   */
  playResearch() {
    if (this.isMuted || !this.initContext()) return;
    try {
      const chords = [440, 554.37, 659.25, 880];
      chords.forEach((freq, idx) => {
        const now = this.ctx.currentTime + idx * 0.08;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + 0.5);
      });
    } catch {}
  }

  /**
   * Starts ambient background industrial synth drone.
   */
  startAmbientMusic() {
    if (this.isMuted || this.ambientRunning || !this.initContext()) return;
    try {
      this.ambientRunning = true;
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.04, this.ctx.currentTime);
      this.ambientGain.connect(this.masterGain);

      const rootFreq = 55.0; // A1
      this.ambientOsc1 = this.ctx.createOscillator();
      this.ambientOsc1.type = 'sawtooth';
      this.ambientOsc1.frequency.setValueAtTime(rootFreq, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(220, this.ctx.currentTime);

      this.ambientOsc1.connect(filter);
      filter.connect(this.ambientGain);

      this.ambientOsc1.start();
    } catch {}
  }

  stopAmbientMusic() {
    this.ambientRunning = false;
    if (this.ambientOsc1) {
      try {
        this.ambientOsc1.stop();
        this.ambientOsc1.disconnect();
      } catch {}
      this.ambientOsc1 = null;
    }
  }
}
