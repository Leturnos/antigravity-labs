/**
 * ChessSounds - Synthesizes chess game sound effects dynamically using Web Audio API.
 * Requires no external audio files, working 100% offline.
 */
const ChessSounds = {
  ctx: null,
  muted: false,

  init() {
    // AudioContext will be initialized on first user interaction to bypass browser autoplay policy
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  playMove() {
    this.init();
    if (this.muted) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.start(now);
    osc.stop(now + 0.08);
  },

  playCapture() {
    this.init();
    if (this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gainOsc = ctx.createGain();
    osc.connect(gainOsc);
    gainOsc.connect(ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);

    gainOsc.gain.setValueAtTime(0.22, now);
    gainOsc.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    const bufferSize = ctx.sampleRate * 0.05; // 50ms of noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const gainNoise = ctx.createGain();
    noise.connect(gainNoise);
    gainNoise.connect(ctx.destination);

    gainNoise.gain.setValueAtTime(0.07, now);
    gainNoise.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.start(now);
    osc.stop(now + 0.12);
    noise.start(now);
    noise.stop(now + 0.05);
  },

  playCheck() {
    this.init();
    if (this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const playTone = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.start(start);
      osc.stop(start + duration);
    };

    playTone(659.25, now, 0.25);
    playTone(880.00, now + 0.08, 0.35);
  },

  playGameOver(isWin) {
    this.init();
    if (this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const playTone = (freq, start, duration, type = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.start(start);
      osc.stop(start + duration);
    };

    if (isWin) {
      playTone(261.63, now, 0.4); // C4
      playTone(329.63, now + 0.1, 0.4); // E4
      playTone(392.00, now + 0.2, 0.4); // G4
      playTone(523.25, now + 0.3, 0.8); // C5
    } else {
      playTone(293.66, now, 0.4); // D4
      playTone(277.18, now + 0.15, 0.4); // C#4
      playTone(261.63, now + 0.3, 0.4); // C4
      playTone(196.00, now + 0.45, 0.8); // G3
    }
  },

  playStart() {
    this.init();
    if (this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const playTone = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.start(start);
      osc.stop(start + duration);
    };

    playTone(440.00, now, 0.3); // A4
    playTone(659.25, now + 0.1, 0.4); // E5
  },

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
};
