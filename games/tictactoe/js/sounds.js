/**
 * Aether Tic-Tac-Toe Sounds - Synthesizes retro sci-fi game sounds using Web Audio API
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

  playHover() {
    // Sutil click agudo
    this.engine.playTone(800, 800, 0.03, 'sine', 0.05);
  }

  playMoveX() {
    // Som ríspido e agudo para o X (onda quadrada)
    this.engine.playTone(440, 550, 0.08, 'square', 0.06);
  }

  playMoveO() {
    // Som redondo e macio para o O (onda triangular)
    this.engine.playTone(330, 220, 0.1, 'triangle', 0.08);
  }

  playWin() {
    // Arpejo alegre ascendente em Dó Maior
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
      this.engine.playTone(freq, freq * 1.01, 0.18, 'square', 0.07, (index * 60) / 1000);
    });
  }

  playLoss() {
    // Arpejo melancólico descendente em Fá Menor
    const notes = [349.23, 293.66, 261.63, 220.00]; // F4, D4, C4, A3
    notes.forEach((freq, index) => {
      this.engine.playTone(freq, freq - 20, 0.25, 'triangle', 0.1, (index * 120) / 1000);
    });
  }

  playDraw() {
    // Dois clicks mecânicos rápidos
    this.engine.playTone(180, 120, 0.06, 'triangle', 0.12, 0);
    this.engine.playTone(180, 120, 0.06, 'triangle', 0.12, 0.08);
  }
}

// Attach globally
window.sounds = new AetherSounds();
