/**
 * Aether Audio Synth - Master Effects Processor
 * Stereo Delay with Closed Feedback Loop & Synthetic Space Reverb
 */

export class MasterEffects {
  constructor() {
    this.ctx = null;
    this.delayNode = null;
    this.delayFilter = null;
    this.delayFeedback = null;
    this.delayWetGain = null;

    this.reverbNode = null;
    this.reverbWetGain = null;

    this.submixBus = null;
    this.dryGain = null;
    this.masterOutput = null;

    this.delayDivision = '1/8';
    this.reverbDecay = 1.5;
  }

  init(ctx, masterOutputNode) {
    this.ctx = ctx;
    this.masterOutput = masterOutputNode;

    this.submixBus = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1.0;

    // --- 1. Delay Feedback Loop Topology ---
    // input -> DelayNode -> BiquadFilter (lowpass 3000Hz) -> GainNode (feedback) -> back to DelayNode
    this.delayNode = ctx.createDelay(2.0);
    this.delayFilter = ctx.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 3000;

    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.4;

    this.delayWetGain = ctx.createGain();
    this.delayWetGain.gain.value = 0.0; // Default dry

    // Closed Feedback Loop Connection
    this.submixBus.connect(this.delayNode);
    this.delayNode.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode); // Feedback loop closed
    this.delayFilter.connect(this.delayWetGain);

    // --- 2. Synthetic Space Reverb (ConvolverNode) ---
    this.reverbNode = ctx.createConvolver();
    this.reverbWetGain = ctx.createGain();
    this.reverbWetGain.gain.value = 0.0; // Default dry

    this.generateReverbIR(this.reverbDecay);

    this.submixBus.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbWetGain);

    // Connect Direct Dry Path
    this.submixBus.connect(this.dryGain);

    // Summing Output to Master Output Node
    this.dryGain.connect(masterOutputNode);
    this.delayWetGain.connect(masterOutputNode);
    this.reverbWetGain.connect(masterOutputNode);
  }

  calculateDelaySeconds(bpm, division) {
    const beatSec = 60.0 / bpm;
    switch (division) {
      case '1/4': return beatSec;
      case '1/8': return beatSec / 2;
      case '1/16': return beatSec / 4;
      case '3/16': return (beatSec / 4) * 3;
      default: return beatSec / 2;
    }
  }

  setDelayBpm(bpm, division = this.delayDivision) {
    this.delayDivision = division;
    if (!this.delayNode || !this.ctx) return;
    const targetTime = this.calculateDelaySeconds(bpm, division);
    // Smooth transition to prevent zipper noise / clicks
    this.delayNode.delayTime.setTargetAtTime(targetTime, this.ctx.currentTime, 0.02);
  }

  setDelayFeedback(val) {
    if (this.delayFeedback && this.ctx) {
      const clampVal = Math.min(0.85, Math.max(0, val));
      this.delayFeedback.gain.setTargetAtTime(clampVal, this.ctx.currentTime, 0.02);
    }
  }

  setDelayWet(val) {
    if (this.delayWetGain && this.ctx) {
      this.delayWetGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.02);
    }
  }

  generateReverbIR(decaySeconds) {
    if (!this.ctx || !this.reverbNode) return;
    this.reverbDecay = decaySeconds;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * decaySeconds));
    const impulse = this.ctx.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
      const decay = Math.exp(-i / (sampleRate * (decaySeconds / 3.0)));
      left[i] = (Math.random() * 2 - 1) * decay;
      right[i] = (Math.random() * 2 - 1) * decay;
    }

    this.reverbNode.buffer = impulse;
  }

  setReverbWet(val) {
    if (this.reverbWetGain && this.ctx) {
      this.reverbWetGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.02);
    }
  }
}
