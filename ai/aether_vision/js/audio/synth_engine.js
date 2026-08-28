/**
 * Aether Vision Sandbox - Web Audio Synthesis Engine
 * 
 * Provides a low-latency Web Audio API graph with dual-oscillator subtractive synthesis,
 * anti-click parameter ramping, Biquad resonant filter, analog delay FX loop,
 * stereo panning, spatial dual-hand modulation, and retro arcade sound effects.
 */

import { midiToFreq, quantizeToScale, continuousFreq, SCALES } from './scales.js';

export class SynthEngine {
    /**
     * @param {object} [options={}] - Engine configuration options
     * @param {Function} [options.AudioContext] - Custom AudioContext class (useful for tests/mocking)
     * @param {number} [options.masterVolume=0.7] - Master volume (0.0 to 1.0)
     * @param {string} [options.oscillatorType='sine'] - Primary oscillator waveform ('sine'|'triangle'|'sawtooth'|'square')
     * @param {number} [options.filterCutoff=2500] - Lowpass filter cutoff frequency in Hz
     * @param {number} [options.filterQ=3.0] - Filter resonance (Q factor)
     * @param {number} [options.delayTime=0.25] - Delay time in seconds
     * @param {number} [options.delayFeedback=0.35] - Delay feedback gain (0.0 to 0.9)
     * @param {number} [options.reverbWet=0.25] - Delay/Wet mix level (0.0 to 1.0)
     * @param {boolean} [options.isQuantized=true] - Whether pitch is quantized to musical scale
     * @param {string} [options.scaleKey='pentatonic_major'] - Active musical scale key
     * @param {number} [options.baseOctave=3] - Base octave for lowest note
     * @param {number} [options.octavesSpan=2] - Number of octaves spanned
     * @param {number} [options.glideTime=0.035] - Pitch portamento/glide time constant in seconds
     */
    constructor(options = {}) {
        this.AudioContextClass = options.AudioContext || 
            (typeof globalThis !== 'undefined' ? (globalThis.AudioContext || globalThis.webkitAudioContext) : null);

        this.masterVolume = options.masterVolume ?? 0.7;
        this.oscillatorType = options.oscillatorType ?? 'sine';
        this.filterCutoff = options.filterCutoff ?? 2500;
        this.filterQ = options.filterQ ?? 3.0;
        this.delayTime = options.delayTime ?? 0.25;
        this.delayFeedback = options.delayFeedback ?? 0.35;
        this.defaultDelayFeedback = this.delayFeedback;
        this.reverbWet = options.reverbWet ?? 0.25;
        this.defaultReverbWet = this.reverbWet;
        this.isQuantized = options.isQuantized ?? true;
        this.scaleKey = options.scaleKey ?? 'pentatonic_major';
        this.baseOctave = options.baseOctave ?? 3;
        this.octavesSpan = options.octavesSpan ?? 2;
        this.glideTime = options.glideTime ?? 0.035;

        // Telemetry and active status
        this.isUnlocked = false;
        this.isPlaying = false;
        this.currentFreq = 440;
        this.currentMidi = 69;
        this.currentNote = 'A4';
        this.currentGain = 0;
        this.currentCutoff = this.filterCutoff;
        this.currentResonance = this.filterQ;
        this.currentPan = 0;

        // Audio node references
        this.ctx = null;
        this.osc1 = null;
        this.osc2 = null;
        this.osc1Gain = null;
        this.osc2Gain = null;
        this.voiceGain = null;
        this.filterNode = null;
        this.pannerNode = null;
        this.dryGain = null;
        this.delayNode = null;
        this.delayFeedbackNode = null;
        this.delayFilterNode = null;
        this.delayWetGain = null;
        this.compressorNode = null;
        this.masterGainNode = null;

        // Initialize audio graph if AudioContext is available
        if (this.AudioContextClass) {
            try {
                this.initAudioGraph();
            } catch (err) {
                console.warn('SynthEngine: Deferred AudioContext initialization until user gesture.', err);
            }
        }
    }

