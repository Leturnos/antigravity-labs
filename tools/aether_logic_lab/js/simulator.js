/**
 * Aether Logic Lab - Simulation Engine, Signal Propagation & Cycle Relaxation
 */

import { SignalState } from './types.js';
import { COMPONENT_DEFINITIONS } from './components.js';

export class Simulator {
  constructor(circuit, onBuzzerStateChange = null) {
    this.circuit = circuit;
    this.isRunning = true;
    this.speed = 1.0; // Speed factor
    this.isOscillating = false;
    this.stepCount = 0;
    this.lastTickTime = performance.now();
    this.onBuzzerStateChange = onBuzzerStateChange;

    this.waveformHistory = new Map(); // key: compId_pinId -> Array of { time, state }
    this.maxWaveformSamples = 300;
  }

  start() {
    this.isRunning = true;
  }

  pause() {
    this.isRunning = false;
  }

  toggle() {
    this.isRunning = !this.isRunning;
    return this.isRunning;
  }

  update(now) {
    if (!this.isRunning) return;

    const deltaMs = now - this.lastTickTime;
    this.lastTickTime = now;

    // 1. Update clock sources
    this.updateClockGenerators(now);

    // 2. Propagate signals with relaxation loop
    this.propagate();

    // 3. Record waveform samples for probed pins
    this.recordWaveforms(now);

    // 4. Update audio buzzers
    this.checkBuzzers();

    this.stepCount++;
  }

  stepOnce() {
    const now = performance.now();
    // Toggle manual clocks if single stepping
    this.propagate();
    this.recordWaveforms(now);
    this.checkBuzzers();
    this.stepCount++;
  }

  updateClockGenerators(now) {
    for (const comp of this.circuit.components.values()) {
      if (comp.type === 'CLOCK') {
        const freq = comp.props.freq || 1.0;
        const periodMs = 1000 / freq;
        const phase = (now % periodMs) / periodMs;
        const newState = phase < 0.5 ? 1 : 0;
        comp.props.state = newState;
      }
    }
  }

  propagate() {
    const maxIterations = 24;
    let iteration = 0;
    let hasChanged = true;

    while (hasChanged && iteration < maxIterations) {
      hasChanged = false;
      iteration++;

      // A. Transfer signals through wires to destination pins
      // Clear all input states first
      const inputMap = new Map(); // key: "toCompId_toPinId" -> Array of states

      for (const wire of this.circuit.wires) {
        const srcComp = this.circuit.components.get(wire.fromCompId);
        if (!srcComp) continue;

        const srcSignal = srcComp.outputStates[wire.fromPinId] ?? SignalState.LOW;
        wire.state = srcSignal;

        const key = `${wire.toCompId}_${wire.toPinId}`;
        if (!inputMap.has(key)) {
          inputMap.set(key, []);
        }
        inputMap.get(key).push(srcSignal);
      }

      // Assign resolved inputs to components
      for (const comp of this.circuit.components.values()) {
        const def = COMPONENT_DEFINITIONS[comp.type];
        if (!def) continue;

        for (const inPin of def.inputs) {
          const key = `${comp.id}_${inPin.id}`;
          const incoming = inputMap.get(key);
          let resolved = SignalState.LOW;

          if (incoming && incoming.length > 0) {
            // Check for contention or Hi-Z
            const nonFloating = incoming.filter(s => s !== SignalState.FLOATING);
            if (nonFloating.length === 0) {
              resolved = SignalState.FLOATING;
            } else {
              const hasHigh = nonFloating.includes(SignalState.HIGH);
              const hasLow = nonFloating.includes(SignalState.LOW);
              if (hasHigh && hasLow) {
                // Short circuit / contention
                resolved = SignalState.ERROR;
              } else if (hasHigh) {
                resolved = SignalState.HIGH;
              } else {
                resolved = SignalState.LOW;
              }
            }
          }

          if (comp.inputStates[inPin.id] !== resolved) {
            comp.inputStates[inPin.id] = resolved;
            hasChanged = true;
          }
        }
      }

      // B. Evaluate all components
      for (const comp of this.circuit.components.values()) {
        const def = COMPONENT_DEFINITIONS[comp.type];
        if (!def || !def.evaluate) continue;

        const newOutputs = def.evaluate(comp, comp.inputStates);
        if (newOutputs) {
          for (const [outPinId, outVal] of Object.entries(newOutputs)) {
            if (comp.outputStates[outPinId] !== outVal) {
              comp.outputStates[outPinId] = outVal;
              hasChanged = true;
            }
          }
        }
      }
    }

    this.isOscillating = (iteration >= maxIterations && hasChanged);
  }

  recordWaveforms(now) {
    for (const probe of this.circuit.probedPins) {
      const key = `${probe.compId}_${probe.pinId}`;
      if (!this.waveformHistory.has(key)) {
        this.waveformHistory.set(key, []);
      }

      const comp = this.circuit.components.get(probe.compId);
      let val = SignalState.LOW;
      if (comp) {
        val = comp.outputStates[probe.pinId] ?? comp.inputStates[probe.pinId] ?? SignalState.LOW;
      }

      const samples = this.waveformHistory.get(key);
      samples.push({ time: now, val });

      if (samples.length > this.maxWaveformSamples) {
        samples.shift();
      }
    }
  }

  checkBuzzers() {
    let hasActiveBuzzer = false;
    let buzzerFreq = 440;

    for (const comp of this.circuit.components.values()) {
      if (comp.type === 'BUZZER') {
        const inVal = comp.inputStates['in'];
        if (inVal === SignalState.HIGH) {
          hasActiveBuzzer = true;
          buzzerFreq = comp.props.freq || 440;
          break;
        }
      }
    }

    if (this.onBuzzerStateChange) {
      this.onBuzzerStateChange(hasActiveBuzzer, buzzerFreq);
    }
  }

  clearWaveforms() {
    this.waveformHistory.clear();
  }
}
