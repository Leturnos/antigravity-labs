/**
 * Monophonic Dual Oscillator Synthesizer Voice (FM/AM, Noise, ADSR, Biquad Filter, LFO)
 */

export class SynthVoice {
  constructor() {
    this.noiseBuffer = null;
  }

  /**
   * Generates a reusable static White Noise buffer
   */
  getNoiseBuffer(ctx) {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const bufferSize = ctx.sampleRate * 2; // 2 seconds buffer
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  /**
   * Triggers a note in the specified audio context (Real-time or Offline)
   */
  triggerNote(ctx, destination, freq, startTime, duration, params) {
    const {
      osc1Type = 'square',
      osc2Type = 'sine',
      osc2DetuneSemitones = 7,
      fmDepth = 0,
      amDepth = 0,
      attack = 0.01,
      decay = 0.2,
      sustain = 0.5,
      release = 0.3,
      cutoff = 4000,
      resonance = 2,
      lfoRate = 4,
      lfoDepth = 0,
      lfoTarget = 'filter'
    } = params;

    // 1. Master Envelope Gain (GainNode)
    const envGain = ctx.createGain();
    envGain.gain.setValueAtTime(0.0001, startTime);
    
    // ADSR Ramp Calculations
    const attackTime = startTime + attack;
    const decayTime = attackTime + decay;
    const releaseTime = startTime + duration + release;

    envGain.gain.linearRampToValueAtTime(1.0, attackTime);
    envGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), decayTime);
    envGain.gain.setValueAtTime(Math.max(0.0001, sustain), startTime + duration);
    envGain.gain.exponentialRampToValueAtTime(0.0001, releaseTime);

    // 2. Biquad Filter
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, startTime);
    filter.Q.setValueAtTime(resonance, startTime);

    filter.connect(envGain);
    envGain.connect(destination);

    // 3. LFO Connection (Filter or Pitch Modulation)
    if (lfoDepth > 0) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.setValueAtTime(lfoRate, startTime);
      lfoGain.gain.setValueAtTime(lfoDepth, startTime);
      lfo.connect(lfoGain);

      if (lfoTarget === 'filter') {
        lfoGain.connect(filter.frequency);
      }
      lfo.start(startTime);
      lfo.stop(releaseTime);
    }

    // 4. Create Oscillator 1 (or Noise Generator)
    let osc1Node;
    if (osc1Type === 'noise') {
      osc1Node = ctx.createBufferSource();
      osc1Node.buffer = this.getNoiseBuffer(ctx);
      osc1Node.loop = true;
    } else {
      osc1Node = ctx.createOscillator();
      osc1Node.type = osc1Type;
      osc1Node.frequency.setValueAtTime(freq, startTime);
    }

    // 5. Create Oscillator 2 (FM / AM)
    const osc2Node = ctx.createOscillator();
    osc2Node.type = osc2Type;
    const osc2Freq = freq * Math.pow(2, osc2DetuneSemitones / 12);
    osc2Node.frequency.setValueAtTime(osc2Freq, startTime);

    // FM Routing: Osc2 -> FMGain -> Osc1.frequency
    if (fmDepth > 0 && osc1Type !== 'noise') {
      const fmGainNode = ctx.createGain();
      fmGainNode.gain.setValueAtTime(fmDepth, startTime);
      osc2Node.connect(fmGainNode);
      fmGainNode.connect(osc1Node.frequency);
    }

    // AM Routing: Osc1 -> AMGainNode (modulated by Osc2)
    let finalSourceNode = osc1Node;
    if (amDepth > 0) {
      const amGainNode = ctx.createGain();
      amGainNode.gain.setValueAtTime(1 - amDepth, startTime);
      
      const amModGain = ctx.createGain();
      amModGain.gain.setValueAtTime(amDepth, startTime);
      
      osc2Node.connect(amModGain);
      amModGain.connect(amGainNode.gain);

      osc1Node.connect(amGainNode);
      finalSourceNode = amGainNode;
    }

    finalSourceNode.connect(filter);

    // Start and Stop Nodes
    osc1Node.start(startTime);
    osc1Node.stop(releaseTime);

    osc2Node.start(startTime);
    osc2Node.stop(releaseTime);
  }
}