    /**
     * Constructs the Web Audio routing graph.
     */
    initAudioGraph() {
        if (this.ctx) return;
        if (!this.AudioContextClass) {
            console.warn('SynthEngine: AudioContext is not supported in this environment.');
            return;
        }

        this.ctx = new this.AudioContextClass();

        // 1. Master Output Chain: Compressor (Limiter) -> Master Gain -> Destination
        if (typeof this.ctx.createDynamicsCompressor === 'function') {
            this.compressorNode = this.ctx.createDynamicsCompressor();
            if (this.compressorNode.threshold) this.compressorNode.threshold.value = -12;
            if (this.compressorNode.knee) this.compressorNode.knee.value = 10;
            if (this.compressorNode.ratio) this.compressorNode.ratio.value = 6;
            if (this.compressorNode.attack) this.compressorNode.attack.value = 0.003;
            if (this.compressorNode.release) this.compressorNode.release.value = 0.15;
        } else {
            this.compressorNode = this.ctx.createGain();
        }

        this.masterGainNode = this.ctx.createGain();
        if (this.masterGainNode.gain) {
            this.masterGainNode.gain.value = this.masterVolume;
        }

        this.compressorNode.connect(this.masterGainNode);
        if (this.ctx.destination) {
            this.masterGainNode.connect(this.ctx.destination);
        }

        // 2. Spatial & Tone Chain: Biquad Filter -> Stereo Panner -> Dry/Wet FX Bus
        this.filterNode = this.ctx.createBiquadFilter();
        this.filterNode.type = 'lowpass';
        if (this.filterNode.frequency) this.filterNode.frequency.value = this.filterCutoff;
        if (this.filterNode.Q) this.filterNode.Q.value = this.filterQ;

        if (typeof this.ctx.createStereoPanner === 'function') {
            try {
                this.pannerNode = this.ctx.createStereoPanner();
                if (this.pannerNode.pan) this.pannerNode.pan.value = 0;
                this.filterNode.connect(this.pannerNode);
            } catch (e) {
                this.pannerNode = null;
            }
        }

        const spatialOutput = this.pannerNode || this.filterNode;

        // Dry bus
        this.dryGain = this.ctx.createGain();
        if (this.dryGain.gain) {
            this.dryGain.gain.value = 1.0 - this.reverbWet * 0.5;
        }
        spatialOutput.connect(this.dryGain);
        this.dryGain.connect(this.compressorNode);

        // Delay FX loop: Delay -> Warm LP Filter -> Feedback -> Delay
        if (typeof this.ctx.createDelay === 'function') {
            this.delayNode = this.ctx.createDelay(2.0);
            if (this.delayNode.delayTime) this.delayNode.delayTime.value = this.delayTime;

            this.delayFilterNode = this.ctx.createBiquadFilter();
            this.delayFilterNode.type = 'lowpass';
            if (this.delayFilterNode.frequency) this.delayFilterNode.frequency.value = 3200;

            this.delayFeedbackNode = this.ctx.createGain();
            if (this.delayFeedbackNode.gain) this.delayFeedbackNode.gain.value = this.delayFeedback;

            this.delayWetGain = this.ctx.createGain();
            if (this.delayWetGain.gain) this.delayWetGain.gain.value = this.reverbWet;

            spatialOutput.connect(this.delayNode);
            this.delayNode.connect(this.delayFilterNode);
            this.delayFilterNode.connect(this.delayFeedbackNode);
            this.delayFeedbackNode.connect(this.delayNode);

            this.delayFilterNode.connect(this.delayWetGain);
            this.delayWetGain.connect(this.compressorNode);
        }

        // 3. Synth Voice: Dual Oscillators -> VCA (Voice Gain) -> Filter
        this.voiceGain = this.ctx.createGain();
        if (this.voiceGain.gain) {
            this.voiceGain.gain.value = 0.0;
        }
        this.voiceGain.connect(this.filterNode);

        // Primary Oscillator
        this.osc1 = this.ctx.createOscillator();
        this.osc1.type = this.oscillatorType;
        if (this.osc1.frequency) this.osc1.frequency.value = this.currentFreq;

        this.osc1Gain = this.ctx.createGain();
        if (this.osc1Gain.gain) this.osc1Gain.gain.value = 0.75;
        this.osc1.connect(this.osc1Gain);
        this.osc1Gain.connect(this.voiceGain);

        // Secondary / Sub Oscillator (Octave down or subtle detune)
        this.osc2 = this.ctx.createOscillator();
        this.osc2.type = 'sine';
        if (this.osc2.frequency) this.osc2.frequency.value = this.currentFreq * 0.5;

        this.osc2Gain = this.ctx.createGain();
        if (this.osc2Gain.gain) this.osc2Gain.gain.value = 0.35;
        this.osc2.connect(this.osc2Gain);
        this.osc2Gain.connect(this.voiceGain);

        // Start oscillators running silently (VCA gates sound)
        try {
            if (typeof this.osc1.start === 'function') this.osc1.start();
            if (typeof this.osc2.start === 'function') this.osc2.start();
        } catch (e) {}
    }

