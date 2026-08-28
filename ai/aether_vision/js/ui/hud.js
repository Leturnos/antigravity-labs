/**
 * Aether Vision Sandbox - HUD & UI Telemetry Manager
 * Handles DOM telemetry updates, glassmorphism status overlays,
 * toast notification system, and interactive user controls.
 */

export const TOAST_ICONS = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌'
};

/**
 * Manages DOM telemetry elements and toast notifications.
 */
export class HudManager {
    /**
     * @param {Object} [config] - Configuration options
     */
    constructor(config = {}) {
        this.config = {
            toastDuration: 3000,
            ...config
        };

        this.elements = {};
        this.toastTimeout = null;
        this.eventCallbacks = {};
        this.boundListeners = [];
    }

    /**
     * Initializes and caches DOM element references.
     * @param {HTMLElement|Document} [container=null]
     */
    init(container = null) {
        const root = container || (typeof document !== 'undefined' ? document : null);
        if (!root) return;

        const getEl = (id) => (root.getElementById ? root.getElementById(id) : null);
        const queryEl = (sel) => (root.querySelector ? root.querySelector(sel) : null);
        const queryAll = (sel) => (root.querySelectorAll ? Array.from(root.querySelectorAll(sel)) : []);

        this.elements = {
            // General Telemetry
            fps: getEl('hud-fps-val'),
            latency: getEl('hud-latency-val'),
            hands: getEl('hud-hands-val'),
            confidence: getEl('hud-confidence-val'),
            statusBadge: getEl('hud-status-badge'),
            leftGesture: getEl('hud-gesture-left'),
            rightGesture: getEl('hud-gesture-right'),
            modeBadge: getEl('hud-mode-badge'),

            // Theremin Telemetry
            note: getEl('hud-note-val'),
            freq: getEl('hud-freq-val'),
            scale: getEl('hud-scale-val'),
            filter: getEl('hud-filter-val'),
            volume: getEl('hud-volume-val'),

            // Arcade Telemetry
            score: getEl('hud-score-val'),
            combo: getEl('hud-combo-val'),
            multiplier: getEl('hud-multiplier-val'),
            highScore: getEl('hud-highscore-val'),

            // Toast Alerts
            toast: getEl('aether-toast'),
            toastMsg: getEl('toast-message'),
            toastIcon: getEl('toast-icon'),

            // Interactive Controls
            btnCamera: getEl('btn-toggle-camera'),
            btnMute: getEl('btn-toggle-mute'),
            btnMirror: getEl('btn-toggle-mirror'),
            btnGrid: getEl('btn-toggle-grid'),
            btnResetScore: getEl('btn-reset-score'),
            modeButtons: queryAll('.mode-btn')
        };
    }

    /**
     * Updates real-time telemetry metrics in batch.
     * @param {Object} metrics 
     */
    updateTelemetry(metrics = {}) {
        if (!metrics) return;

        if (this.elements.fps && metrics.fps !== undefined) {
            this.elements.fps.innerText = `${Math.round(metrics.fps)} FPS`;
        }

        if (this.elements.latency && metrics.latency !== undefined) {
            this.elements.latency.innerText = `${typeof metrics.latency === 'number' ? metrics.latency.toFixed(1) : metrics.latency} ms`;
        }

        if (this.elements.hands && metrics.handsCount !== undefined) {
            this.elements.hands.innerText = `${metrics.handsCount} detected`;
        }

        if (this.elements.confidence && metrics.trackingConfidence !== undefined) {
            const pct = Math.round(metrics.trackingConfidence * 100);
            this.elements.confidence.innerText = `${pct}%`;
        }

        if (this.elements.leftGesture && metrics.leftGesture !== undefined) {
            this.elements.leftGesture.innerText = metrics.leftGesture || 'NONE';
        }

        if (this.elements.rightGesture && metrics.rightGesture !== undefined) {
            this.elements.rightGesture.innerText = metrics.rightGesture || 'NONE';
        }

        if (this.elements.modeBadge && metrics.activeMode) {
            this.elements.modeBadge.innerText = String(metrics.activeMode).toUpperCase();
        }
    }

    /**
     * Updates Air Theremin audio telemetry displays.
     * @param {Object} info 
     */
    updateTheremin(info = {}) {
        if (!info) return;

        if (this.elements.note && info.noteName !== undefined) {
            this.elements.note.innerText = info.noteName || '--';
        }

        if (this.elements.freq && info.frequency !== undefined) {
            const hz = typeof info.frequency === 'number' ? Math.round(info.frequency) : info.frequency;
            this.elements.freq.innerText = `${hz} Hz`;
        }

        if (this.elements.scale && info.scaleKey !== undefined) {
            this.elements.scale.innerText = String(info.scaleKey).toUpperCase();
        }

        if (this.elements.filter && info.cutoffHz !== undefined) {
            const khz = (info.cutoffHz / 1000).toFixed(1);
            this.elements.filter.innerText = `${khz} kHz`;
        }

        if (this.elements.volume && info.volumePct !== undefined) {
            this.elements.volume.innerText = `${Math.round(info.volumePct)}%`;
        }
    }

