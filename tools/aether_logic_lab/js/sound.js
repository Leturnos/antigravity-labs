/**
 * Aether Logic Lab - Procedural Audio Engine (Web Audio API)
 */

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.buzzerOsc = null;
    this.buzzerGain = null;
    this.isBuzzerPlaying = false;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playClick(isOn = true) {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(isOn ? 900 : 600, now);
    osc.frequency.exponentialRampToValueAtTime(isOn ? 1200 : 400, now + 0.03);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  playClockTick() {
    if (this.isMuted) return;
    this.ensureContext();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.015);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.025);
  }

  setBuzzerState(active, freq = 440) {
    if (this.isMuted) {
      active = false;
    }
    this.ensureContext();
    if (!this.ctx) return;

    if (active && !this.isBuzzerPlaying) {
      const now = this.ctx.currentTime;
      this.buzzerOsc = this.ctx.createOscillator();
      this.buzzerGain = this.ctx.createGain();

      this.buzzerOsc.type = 'square';
      this.buzzerOsc.frequency.setValueAtTime(freq, now);

      this.buzzerGain.gain.setValueAtTime(0.06, now);

      this.buzzerOsc.connect(this.buzzerGain);
      this.buzzerGain.connect(this.ctx.destination);

      this.buzzerOsc.start(now);
      this.isBuzzerPlaying = true;
    } else if (!active && this.isBuzzerPlaying) {
      if (this.buzzerGain && this.ctx) {
        const now = this.ctx.currentTime;
        this.buzzerGain.gain.setValueAtTime(this.buzzerGain.gain.value, now);
        this.buzzerGain.gain.linearRampToValueAtTime(0.0001, now + 0.02);
        setTimeout(() => {
          if (this.buzzerOsc) {
            try { this.buzzerOsc.stop(); } catch (_) {}
            this.buzzerOsc.disconnect();
            this.buzzerOsc = null;
          }
          this.isBuzzerPlaying = false;
        }, 25);
      } else {
        this.isBuzzerPlaying = false;
      }
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.setBuzzerState(false);
    }
    return this.isMuted;
  }
}