    /**
     * Unlocks the AudioContext following user gesture requirement.
     * @returns {Promise<boolean>}
     */
    async unlock() {
        if (!this.ctx) {
            this.initAudioGraph();
        }
        if (this.ctx && typeof this.ctx.resume === 'function' && this.ctx.state === 'suspended') {
            try {
                await this.ctx.resume();
            } catch (err) {
                console.error('SynthEngine unlock error:', err);
            }
        }
        this.isUnlocked = this.ctx ? (this.ctx.state === 'running' || this.ctx.state === 'suspended') : false;
        return this.isUnlocked;
    }

    /**
     * Safe parameter ramping helper to prevent acoustic clicks.
     * @private
     */
    rampParam(audioParam, targetValue, timeConstant = 0.03) {
        if (!audioParam) return;
        if (this.ctx && typeof audioParam.setTargetAtTime === 'function') {
            try {
                if (typeof audioParam.cancelScheduledValues === 'function') {
                    audioParam.cancelScheduledValues(this.ctx.currentTime);
                }
                audioParam.setTargetAtTime(targetValue, this.ctx.currentTime, timeConstant);
            } catch (e) {
                audioParam.value = targetValue;
            }
        } else {
            audioParam.value = targetValue;
        }
    }

    /**
     * Updates pitch, volume and timbre based on Right Hand coordinates and gesture.
     * 
     * @param {object} coordsOrHandData - Coordinates {x, y, z} or full hand data object
     * @param {string|object} [gestureOrOptions='open_palm'] - Gesture name or options
     * @param {object} [options={}] - Additional settings
     * @returns {object} Audio state snapshot
     */
    updateRightHand(coordsOrHandData, gestureOrOptions = 'open_palm', options = {}) {
        let x = 0.5;
        let y = 0.5;
        let z = 0.0;
        let gesture = 'open_palm';

        if (coordsOrHandData && typeof coordsOrHandData === 'object') {
            if ('palmCenter' in coordsOrHandData && coordsOrHandData.palmCenter) {
                x = coordsOrHandData.palmCenter.x ?? 0.5;
                y = coordsOrHandData.palmCenter.y ?? 0.5;
                z = coordsOrHandData.palmCenter.z ?? 0.0;
            } else if ('x' in coordsOrHandData) {
                x = coordsOrHandData.x ?? 0.5;
                y = coordsOrHandData.y ?? 0.5;
                z = coordsOrHandData.z ?? 0.0;
            }

            if ('gesture' in coordsOrHandData) {
                gesture = typeof coordsOrHandData.gesture === 'string' 
                    ? coordsOrHandData.gesture 
                    : (coordsOrHandData.gesture?.name || 'none');
            }
        }

        if (typeof gestureOrOptions === 'string') {
            gesture = gestureOrOptions;
        } else if (gestureOrOptions && typeof gestureOrOptions === 'object' && gestureOrOptions.name) {
            gesture = gestureOrOptions.name;
        }

        // 1. Pitch & Frequency Calculation
        let targetFreq = 440;
        let targetMidi = 69;
        let noteName = 'A4';

        if (this.isQuantized) {
            const quantized = quantizeToScale(x, this.scaleKey, this.baseOctave, this.octavesSpan);
            targetFreq = quantized.freq;
            targetMidi = quantized.midi;
            noteName = quantized.noteName;
        } else {
            const cont = continuousFreq(x, this.baseOctave, this.octavesSpan);
            targetFreq = cont.freq;
            targetMidi = cont.midi;
            noteName = cont.noteName;
        }

        this.currentFreq = targetFreq;
        this.currentMidi = targetMidi;
        this.currentNote = noteName;

        if (this.osc1 && this.osc1.frequency) {
            this.rampParam(this.osc1.frequency, targetFreq, this.glideTime);
        }
        if (this.osc2 && this.osc2.frequency) {
            this.rampParam(this.osc2.frequency, targetFreq * 0.5, this.glideTime);
        }

        // 2. Volume & Gate Control
        // Fist, pinch, none or missing coordinates gate audio off
        if (!coordsOrHandData || gesture === 'fist' || gesture === 'pinch' || gesture === 'none') {
            this.silence();
        } else {
            // Open palm, pointing, peace, thumbs up gate audio on
            this.isPlaying = true;

            // Inverted vertical position: Y=0 (top) is max volume, Y=1 (bottom) is min volume
            const normalizedHeight = Math.max(0, Math.min(1, 1.0 - y));
            let targetGain = normalizedHeight * this.masterVolume;

            // Gesture nuances:
            if (gesture === 'pointing') {
                targetGain = Math.min(1.0, targetGain * 1.15);
            } else if (gesture === 'peace') {
                targetGain = targetGain * 0.85;
            }

            this.currentGain = targetGain;
            if (this.voiceGain && this.voiceGain.gain) {
                this.rampParam(this.voiceGain.gain, targetGain, 0.02);
            }
        }

        return this.getState();
    }