    /**
     * Updates Gesture Arcade game metrics.
     * @param {Object} info 
     */
    updateArcade(info = {}) {
        if (!info) return;

        if (this.elements.score && info.score !== undefined) {
            this.elements.score.innerText = `${info.score}`;
        }

        if (this.elements.combo && info.combo !== undefined) {
            this.elements.combo.innerText = `${info.combo}x`;
        }

        if (this.elements.multiplier && info.multiplier !== undefined) {
            this.elements.multiplier.innerText = `x${info.multiplier}`;
        }

        if (this.elements.highScore && info.highScore !== undefined) {
            this.elements.highScore.innerText = `${info.highScore}`;
        }
    }

    /**
     * Updates status badge text and error indicator.
     * @param {string} statusText 
     * @param {boolean} [isError=false] 
     */
    updateStatus(statusText, isError = false) {
        if (!this.elements.statusBadge) return;

        this.elements.statusBadge.innerText = statusText;
        if (this.elements.statusBadge.classList) {
            if (isError) {
                this.elements.statusBadge.classList.add('error');
                this.elements.statusBadge.classList.remove('active');
            } else {
                this.elements.statusBadge.classList.remove('error');
                this.elements.statusBadge.classList.add('active');
            }
        }
    }

    /**
     * Displays a glassmorphism toast notification.
     * @param {string} message 
     * @param {'info'|'success'|'warning'|'error'} [type='info'] 
     * @param {number} [duration=3000] 
     * @returns {Object} Toast result info
     */
    showToast(message, type = 'info', duration = null) {
        const dur = duration !== null ? duration : this.config.toastDuration;

        if (this.elements.toastMsg) {
            this.elements.toastMsg.innerText = message;
        }

        if (this.elements.toastIcon) {
            this.elements.toastIcon.innerText = TOAST_ICONS[type] || TOAST_ICONS.info;
        }

        if (this.elements.toast && this.elements.toast.classList) {
            this.elements.toast.classList.remove('toast-info', 'toast-success', 'toast-warning', 'toast-error');
            this.elements.toast.classList.add(`toast-${type}`);
            this.elements.toast.classList.add('show');
        }

        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }

        this.toastTimeout = setTimeout(() => {
            if (this.elements.toast && this.elements.toast.classList) {
                this.elements.toast.classList.remove('show');
            }
        }, dur);

        return { message, type, duration: dur };
    }

    /**
     * Sets active mode highlighting on mode navigation buttons.
     * @param {string} modeName 
     */
    setActiveMode(modeName) {
        if (!modeName) return;

        if (this.elements.modeBadge) {
            this.elements.modeBadge.innerText = modeName.toUpperCase();
        }

        if (Array.isArray(this.elements.modeButtons)) {
            for (const btn of this.elements.modeButtons) {
                if (btn.classList) {
                    const btnMode = btn.getAttribute ? btn.getAttribute('data-mode') : null;
                    if (btnMode === modeName) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                }
            }
        }
    }

    /**
     * Binds UI event listeners to action buttons.
     * @param {Object} callbacks - Handler callbacks
     */
    bindEvents(callbacks = {}) {
        this.eventCallbacks = { ...this.eventCallbacks, ...callbacks };

        const bindClick = (el, handler) => {
            if (el && typeof el.addEventListener === 'function') {
                const listener = (e) => handler(e);
                el.addEventListener('click', listener);
                this.boundListeners.push({ element: el, type: 'click', listener });
            }
        };

        if (callbacks.onToggleCamera) {
            bindClick(this.elements.btnCamera, callbacks.onToggleCamera);
        }
        if (callbacks.onToggleMute) {
            bindClick(this.elements.btnMute, callbacks.onToggleMute);
        }
        if (callbacks.onToggleMirror) {
            bindClick(this.elements.btnMirror, callbacks.onToggleMirror);
        }
        if (callbacks.onToggleGrid) {
            bindClick(this.elements.btnGrid, callbacks.onToggleGrid);
        }
        if (callbacks.onResetScore) {
            bindClick(this.elements.btnResetScore, callbacks.onResetScore);
        }

        if (callbacks.onSwitchMode && Array.isArray(this.elements.modeButtons)) {
            for (const btn of this.elements.modeButtons) {
                bindClick(btn, () => {
                    const mode = btn.getAttribute ? btn.getAttribute('data-mode') : null;
                    if (mode) {
                        this.setActiveMode(mode);
                        callbacks.onSwitchMode(mode);
                    }
                });
            }
        }
    }

    /**
     * Programmatically triggers a mode switch event.
     * @param {string} mode 
     */
    triggerModeSwitch(mode) {
        this.setActiveMode(mode);
        if (typeof this.eventCallbacks.onSwitchMode === 'function') {
            this.eventCallbacks.onSwitchMode(mode);
        }
    }

    /**
     * Cleans up all event listeners and active timers.
     */
    destroy() {
        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
            this.toastTimeout = null;
        }

        for (const { element, type, listener } of this.boundListeners) {
            if (element && typeof element.removeEventListener === 'function') {
                element.removeEventListener(type, listener);
            }
        }
        this.boundListeners = [];
        this.eventCallbacks = {};
    }
}
