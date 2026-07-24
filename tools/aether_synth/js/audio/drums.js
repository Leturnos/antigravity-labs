/**
 * Physical Percussion Synthesizer (Kick, Snare, HiHat)
 */

export class DrumSynth {
  constructor(synthVoice) {
    this.synthVoice = synthVoice;
  }

  trigger(ctx, destination, type, time) {
    switch (type) {
      case 'kick':
        this.playKick(ctx, destination, time);
        break;
      case 'snare':
        this.playSnare(ctx, destination, time);
        break;
      case 'hihat':
        this.playHiHat(ctx, destination, time);
        break;
    }
  }

  playKick(ctx, destination, time) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.1);

    gain.gain.setValueAtTime(1.0, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  playSnare(ctx, destination, time) {
    // Tonal element
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.frequency.setValueAtTime(180, time);
    oscGain.gain.setValueAtTime(0.7, time);
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc.connect(oscGain);
    oscGain.connect(destination);

    // Noise element
    const noise = ctx.createBufferSource();
    noise.buffer = this.synthVoice.getNoiseBuffer(ctx);
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1000, time);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.8, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(destination);

    osc.start(time);
    osc.stop(time + 0.1);
    noise.start(time);
    noise.stop(time + 0.15);
  }

  playHiHat(ctx, destination, time) {
    const noise = ctx.createBufferSource();
    noise.buffer = this.synthVoice.getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(7000, time);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    noise.start(time);
    noise.stop(time + 0.05);
  }
}
