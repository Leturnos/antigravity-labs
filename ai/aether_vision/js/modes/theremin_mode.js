/**
 * Aether Vision Sandbox - Air Theremin Experience Mode
 * 
 * Provides interactive dual-hand spatial audio modulation:
 * - Right Hand: X-axis spatial pitch quantization/continuous glissando, Y-axis inverted volume VCA gating,
 *   and gesture-based articulation (pointing accent, fist silence, open palm sustain).
 * - Left Hand: Y-axis Biquad resonant lowpass filter cutoff sweep, X-axis resonance (Q factor),
 *   and gesture-based FX space delay / reverb boosts (pinch, thumbs up).
 * - Visual scale fret lanes, real-time note highlighting, and reactive neon particle bursts.
 */

import { generateScaleNotes, quantizeToScale, continuousFreq, SCALES, midiToFreq, midiToNoteName } from '../audio/scales.js';
import { synthEngine } from '../audio/synth_engine.js';
import { appState } from '../core/state.js';
import { THEME_COLORS } from '../ui/renderer.js';

export class ThereminMode {
    /**
     * @param {Object} [options={}] - Mode configuration options
     * @param {import('../audio/synth_engine.js').SynthEngine} [options.synth] - Web Audio synthesizer engine instance
     * @param {import('../core/state.js').StateManager} [options.state] - State manager instance
     * @param {import('../ui/renderer.js').CanvasRenderer} [options.renderer] - Canvas overlay renderer instance
     * @param {import('../ui/hud.js').HudManager} [options.hud] - HUD telemetry manager instance
     * @param {string} [options.scaleKey='pentatonic_major'] - Initial musical scale
     * @param {number} [options.baseOctave=3] - Base octave for lowest note
     * @param {number} [options.octavesSpan=2] - Octaves spanned
     * @param {boolean} [options.isQuantized=true] - Whether pitch is quantized to discrete scale notes
     * @param {string} [options.oscillatorType='sine'] - Primary oscillator waveform
     */
    constructor(options = {}) {
        this.synth = options.synth || synthEngine;
        this.state = options.state || appState;
        this.renderer = options.renderer || null;
        this.hud = options.hud || null;

        this.isActive = false;
        this.scaleKey = options.scaleKey || (this.state ? this.state.get('activeScale', 'pentatonic_major') : 'pentatonic_major');
        this.baseOctave = options.baseOctave ?? (this.state ? this.state.get('baseOctave', 3) : 3);
        this.octavesSpan = options.octavesSpan ?? (this.state ? this.state.get('octavesSpan', 2) : 2);
        this.isQuantized = options.isQuantized ?? true;
        this.oscillatorType = options.oscillatorType || (this.state ? this.state.get('oscillatorType', 'sine') : 'sine');

        this.leadHand = options.leadHand || (this.state ? this.state.get('thereminLeadHand', 'auto') : 'auto');

        /** @type {Array<{ midi: number, freq: number, noteName: string }>} */
        this.activeScaleNotes = [];
        this.currentActiveNoteIndex = -1;

        this.lastRightHand = null;
        this.lastLeftHand = null;
        this.particleTimer = 0;
        this.trailHistory = [];

        this._rebuildScaleNotes();
    }

    /**
     * Sets lead / playing hand preference ('auto' | 'right' | 'left').
     * @param {'auto'|'right'|'left'} leadHand
     */
    setLeadHand(leadHand) {
        if (leadHand === 'auto' || leadHand === 'right' || leadHand === 'left') {
            this.leadHand = leadHand;
            if (this.state) {
                this.state.set('thereminLeadHand', leadHand);
            }
        }
    }

    /**
     * Rebuilds the cached scale notes list for visual lane rendering and quantization.
     * @private
     */
    _rebuildScaleNotes() {
        const midiNotes = generateScaleNotes(this.scaleKey, this.baseOctave, this.octavesSpan, 0);
        this.activeScaleNotes = midiNotes.map(midi => ({
            midi,
            freq: midiToFreq(midi),
            noteName: midiToNoteName(midi)
        }));
    }

