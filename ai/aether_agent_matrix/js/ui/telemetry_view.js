/**
 * Aether Agent Matrix - Telemetry View & Live Performance HUD
 * Displays real-time WebGPU / Wasm inference statistics, tokens/sec,
 * VRAM/memory consumption, turn latency, and model download progress.
 */

/**
 * Formats tokens per second for display.
 * @param {number} tps
 * @returns {string} e.g. "24.5 tok/s"
 */
export function formatTPS(tps) {
  if (tps === null || tps === undefined || isNaN(tps)) return '0.0 tok/s';
  return `${Number(tps).toFixed(1)} tok/s`;
}

/**
 * Formats duration in milliseconds into human-readable string.
 * @param {number} ms
 * @returns {string} e.g. "450 ms" or "1.8 s"
 */
export function formatDuration(ms) {
  if (ms === null || ms === undefined || isNaN(ms) || ms < 0) return '0 ms';
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)} s`;
  }
  return `${Math.round(ms)} ms`;
}

/**
 * Formats memory in Megabytes into readable MB / GB.
 * @param {number} mb
 * @returns {string} e.g. "1,250 MB", "2.4 GB", or "N/A"
 */
export function formatMemory(mb) {
  if (mb === null || mb === undefined || isNaN(mb) || mb <= 0) return 'N/A';
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${Math.round(mb)} MB`;
}

/**
 * Formats backend name for badge display.
 * @param {string} backend
 * @returns {string}
 */
export function formatBackend(backend) {
  if (!backend) return 'WebGPU';
  const lower = String(backend).toLowerCase();
  if (lower.includes('webgpu')) return 'WebGPU';
  if (lower.includes('wasm') || lower.includes('worker')) return 'Wasm Worker';
  if (lower.includes('mock')) return 'Mock Engine';
  if (lower.includes('cpu')) return 'CPU Fallback';
  return backend;
}

/**
 * TelemetryView class for managing the HUD and loading modal.
 */
export class TelemetryView {
  /**
   * @param {Object} [options]
   * @param {Object} [options.state] - Optional StateManager instance
   * @param {Object} [options.selectors] - Custom DOM selectors
   * @param {Object} [options.elements] - Direct element references (useful for tests)
   */
  constructor(options = {}) {
    this.state = options.state || null;
    this.unsubscribers = [];

    this.selectors = {
      backendBadge: '#hud-backend, [data-telemetry="backend"]',
      modelName: '#hud-model, [data-telemetry="model"]',
      tps: '#hud-tps, [data-telemetry="tokensPerSec"]',
      turnTime: '#hud-turn-time, [data-telemetry="turnTime"]',
      vram: '#hud-vram, [data-telemetry="vram"]',
      stateBadge: '#hud-state, [data-telemetry="state"]',
      roundBadge: '#hud-round, [data-telemetry="round"]',
      loadingModal: '#modal-model-loading, [data-modal="model-loading"]',
      loadingProgressBar: '#model-progress-bar, [data-loading="progress-bar"]',
      loadingProgressText: '#model-progress-text, [data-loading="progress-text"]',
      loadingMessage: '#model-loading-message, [data-loading="message"]',
      ...(options.selectors || {})
    };

    this.elements = options.elements || {};

    if (this.state && typeof this.state.subscribe === 'function') {
      this._bindStateSubscriptions();
    }
  }

  /**
   * Resolves a DOM element safely across browser and test environments.
   * @param {string} key
   * @returns {HTMLElement|null}
   * @private
   */
  _getElement(key) {
    if (this.elements && this.elements[key]) {
      return this.elements[key];
    }
    if (typeof document !== 'undefined' && document !== null && typeof document.querySelector === 'function') {
      const sel = this.selectors[key];
      if (sel) {
        return document.querySelector(sel);
      }
    }
    return null;
  }

  /**
   * Binds subscriptions to StateManager instance.
   * @private
   */
  _bindStateSubscriptions() {
    const unsubTelemetry = this.state.subscribe('telemetry', (data) => {
      this.updateTelemetry(data);
    });
    this.unsubscribers.push(unsubTelemetry);

    const unsubModel = this.state.subscribe('selectedModel', (model) => {
      this.updateModel(model);
    });
    this.unsubscribers.push(unsubModel);

    const unsubTurn = this.state.subscribe('currentTurn', (turn) => {
      const round = this.state.get('currentRoundIndex') || 0;
      const rounds = this.state.get('rounds') || 3;
      this.updateState(turn, round, rounds);
    });
    this.unsubscribers.push(unsubTurn);
  }

