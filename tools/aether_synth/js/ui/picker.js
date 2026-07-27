/**
 * Aether Audio Synth - Chromatic Note Pitch Picker Popover UI
 */

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const OCTAVES = [2, 3, 4, 5];

export class PitchPicker {
  constructor() {
    this.container = null;
    this.onSelectCallback = null;
    this.activeNote = 'C4';
    this.createPopoverDOM();
  }

  createPopoverDOM() {
    this.container = document.createElement('div');
    this.container.className = 'pitch-picker-popover hidden';

    const octavesNav = document.createElement('div');
    octavesNav.className = 'octave-tabs';

    OCTAVES.forEach(oct => {
      const btn = document.createElement('button');
      btn.className = 'oct-btn';
      btn.textContent = `O${oct}`;
      btn.setAttribute('data-oct', oct);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.renderKeys(oct);
      });
      octavesNav.appendChild(btn);
    });

    const keysGrid = document.createElement('div');
    keysGrid.className = 'picker-keys-grid';
    keysGrid.id = 'picker-keys-grid';

    this.container.appendChild(octavesNav);
    this.container.appendChild(keysGrid);
    document.body.appendChild(this.container);

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (this.container && !this.container.contains(e.target) && !e.target.classList.contains('step-btn')) {
        this.hide();
      }
    });
  }

  renderKeys(octave) {
    const grid = this.container.querySelector('#picker-keys-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Update active octave tab
    this.container.querySelectorAll('.oct-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.getAttribute('data-oct')) === octave);
    });

    NOTES.forEach(note => {
      const noteName = `${note}${octave}`;
      const keyBtn = document.createElement('button');
      keyBtn.className = 'picker-key-btn';
      if (note.includes('#')) keyBtn.classList.add('sharp');
      if (noteName === this.activeNote) keyBtn.classList.add('selected');
      keyBtn.textContent = noteName;

      keyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onSelectCallback) {
          this.onSelectCallback(noteName);
        }
        this.hide();
      });

      grid.appendChild(keyBtn);
    });
  }

  show(targetElement, currentNote, onSelectCallback) {
    this.activeNote = currentNote || 'C4';
    this.onSelectCallback = onSelectCallback;

    const octaveMatch = this.activeNote.match(/\d+/);
    const initialOctave = octaveMatch ? parseInt(octaveMatch[0]) : 4;
    this.renderKeys(initialOctave);

    const rect = targetElement.getBoundingClientRect();
    this.container.style.top = `${rect.bottom + window.scrollY + 6}px`;
    this.container.style.left = `${Math.min(window.innerWidth - 220, rect.left + window.scrollX)}px`;
    this.container.classList.remove('hidden');
  }

  hide() {
    if (this.container) {
      this.container.classList.add('hidden');
    }
  }
}
