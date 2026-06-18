/**
 * Aether Snake Sounds — Web Audio API Synthesizer
 * Integrates with the shared RetroAudioEngine to synthesize sounds dynamically in real time.
 */

class SnakeSoundManager {
  constructor() {
    // Instantiate the shared audio engine from window
    this.audio = new window.RetroAudioEngine();
    this.audioEnabled = true;
  }

  init() {
    this.audio.init();
  }

  toggleSound() {
    const isMuted = this.audio.toggleMute();
    this.audioEnabled = !isMuted;
    return this.audioEnabled;
  }

  setMute(isMuted) {
    this.audio.setMute(isMuted);
    this.audioEnabled = !isMuted;
  }

  /**
   * Sound effect when the snake eats food.
   * A crisp ascending arpeggio.
   */
  playEat() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    // Ascending arpeggio: C5 -> G5
    this.audio.playTone(523.25, 523.25, 0.06, 'sine', 0.08, 0);
    this.audio.playTone(783.99, 783.99, 0.12, 'sine', 0.08, 0.06);
  }

  /**
   * Sound effect when the game is paused.
   * High pitch blip.
   */
  playPause() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    this.audio.playTone(400, 300, 0.08, 'triangle', 0.06, 0);
  }

  /**
   * Sound effect when the game is resumed.
   * Low to high blip.
   */
  playResume() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    this.audio.playTone(300, 400, 0.08, 'triangle', 0.06, 0);
  }

  /**
   * Sound effect when a UI button is clicked.
   * Short clean click.
   */
  playClick() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    this.audio.playTone(600, 600, 0.03, 'sine', 0.05, 0);
  }

  /**
   * Sound effect when the snake crashes (Game Over).
   * A filtered low noise explosion + descending tone.
   */
  playCrash() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    // Descending tone sweep
    this.audio.playTone(220, 55, 0.4, 'sawtooth', 0.12, 0);
    // Lowpass noise sweep for crash impact
    this.audio.playNoise(0.5, 600, 60, 0.2, 0);
  }

  /**
   * Sound effect when the player wins the game (fills the board).
   * An epic ascending arpeggio.
   */
  playVictory() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      this.audio.playTone(freq, freq, 0.15, 'triangle', 0.07, idx * 0.1);
    });
  }
}

// Instantiate globally
window.SnakeSounds = new SnakeSoundManager();