    /**
     * Activates Air Theremin mode, syncs settings with synth engine and HUD.
     */
    activate() {
        this.isActive = true;
        this._rebuildScaleNotes();

        if (this.synth) {
            this.synth.setScale(this.scaleKey);
            this.synth.setBaseOctave(this.baseOctave);
            this.synth.setOctavesSpan(this.octavesSpan);
            this.synth.setQuantized(this.isQuantized);
            this.synth.setOscillatorType(this.oscillatorType);
        }

        if (this.state) {
            this.state.set('activeMode', 'theremin');
            this.state.set('activeScale', this.scaleKey);
            this.state.set('baseOctave', this.baseOctave);
            this.state.set('octavesSpan', this.octavesSpan);
        }

        if (this.hud) {
            this.hud.setActiveMode('theremin');
            this.hud.updateTheremin({
                scaleKey: this.scaleKey,
                octave: this.baseOctave
            });
        }
    }

    /**
     * Deactivates Air Theremin mode and silences audio output.
     */
    deactivate() {
        this.isActive = false;
        if (this.synth) {
            this.synth.silence();
        }
        this.currentActiveNoteIndex = -1;
        this.lastRightHand = null;
        this.lastLeftHand = null;
        this.trailHistory = [];
    }

    /**
     * Changes musical scale and rebuilds visual fret lanes.
     * @param {string} scaleKey - Key from SCALES
     */
    setScale(scaleKey) {
        if (SCALES[scaleKey]) {
            this.scaleKey = scaleKey;
            this._rebuildScaleNotes();

            if (this.synth) {
                this.synth.setScale(scaleKey);
            }
            if (this.state) {
                this.state.set('activeScale', scaleKey);
            }
            if (this.hud) {
                this.hud.updateTheremin({ scaleKey });
            }
        }
    }

    /**
     * Sets base octave and octave range span.
     * @param {number} baseOctave - Octave index [1..6]
     * @param {number} [octavesSpan=2] - Total octaves spanned [1..4]
     */
    setOctaves(baseOctave, octavesSpan = 2) {
        this.baseOctave = Math.max(1, Math.min(6, baseOctave));
        this.octavesSpan = Math.max(1, Math.min(4, octavesSpan));
        this._rebuildScaleNotes();

        if (this.synth) {
            this.synth.setBaseOctave(this.baseOctave);
            this.synth.setOctavesSpan(this.octavesSpan);
        }
        if (this.state) {
            this.state.set('baseOctave', this.baseOctave);
            this.state.set('octavesSpan', this.octavesSpan);
        }
        if (this.hud) {
            this.hud.updateTheremin({ octave: this.baseOctave });
        }
    }

    /**
     * Toggles scale quantization (true = discrete notes, false = continuous glide).
     * @param {boolean} quantized
     */
    setQuantized(quantized) {
        this.isQuantized = !!quantized;
        if (this.synth) {
            this.synth.setQuantized(this.isQuantized);
        }
        if (this.state) {
            this.state.set('isQuantized', this.isQuantized);
        }
    }

    /**
     * Sets primary oscillator waveform ('sine' | 'triangle' | 'sawtooth' | 'square').
     * @param {string} type 
     */
    setWaveform(type) {
        this.oscillatorType = type;
        if (this.synth) {
            this.synth.setOscillatorType(type);
        }
        if (this.state) {
            this.state.set('oscillatorType', type);
        }
    }

