/**
 * Aether Agent Matrix - Reactive State Management & Persistence
 * Manages global application state, event subscriptions, and localStorage sync.
 */

import { DEFAULT_PERSONAS, validatePersona } from './debate/personas.js';

export const STORAGE_KEYS = {
  CUSTOM_PERSONAS: 'aether_matrix_custom_personas',
  SETTINGS: 'aether_matrix_settings'
};

export const DEFAULT_TOPIC = 'O avanço acelerado da Inteligência Artificial Geral (AGI) deve ser regulado e desacelerado por tratados globais?';

export class StateManager {
  constructor(initialOverrides = {}) {
    this._listeners = new Map();
    this._state = this._buildInitialState(initialOverrides);
    this._loadPersistedData();
  }

  _getStorage() {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      return localStorage;
    }
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
    return null;
  }

  _buildInitialState(overrides = {}) {
    return {
      topic: DEFAULT_TOPIC,
      activeDebaters: {
        debaterA: { ...DEFAULT_PERSONAS.debaterA },
        debaterB: { ...DEFAULT_PERSONAS.debaterB },
        judge: { ...DEFAULT_PERSONAS.judge }
      },
      rounds: 3,
      currentRoundIndex: 0,
      currentTurn: null,
      audienceVotes: {
        debaterA: 0,
        debaterB: 0
      },
      telemetry: {
        tokensPerSec: 0,
        vramMB: 0,
        turnTimeMs: 0,
        backend: 'webgpu'
      },
      isPaused: false,
      isIntervening: false,
      transcriptHistory: [],
      customPersonas: [],
      selectedModel: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
      ...overrides
    };
  }

  _loadPersistedData() {
    const storage = this._getStorage();
    if (!storage) return;

    try {
      const savedPersonas = storage.getItem(STORAGE_KEYS.CUSTOM_PERSONAS);
      if (savedPersonas) {
        const parsed = JSON.parse(savedPersonas);
        if (Array.isArray(parsed)) {
          this._state.customPersonas = parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to load custom personas from localStorage:', e);
    }

    try {
      const savedSettings = storage.getItem(STORAGE_KEYS.SETTINGS);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed && typeof parsed === 'object') {
          if (parsed.selectedModel) this._state.selectedModel = parsed.selectedModel;
          if (parsed.rounds !== undefined) this._state.rounds = parsed.rounds;
          if (parsed.topic) this._state.topic = parsed.topic;
        }
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage:', e);
    }
  }

  get(key) {
    if (!key) {
      return JSON.parse(JSON.stringify(this._state));
    }

    const parts = key.split('.');
    let curr = this._state;
    for (const part of parts) {
      if (curr === null || curr === undefined) return undefined;
      curr = curr[part];
    }
    if (curr !== null && typeof curr === 'object') {
      return JSON.parse(JSON.stringify(curr));
    }
    return curr;
  }

  set(key, value) {
    if (!key || typeof key !== 'string') return;
    const parts = key.split('.');
    let curr = this._state;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (curr[part] === undefined || curr[part] === null || typeof curr[part] !== 'object') {
        curr[part] = {};
      }
      curr = curr[part];
    }

    const finalKey = parts[parts.length - 1];
    const oldValue = curr[finalKey];
    curr[finalKey] = value;

    // Trigger specific listeners
    this._notify(key, value, oldValue);

    // If setting a nested property like 'telemetry.tokensPerSec', also notify parent 'telemetry'
    if (parts.length > 1) {
      const parentKey = parts.slice(0, -1).join('.');
      this._notify(parentKey, this.get(parentKey), null);
    }

    // Notify wildcard
    this._notify('*', this._state, null);

    // Sync persistence if relevant
    if (key === 'customPersonas' || key.startsWith('customPersonas.')) {
      this._persistCustomPersonas();
    } else if (key === 'selectedModel' || key === 'rounds' || key === 'topic') {
      this._persistSettings();
    }
  }

  subscribe(key, callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key).add(callback);

    return () => {
      const set = this._listeners.get(key);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this._listeners.delete(key);
        }
      }
    };
  }

  _notify(key, newValue, oldValue) {
    const listeners = this._listeners.get(key);
    if (listeners) {
      listeners.forEach(cb => {
        try {
          cb(newValue, oldValue, key);
        } catch (err) {
          console.error(`Error in subscriber callback for key "${key}":`, err);
        }
      });
    }
  }

  resetDebate() {
    this.set('currentRoundIndex', 0);
    this.set('currentTurn', null);
    this.set('audienceVotes', { debaterA: 0, debaterB: 0 });
    this.set('telemetry', {
      tokensPerSec: 0,
      vramMB: 0,
      turnTimeMs: 0,
      backend: this.get('telemetry.backend') || 'webgpu'
    });
    this.set('isPaused', false);
    this.set('isIntervening', false);
    this.set('transcriptHistory', []);
    this._notify('debateReset', this._state, null);
  }

  saveCustomPersona(persona) {
    const validation = validatePersona(persona);
    if (!validation.valid) {
      throw new Error(`Invalid persona: ${validation.errors.join(', ')}`);
    }

    const personas = this.get('customPersonas') || [];
    const index = personas.findIndex(p => p.id === persona.id);

    const personaToSave = { ...persona };
    if (index >= 0) {
      personas[index] = personaToSave;
    } else {
      personas.push(personaToSave);
    }

    this.set('customPersonas', personas);
    return personaToSave;
  }

  getCustomPersonas() {
    return this.get('customPersonas') || [];
  }

  deleteCustomPersona(id) {
    if (!id) return false;
    const personas = this.get('customPersonas') || [];
    const initialLen = personas.length;
    const filtered = personas.filter(p => p.id !== id);

    if (filtered.length !== initialLen) {
      this.set('customPersonas', filtered);
      return true;
    }
    return false;
  }

  _persistCustomPersonas() {
    const storage = this._getStorage();
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEYS.CUSTOM_PERSONAS, JSON.stringify(this._state.customPersonas));
    } catch (e) {
      console.warn('Failed to persist custom personas:', e);
    }
  }

  _persistSettings() {
    const storage = this._getStorage();
    if (!storage) return;
    try {
      const settings = {
        selectedModel: this._state.selectedModel,
        rounds: this._state.rounds,
        topic: this._state.topic
      };
      storage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to persist settings:', e);
    }
  }
}

export const appState = new StateManager();
