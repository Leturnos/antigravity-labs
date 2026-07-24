/**
 * Aether Audio Synth - Tracker & Song Arranger Module
 * Pattern Management, Song Timeline Sequence, JSON Project Storage, and Demo Songs
 */

export class TrackerManager {
  constructor(sequencer) {
    this.sequencer = sequencer;
    
    // Default 4 pattern slots
    this.patterns = {
      1: this.createEmptyPattern(),
      2: this.createEmptyPattern(),
      3: this.createEmptyPattern(),
      4: this.createEmptyPattern()
    };

    this.activePatternId = 1;
    this.songSequence = [1, 1, 2, 1]; // Order of pattern playback in Song Mode
    this.songMode = false; // false = Loop Pattern, true = Song Timeline
    this.currentTimelineIndex = 0;
  }

  createEmptyPattern() {
    return [
      { id: 'kick', type: 'drum', label: 'Bumbo (Kick)', steps: Array(16).fill(false) },
      { id: 'snare', type: 'drum', label: 'Caixa (Snare)', steps: Array(16).fill(false) },
      { id: 'hihat', type: 'drum', label: 'Chimbal (HiHat)', steps: Array(16).fill(false) },
      { id: 'lead', type: 'synth', label: 'Sintetizador', steps: Array(16).fill(false), notes: Array(16).fill('C4') },
      { id: 'bass', type: 'synth', label: 'Linha de Baixo', steps: Array(16).fill(false), notes: Array(16).fill('C2') }
    ];
  }

  /**
   * Saves the current active grid from sequencer into pattern storage
   */
  saveActiveSequencerPattern() {
    this.patterns[this.activePatternId] = JSON.parse(JSON.stringify(this.sequencer.tracks));
  }

  /**
   * Loads a pattern into the live sequencer
   */
  loadPatternToSequencer(patternId) {
    if (!this.patterns[patternId]) {
      this.patterns[patternId] = this.createEmptyPattern();
    }
    this.activePatternId = patternId;
    this.sequencer.tracks = JSON.parse(JSON.stringify(this.patterns[patternId]));
  }

  /**
   * Advances song timeline in Song Mode when 16 steps complete
   */
  advanceSongTimeline() {
    if (!this.songMode || this.songSequence.length === 0) return;
    this.currentTimelineIndex = (this.currentTimelineIndex + 1) % this.songSequence.length;
    const nextPatternId = this.songSequence[this.currentTimelineIndex];
    this.loadPatternToSequencer(nextPatternId);
  }

  // --- DEMO SONGS ---

  loadDemoCyberpunk() {
    this.sequencer.bpm = 130;
    this.sequencer.swing = 10;
    this.songSequence = [1, 1, 2, 1];

    const p1 = this.createEmptyPattern();
    // Kick on 0, 4, 8, 12
    [0, 4, 8, 12].forEach(s => p1[0].steps[s] = true);
    // Snare on 4, 12
    [4, 12].forEach(s => p1[1].steps[s] = true);
    // HiHat offbeat
    [2, 6, 10, 14].forEach(s => p1[2].steps[s] = true);
    // Bass line
    [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => {
      p1[4].steps[s] = true;
      p1[4].notes[s] = s % 4 === 0 ? 'C2' : 'G2';
    });
    // Synth lead
    [0, 3, 6, 9, 12].forEach(s => {
      p1[3].steps[s] = true;
      p1[3].notes[s] = s < 6 ? 'C4' : 'G4';
    });

    const p2 = JSON.parse(JSON.stringify(p1));
    [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => {
      p2[4].notes[s] = 'F2';
    });
    [0, 3, 6, 9, 12].forEach(s => {
      p2[3].notes[s] = s < 6 ? 'F4' : 'A4';
    });

    this.patterns[1] = p1;
    this.patterns[2] = p2;
    this.patterns[3] = this.createEmptyPattern();
    this.patterns[4] = this.createEmptyPattern();

    this.loadPatternToSequencer(1);
  }

  loadDemoChiptune() {
    this.sequencer.bpm = 140;
    this.sequencer.swing = 0;
    this.songSequence = [1, 2, 1, 2];

    const p1 = this.createEmptyPattern();
    // Fast 8-bit drums
    [0, 8].forEach(s => p1[0].steps[s] = true);
    [4, 12].forEach(s => p1[1].steps[s] = true);
    [0, 2, 4, 6, 8, 10, 12, 14].forEach(s => p1[2].steps[s] = true);

    // Fast arpeggio synth
    const scale = ['C4', 'E4', 'G4', 'B4', 'C4', 'E4', 'G4', 'B4', 'A4', 'C4', 'E4', 'A4', 'G4', 'B3', 'D4', 'G4'];
    for (let i = 0; i < 16; i++) {
      p1[3].steps[i] = true;
      p1[3].notes[i] = scale[i];
    }

    this.patterns[1] = p1;
    this.patterns[2] = JSON.parse(JSON.stringify(p1));
    this.patterns[3] = this.createEmptyPattern();
    this.patterns[4] = this.createEmptyPattern();

    this.loadPatternToSequencer(1);
  }

  // --- JSON EXPORT / IMPORT & LOCALSTORAGE ---

  exportProjectJSON(synthParams) {
    this.saveActiveSequencerPattern();
    const projectData = {
      version: '1.0',
      title: 'Aether Synth Project',
      timestamp: new Date().toISOString(),
      bpm: this.sequencer.bpm,
      swing: this.sequencer.swing,
      activePatternId: this.activePatternId,
      songSequence: this.songSequence,
      patterns: this.patterns,
      synthParams: synthParams
    };
    return JSON.stringify(projectData, null, 2);
  }

  importProjectJSON(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data.patterns) throw new Error('Invalid project structure');

      this.sequencer.bpm = data.bpm || 120;
      this.sequencer.swing = data.swing || 0;
      this.patterns = data.patterns;
      this.songSequence = data.songSequence || [1, 1, 2, 1];
      this.activePatternId = data.activePatternId || 1;

      this.loadPatternToSequencer(this.activePatternId);
      return data;
    } catch (err) {
      console.error('Failed to import JSON project:', err);
      throw err;
    }
  }

  saveToLocalStorage(synthParams) {
    try {
      const json = this.exportProjectJSON(synthParams);
      localStorage.setItem('aether_synth_project', json);
    } catch (e) {
      console.warn('Could not save to LocalStorage:', e);
    }
  }

  loadFromLocalStorage() {
    try {
      const json = localStorage.getItem('aether_synth_project');
      if (json) {
        return this.importProjectJSON(json);
      }
    } catch (e) {
      console.warn('Could not load from LocalStorage:', e);
    }
    return null;
  }
}