    /**
     * Updates Theremin audio graph, visual lanes, particle dynamics and telemetry from tracking results.
     * 
     * @param {Object} trackingResults - Output from HandTracker { hands: [...] }
     * @param {number} [dt=0.016] - Delta time in seconds
     * @returns {Object} Mode telemetry snapshot
     */
    update(trackingResults, dt = 0.016) {
        if (!this.isActive) {
            return {
                isActive: false,
                isPlaying: false,
                currentNote: '--',
                currentFreq: 0,
                currentGain: 0,
                activeNoteIndex: -1
            };
        }

        const hands = trackingResults?.hands || [];
        let pitchHand = null;
        let filterHand = null;

        if (hands.length === 1) {
            // SINGLE HAND MODE: The single visible hand plays pitch & volume regardless of whether MediaPipe classified it as Left or Right.
            pitchHand = hands[0];
            filterHand = null;
        } else if (hands.length >= 2) {
            // DUAL HAND MODE: Separate pitch hand and filter hand
            const rightCandidate = hands.find(h => h.handedness === 'Right');
            const leftCandidate = hands.find(h => h.handedness === 'Left');

            let assignedRight = rightCandidate;
            let assignedLeft = leftCandidate;

            if (!assignedRight || !assignedLeft) {
                // If handedness labels are ambiguous, sort by screen X position
                // Leftmost hand modulates filter, rightmost hand plays pitch
                const sortedByX = [...hands].sort((a, b) => {
                    const ax = a.palmCenter?.x ?? a.landmarks?.[0]?.x ?? 0.5;
                    const bx = b.palmCenter?.x ?? b.landmarks?.[0]?.x ?? 0.5;
                    return ax - bx;
                });
                assignedLeft = sortedByX[0];
                assignedRight = sortedByX[sortedByX.length - 1];
            }

            if (this.leadHand === 'left') {
                pitchHand = assignedLeft;
                filterHand = assignedRight;
            } else {
                pitchHand = assignedRight;
                filterHand = assignedLeft;
            }
        }

        // 1. Process Pitch Hand (Pitch, Volume, Sustain Gate)
        let rightAudioState = null;
        if (pitchHand) {
            this.lastRightHand = pitchHand;
            const gesture = pitchHand.gesture?.name || (typeof pitchHand.gesture === 'string' ? pitchHand.gesture : 'open_palm');
            if (this.synth) {
                rightAudioState = this.synth.updateRightHand(pitchHand, gesture);
            }

            // Calculate active visual lane index
            const rx = pitchHand.palmCenter?.x ?? pitchHand.landmarks?.[8]?.x ?? 0.5;
            const clampedRx = Math.max(0, Math.min(1, rx));

            if (this.isQuantized && this.activeScaleNotes.length > 0) {
                this.currentActiveNoteIndex = Math.min(
                    this.activeScaleNotes.length - 1,
                    Math.floor(clampedRx * this.activeScaleNotes.length)
                );
            } else {
                this.currentActiveNoteIndex = -1;
            }

            // Emit reactive musical particles at pitch hand tip/palm when active
            if (this.renderer && rightAudioState?.isPlaying) {
                this.particleTimer += dt;
                if (this.particleTimer >= 0.035) {
                    this.particleTimer = 0;
                    const rwidth = this.renderer.width || 1280;
                    const rheight = this.renderer.height || 720;
                    const px = (pitchHand.landmarks?.[8]?.x ?? pitchHand.palmCenter?.x ?? 0.5) * rwidth;
                    const py = (pitchHand.landmarks?.[8]?.y ?? pitchHand.palmCenter?.y ?? 0.5) * rheight;

                    this.renderer.emitParticles(px, py, 3, {
                        color: THEME_COLORS.rightHand,
                        speed: 3.5,
                        spread: Math.PI * 2,
                        size: 3.5,
                        life: 0.7,
                        gravity: -0.05
                    });
                }
            }
        } else {
            this.lastRightHand = null;
            this.currentActiveNoteIndex = -1;
            if (this.synth) {
                this.synth.updateRightHand(null, 'none');
            }
        }

        // 2. Process Filter Hand (Filter Cutoff, Resonance Q, Space FX)
        let leftAudioState = null;
        if (filterHand) {
            this.lastLeftHand = filterHand;
            const gesture = filterHand.gesture?.name || (typeof filterHand.gesture === 'string' ? filterHand.gesture : 'open_palm');
            if (this.synth) {
                leftAudioState = this.synth.updateLeftHand(filterHand, gesture);
            }

            // Emit space FX particles when pinch or thumbs up gesture is active on filter hand
            const isFxBoosted = filterHand.gesture?.name === 'pinch' ||
                filterHand.gesture?.name === 'thumbs_up' ||
                filterHand.pinch?.isPinching;

            if (this.renderer && isFxBoosted) {
                const rwidth = this.renderer.width || 1280;
                const rheight = this.renderer.height || 720;
                const lx = (filterHand.palmCenter?.x ?? 0.5) * rwidth;
                const ly = (filterHand.palmCenter?.y ?? 0.5) * rheight;

                this.renderer.emitParticles(lx, ly, 2, {
                    color: THEME_COLORS.accentGold,
                    speed: 2.0,
                    spread: Math.PI * 2,
                    size: 2.5,
                    life: 0.5,
                    gravity: 0.05
                });
            }
        } else {
            this.lastLeftHand = null;
            if (this.synth) {
                this.synth.updateLeftHand(null);
            }
        }

        // 3. Update Audio state snapshot & HUD Telemetry
        const currentAudioState = this.synth ? this.synth.getState() : {};

        if (this.hud) {
            this.hud.updateTheremin({
                noteName: currentAudioState.currentNote || '--',
                frequency: currentAudioState.currentFreq || 0,
                scaleKey: this.scaleKey,
                cutoffHz: currentAudioState.currentCutoff || 2500,
                volumePct: (currentAudioState.currentGain || 0) * 100,
                octave: this.baseOctave
            });

            this.hud.updateTelemetry({
                handsCount: hands.length,
                leftGesture: (hands.find(h => h.handedness === 'Left')?.gesture?.name) || (hands.length === 1 && hands[0].handedness === 'Left' ? hands[0].gesture?.name : 'NONE') || 'NONE',
                rightGesture: (hands.find(h => h.handedness === 'Right')?.gesture?.name) || (hands.length === 1 && hands[0].handedness === 'Right' ? hands[0].gesture?.name : 'NONE') || 'NONE',
                activeMode: 'theremin'
            });
        }

        if (this.state) {
            this.state.update({
                synthFrequency: currentAudioState.currentFreq,
                synthGain: currentAudioState.currentGain,
                volume: currentAudioState.masterVolume,
                handsCount: hands.length
            });
        }

        return {
            isActive: this.isActive,
            isPlaying: !!currentAudioState.isPlaying,
            currentNote: currentAudioState.currentNote || '--',
            currentFreq: currentAudioState.currentFreq || 0,
            currentGain: currentAudioState.currentGain || 0,
            currentCutoff: currentAudioState.currentCutoff || 2500,
            currentResonance: currentAudioState.currentResonance || 3.0,
            currentPan: currentAudioState.currentPan || 0,
            activeNoteIndex: this.currentActiveNoteIndex,
            scaleKey: this.scaleKey,
            baseOctave: this.baseOctave,
            octavesSpan: this.octavesSpan,
            handsCount: hands.length
        };
    }

    /**
     * Renders Air Theremin visual overlays (musical grid, skeletons, halos, particles).
     * @param {import('../ui/renderer.js').CanvasRenderer} [renderer=this.renderer]
     */
    render(renderer = this.renderer) {
        if (!renderer || !this.isActive) return;

        // 1. Draw musical scale fret lanes
        renderer.drawThereminGrid(this.activeScaleNotes, this.currentActiveNoteIndex);

        // 2. Draw Hand Skeletons
        if (this.lastRightHand) {
            renderer.drawHandSkeleton(this.lastRightHand, {
                color: THEME_COLORS.rightHand,
                showGestureBadge: true,
                showPinchAura: true
            });
        }

        if (this.lastLeftHand) {
            renderer.drawHandSkeleton(this.lastLeftHand, {
                color: THEME_COLORS.leftHand,
                showGestureBadge: true,
                showPinchAura: true
            });
        }

        // 3. Update & render particles
        renderer.updateParticles(0.016);
        renderer.renderParticles();
    }

    /**
     * Cleans up resources.
     */
    destroy() {
        this.deactivate();
        this.synth = null;
        this.state = null;
        this.renderer = null;
        this.hud = null;
        this.activeScaleNotes = [];
    }
}
