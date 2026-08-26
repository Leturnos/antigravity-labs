/**
 * Procedural Web Audio API sound generator providing real-time audio feedback
 * for simulation events without external audio assets.
 */
export class SoundFX {
    /**
     * @param {AudioContext|null} [audioContext=null] - Optional custom AudioContext for mocking or custom audio routing
     */
    constructor(audioContext = null) {
        this.ctx = audioContext;
        this.muted = false;
    }

    /**
     * Safely initializes or resumes the Web Audio context upon user interaction.
     * @private
     */
    _initCtx() {
        if (!this.ctx && typeof window !== 'undefined') {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                try {
                    this.ctx = new AudioContextClass();
                } catch (e) {
                    // Audio context creation blocked or not supported
                }
            }
        }
        if (this.ctx && this.ctx.state === 'suspended' && typeof this.ctx.resume === 'function') {
            try {
                this.ctx.resume();
            } catch (e) {
                // Resume failed or not allowed yet
            }
        }
    }

    /**
     * Toggles mute state.
     * @returns {boolean} New mute state
     */
    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    /**
     * Sets explicit mute state.
     * @param {boolean} muted
     */
    setMuted(muted) {
        this.muted = !!muted;
    }

    /**
     * Upward sine chirp played when an agent consumes food.
     */
    playEat() {
        if (this.muted) return;
        this._initCtx();
        if (!this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(520, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.08);

            gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.08);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.08);
        } catch (e) {}
    }

    /**
     * Descending sawtooth buzz played when an agent strikes a hazard or takes damage.
     */
    playHazard() {
        if (this.muted) return;
        this._initCtx();
        if (!this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.12);

            gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.12);
        } catch (e) {}
    }

    /**
     * Ascending arpeggiated chord played on generation turnover.
     */
    playNewGen() {
        if (this.muted) return;
        this._initCtx();
        if (!this.ctx) return;

        try {
            [440, 554, 659, 880].forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.08, this.ctx.currentTime + i * 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + i * 0.05 + 0.3);

                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(this.ctx.currentTime + i * 0.05);
                osc.stop(this.ctx.currentTime + i * 0.05 + 0.3);
            });
        } catch (e) {}
    }

    /**
     * Downward square wave sweep played on agent disintegration or tool laser action.
     */
    playLaser() {
        if (this.muted) return;
        this._initCtx();
        if (!this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(900, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.15);

            gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.15);
        } catch (e) {}
    }

    /**
     * Short crisp click sound played on UI interactions or tool placements.
     */
    playClick() {
        if (this.muted) return;
        this._initCtx();
        if (!this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(400, this.ctx.currentTime + 0.03);

            gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.001, this.ctx.currentTime + 0.03);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.03);
        } catch (e) {}
    }
}
