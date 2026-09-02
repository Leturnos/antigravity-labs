/**
 * StatusBar manages real-time status HUD metrics for Aether Shader Studio:
 * - Rolling FPS calculation over 500ms intervals
 * - Simulation time (iTime) and frame counter (iFrame)
 * - Canvas resolution and rendering scale selector
 * - Shader compilation status badge (OK / Error / Compiling)
 */
export class StatusBar {
  constructor(options = {}) {
    this.options = {
      fpsPillSelector: '#fps-pill',
      resPillSelector: '#res-pill',
      timePillSelector: '#time-pill',
      compilePillSelector: '#compile-pill',
      resScaleSelectSelector: '#resolution-scale-select',
      fpsIntervalMs: 500,
      ...options
    };

    // DOM Element references
    this.fpsPillEl = null;
    this.resPillEl = null;
    this.timePillEl = null;
    this.compilePillEl = null;
    this.resScaleSelectEl = null;

    // Sub-elements for efficient inner text updates
    this.fpsValEl = null;
    this.resValEl = null;
    this.timeValEl = null;
    this.frameValEl = null;
    this.compileTextEl = null;

    // Rolling FPS state
    this.fpsIntervalMs = this.options.fpsIntervalMs || 500;
    this.frameCount = 0;
    this.lastFpsTime = 0;
    this.currentFps = 60.0;

    // Simulation metrics
    this.currentTime = 0.0;
    this.currentFrame = 0;
    this.currentWidth = 0;
    this.currentHeight = 0;
    this.currentScale = 1.0;

    // Compilation badge state
    this.compileStatus = 'ok'; // 'ok' | 'error' | 'compiling'
    this.compileMessage = '';

    this.init();
  }

  init() {
    const doc = typeof document !== 'undefined' ? document : null;

    this.fpsPillEl = this.options.fpsPillEl || (doc ? doc.querySelector(this.options.fpsPillSelector) : null);
    this.resPillEl = this.options.resPillEl || (doc ? doc.querySelector(this.options.resPillSelector) : null);
    this.timePillEl = this.options.timePillEl || (doc ? doc.querySelector(this.options.timePillSelector) : null);
    this.compilePillEl = this.options.compilePillEl || (doc ? doc.querySelector(this.options.compilePillSelector) : null);
    this.resScaleSelectEl = this.options.resScaleSelectEl || (doc ? doc.querySelector(this.options.resScaleSelectSelector) : null);

    // Cache sub-elements if available
    if (this.fpsPillEl && typeof this.fpsPillEl.querySelector === 'function') {
      this.fpsValEl = this.fpsPillEl.querySelector('.pill-value') || this.fpsPillEl;
    } else {
      this.fpsValEl = this.fpsPillEl;
    }

    if (this.resPillEl && typeof this.resPillEl.querySelector === 'function') {
      this.resValEl = this.resPillEl.querySelector('#res-val') || this.resPillEl.querySelector('.pill-value') || this.resPillEl;
    } else {
      this.resValEl = this.resPillEl;
    }

    if (this.timePillEl && typeof this.timePillEl.querySelector === 'function') {
      this.timeValEl = this.timePillEl.querySelector('#time-val') || this.timePillEl.querySelector('.pill-value');
      this.frameValEl = this.timePillEl.querySelector('#frame-val') || this.timePillEl.querySelector('.pill-sub');
    }

    if (this.compilePillEl && typeof this.compilePillEl.querySelector === 'function') {
      this.compileTextEl = this.compilePillEl.querySelector('.compile-text') || this.compilePillEl;
    } else {
      this.compileTextEl = this.compilePillEl;
    }
  }

  /**
   * Record a new render frame and compute rolling FPS over 500ms intervals.
   * @param {number} [now] - High-resolution timestamp (ms). Defaults to performance.now().
   * @returns {number} Current rolling FPS.
   */
  recordFrame(now) {
    const timestamp = typeof now === 'number'
      ? now
      : (typeof performance !== 'undefined' ? performance.now() : Date.now());

    if (this.lastFpsTime === 0) {
      this.lastFpsTime = timestamp;
      this.frameCount = 0;
      return this.currentFps;
    }

    this.frameCount++;

    const elapsed = timestamp - this.lastFpsTime;
    if (elapsed >= this.fpsIntervalMs) {
      this.currentFps = (this.frameCount * 1000) / elapsed;
      this.frameCount = 0;
      this.lastFpsTime = timestamp;
      this._renderFPS();
    }

    return this.currentFps;
  }

