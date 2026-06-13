/**
 * NES_AudioEngine - Real-time retro audio synthesis using the Web Audio API.
 * Synthesizes all sound effects on-the-fly, 100% offline with zero dependencies.
 */
window.NES_AudioEngine = {
  ctx: null,
  muted: false,

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  play(type) {
    this.init();
    if (this.muted) return;
    
    const ctx = this.ctx;
    const now = ctx.currentTime;

    switch (type) {
      case 'reveal':
        this.playReveal(ctx, now);
        break;
      case 'flag':
        this.playFlag(ctx, now, false);
        break;
      case 'unflag':
        this.playFlag(ctx, now, true);
        break;
      case 'chord':
        this.playChord(ctx, now);
        break;
      case 'win':
        this.playWinFanfare(ctx, now);
        break;
      case 'lose':
        this.playExplosion(ctx, now);
        break;
      default:
        console.warn(`Unknown sound type: ${type}`);
    }
  },

  playReveal(ctx, now) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.06);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.start(now);
    osc.stop(now + 0.06);
  },

  playFlag(ctx, now, isUnflag) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    const startFreq = isUnflag ? 1500 : 1200;
    const endFreq = isUnflag ? 500 : 300;
    
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.03);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.start(now);
    osc.stop(now + 0.03);
  },

  playChord(ctx, now) {
    const playTone = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.08, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.start(start);
      osc.stop(start + duration);
    };

    playTone(523.25, now, 0.06);       // C5
    playTone(659.25, now + 0.04, 0.08); // E5
  },

  playExplosion(ctx, now) {
    // 1. Synthesize White Noise for the explosion blast
    const bufferSize = ctx.sampleRate * 0.4; // 400ms buffer
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    // Filter to simulate low rumbling explosion
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(60, now + 0.4);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    // 2. Add an Oscillator Rumble for deep mechanical feedback
    const rumble = ctx.createOscillator();
    const rumbleGain = ctx.createGain();

    rumble.type = 'sawtooth';
    rumble.frequency.setValueAtTime(90, now);
    rumble.frequency.linearRampToValueAtTime(30, now + 0.35);

    rumbleGain.gain.setValueAtTime(0.18, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    rumble.connect(rumbleGain);
    rumbleGain.connect(ctx.destination);

    // Start both
    noise.start(now);
    noise.stop(now + 0.4);
    rumble.start(now);
    rumble.stop(now + 0.4);
  },

  playWinFanfare(ctx, now) {
    const playNote = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // Use square wave for classic 8-bit sound chip feel
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.06, start);
      gain.gain.setValueAtTime(0.06, start + duration - 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    // Upbeat major fanfare jingle
    const noteDuration = 0.08;
    playNote(523.25, now, noteDuration);                      // C5
    playNote(659.25, now + noteDuration, noteDuration);        // E5
    playNote(783.99, now + noteDuration * 2, noteDuration);    // G5
    playNote(1046.50, now + noteDuration * 3, noteDuration);   // C6
    playNote(783.99, now + noteDuration * 4, noteDuration);    // G5
    playNote(1046.50, now + noteDuration * 5, noteDuration * 3); // C6 long note
  },

  setMute(isMuted) {
    this.muted = isMuted;
  }
};
