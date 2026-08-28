/**
 * Aether Vision Sandbox - Musical Scales & Note Quantization Engine
 * 
 * Provides musical scales (Pentatonic, Blues, Dorian, Chromatic, Hirajoshi, Arabic, etc.),
 * MIDI-to-frequency conversions, note naming, and spatial coordinate-to-note quantization.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Standard scale definitions with semitone intervals from the root note.
 */
export const SCALES = {
    pentatonic_major: {
        id: 'pentatonic_major',
        name: 'Major Pentatonic',
        description: 'Bright, consonant, uplifting - impossible to hit a wrong note',
        intervals: [0, 2, 4, 7, 9]
    },
    pentatonic_minor: {
        id: 'pentatonic_minor',
        name: 'Minor Pentatonic',
        description: 'Bluesy, moody, soulful rock and jazz tonality',
        intervals: [0, 3, 5, 7, 10]
    },
    major: {
        id: 'major',
        name: 'Diatonic Major (Ionian)',
        description: 'Standard Western classical major scale',
        intervals: [0, 2, 4, 5, 7, 9, 11]
    },
    minor: {
        id: 'minor',
        name: 'Natural Minor (Aeolian)',
        description: 'Emotional, melancholic, cinematic tonality',
        intervals: [0, 2, 3, 5, 7, 8, 10]
    },
    blues: {
        id: 'blues',
        name: 'Blues Hexatonic',
        description: 'Expressive with the flattened fifth blue note',
        intervals: [0, 3, 5, 6, 7, 10]
    },
    dorian: {
        id: 'dorian',
        name: 'Dorian Mode',
        description: 'Jazzy, mystical folk feel with natural 6th',
        intervals: [0, 2, 3, 5, 7, 9, 10]
    },
    hirajoshi: {
        id: 'hirajoshi',
        name: 'Hirajoshi (Japanese Pentatonic)',
        description: 'Traditional Japanese folk / zen atmosphere',
        intervals: [0, 2, 3, 7, 8]
    },
    chromatic: {
        id: 'chromatic',
        name: 'Chromatic (12-TET)',
        description: 'All 12 equal-tempered semitones per octave',
        intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    },
    arabic: {
        id: 'arabic',
        name: 'Double Harmonic Major (Byzantine / Arabic)',
        description: 'Exotic Middle-Eastern tonality with two augmented seconds',
        intervals: [0, 1, 4, 5, 7, 8, 11]
    },
    lydian: {
        id: 'lydian',
        name: 'Lydian Mode',
        description: 'Dreamy, ethereal and futuristic with raised 4th',
        intervals: [0, 2, 4, 6, 7, 9, 11]
    },
    mixolydian: {
        id: 'mixolydian',
        name: 'Mixolydian Mode',
        description: 'Dominant 7th blues-rock scale',
        intervals: [0, 2, 4, 5, 7, 9, 10]
    }
};

/**
 * Converts a MIDI note number (0 - 127) to frequency in Hertz (Hz).
 * Formula: f = A4 * 2^((midi - 69) / 12)
 * 
 * @param {number} midi - MIDI note number (e.g. 60 = C4, 69 = A4)
 * @param {number} [a4Freq=440] - Reference concert pitch for A4 in Hz
 * @returns {number} Frequency in Hz
 */
export function midiToFreq(midi, a4Freq = 440) {
    if (typeof midi !== 'number' || isNaN(midi)) {
        return 440;
    }
    return a4Freq * Math.pow(2, (midi - 69) / 12);
}

/**
 * Converts a frequency in Hertz (Hz) to a MIDI note number.
 * Formula: midi = 69 + 12 * log2(f / A4)
 * 
 * @param {number} freq - Frequency in Hz
 * @param {number} [a4Freq=440] - Reference concert pitch for A4 in Hz
 * @returns {number} MIDI note number
 */
export function freqToMidi(freq, a4Freq = 440) {
    if (typeof freq !== 'number' || freq <= 0 || isNaN(freq)) {
        return 69;
    }
    return 69 + 12 * Math.log2(freq / a4Freq);
}

/**
 * Formats a MIDI note number into standard scientific pitch notation (e.g. 60 -> 'C4', 69 -> 'A4').
 * 
 * @param {number} midi - MIDI note number
 * @returns {string} Note name and octave string
 */