    /**
     * Updates filter cutoff, resonance and FX based on Left Hand coordinates and gestures.
     * 
     * @param {object} coordsOrHandData - Coordinates {x, y, z} or full hand data
     * @param {string|object} [gestureOrOptions='open_palm'] - Gesture name or object
     * @returns {object} Audio state snapshot
     */
    updateLeftHand(coordsOrHandData, gestureOrOptions = 'open_palm') {
        let x = 0.5;
        let y = 0.5;
        let z = 0.0;
        let gesture = 'open_palm';

        if (coordsOrHandData && typeof coordsOrHandData === 'object') {
            if ('palmCenter' in coordsOrHandData && coordsOrHandData.palmCenter) {
                x = coordsOrHandData.palmCenter.x ?? 0.5;
                y = coordsOrHandData.palmCenter.y ?? 0.5;
                z = coordsOrHandData.palmCenter.z ?? 0.0;
            } else if ('x' in coordsOrHandData) {
                x = coordsOrHandData.x ?? 0.5;
                y = coordsOrHandData.y ?? 0.5;
                z = coordsOrHandData.z ?? 0.0;
            }

            if ('gesture' in coordsOrHandData) {
                gesture = typeof coordsOrHandData.gesture === 'string'
                    ? coordsOrHandData.gesture
                    : (coordsOrHandData.gesture?.name || 'none');
            }
        }

        if (typeof gestureOrOptions === 'string') {
            gesture = gestureOrOptions;
        } else if (gestureOrOptions && typeof gestureOrOptions === 'object' && gestureOrOptions.name) {
            gesture = gestureOrOptions.name;
        }

        if (!coordsOrHandData || gesture === 'none') {
            this.setFilterCutoff(this.filterCutoff);
            this.setFilterQ(this.filterQ);
            this.setDelayFeedback(this.defaultDelayFeedback);
            this.setReverbWet(this.defaultReverbWet);
            return this.getState();
        }

        // 1. Filter Cutoff (Y-axis): Top (0.0) = 12000 Hz, Bottom (1.0) = 200 Hz
        const heightInverted = Math.max(0, Math.min(1, 1.0 - y));
        const cutoff = 200 * Math.pow(12000 / 200, heightInverted);
        this.setFilterCutoff(cutoff);

        // 2. Filter Resonance Q (X-axis): Left (0.0) = 0.5, Right (1.0) = 14.0
        const clampedX = Math.max(0, Math.min(1, x));
        const qVal = 0.5 + clampedX * 13.5;
        this.setFilterQ(qVal);

        // 3. Pinch or Thumbs Up boosts FX Space Delay
        if (gesture === 'pinch') {
            this.setDelayFeedback(0.70);
            this.setReverbWet(0.60);
        } else if (gesture === 'thumbs_up') {
            this.setDelayFeedback(0.55);
            this.setReverbWet(0.45);
        } else {
            this.setDelayFeedback(this.defaultDelayFeedback);
            this.setReverbWet(this.defaultReverbWet);
        }

        // 4. Stereo Panning based on Left Hand position
        const pan = Math.max(-1, Math.min(1, (clampedX - 0.5) * 2));
        this.setPanning(pan);

        return this.getState();
    }

