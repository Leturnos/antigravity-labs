/**
 * Aether Sounds - Synthesizes Tetris game sound effects dynamically using the shared RetroAudioEngine.
 * Employs precise Web Audio API timing sweeps instead of browser setTimeout loops.
 */
class AetherSounds {
  constructor() {
    this.engine = new RetroAudioEngine();
  }

  init() {
    this.engine.init();
  }

  toggleMute() {
    return this.engine.toggleMute();
  }

  playMove() {
    this.engine.playTone(120, 80, 0.06, 'triangle', 0.15);
  }

  playRotate() {
    this.engine.playTone(300, 420, 0.08, 'sine', 0.12);
  }

  playLock() {
    this.engine.playTone(90, 40, 0.12, 'triangle', 0.25);
  }

  playHold() {
    this.engine.playTone(200, 320, 0.1, 'sine', 0.15);
  }

  playLineClear() {
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, index) => {
      this.engine.playTone(freq, freq * 1.05, 0.15, 'square', 0.08, (index * 80) / 1000);
    });
  }

  playTetris() {
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
      this.engine.playTone(freq, freq * 1.02, 0.2, 'square', 0.08, (index * 60) / 1000);
    });
    // Overlay explosion noise for sensory impact
    this.engine.playNoise(0.25, 600, 100, 0.08, 0.10);
  }

  playLevelUp() {
    const notes = [587.33, 880.00]; // D5, A5
    notes.forEach((freq, index) => {
      this.engine.playTone(freq, freq, 0.22, 'triangle', 0.15, (index * 100) / 1000);
    });
  }

  playGameOver() {
    const notes = [392.00, 349.23, 311.13, 261.63]; // G4, F4, D#4, C4
    notes.forEach((freq, index) => {
      this.engine.playTone(freq, freq - 30, 0.3, 'triangle', 0.15, (index * 180) / 1000);
    });
  }
}

// Instantiate globally
window.sounds = new AetherSounds();
