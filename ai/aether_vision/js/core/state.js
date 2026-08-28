/**
 * Aether Vision Sandbox - Centralized State Manager
 * 
 * Provides a reactive, event-driven state store with pub/sub subscription support,
 * nested path navigation, and default configurations for Vision, Audio, Arcade, and Debugger modes.
 */

export const DEFAULT_STATE = {
    // Active application mode: 'theremin' | 'arcade' | 'debugger'
    activeMode: 'theremin',

    // System and stream telemetry
    isTracking: false,
    cameraActive: false,
    mirrored: true,
    fps: 0,
    latency: 0,

    // Hand tracking & gesture detection data
    handsCount: 0,
    primaryHand: null, // 'Left' | 'Right'
    detectedGestures: {
        left: null,
        right: null
    },
    rawLandmarks: [],
    smoothedLandmarks: [],

    // Audio & Air Theremin configuration
    audioEnabled: false,
    activeScale: 'pentatonic_major',
    baseOctave: 3,
    octavesSpan: 2,
    oscillatorType: 'sine',
    volume: 0.7,
    reverbWet: 0.3,
    synthFrequency: 440,
    synthGain: 0,

    // Gesture Arcade minigame configuration
    arcadeMode: 'deflect', // 'deflect' | 'slice'
    arcadeScore: 0,
    arcadeCombo: 0,
    arcadeLives: 3,
    arcadeGameOver: false,
    arcadeHighScore: 0,
    arcadeTargets: [],

    // Vision Debugger overlays & telemetry toggles
    showSkeleton: true,
    showBoundingBox: true,
    showLandmarkIndices: false,
    showFps: true,
    showGestures: true,
    showDepthGraph: true,
    smoothingAlpha: 0.6
};

/**
 * Helper to get a deeply nested property from an object using a dot-notated string.
 * @param {object} obj - Source object
 * @param {string} path - Dot-separated path (e.g. 'arcade.score' or 'fps')
 * @param {*} defaultValue - Fallback value if path does not exist
 * @returns {*}
 */
function getNestedValue(obj, path, defaultValue = undefined) {
    if (!obj || typeof obj !== 'object') return defaultValue;
    if (path in obj) return obj[path];

    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return defaultValue;
        }
        current = current[key];
    }
    return current !== undefined ? current : defaultValue;
}

/**
 * Helper to set a deeply nested property in an object using a dot-notated string.
 * @param {object} obj - Source object
 * @param {string} path - Dot-separated path
 * @param {*} value - Value to set
 * @returns {*}
 */
function setNestedValue(obj, path, value) {
    if (!obj || typeof obj !== 'object') return false;
    if (!path.includes('.')) {
        obj[path] = value;
        return true;
    }

    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
            current[key] = {};
        }
        current = current[key];
    }
    current[keys[keys.length - 1]] = value;
    return true;
}

/**
 * Reactive StateManager with Pub/Sub subscriptions.
 */
export class StateManager {
    /**
     * @param {object} [initialOverrides={}] - Optional initial state values overriding DEFAULT_STATE
     */
    constructor(initialOverrides = {}) {
        this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        Object.assign(this.state, initialOverrides);
        
        /** @type {Map<string, Set<Function>>} */
        this.listeners = new Map();
    }

    /**
     * Retrieves a state value by key or dot-separated path.
     * @param {string} key - State key or nested path
     * @param {*} [defaultValue=undefined] - Fallback value if undefined
     * @returns {*}
     */
    get(key, defaultValue = undefined) {
        return getNestedValue(this.state, key, defaultValue);
    }

    /**
     * Sets a state value and notifies registered listeners.
     * @param {string} key - State key or nested path
     * @param {*} value - New value to store
     * @returns {*} Stored value
     */
    set(key, value) {
        const oldValue = this.get(key);
        if (oldValue === value && typeof value !== 'object' && value !== null) {
            return value;
        }

        setNestedValue(this.state, key, value);
        this.notify(key, value, oldValue);
        return value;
    }

    /**
     * Updates multiple key-value pairs atomically and notifies listeners.
     * @param {object} partialState - Key-value map of state updates
     */
    update(partialState) {
        if (!partialState || typeof partialState !== 'object') return;
        for (const [key, value] of Object.entries(partialState)) {
            this.set(key, value);
        }
    }

    /**
     * Subscribes a callback to changes for a specific key or '*' for any change.
     * @param {string} key - Specific state key or '*' for wildcard
     * @param {Function} callback - Function receiving (newValue, oldValue, key)
     * @returns {Function} Unsubscribe function
     */
    subscribe(key, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError(`StateManager.subscribe: callback must be a function, received ${typeof callback}`);
        }

        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }

        this.listeners.get(key).add(callback);

        return () => {
            this.unsubscribe(key, callback);
        };
    }

    /**
     * Unsubscribes a previously registered listener.
     * @param {string} key - State key
     * @param {Function} callback - Function reference to remove
     */
    unsubscribe(key, callback) {
        const keySet = this.listeners.get(key);
        if (keySet) {
            keySet.delete(callback);
            if (keySet.size === 0) {
                this.listeners.delete(key);
            }
        }
    }

    /**
     * Notifies listeners of a state change.
     * @private
     * @param {string} key - State key that changed
     * @param {*} newValue - Updated value
     * @param {*} oldValue - Previous value
     */
    notify(key, newValue, oldValue) {
        // Direct key listeners
        const directListeners = this.listeners.get(key);
        if (directListeners) {
            for (const cb of directListeners) {
                try {
                    cb(newValue, oldValue, key);
                } catch (err) {
                    console.error(`StateManager listener error for key "${key}":`, err);
                }
            }
        }

        // Wildcard listeners
        const wildcardListeners = this.listeners.get('*');
        if (wildcardListeners) {
            for (const cb of wildcardListeners) {
                try {
                    cb(newValue, oldValue, key);
                } catch (err) {
                    console.error(`StateManager wildcard listener error for key "${key}":`, err);
                }
            }
        }
    }

    /**
     * Resets the entire state back to default configuration.
     * @param {object} [customDefaults={}] - Optional custom defaults to merge
     */
    reset(customDefaults = {}) {
        const oldState = { ...this.state };
        this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        Object.assign(this.state, customDefaults);

        // Notify wildcard listeners of full state reset
        const wildcardListeners = this.listeners.get('*');
        if (wildcardListeners) {
            for (const cb of wildcardListeners) {
                try {
                    cb(this.state, oldState, '*');
                } catch (err) {
                    console.error('StateManager reset wildcard listener error:', err);
                }
            }
        }
    }

    /**
     * Returns a snapshot of the current state.
     * @returns {object}
     */
    getState() {
        return JSON.parse(JSON.stringify(this.state));
    }
}

/**
 * Singleton instance shared across the entire application runtime.
 */
export const appState = new StateManager();