  /**
   * Alias for recordFrame.
   */
  updateFPS(now) {
    return this.recordFrame(now);
  }

  _renderFPS() {
    if (!this.fpsPillEl) return;
    const formatted = this.currentFps.toFixed(1);
    if (this.fpsValEl && this.fpsValEl !== this.fpsPillEl) {
      this.fpsValEl.textContent = formatted;
    } else {
      this.fpsPillEl.textContent = `${formatted} FPS`;
    }
  }

  getFPS() {
    return this.currentFps;
  }

  /**
   * Update elapsed simulation time and frame counter.
   * @param {number} iTime - Elapsed time in seconds.
   * @param {number} iFrame - Rendered frame index.
   */
  updateTime(iTime = 0, iFrame = 0) {
    this.currentTime = Number(iTime) || 0;
    this.currentFrame = Math.max(0, Math.floor(Number(iFrame) || 0));

    const timeStr = `${this.currentTime.toFixed(2)}s`;
    const frameStr = `F: ${this.currentFrame}`;

    if (this.timeValEl) {
      this.timeValEl.textContent = timeStr;
    }
    if (this.frameValEl) {
      this.frameValEl.textContent = frameStr;
    }
    if (!this.timeValEl && !this.frameValEl && this.timePillEl) {
      this.timePillEl.textContent = `${timeStr} | ${frameStr}`;
    }
  }

  getTime() {
    return this.currentTime;
  }

  getFrame() {
    return this.currentFrame;
  }

  /**
   * Update canvas resolution display and optional scaling selector.
   * @param {number} width - Canvas physical width in pixels.
   * @param {number} height - Canvas physical height in pixels.
   * @param {number} [scale] - Resolution scale multiplier (e.g. 0.5, 1.0, 2.0).
   */
  updateResolution(width, height, scale) {
    this.currentWidth = Math.max(0, Math.floor(width || 0));
    this.currentHeight = Math.max(0, Math.floor(height || 0));
    if (typeof scale === 'number') {
      this.currentScale = scale;
    }

    const resStr = `${this.currentWidth}×${this.currentHeight}`;

    if (this.resValEl && this.resValEl !== this.resPillEl) {
      this.resValEl.textContent = resStr;
    } else if (this.resPillEl) {
      this.resPillEl.textContent = resStr;
    }

    if (this.resScaleSelectEl && typeof scale === 'number') {
      this.resScaleSelectEl.value = String(scale);
    }
  }

  getResolution() {
    return {
      width: this.currentWidth,
      height: this.currentHeight,
      scale: this.currentScale
    };
  }

  /**
   * Update compile status badge and pulse style.
   * @param {'ok' | 'error' | 'compiling'} status
   * @param {string} [message] - Optional error details or message.
   */
  setCompileStatus(status, message = '') {
    const validStatus = ['ok', 'error', 'compiling'].includes(status) ? status : 'ok';
    this.compileStatus = validStatus;
    this.compileMessage = message;

    if (!this.compilePillEl) return;

    if (this.compilePillEl.classList) {
      this.compilePillEl.classList.remove('status-ok', 'status-error', 'status-compiling');
      this.compilePillEl.classList.add(`status-${validStatus}`);
    }

    let badgeText = 'OK';
    let tooltip = 'Shader compilado com sucesso';

    if (validStatus === 'error') {
      badgeText = 'Erro';
      tooltip = message ? `Erro GLSL: ${message}` : 'Erro de compilação no shader';
    } else if (validStatus === 'compiling') {
      badgeText = 'Compilando...';
      tooltip = 'Compilando código GLSL...';
    }

    if (this.compileTextEl) {
      this.compileTextEl.textContent = badgeText;
    } else {
      this.compilePillEl.textContent = badgeText;
    }

    this.compilePillEl.title = tooltip;
  }

  getCompileStatus() {
    return {
      status: this.compileStatus,
      message: this.compileMessage
    };
  }

  /**
   * Reset all counters and metrics to initial state.
   */
  reset() {
    this.frameCount = 0;
    this.lastFpsTime = 0;
    this.currentFps = 60.0;
    this.currentTime = 0.0;
    this.currentFrame = 0;
    this.setCompileStatus('ok');
    this.updateTime(0, 0);
    this._renderFPS();
  }
}

export default StatusBar;