    /**
     * Silences the main synth voice with anti-click decay.
     */
    silence() {
        this.isPlaying = false;
        this.currentGain = 0.0;
        if (this.voiceGain && this.voiceGain.gain) {
            this.rampParam(this.voiceGain.gain, 0.0, 0.035);
        }
    }

    /**
     * Plays dynamic synthesized retro arcade sound effects.
     * 
     * @param {string} [type='deflect'] - FX type: 'deflect' | 'slice' | 'combo' | 'score' | 'game_over' | 'laser'
     */
    playArcadeHit(type = 'deflect') {
        if (!this.ctx) {
            this.initAudioGraph();
        }
        if (!this.ctx || !this.masterGainNode) return;

        const now = this.ctx.currentTime || 0;
        const fxOsc = this.ctx.createOscillator();
        const fxGain = this.ctx.createGain();

        fxOsc.connect(fxGain);
        fxGain.connect(this.masterGainNode);

        switch (type) {
            case 'deflect': {
                fxOsc.type = 'triangle';
                if (fxOsc.frequency) {
                    if (typeof fxOsc.frequency.setValueAtTime === 'function') fxOsc.frequency.setValueAtTime(280, now);
                    if (typeof fxOsc.frequency.exponentialRampToValueAtTime === 'function') {
                        fxOsc.frequency.exponentialRampToValueAtTime(840, now + 0.12);
                    } else if (typeof fxOsc.frequency.setValueAtTime === 'function') {
                        fxOsc.frequency.setValueAtTime(840, now + 0.12);
                    } else {
                        fxOsc.frequency.value = 840;
                    }
                }

                if (fxGain.gain) {
                    if (typeof fxGain.gain.setValueAtTime === 'function') fxGain.gain.setValueAtTime(0.45 * this.masterVolume, now);
                    if (typeof fxGain.gain.setTargetAtTime === 'function') {
                        fxGain.gain.setTargetAtTime(0.001, now + 0.02, 0.03);
                    } else {
                        fxGain.gain.value = 0;
                    }
                }

                if (typeof fxOsc.start === 'function') fxOsc.start(now);
                if (typeof fxOsc.stop === 'function') fxOsc.stop(now + 0.14);
                break;
            }

            case 'slice': {
                fxOsc.type = 'sawtooth';
                if (fxOsc.frequency) {
                    if (typeof fxOsc.frequency.setValueAtTime === 'function') fxOsc.frequency.setValueAtTime(1400, now);
                    if (typeof fxOsc.frequency.exponentialRampToValueAtTime === 'function') {
                        fxOsc.frequency.exponentialRampToValueAtTime(160, now + 0.09);
                    } else if (typeof fxOsc.frequency.setValueAtTime === 'function') {
                        fxOsc.frequency.setValueAtTime(160, now + 0.09);
                    } else {
                        fxOsc.frequency.value = 160;
                    }
                }

                if (fxGain.gain) {
                    if (typeof fxGain.gain.setValueAtTime === 'function') fxGain.gain.setValueAtTime(0.4 * this.masterVolume, now);
                    if (typeof fxGain.gain.setTargetAtTime === 'function') {
                        fxGain.gain.setTargetAtTime(0.001, now + 0.01, 0.025);
                    } else {
                        fxGain.gain.value = 0;
                    }
                }

                if (typeof fxOsc.start === 'function') fxOsc.start(now);
                if (typeof fxOsc.stop === 'function') fxOsc.stop(now + 0.11);
                break;
            }

            case 'combo': {
                fxOsc.type = 'sine';
                if (fxOsc.frequency) {
                    if (typeof fxOsc.frequency.setValueAtTime === 'function') {
                        fxOsc.frequency.setValueAtTime(659.25, now);
                        fxOsc.frequency.setValueAtTime(830.61, now + 0.06);
                        fxOsc.frequency.setValueAtTime(987.77, now + 0.12);
                    } else {
                        fxOsc.frequency.value = 987.77;
                    }
                }

                if (fxGain.gain) {
                    if (typeof fxGain.gain.setValueAtTime === 'function') fxGain.gain.setValueAtTime(0.4 * this.masterVolume, now);
                    if (typeof fxGain.gain.setTargetAtTime === 'function') {
                        fxGain.gain.setTargetAtTime(0.001, now + 0.14, 0.05);
                    } else {
                        fxGain.gain.value = 0;
                    }
                }

                if (typeof fxOsc.start === 'function') fxOsc.start(now);
                if (typeof fxOsc.stop === 'function') fxOsc.stop(now + 0.24);
                break;
            }

            case 'score': {
                fxOsc.type = 'sine';
                if (fxOsc.frequency) {
                    if (typeof fxOsc.frequency.setValueAtTime === 'function') {
                        fxOsc.frequency.setValueAtTime(1046.50, now);
                        fxOsc.frequency.setValueAtTime(1567.98, now + 0.07);
                    } else {
                        fxOsc.frequency.value = 1567.98;
                    }
                }

                if (fxGain.gain) {
                    if (typeof fxGain.gain.setValueAtTime === 'function') fxGain.gain.setValueAtTime(0.35 * this.masterVolume, now);
                    if (typeof fxGain.gain.setTargetAtTime === 'function') {
                        fxGain.gain.setTargetAtTime(0.001, now + 0.08, 0.05);
                    } else {
                        fxGain.gain.value = 0;
                    }
                }

                if (typeof fxOsc.start === 'function') fxOsc.start(now);
                if (typeof fxOsc.stop === 'function') fxOsc.stop(now + 0.22);
                break;
            }

            case 'game_over': {
                fxOsc.type = 'sawtooth';
                if (fxOsc.frequency) {
                    if (typeof fxOsc.frequency.setValueAtTime === 'function') fxOsc.frequency.setValueAtTime(440, now);
                    if (typeof fxOsc.frequency.exponentialRampToValueAtTime === 'function') {
                        fxOsc.frequency.exponentialRampToValueAtTime(65, now + 0.45);
                    } else if (typeof fxOsc.frequency.setValueAtTime === 'function') {
                        fxOsc.frequency.setValueAtTime(65, now + 0.45);
                    } else {
                        fxOsc.frequency.value = 65;
                    }
                }

                if (fxGain.gain) {
                    if (typeof fxGain.gain.setValueAtTime === 'function') fxGain.gain.setValueAtTime(0.5 * this.masterVolume, now);
                    if (typeof fxGain.gain.setTargetAtTime === 'function') {
                        fxGain.gain.setTargetAtTime(0.001, now + 0.3, 0.08);
                    } else {
                        fxGain.gain.value = 0;
                    }
                }

                if (typeof fxOsc.start === 'function') fxOsc.start(now);
                if (typeof fxOsc.stop === 'function') fxOsc.stop(now + 0.5);
                break;
            }

            case 'laser':
            default: {
                fxOsc.type = 'sawtooth';
                if (fxOsc.frequency) {
                    if (typeof fxOsc.frequency.setValueAtTime === 'function') fxOsc.frequency.setValueAtTime(1800, now);
                    if (typeof fxOsc.frequency.exponentialRampToValueAtTime === 'function') {
                        fxOsc.frequency.exponentialRampToValueAtTime(120, now + 0.1);
                    } else if (typeof fxOsc.frequency.setValueAtTime === 'function') {
                        fxOsc.frequency.setValueAtTime(120, now + 0.1);
                    } else {
                        fxOsc.frequency.value = 120;
                    }
                }

                if (fxGain.gain) {
                    if (typeof fxGain.gain.setValueAtTime === 'function') fxGain.gain.setValueAtTime(0.4 * this.masterVolume, now);
                    if (typeof fxGain.gain.setTargetAtTime === 'function') {
                        fxGain.gain.setTargetAtTime(0.001, now + 0.02, 0.03);
                    } else {
                        fxGain.gain.value = 0;
                    }
                }

                if (typeof fxOsc.start === 'function') fxOsc.start(now);
                if (typeof fxOsc.stop === 'function') fxOsc.stop(now + 0.13);
                break;
            }
        }

        setTimeout(() => {
            try {
                if (typeof fxOsc.disconnect === 'function') fxOsc.disconnect();
                if (typeof fxGain.disconnect === 'function') fxGain.disconnect();
            } catch (e) {}
        }, 600);
    }