  /**
   * Updates HUD telemetry displays.
   * @param {Object} data
   * @param {number} [data.tokensPerSec]
   * @param {number} [data.vramMB]
   * @param {number} [data.turnTimeMs]
   * @param {string} [data.backend]
   */
  updateTelemetry(data = {}) {
    const elBackend = this._getElement('backendBadge');
    if (elBackend) {
      const backendStr = formatBackend(data.backend);
      elBackend.textContent = backendStr;

      // Update backend badge style class if classList exists
      if (elBackend.classList) {
        elBackend.classList.remove('badge-webgpu', 'badge-wasm', 'badge-cpu', 'badge-mock');
        const bLower = (data.backend || '').toLowerCase();
        if (bLower.includes('webgpu')) elBackend.classList.add('badge-webgpu');
        else if (bLower.includes('wasm') || bLower.includes('worker')) elBackend.classList.add('badge-wasm');
        else if (bLower.includes('mock')) elBackend.classList.add('badge-mock');
        else elBackend.classList.add('badge-cpu');
      }
    }

    const elTps = this._getElement('tps');
    if (elTps) {
      elTps.textContent = formatTPS(data.tokensPerSec);
    }

    const elTurnTime = this._getElement('turnTime');
    if (elTurnTime) {
      elTurnTime.textContent = formatDuration(data.turnTimeMs);
    }

    const elVram = this._getElement('vram');
    if (elVram) {
      elVram.textContent = formatMemory(data.vramMB);
    }
  }

  /**
   * Updates state and round display badges.
   * @param {string} stateName
   * @param {number} [roundIndex=0]
   * @param {number} [totalRounds=3]
   */
  updateState(stateName, roundIndex = 0, totalRounds = 3) {
    const elState = this._getElement('stateBadge');
    if (elState) {
      elState.textContent = stateName ? String(stateName).replace(/_/g, ' ') : 'IDLE';
    }

    const elRound = this._getElement('roundBadge');
    if (elRound) {
      const rNum = Math.max(1, (roundIndex || 0) + 1);
      elRound.textContent = `Rodada ${rNum} / ${totalRounds || 3}`;
    }
  }

  /**
   * Updates displayed model name.
   * @param {string} modelName
   */
  updateModel(modelName) {
    const elModel = this._getElement('modelName');
    if (elModel) {
      elModel.textContent = modelName || 'Modelo não selecionado';
      if (elModel.title !== undefined) {
        elModel.title = modelName || '';
      }
    }
  }

  /**
   * Displays model download / loading progress modal.
   * @param {number} progress - Progress value between 0 and 1 (or 0 and 100)
   * @param {string} [message='Carregando pesos do modelo...']
   */
  showModelLoading(progress = 0, message = 'Carregando pesos do modelo...') {
    // Normalize progress to percentage (0 - 100)
    let pct = typeof progress === 'number' ? progress : 0;
    if (pct > 0 && pct <= 1) {
      pct = Math.round(pct * 100);
    } else {
      pct = Math.min(100, Math.max(0, Math.round(pct)));
    }

    const modal = this._getElement('loadingModal');
    if (modal) {
      if (modal.classList) {
        modal.classList.remove('hidden', 'd-none');
        modal.classList.add('active', 'show');
      }
      if (modal.style) {
        modal.style.display = 'flex';
      }
      if (modal.setAttribute) {
        modal.setAttribute('aria-hidden', 'false');
      }
    }

    const bar = this._getElement('loadingProgressBar');
    if (bar) {
      if (bar.style) {
        bar.style.width = `${pct}%`;
      }
      if (bar.setAttribute) {
        bar.setAttribute('aria-valuenow', String(pct));
      }
    }

    const text = this._getElement('loadingProgressText');
    if (text) {
      text.textContent = `${pct}%`;
    }

    const msg = this._getElement('loadingMessage');
    if (msg) {
      msg.textContent = message;
    }
  }

  /**
   * Hides the model download / loading progress modal.
   */
  hideModelLoading() {
    const modal = this._getElement('loadingModal');
    if (modal) {
      if (modal.classList) {
        modal.classList.add('hidden', 'd-none');
        modal.classList.remove('active', 'show');
      }
      if (modal.style) {
        modal.style.display = 'none';
      }
      if (modal.setAttribute) {
        modal.setAttribute('aria-hidden', 'true');
      }
    }
  }

  /**
   * Resets HUD values to initial state.
   */
  reset() {
    this.updateTelemetry({
      tokensPerSec: 0,
      turnTimeMs: 0,
      vramMB: 0,
      backend: 'WebGPU'
    });
    this.updateState('IDLE', 0, 3);
    this.hideModelLoading();
  }

  /**
   * Cleans up all state subscriptions.
   */
  destroy() {
    this.unsubscribers.forEach(unsub => {
      if (typeof unsub === 'function') unsub();
    });
    this.unsubscribers = [];
  }
}
