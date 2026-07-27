/**
 * Aether Audio Synth - On-Screen Piano Keyboard, QWERTY Shortcuts, and Web MIDI Interface
 */

const KEY_MAP = {
  'KeyA': 'C4',  'KeyW': 'C#4',
  'KeyS': 'D4',  'KeyE': 'D#4',
  'KeyD': 'E4',  'KeyF': 'F4',
  'KeyT': 'F#4', 'KeyG': 'G4',
  'KeyY': 'G#4', 'KeyH': 'A4',
  'KeyU': 'A#4', 'KeyJ': 'B4',
  'KeyK': 'C5'
};

const NOTE_FREQS = {
  'C2': 65.41, 'D2': 73.42, 'E2': 82.41, 'F2': 87.31, 'G2': 98.00, 'A2': 110.00, 'B2': 123.47,
  'C3': 130.81, 'D3': 146.83, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25
};

export class VirtualKeyboard {
  constructor(synthVoice, audioEngine, getSynthParamsCallback) {
    this.synthVoice = synthVoice;
    this.audioEngine = audioEngine;
    this.getSynthParams = getSynthParamsCallback;
    this.pressedKeys = new Set();
  }

  init(containerElement) {
    this.renderOnScreenKeyboard(containerElement);
    this.bindQWERTYKeys();
    this.initWebMIDI();
  }

  renderOnScreenKeyboard(container) {
    if (!container) return;
    container.innerHTML = '';
    const pianoWrap = document.createElement('div');
    pianoWrap.className = 'piano-keyboard-wrapper';

    Object.keys(NOTE_FREQS).forEach(note => {
      if (note.includes('4') || note === 'C5') {
        const keyBtn = document.createElement('div');
        keyBtn.className = `piano-key ${note.includes('#') ? 'black' : 'white'}`;
        keyBtn.setAttribute('data-note', note);
        keyBtn.innerHTML = `<span>${note}</span>`;

        keyBtn.addEventListener('mousedown', () => this.playNote(note));
        pianoWrap.appendChild(keyBtn);
      }
    });

    container.appendChild(pianoWrap);
  }

  bindQWERTYKeys() {
    window.addEventListener('keydown', (e) => {
      // 1. Ignore if typing inside input, select, or textarea
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      // 2. Prevent SO key repeat glitch
      if (this.pressedKeys.has(e.code)) return;

      const note = KEY_MAP[e.code];
      if (note) {
        this.pressedKeys.add(e.code);
        this.playNote(note);
        this.highlightKeyUI(note, true);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.pressedKeys.delete(e.code);
      const note = KEY_MAP[e.code];
      if (note) {
        this.highlightKeyUI(note, false);
      }
    });
  }

  playNote(noteName) {
    this.audioEngine.init();
    this.audioEngine.resume();
    const freq = NOTE_FREQS[noteName] || 440;
    const params = this.getSynthParams ? this.getSynthParams() : {};
    this.synthVoice.triggerNote(
      this.audioEngine.ctx,
      this.audioEngine.masterGain,
      freq,
      this.audioEngine.getCurrentTime(),
      0.3,
      params
    );
  }

  highlightKeyUI(noteName, active) {
    const el = document.querySelector(`.piano-key[data-note="${noteName}"]`);
    if (el) {
      el.classList.toggle('active', active);
    }
  }

  initWebMIDI() {
    if (navigator.requestMIDIAccess) {
      navigator.requestMIDIAccess()
        .then(midiAccess => {
          for (let input of midiAccess.inputs.values()) {
            input.onmidimessage = (msg) => this.handleMIDIMessage(msg);
          }
        })
        .catch(() => {
          // Silent graceful fallback if MIDI permission denied or unavailable
        });
    }
  }

  handleMIDIMessage(event) {
    const [command, noteNumber, velocity] = event.data;
    if (command === 144 && velocity > 0) { // Note ON
      const freq = 440 * Math.pow(2, (noteNumber - 69) / 12);
      this.audioEngine.init();
      const params = this.getSynthParams ? this.getSynthParams() : {};
      this.synthVoice.triggerNote(
        this.audioEngine.ctx,
        this.audioEngine.masterGain,
        freq,
        this.audioEngine.getCurrentTime(),
        0.3,
        params
      );
    }
  }
}
