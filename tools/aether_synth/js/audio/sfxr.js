/**
 * Aether Audio Synth - SFX Generator (sfxr 8-Bit Engine)
 * Pure JavaScript 8-Bit Procedural Sound Effect Synthesizer
 */
import { AudioEngine } from './engine.js';

export class SFXGenerator {
  constructor() {
    this.params = {
      waveType: 'square', // 'square', 'sawtooth', 'sine', 'noise'
      
      // Envelope
      attackTime: 0.0,    // 0 to 1 sec
      sustainTime: 0.15,  // 0 to 1 sec
      sustainPunch: 0.2,  // 0 to 1 boost
      decayTime: 0.2,     // 0 to 2 sec

      // Pitch / Frequency
      startFrequency: 440, // 20 to 4000 Hz
      minFrequency: 40,    // 20 to 2000 Hz
      slide: 0,            // -2000 to +2000 Hz/sec
      deltaSlide: 0,       // -1000 to +1000 Hz/sec^2

      // Square wave duty cycle
      squareDuty: 0.5,     // 0.05 to 0.95
      dutySweep: 0.0,      // -1 to 1

      // Vibrato
      vibratoDepth: 0.0,   // 0 to 1
      vibratoSpeed: 10.0,  // 0 to 30 Hz

      // Filters
      lpFilterCutoff: 10000, // 100 to 20000 Hz
      hpFilterCutoff: 20,    // 10 to 4000 Hz
      
      // Master volume
      volume: 0.5
    };
  }

  /**
   * Resets parameters to neutral defaults
   */
  reset() {
    this.params = {
      waveType: 'square',
      attackTime: 0.0,
      sustainTime: 0.15,
      sustainPunch: 0.0,
      decayTime: 0.2,
      startFrequency: 440,
      minFrequency: 40,
      slide: 0,
      deltaSlide: 0,
      squareDuty: 0.5,
      dutySweep: 0.0,
      vibratoDepth: 0.0,
      vibratoSpeed: 10.0,
      lpFilterCutoff: 20000,
      hpFilterCutoff: 20,
      volume: 0.5
    };
  }

  // --- PRESETS ---

  presetLaser() {
    this.reset();
    this.params.waveType = Math.random() > 0.5 ? 'square' : 'sawtooth';
    this.params.startFrequency = 800 + Math.random() * 800;
    this.params.minFrequency = 100;
    this.params.slide = -1500 - Math.random() * 2000;
    this.params.attackTime = 0.0;
    this.params.sustainTime = 0.05 + Math.random() * 0.08;
    this.params.sustainPunch = 0.3;
    this.params.decayTime = 0.1 + Math.random() * 0.15;
    this.params.squareDuty = 0.2 + Math.random() * 0.6;
  }

  presetExplosion() {
    this.reset();
    this.params.waveType = 'noise';
    this.params.attackTime = 0.0;
    this.params.sustainTime = 0.1 + Math.random() * 0.2;
    this.params.sustainPunch = 0.5;
    this.params.decayTime = 0.3 + Math.random() * 0.4;
    this.params.startFrequency = 200 + Math.random() * 300;
    this.params.slide = -400 - Math.random() * 600;
    this.params.lpFilterCutoff = 3000 + Math.random() * 4000;
  }

  presetCoin() {
    this.reset();
    this.params.waveType = 'square';
    this.params.startFrequency = 600 + Math.random() * 200;
    this.params.sustainTime = 0.08;
    this.params.decayTime = 0.15;
    this.params.sustainPunch = 0.3;
    this.params.squareDuty = 0.5;
    this.params.slide = 1200;
  }

  presetJump() {
    this.reset();
    this.params.waveType = 'square';
    this.params.squareDuty = 0.5;
    this.params.startFrequency = 150 + Math.random() * 200;
    this.params.slide = 1500 + Math.random() * 1000;
    this.params.attackTime = 0.0;
    this.params.sustainTime = 0.1 + Math.random() * 0.1;
    this.params.decayTime = 0.15;
  }

  presetPowerup() {
    this.reset();
    if (Math.random() > 0.5) {
      this.params.waveType = 'sawtooth';
    } else {
      this.params.waveType = 'square';
      this.params.squareDuty = 0.3;
    }
    this.params.startFrequency = 200 + Math.random() * 300;
    this.params.slide = 1800 + Math.random() * 1200;
    this.params.sustainTime = 0.25;
    this.params.decayTime = 0.2;
    this.params.vibratoDepth = 0.3;
    this.params.vibratoSpeed = 15;
  }

  presetHit() {
    this.reset();
    this.params.waveType = Math.random() > 0.5 ? 'noise' : 'square';
    this.params.startFrequency = 300 + Math.random() * 400;
    this.params.slide = -1000 - Math.random() * 1000;
    this.params.attackTime = 0.0;
    this.params.sustainTime = 0.03 + Math.random() * 0.05;
    this.params.decayTime = 0.08 + Math.random() * 0.1;
    this.params.hpFilterCutoff = 100 + Math.random() * 200;
  }

  /**
   * Mutates current parameters by ±15%
   */
  mutate() {
    const p = this.params;
    const rnd = (val, range, min = 0, max = Infinity) => {
      const delta = (Math.random() * 2 - 1) * range;
      return Math.min(max, Math.max(min, val + delta));
    };

    p.startFrequency = rnd(p.startFrequency, 100, 20, 4000);
    p.slide = rnd(p.slide, 300, -3000, 3000);
    p.attackTime = rnd(p.attackTime, 0.03, 0, 1);
    p.sustainTime = rnd(p.sustainTime, 0.05, 0.01, 1);
    p.decayTime = rnd(p.decayTime, 0.05, 0.01, 2);
    p.squareDuty = rnd(p.squareDuty, 0.1, 0.05, 0.95);
    p.vibratoDepth = rnd(p.vibratoDepth, 0.1, 0, 1);
  }