export function midiToNoteName(midi) {
    if (typeof midi !== 'number' || isNaN(midi)) {
        return 'A4';
    }
    const roundedMidi = Math.round(midi);
    const noteIndex = ((roundedMidi % 12) + 12) % 12;
    const octave = Math.floor(roundedMidi / 12) - 1;
    return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Generates an ascending array of MIDI note numbers for a given scale and octave span.
 * 
 * @param {string} [scaleKey='pentatonic_major'] - Key from SCALES
 * @param {number} [baseOctave=3] - Starting base octave (e.g. 3 = C3/48)
 * @param {number} [octavesSpan=2] - Number of octaves to span (1 to 6)
 * @param {number} [rootNote=0] - Root note semitone offset (0 = C, 1 = C#, 2 = D, ..., 9 = A)
 * @returns {number[]} Array of MIDI note numbers
 */
export function generateScaleNotes(scaleKey = 'pentatonic_major', baseOctave = 3, octavesSpan = 2, rootNote = 0) {
    const scale = SCALES[scaleKey] || SCALES.pentatonic_major;
    const intervals = scale.intervals || [0, 2, 4, 7, 9];
    const span = Math.max(1, Math.min(6, Math.round(octavesSpan)));
    const octave = Math.max(0, Math.min(8, Math.round(baseOctave)));
    const root = Math.max(0, Math.min(11, Math.round(rootNote)));

    const baseMidi = (octave + 1) * 12 + root;
    const notes = [];

    for (let o = 0; o < span; o++) {
        for (let i = 0; i < intervals.length; i++) {
            const midi = baseMidi + o * 12 + intervals[i];
            if (midi <= 127) {
                notes.push(midi);
            }
        }
    }

    // Include the top tonic note completing the final octave range
    const topTonic = baseMidi + span * 12;
    if (topTonic <= 127 && !notes.includes(topTonic)) {
        notes.push(topTonic);
    }

    return notes;
}

/**
 * Quantizes a normalized spatial horizontal coordinate (0.0 to 1.0) into discrete musical scale notes.
 * 
 * @param {number} normalizedX - Normalized horizontal position [0.0, 1.0] (0 = low pitch left, 1 = high pitch right)
 * @param {string} [scaleKey='pentatonic_major'] - Musical scale key
 * @param {number} [baseOctave=3] - Base octave (default: 3)
 * @param {number} [octavesSpan=2] - Octaves span (default: 2)
 * @param {number} [rootNote=0] - Root note offset (0 = C)
 * @returns {{ midi: number, freq: number, noteName: string, index: number, totalNotes: number, scaleKey: string, normalizedX: number }}
 */
export function quantizeToScale(normalizedX, scaleKey = 'pentatonic_major', baseOctave = 3, octavesSpan = 2, rootNote = 0) {
    const clampedX = Math.max(0, Math.min(1, typeof normalizedX === 'number' && !isNaN(normalizedX) ? normalizedX : 0.5));
    const notes = generateScaleNotes(scaleKey, baseOctave, octavesSpan, rootNote);

    if (notes.length === 0) {
        return {
            midi: 60,
            freq: 261.63,
            noteName: 'C4',
            index: 0,
            totalNotes: 1,
            scaleKey,
            normalizedX: clampedX
        };
    }

    // Map [0, 1] to note index
    const index = Math.min(notes.length - 1, Math.floor(clampedX * notes.length));
    const midi = notes[index];
    const freq = midiToFreq(midi);
    const noteName = midiToNoteName(midi);

    return {
        midi,
        freq,
        noteName,
        index,
        totalNotes: notes.length,
        scaleKey,
        normalizedX: clampedX
    };
}

/**
 * Calculates continuous glissando frequency across an octave span (for unquantized Theremin mode).
 * 
 * @param {number} normalizedX - Normalized horizontal position [0.0, 1.0]
 * @param {number} [baseOctave=3] - Base octave
 * @param {number} [octavesSpan=2] - Octaves span
 * @param {number} [rootNote=0] - Root note offset
 * @returns {{ midi: number, freq: number, noteName: string, normalizedX: number }}
 */
export function continuousFreq(normalizedX, baseOctave = 3, octavesSpan = 2, rootNote = 0) {
    const clampedX = Math.max(0, Math.min(1, typeof normalizedX === 'number' && !isNaN(normalizedX) ? normalizedX : 0.5));
    const span = Math.max(1, Math.min(6, octavesSpan));
    const octave = Math.max(0, Math.min(8, baseOctave));
    const root = Math.max(0, Math.min(11, rootNote));

    const minMidi = (octave + 1) * 12 + root;
    const maxMidi = minMidi + span * 12;

    const currentMidi = minMidi + clampedX * (maxMidi - minMidi);
    const freq = midiToFreq(currentMidi);
    const noteName = midiToNoteName(currentMidi);

    return {
        midi: currentMidi,
        freq,
        noteName,
        normalizedX: clampedX
    };
}
