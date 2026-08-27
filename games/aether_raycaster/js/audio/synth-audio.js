export class SynthAudio {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.isPlayingMusic = false;
    this.musicTimer = null;
    this.step = 0;
  }

  init() {
    if (this.ctx) return;
    if (typeof window === 'undefined') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      this.ctx = new AudioContext();
    }
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
      this.ctx.resume();
    }
  }

  setMuted(muted) {
    this.isMuted = Boolean(muted);
    if (this.isMuted && this.musicTimer) {
      this.stopMusic();
    }
  }

  toggleMusic() {
    if (this.isPlayingMusic) {
      this.stopMusic();
    } else {
      this.startSynthwaveMusic();
    }
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.isPlayingMusic = false;
  }

  playLaser() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.15);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  playExplosion() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const sampleRate = this.ctx.sampleRate || 44100;
    const bufferSize = Math.floor(sampleRate * 0.4);
    const buffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 0.38);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.38);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(t);
  }

  playDoor() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(350, t + 0.25);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0.01, t + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  playPickup() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      if (osc.frequency.setValueAtTime) {
        osc.frequency.setValueAtTime(freq, t + i * 0.05);
      } else {
        osc.frequency.value = freq;
      }
      gain.gain.setValueAtTime(0.2, t + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.05 + 0.1);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t + i * 0.05);
      osc.stop(t + i * 0.05 + 0.11);
    });
  }

  playHurt() {
    if (this.isMuted || !this.ctx) return;
    this.ensureContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.2);
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.21);
  }

  startSynthwaveMusic() {
    if (this.isMuted || this.isPlayingMusic) return;
    this.ensureContext();
    if (!this.ctx) return;
    this.isPlayingMusic = true;
    const notes = [110, 110, 130.81, 110, 146.83, 130.81, 110, 164.81]; // A2, C3, D3, E3 bassline
    this.step = 0;

    this.musicTimer = setInterval(() => {
      if (this.isMuted || !this.ctx) return;
      const t = this.ctx.currentTime;
      const freq = notes[this.step % notes.length];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.19);

      this.step++;
    }, 200); // 150 BPM 8th notes
  }
}