    /**
     * Sets primary oscillator waveform ('sine', 'triangle', 'sawtooth', 'square').
     * @param {string} type
     */
    setOscillatorType(type) {
        const validTypes = ['sine', 'triangle', 'sawtooth', 'square'];
        if (validTypes.includes(type)) {
            this.oscillatorType = type;
            if (this.osc1) {
                this.osc1.type = type;
            }
        }
    }

    /**
     * Sets active musical scale key.
     * @param {string} scaleKey
     */
    setScale(scaleKey) {
        if (SCALES[scaleKey]) {
            this.scaleKey = scaleKey;
        }
    }

    /**
     * Sets base octave.
     * @param {number} octave
     */
    setBaseOctave(octave) {
        this.baseOctave = Math.max(0, Math.min(8, Math.round(octave)));
    }

    /**
     * Sets octaves span.
     * @param {number} span
     */
    setOctavesSpan(span) {
        this.octavesSpan = Math.max(1, Math.min(6, Math.round(span)));
    }

    /**
     * Sets scale quantization flag.
     * @param {boolean} isQuantized
     */
    setQuantized(isQuantized) {
        this.isQuantized = !!isQuantized;
    }

    /**
     * Sets master volume level (0.0 to 1.0).
     * @param {number} volume
     */
    setMasterVolume(volume) {
        this.masterVolume = Math.max(0, Math.min(1, volume));
        if (this.masterGainNode && this.masterGainNode.gain) {
            this.rampParam(this.masterGainNode.gain, this.masterVolume, 0.02);
        }
    }