  /**
   * Generates completely random parameters
   */
  randomize() {
    const waves = ['square', 'sawtooth', 'sine', 'noise'];
    this.params.waveType = waves[Math.floor(Math.random() * waves.length)];
    this.params.startFrequency = 50 + Math.random() * 2500;
    this.params.minFrequency = 20 + Math.random() * 500;
    this.params.slide = (Math.random() * 2 - 1) * 2500;
    this.params.deltaSlide = (Math.random() * 2 - 1) * 500;
    this.params.attackTime = Math.random() * 0.1;
    this.params.sustainTime = Math.random() * 0.4;
    this.params.sustainPunch = Math.random() * 0.5;
    this.params.decayTime = 0.05 + Math.random() * 0.5;
    this.params.squareDuty = 0.1 + Math.random() * 0.8;
    this.params.dutySweep = (Math.random() * 2 - 1) * 0.5;
    this.params.vibratoDepth = Math.random() > 0.7 ? Math.random() * 0.5 : 0;
    this.params.vibratoSpeed = 2 + Math.random() * 20;
    this.params.lpFilterCutoff = 500 + Math.random() * 19500;
    this.params.hpFilterCutoff = 10 + Math.random() * 2000;
  }

  /**
   * Generates an AudioBuffer sample-by-sample for smooth digital 8-bit sound
   */
  generateSoundBuffer(audioCtx) {
    const sampleRate = audioCtx.sampleRate;
    const p = this.params;

    const totalTime = p.attackTime + p.sustainTime + p.decayTime;
    const totalSamples = Math.max(1, Math.floor(totalTime * sampleRate));

    const buffer = audioCtx.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);

    let freq = p.startFrequency;
    let slide = p.slide;
    let deltaSlide = p.deltaSlide;

    let duty = p.squareDuty;
    let phase = 0;

    // Simple RC filter state variables
    let lpVal = 0;
    let hpVal = 0;

    // Pre-calculate filter coefficients
    const lpCutoff = Math.min(sampleRate / 2 - 1, Math.max(20, p.lpFilterCutoff));
    const lpAlpha = (2 * Math.PI * lpCutoff / sampleRate) / (2 * Math.PI * lpCutoff / sampleRate + 1);

    const hpCutoff = Math.min(sampleRate / 2 - 1, Math.max(10, p.hpFilterCutoff));
    const hpAlpha = 1 / (2 * Math.PI * hpCutoff / sampleRate + 1);

    for (let i = 0; i < totalSamples; i++) {
      const t = i / sampleRate;

      // 1. Envelope Calculation
      let envGain = 0;
      if (t < p.attackTime) {
        envGain = t / (p.attackTime || 0.001);
      } else if (t < p.attackTime + p.sustainTime) {
        const sustainRamp = (t - p.attackTime) / (p.sustainTime || 0.001);
        envGain = 1.0 + (p.sustainPunch * (1 - sustainRamp));
      } else {
        const decayRamp = (t - p.attackTime - p.sustainTime) / (p.decayTime || 0.001);
        envGain = Math.max(0, 1.0 - decayRamp);
      }

      // 2. Frequency & Slide
      slide += deltaSlide / sampleRate;
      freq += slide / sampleRate;
      freq = Math.max(p.minFrequency, freq);

      // 3. Vibrato
      let currentFreq = freq;
      if (p.vibratoDepth > 0) {
        const vib = Math.sin(2 * Math.PI * p.vibratoSpeed * t) * (p.vibratoDepth * 50);
        currentFreq = Math.max(20, freq + vib);
      }

      // 4. Phase Accumulation
      phase += currentFreq / sampleRate;
      if (phase >= 1.0) phase -= 1.0;

      // 5. Duty Sweep
      duty += (p.dutySweep / sampleRate);
      duty = Math.min(0.95, Math.max(0.05, duty));

      // 6. Waveform Generation
      let sample = 0;
      switch (p.waveType) {
        case 'square':
          sample = phase < duty ? 1.0 : -1.0;
          break;
        case 'sawtooth':
          sample = 2.0 * phase - 1.0;
          break;
        case 'sine':
          sample = Math.sin(2 * Math.PI * phase);
          break;
        case 'noise':
          sample = Math.random() * 2.0 - 1.0;
          break;
        default:
          sample = Math.sin(2 * Math.PI * phase);
      }

      // 7. Filters
      // Lowpass
      lpVal = lpVal + lpAlpha * (sample - lpVal);
      sample = lpVal;

      // Highpass
      hpVal = hpAlpha * (hpVal + sample - (i > 0 ? data[i - 1] : 0));
      sample = hpVal;

      // Multiply by Envelope and Master Volume
      data[i] = sample * envGain * p.volume;
    }

    return buffer;
  }

  /**
   * Plays the generated SFX buffer immediately
   */
  play(audioCtx, destinationNode) {
    if (!audioCtx) return;
    const buffer = this.generateSoundBuffer(audioCtx);
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(destinationNode || audioCtx.destination);
    source.start();
    return source;
  }

  /**
   * Exports current sound as a WAV Blob download
   */
  exportWAV(audioCtx) {
    const buffer = this.generateSoundBuffer(audioCtx);
    const wavBuffer = AudioEngine.encodeWAV(buffer);
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `sfxr_${this.params.waveType}_${Date.now()}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
