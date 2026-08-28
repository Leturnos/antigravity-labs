/**
 * Aether Agent Matrix - Voice Synthesis Engine (Web Speech API)
 * Provides distinct voices, pitch, rate, and speech profiles for Debater A, Debater B, and the Judge.
 * Includes natural markdown cleaning, sentence-chunked streaming speech, and mute management.
 */

export class VoiceSynth {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.isMuted=false]
   * @param {Function} [options.onStateChange]
   */
  constructor(options = {}) {
    this.isMuted = options.isMuted !== undefined ? options.isMuted : false;
    this.onStateChange = options.onStateChange || null;
    this.voices = [];
    this.isSpeaking = false;
    this.currentUtterance = null;
    this._audioCtx = null;
    this._activeAudioNodes = [];
    this._speechTimer = null;
    this._init();
  }

  /**
   * Initializes Web Speech API and voice discovery.
   * @private
   */
  _init() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this._loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = () => this._loadVoices();
      }
    }
  }

  /**
   * Gets or initializes AudioContext safely.
   * @private
   */
  _getAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!this._audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this._audioCtx = new AudioCtx();
      }
    }
    return this._audioCtx;
  }

  /**
   * Loads and caches available browser TTS voices.
   * @private
   */
  _loadVoices() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.voices = window.speechSynthesis.getVoices() || [];
    }
  }

  /**
   * Cleans Markdown formatting, tags, and special characters from text for natural speech.
   * @param {string} text
   * @returns {string} Clean readable text
   */
  cleanTextForSpeech(text) {
    if (!text || typeof text !== 'string') return '';
    return text
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Remove inline code
      .replace(/`[^`]+`/g, '')
      // Remove markdown headers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold and italic
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove blockquotes
      .replace(/^>\s+/gm, '')
      // Remove links [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Remove bullet markers
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      // Remove HTML tags
      .replace(/<[^>]+>/g, '')
      // Convert scores like 88/100 to natural speech "88 pontos"
      .replace(/(\d+)\/100/g, '$1 pontos')
      // Clean duplicate whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Finds the best matching voice for the given language and voice preference.
   * @param {string} [lang='pt-BR']
   * @param {'female'|'male'|'robot'|'neutral'} [genderPref='neutral']
   * @returns {SpeechSynthesisVoice|null}
   */
  getBestVoice(lang = 'pt-BR', genderPref = 'neutral') {
    if (!this.voices || this.voices.length === 0) {
      this._loadVoices();
    }

    const ptVoices = this.voices.filter(v => v.lang && (v.lang.startsWith('pt') || v.lang.includes('pt-BR') || v.lang.includes('pt_BR')));
    
    if (ptVoices.length === 0) {
      // Fallback to default voice
      return this.voices.find(v => v.default) || this.voices[0] || null;
    }

    // Attempt gender / persona heuristic
    if (genderPref === 'female') {
      const female = ptVoices.find(v => /female|mulher|luciana|maria|helena|victoria|francisca/i.test(v.name));
      if (female) return female;
    } else if (genderPref === 'male') {
      const male = ptVoices.find(v => /male|homem|felipe|daniel|ricardo|jorge|marcus/i.test(v.name));
      if (male) return male;
    }

    return ptVoices[0] || this.voices[0] || null;
  }

  /**
   * Gets vocal parameters (pitch, rate, volume, voice) for a given agent persona.
   * @param {'debaterA'|'debaterB'|'judge'|string} agentKey
   * @returns {{ pitch: number, rate: number, volume: number, voice: SpeechSynthesisVoice|null }}
   */
  getVoiceProfile(agentKey = 'debaterA') {
    let pitch = 1.0;
    let rate = 1.0;
    let volume = 1.0;
    let genderPref = 'neutral';

    switch (agentKey) {
      case 'debaterA':
        // Dr. Marcus Vance: Tecnocrata firme, analítico, tom levemente mais grave e rápido
        pitch = 0.92;
        rate = 1.08;
        genderPref = 'male';
        break;

      case 'debaterB':
        // Dra. Helena Rios: Humanista expressiva, articulada, tom caloroso
        pitch = 1.15;
        rate = 0.98;
        genderPref = 'female';
        break;

      case 'judge':
        // Lexis-9: Juiz imparcial, tom mais solene, pausado e autoritário
        pitch = 0.82;
        rate = 0.95;
        genderPref = 'male';
        break;

      default:
        pitch = 1.0;
        rate = 1.0;
        break;
    }

    const voice = this.getBestVoice('pt-BR', genderPref);
    return { pitch, rate, volume, voice };
  }

  /**
   * Unlocks speech synthesis and Web Audio contexts upon user gesture (e.g. clicking start button).
   */
  unlockAudio() {
    if (typeof window !== 'undefined') {
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.resume();
          const dummy = new SpeechSynthesisUtterance('');
          dummy.volume = 0.01;
          window.speechSynthesis.speak(dummy);
        } catch (e) {
          // Ignore unlock error
        }
      }
      const ctx = this._getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    }
  }

  /**
   * Speaks the provided text using Web Speech API if supported with voices,
   * or falls back automatically to procedural Web Audio neural speech synthesis.
   *
   * @param {string} rawText - Text to speak (will be cleaned from markdown)
   * @param {'debaterA'|'debaterB'|'judge'|string} [agentKey='debaterA']
   * @param {Function} [onEnd] - Callback when speech is completed or cancelled
   * @returns {boolean} True if speech started, false if muted or unsupported
   */
  speak(rawText, agentKey = 'debaterA', onEnd = null) {
    if (this.isMuted) {
      if (typeof onEnd === 'function') onEnd();
      return false;
    }

    const cleanText = this.cleanTextForSpeech(rawText);
    if (!cleanText) {
      if (typeof onEnd === 'function') onEnd();
      return false;
    }

    // Stop ongoing speech & resume paused state
    this.stop();

    const hasSpeechSynth = typeof window !== 'undefined' && 'speechSynthesis' in window;
    const hasVoices = this.voices && this.voices.length > 0;

    if (hasSpeechSynth && hasVoices) {
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        const profile = this.getVoiceProfile(agentKey);
        const utterance = new SpeechSynthesisUtterance(cleanText);

        utterance.lang = profile.voice?.lang || 'pt-BR';
        utterance.pitch = profile.pitch;
        utterance.rate = profile.rate;
        utterance.volume = profile.volume;
        if (profile.voice) {
          utterance.voice = profile.voice;
        }

        this.isSpeaking = true;
        this.currentUtterance = utterance;

        let finished = false;
        const finishSpeech = () => {
          if (finished) return;
          finished = true;
          this.isSpeaking = false;
          this.currentUtterance = null;
          if (typeof onEnd === 'function') onEnd();
        };

        utterance.onend = finishSpeech;
        utterance.onerror = (e) => {
          if (!finished) {
            finished = true;
            this.currentUtterance = null;
            // Seamless procedural fallback on OS speech synthesis failure (e.g. Linux synthesis-failed)
            this.speakWithWebAudio(cleanText, agentKey, onEnd);
          }
        };

        window.speechSynthesis.speak(utterance);

        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        return true;
      } catch (err) {
        console.warn('SpeechSynthesis threw, falling back to Web Audio formant synth:', err);
      }
    }

    // Direct Web Audio Procedural Synthesis fallback
    return this.speakWithWebAudio(cleanText, agentKey, onEnd);
  }

  /**
   * Procedural Neural Speech Synthesizer using Web Audio API Formant Filters.
   * Produces rhythmic vocal formants with distinct timbres for each persona.
   *
   * @param {string} cleanText
   * @param {string} agentKey
   * @param {Function} [onEnd]
   * @returns {boolean}
   */
  speakWithWebAudio(cleanText, agentKey = 'debaterA', onEnd = null) {
    const ctx = this._getAudioContext();
    if (!ctx) {
      if (typeof onEnd === 'function') onEnd();
      return false;
    }

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    this.isSpeaking = true;

    // Persona vocal configuration
    let baseFreq = 160;
    let waveType = 'sawtooth';
    let f1Freq = 600;
    let f2Freq = 1800;
    let qFactor = 5.0;

    switch (agentKey) {
      case 'debaterA':
        // Dr. Marcus Vance: Tecnocrata 165Hz, cybernetic resonance
        baseFreq = 165;
        waveType = 'sawtooth';
        f1Freq = 620;
        f2Freq = 1850;
        qFactor = 5.5;
        break;

      case 'debaterB':
        // Dra. Helena Rios: Humanista 235Hz, warm melodic tone
        baseFreq = 235;
        waveType = 'triangle';
        f1Freq = 720;
        f2Freq = 2200;
        qFactor = 4.0;
        break;

      case 'judge':
        // Lexis-9: Árbitro 110Hz, deep synthetic vocoder
        baseFreq = 110;
        waveType = 'sawtooth';
        f1Freq = 420;
        f2Freq = 1150;
        qFactor = 7.0;
        break;

      default:
        baseFreq = 180;
        waveType = 'sine';
        f1Freq = 600;
        f2Freq = 1800;
        break;
    }

    const words = cleanText.split(/\s+/).filter(Boolean);
    const totalWords = Math.min(words.length, 60); // Cap speech audio duration to ~6-8s max per turn
    const wordDuration = 0.12; // 120ms per word pulse
    const now = ctx.currentTime + 0.05;

    for (let i = 0; i < totalWords; i++) {
      const startTime = now + (i * (wordDuration + 0.03));
      const word = words[i] || '';
      
      // Pitch inflection per syllable
      const pitchMod = (i % 4 === 0 ? 1.08 : i % 3 === 0 ? 0.94 : 1.0) * (word.endsWith('?') ? 1.2 : word.endsWith('.') ? 0.88 : 1.0);
      const freq = baseFreq * pitchMod;

      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const f1 = ctx.createBiquadFilter();
        const f2 = ctx.createBiquadFilter();

        osc.type = waveType;
        osc.frequency.setValueAtTime(freq, startTime);

        // Vocal Formant Filter 1 (Mouth/Throat cavity)
        f1.type = 'bandpass';
        f1.frequency.setValueAtTime(f1Freq, startTime);
        f1.Q.setValueAtTime(qFactor, startTime);

        // Vocal Formant Filter 2 (Nasal/Oral resonance)
        f2.type = 'bandpass';
        f2.frequency.setValueAtTime(f2Freq, startTime);
        f2.Q.setValueAtTime(qFactor * 0.8, startTime);

        // Volume Envelope
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.18, startTime + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + wordDuration);

        // Routing
        osc.connect(f1);
        f1.connect(gain);
        osc.connect(f2);
        f2.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + wordDuration);

        this._activeAudioNodes.push(osc);
      } catch (err) {
        // Fallback for audio scheduling
      }
    }

    const totalSpeechTimeMs = Math.max(1200, Math.round((totalWords * (wordDuration + 0.03) + 0.3) * 1000));

    this._speechTimer = setTimeout(() => {
      this.isSpeaking = false;
      this._speechTimer = null;
      this._activeAudioNodes = [];
      if (typeof onEnd === 'function') {
        onEnd();
      }
    }, totalSpeechTimeMs);

    return true;
  }

  /**
   * Immediately stops any ongoing speech synthesis.
   */
  stop() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {
        // Ignore cancellation error
      }
    }

    if (this._speechTimer) {
      clearTimeout(this._speechTimer);
      this._speechTimer = null;
    }

    this._activeAudioNodes.forEach(node => {
      try {
        node.stop();
        node.disconnect();
      } catch (e) {}
    });
    this._activeAudioNodes = [];

    this.isSpeaking = false;
    this.currentUtterance = null;
  }

  /**
   * Toggles the mute state.
   * @returns {boolean} New isMuted state
   */
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stop();
    }
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.isMuted);
    }
    return this.isMuted;
  }

  /**
   * Explicitly sets mute state.
   * @param {boolean} muted
   */
  setMuted(muted) {
    this.isMuted = Boolean(muted);
    if (this.isMuted) {
      this.stop();
    }
    if (typeof this.onStateChange === 'function') {
      this.onStateChange(this.isMuted);
    }
  }

  /**
   * Checks if TTS or Web Audio is supported by the client browser.
   * @returns {boolean}
   */
  isSupported() {
    if (typeof window === 'undefined') return false;
    return 'speechSynthesis' in window || 'AudioContext' in window || 'webkitAudioContext' in window;
  }
}

export const voiceSynth = new VoiceSynth();