    /**
     * Sets lowpass filter cutoff frequency in Hz.
     * @param {number} freq
     */
    setFilterCutoff(freq) {
        this.currentCutoff = Math.max(50, Math.min(20000, freq));
        if (this.filterNode && this.filterNode.frequency) {
            this.rampParam(this.filterNode.frequency, this.currentCutoff, 0.03);
        }
    }

    /**
     * Sets filter resonance Q factor.
     * @param {number} q
     */
    setFilterQ(q) {
        this.currentResonance = Math.max(0.1, Math.min(25.0, q));
        if (this.filterNode && this.filterNode.Q) {
            this.rampParam(this.filterNode.Q, this.currentResonance, 0.03);
        }
    }

    /**
     * Sets delay feedback gain.
     * @param {number} feedback
     */
    setDelayFeedback(feedback) {
        this.delayFeedback = Math.max(0, Math.min(0.92, feedback));
        if (this.delayFeedbackNode && this.delayFeedbackNode.gain) {
            this.rampParam(this.delayFeedbackNode.gain, this.delayFeedback, 0.03);
        }
    }

    /**
     * Sets delay time in seconds.
     * @param {number} time
     */
    setDelayTime(time) {
        this.delayTime = Math.max(0.01, Math.min(2.0, time));
        if (this.delayNode && this.delayNode.delayTime) {
            this.rampParam(this.delayNode.delayTime, this.delayTime, 0.03);
        }
    }

