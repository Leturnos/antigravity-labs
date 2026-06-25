/**
 * Aether Poker Sounds — Web Audio API Synthesizer
 * Integrates with the shared RetroAudioEngine to synthesize sounds dynamically in real time.
 */

class PokerSoundManager {
  constructor() {
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
   * Sound of a card being dealt or flipped.
   * A short low-pass noise sweep and pitch slide.
   */
  playDeal() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    this.audio.playTone(350, 450, 0.06, 'triangle', 0.06, 0);
    this.audio.playNoise(0.06, 800, 300, 0.03, 0);
  }

  /**
   * Sound of UI button clicks.
   */
  playClick() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    this.audio.playTone(600, 600, 0.03, 'sine', 0.05, 0);
  }

  /**
   * Sound of a single chip or small bet action.
   * Synthesizes short, high-frequency clinks.
   */
  playChip() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    this.audio.playTone(1600, 1600, 0.02, 'sine', 0.06, 0);
    this.audio.playTone(1900, 1900, 0.015, 'sine', 0.04, 0.01);
    this.audio.playTone(1300, 1300, 0.02, 'sine', 0.03, 0.02);
  }

  /**
   * Sound of a larger bet or raise.
   * Multiple chips colliding in rapid succession.
   */
  playBet() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    const delays = [0, 0.015, 0.03, 0.045, 0.06];
    const freqs = [1500, 1800, 1200, 1600, 1000];
    const volumes = [0.08, 0.06, 0.05, 0.04, 0.03];
    
    delays.forEach((delay, idx) => {
      this.audio.playTone(freqs[idx], freqs[idx], 0.03, 'sine', volumes[idx], delay);
    });
  }

  /**
   * Sound of a check (knocking on the wooden table).
   * Double low-pitch hollow thuds.
   */
  playCheck() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    // First knock
    this.audio.playTone(140, 80, 0.06, 'triangle', 0.12, 0);
    // Second knock shortly after
    this.audio.playTone(130, 75, 0.06, 'triangle', 0.10, 0.08);
  }

  /**
   * Sound of a fold (sliding card away on the felt).
   * Short, friction-like noise sweep.
   */
  playFold() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    this.audio.playNoise(0.12, 600, 150, 0.04, 0);
  }

  /**
   * Sound of winning a pot.
   * Ascending retro arpeggio.
   */
  playWin() {
    if (!this.audioEnabled) return;
    this.audio.resume();
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      this.audio.playTone(freq, freq, 0.12, 'triangle', 0.06, idx * 0.07);
    });
  }
}

window.PokerSounds = new PokerSoundManager();
