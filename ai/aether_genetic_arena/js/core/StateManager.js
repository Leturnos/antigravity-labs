/**
 * Session persistence manager for serializing/deserializing simulation states
 * and saving/loading snapshots to/from localStorage or JSON files.
 */
export class StateManager {
    /**
     * Serializes simulation state object into a formatted JSON string.
     * @param {object} state - Simulation state or snapshot data
     * @returns {string} JSON string representation
     */
    static serialize(state) {
        return JSON.stringify({
            version: 1,
            timestamp: Date.now(),
            ...state
        }, null, 2);
    }

    /**
     * Deserializes a JSON string into a verified state object.
     * @param {string} jsonString
     * @returns {object|null} Restored state or null if parsing fails
     */
    static deserialize(jsonString) {
        try {
            if (!jsonString || typeof jsonString !== 'string') {
                return null;
            }
            const parsed = JSON.parse(jsonString);
            if (!parsed || typeof parsed !== 'object' || !parsed.version) {
                return null;
            }
            return parsed;
        } catch (err) {
            console.error('StateManager: Failed to parse snapshot JSON:', err);
            return null;
        }
    }

    /**
     * Saves simulation state to localStorage under the specified key.
     * @param {string} key
     * @param {object} state
     * @returns {boolean} True if successfully saved
     */
    static saveToLocalStorage(key, state) {
        try {
            if (typeof localStorage === 'undefined' || !localStorage) {
                return false;
            }
            localStorage.setItem(key, this.serialize(state));
            return true;
        } catch (e) {
            console.warn('StateManager: LocalStorage save failed:', e);
            return false;
        }
    }

    /**
     * Loads and deserializes simulation state from localStorage.
     * @param {string} key
     * @returns {object|null} Restored state or null if not found/invalid
     */
    static loadFromLocalStorage(key) {
        try {
            if (typeof localStorage === 'undefined' || !localStorage) {
                return null;
            }
            const data = localStorage.getItem(key);
            return data ? this.deserialize(data) : null;
        } catch (e) {
            console.warn('StateManager: LocalStorage load failed:', e);
            return null;
        }
    }
}
