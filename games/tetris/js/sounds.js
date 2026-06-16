/**
 * Aether Tetris — Retro Chiptune Sound Synthesizer
 * Generated via Web Audio API (no external audio files required)
 */

class AetherSounds {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // Initializes the audio context upon the first user interaction (browser policy)
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API is not supported in this browser.", e);
    }
  }

  // Toggles sound on/off
  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  // Synthesizes a brief note with custom parameters
  playTone(freqStart, freqEnd, duration, type = 'sine', volume = 0.1) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    
    // Resume audio context if suspended (common in modern browsers)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
    
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, this.ctx.currentTime + duration);
    }

    gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  // Sound triggered when moving the block laterally (short low-frequency triangle wave)
  playMove() {
    this.playTone(120, 80, 0.06, 'triangle', 0.15);
  }

  // Sound triggered when rotating the block (short sine wave with rapid frequency shift)
  playRotate() {
    this.playTone(300, 420, 0.08, 'sine', 0.12);
  }

  // Sound triggered when the block locks down (low frequency triangle with noise burst)
  playLock() {
    this.playTone(90, 40, 0.12, 'triangle', 0.25);
  }

  // Sound triggered when holding/swapping a piece
  playHold() {
    this.playTone(200, 320, 0.1, 'sine', 0.15);
  }

  // Sound triggered when clearing 1 to 3 lines (fast ascending 8-bit square wave arpeggio)
  playLineClear() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.playTone(freq, freq * 1.05, 0.15, 'square', 0.08);
      }, index * 80);
    });
  }

  // Special sound triggered when clearing 4 lines simultaneously (Tetris!)
  playTetris() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.playTone(freq, freq * 1.02, 0.2, 'square', 0.08);
      }, index * 60);
    });

    // Add white noise explosion sound in the background for impact
    setTimeout(() => {
      this.playExplosionNoise();
    }, 100);
  }

  // Filtered white noise for the Tetris line clear explosion effect
  playExplosionNoise() {
    if (this.muted || !this.ctx) return;
    
    try {
      const bufferSize = this.ctx.sampleRate * 0.25; // 0.25 seconds
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.25);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);

      noiseNode.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      noiseNode.start();
    } catch (e) {
      // Silent fallback
    }
  }

  // Level Up sound effect (triumphant double beep)
  playLevelUp() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [587.33, 880.00]; // D5, A5
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.playTone(freq, freq, 0.22, 'triangle', 0.15);
      }, index * 100);
    });
  }

  // Sad descending game over sound effect
  playGameOver() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [392.00, 349.23, 311.13, 261.63]; // G4, F4, D#4, C4
    notes.forEach((freq, index) => {
      setTimeout(() => {
        this.playTone(freq, freq - 30, 0.3, 'triangle', 0.15);
      }, index * 180);
    });
  }
}

// Instantiate globally
window.sounds = new AetherSounds();
