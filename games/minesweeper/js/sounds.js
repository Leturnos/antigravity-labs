/**
 * NES_AudioEngine - Real-time retro audio synthesis using the shared RetroAudioEngine.
 */
window.NES_AudioEngine = {
  engine: new RetroAudioEngine(),

  play(type) {
    switch (type) {
      case 'reveal':
        this.engine.playTone(520, 150, 0.06, 'triangle', 0.12);
        break;
      case 'flag':
        this.engine.playTone(1200, 300, 0.03, 'sine', 0.08);
        break;
      case 'unflag':
        this.engine.playTone(1500, 500, 0.03, 'sine', 0.08);
        break;
      case 'chord':
        this.engine.playTone(523.25, 523.25, 0.06, 'triangle', 0.08);
        this.engine.playTone(659.25, 659.25, 0.08, 'triangle', 0.08, 0.04);
        break;
      case 'win':
        this.playWinFanfare();
        break;
      case 'lose':
        // Explosion noise + low-frequency sawtooth rumble
        this.engine.playNoise(0.4, 800, 60, 0.25);
        this.engine.playTone(90, 30, 0.35, 'sawtooth', 0.18);
        break;
      default:
        console.warn(`Unknown sound type: ${type}`);
    }
  },

  playWinFanfare() {
    const noteDuration = 0.08;
    this.engine.playTone(523.25, 523.25, noteDuration, 'square', 0.06, 0);
    this.engine.playTone(659.25, 659.25, noteDuration, 'square', 0.06, noteDuration);
    this.engine.playTone(783.99, 783.99, noteDuration, 'square', 0.06, noteDuration * 2);
    this.engine.playTone(1046.50, 1046.50, noteDuration, 'square', 0.06, noteDuration * 3);
    this.engine.playTone(783.99, 783.99, noteDuration, 'square', 0.06, noteDuration * 4);
    this.engine.playTone(1046.50, 1046.50, noteDuration * 3, 'square', 0.06, noteDuration * 5);
  },

  setMute(isMuted) {
    this.engine.setMute(isMuted);
  }
};
