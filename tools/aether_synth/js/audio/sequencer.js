/**
 * 16-Step Sequencer with High-Precision Scheduler (25ms Lookahead / 100ms Timer)
 */

const NOTE_FREQS = {
  'C2': 65.41, 'D2': 73.42, 'E2': 82.41, 'F2': 87.31, 'G2': 98.00, 'A2': 110.00, 'B2': 123.47,
  'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
  'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88
};

export class Sequencer {
  constructor(engine, synthVoice, drumSynth) {
    this.engine = engine;
    this.synthVoice = synthVoice;
    this.drumSynth = drumSynth;

    this.isPlaying = false;
    this.currentStep = 0;
    this.bpm = 120;
    this.swing = 0; // 0 - 50%

    this.lookaheadMs = 25;
    this.scheduleAheadSec = 0.1;
    this.nextStepTime = 0.0;
    this.timerId = null;

    // 16-step grid state for 5 tracks
    this.tracks = [
      { id: 'kick', type: 'drum', label: 'Bumbo (Kick)', steps: Array(16).fill(false) },
      { id: 'snare', type: 'drum', label: 'Caixa (Snare)', steps: Array(16).fill(false) },
      { id: 'hihat', type: 'drum', label: 'Chimbal (HiHat)', steps: Array(16).fill(false) },
      { id: 'lead', type: 'synth', label: 'Sintetizador', steps: Array(16).fill(false), notes: Array(16).fill('C4') },
      { id: 'bass', type: 'synth', label: 'Linha de Baixo', steps: Array(16).fill(false), notes: Array(16).fill('C2') }
    ];

    this.onStepChangeCallbacks = [];
    this.onLoopCompleteCallbacks = [];
  }

  onStepChange(callback) {
    this.onStepChangeCallbacks.push(callback);
  }

  onLoopComplete(callback) {
    this.onLoopCompleteCallbacks.push(callback);
  }

  start(synthParamsGetter) {
    if (this.isPlaying) return;
    this.engine.init();
    this.engine.resume();

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = this.engine.getCurrentTime();
    this.synthParamsGetter = synthParamsGetter;

    this.scheduler();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  scheduler() {
    while (this.nextStepTime < this.engine.getCurrentTime() + this.scheduleAheadSec) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }
    if (this.isPlaying) {
      this.timerId = setTimeout(() => this.scheduler(), this.lookaheadMs);
    }
  }

  scheduleStep(stepIndex, time) {
    const ctx = this.engine.ctx;
    const dest = this.engine.masterGain;
    const synthParams = this.synthParamsGetter ? this.synthParamsGetter() : {};

    // Notify UI listeners about current step
    setTimeout(() => {
      this.onStepChangeCallbacks.forEach(cb => cb(stepIndex));
    }, Math.max(0, (time - this.engine.getCurrentTime()) * 1000));

    // Execute scheduled notes
    this.tracks.forEach(track => {
      const isAudible = this.isTrackAudibleGetter ? this.isTrackAudibleGetter(track.id) : true;
      if (track.steps[stepIndex] && isAudible) {
        if (track.type === 'drum') {
          this.drumSynth.trigger(ctx, dest, track.id, time);
        } else if (track.type === 'synth') {
          const noteName = track.notes[stepIndex] || 'C4';
          const freq = NOTE_FREQS[noteName] || 261.63;
          this.synthVoice.triggerNote(ctx, dest, freq, time, 0.15, synthParams);
        }
      }
    });
  }

  advanceStep() {
    const secondsPerStep = (60.0 / this.bpm) / 4.0;
    // Calculate swing offset on odd steps
    let stepDuration = secondsPerStep;
    if (this.currentStep % 2 === 1 && this.swing > 0) {
      stepDuration += secondsPerStep * (this.swing / 100);
    }

    this.nextStepTime += stepDuration;
    
    if (this.currentStep === 15) {
      this.onLoopCompleteCallbacks.forEach(cb => cb());
    }

    this.currentStep = (this.currentStep + 1) % 16;
  }
}
