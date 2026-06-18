/**
 * RetroAudioEngine - Shared real-time retro audio synthesis using the Web Audio API.
 * Synthesizes sound effects dynamically, 100% offline with zero dependencies.
 */
class RetroAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // Lazy initialization of AudioContext to satisfy browser autoplay policy
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API is not supported in this browser.", e);
    }
  }

  // Toggles mute state
  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  setMute(isMuted) {
    this.muted = isMuted;
  }

  // Resume context if suspended
  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Synthesizes a clean tone with frequency sweep (pitch sliding).
   */
  playTone(freqStart, freqEnd, duration, type = 'sine', volume = 0.1, delay = 0) {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime + delay;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
    }

    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * Synthesizes lowpass-filtered white noise for explosions, sweeps, and mechanical feedback.
   */
  playNoise(duration, lowpassStart, lowpassEnd, volume = 0.1, delay = 0) {
    if (this.muted) return;
    this.resume();
    if (!this.ctx) return;

    const ctx = this.ctx;
    const now = ctx.currentTime + delay;

    try {
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(lowpassStart, now);
      if (lowpassEnd !== lowpassStart) {
        filter.frequency.exponentialRampToValueAtTime(lowpassEnd, now + duration);
      }

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(volume, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

      noiseNode.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      noiseNode.start(now);
      noiseNode.stop(now + duration);
    } catch (e) {
      console.warn("Noise play failed", e);
    }
  }
}

// Attach globally
window.RetroAudioEngine = RetroAudioEngine;
