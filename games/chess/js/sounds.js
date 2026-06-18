/**
 * ChessSounds - Synthesizes chess game sound effects dynamically using the shared RetroAudioEngine.
 */
const ChessSounds = {
  engine: new RetroAudioEngine(),
  muted: false,

  init() {
    this.engine.init();
  },

  playMove() {
    this.engine.playTone(320, 120, 0.08, 'sine', 0.15);
  },

  playCapture() {
    // Triangle frequency sweep + white noise blast
    this.engine.playTone(180, 60, 0.12, 'triangle', 0.22);
    this.engine.playNoise(0.05, 1000, 1000, 0.07);
  },

  playCheck() {
    this.engine.playTone(659.25, 659.25, 0.25, 'sine', 0.12);
    this.engine.playTone(880.00, 880.00, 0.35, 'sine', 0.12, 0.08);
  },

  playGameOver(isWin) {
    if (isWin) {
      this.engine.playTone(261.63, 261.63, 0.4, 'sine', 0.1);
      this.engine.playTone(329.63, 329.63, 0.4, 'sine', 0.1, 0.1);
      this.engine.playTone(392.00, 392.00, 0.4, 'sine', 0.1, 0.2);
      this.engine.playTone(523.25, 523.25, 0.8, 'sine', 0.1, 0.3);
    } else {
      this.engine.playTone(293.66, 293.66, 0.4, 'sine', 0.1);
      this.engine.playTone(277.18, 277.18, 0.4, 'sine', 0.1, 0.15);
      this.engine.playTone(261.63, 261.63, 0.4, 'sine', 0.1, 0.3);
      this.engine.playTone(196.00, 196.00, 0.8, 'sine', 0.1, 0.45);
    }
  },

  playStart() {
    this.engine.playTone(440.00, 440.00, 0.3, 'triangle', 0.1);
    this.engine.playTone(659.25, 659.25, 0.4, 'triangle', 0.1, 0.1);
  },

  toggleMute() {
    this.muted = this.engine.toggleMute();
    return this.muted;
  }
};