    /**
     * Sets delay/reverb wet mix level.
     * @param {number} wet
     */
    setReverbWet(wet) {
        this.reverbWet = Math.max(0, Math.min(1.0, wet));
        if (this.delayWetGain && this.delayWetGain.gain) {
            this.rampParam(this.delayWetGain.gain, this.reverbWet, 0.03);
        }
        if (this.dryGain && this.dryGain.gain) {
            this.rampParam(this.dryGain.gain, 1.0 - this.reverbWet * 0.5, 0.03);
        }
    }

    /**
     * Sets stereo panning (-1.0 to 1.0).
     * @param {number} pan
     */
    setPanning(pan) {
        this.currentPan = Math.max(-1.0, Math.min(1.0, pan));
        if (this.pannerNode && this.pannerNode.pan) {
            this.rampParam(this.pannerNode.pan, this.currentPan, 0.03);
        }
    }

    /**
     * Sets pitch portamento glide time.
     * @param {number} timeInSeconds
     */
    setGlideTime(timeInSeconds) {
        this.glideTime = Math.max(0.001, Math.min(0.5, timeInSeconds));
    }

    /**
     * Returns a snapshot of the current audio synthesis telemetry.
     * @returns {object}
     */
    getState() {
        return {
            isUnlocked: this.isUnlocked,
            isPlaying: this.isPlaying,
            currentFreq: Math.round(this.currentFreq * 100) / 100,
            currentMidi: Math.round(this.currentMidi * 100) / 100,
            currentNote: this.currentNote,
            currentGain: Math.round(this.currentGain * 100) / 100,
            currentCutoff: Math.round(this.currentCutoff),
            currentResonance: Math.round(this.currentResonance * 10) / 10,
            currentPan: Math.round(this.currentPan * 100) / 100,
            masterVolume: this.masterVolume,
            oscillatorType: this.oscillatorType,
            scaleKey: this.scaleKey,
            baseOctave: this.baseOctave,
            octavesSpan: this.octavesSpan,
            isQuantized: this.isQuantized,
            delayFeedback: this.delayFeedback,
            reverbWet: this.reverbWet
        };
    }

    /**
     * Gracefully cleans up all audio nodes and context.
     */
    destroy() {
        this.silence();
        try {
            if (this.osc1 && typeof this.osc1.stop === 'function') {
                this.osc1.stop();
                if (typeof this.osc1.disconnect === 'function') this.osc1.disconnect();
            }
            if (this.osc2 && typeof this.osc2.stop === 'function') {
                this.osc2.stop();
                if (typeof this.osc2.disconnect === 'function') this.osc2.disconnect();
            }
            if (this.ctx && typeof this.ctx.close === 'function') {
                this.ctx.close();
            }
        } catch (e) {}

        this.ctx = null;
        this.isUnlocked = false;
        this.isPlaying = false;
    }
}

/**
 * Singleton instance shared across the Aether Vision sandbox.
 */
export const synthEngine = new SynthEngine();
