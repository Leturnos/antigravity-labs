/**
 * KeybindingsManager - Handles global keyboard shortcuts for Aether Shader Studio.
 *
 * Supported shortcuts:
 * - Ctrl+Enter / Cmd+Enter: Trigger shader recompilation
 * - Ctrl+S / Cmd+S: Save shader to local storage or export
 * - Space: Toggle play/pause (disabled when focused inside code editor or input fields)
 * - H / F11: Toggle zen mode (disabled when focused inside code editor or input fields)
 * - R: Reset simulation time (disabled when focused inside code editor or input fields)
 */
export class KeybindingsManager {
  /**
   * Bind global keybindings for the shader studio.
   * @param {Object} actions
   * @param {() => void} [actions.onCompile] - Action for Ctrl+Enter / Cmd+Enter
   * @param {() => void} [actions.onSave] - Action for Ctrl+S / Cmd+S
   * @param {() => void} [actions.onTogglePlay] - Action for Space
   * @param {() => void} [actions.onToggleZen] - Action for H / F11
   * @param {() => void} [actions.onResetTime] - Action for R
   * @returns {() => void} Function to unbind/remove the event listener
   */
  static bind(actions = {}) {
    const handler = (e) => {
      // Ctrl+Enter or Cmd+Enter: Compile
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (actions.onCompile) actions.onCompile();
        return;
      }

      // Ctrl+S or Cmd+S: Save
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (actions.onSave) actions.onSave();
        return;
      }

      const target = e.target;
      const isInsideInputOrEditor = Boolean(
        target && typeof target.closest === 'function' &&
        (target.closest('.monaco-editor') || target.closest('input') || target.closest('textarea'))
      );

      // Space: Toggle Play/Pause (when not typing in editor)
      if ((e.code === 'Space' || e.key === ' ') && !isInsideInputOrEditor) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (actions.onTogglePlay) actions.onTogglePlay();
        return;
      }

      // H or F11: Zen Mode
      if ((e.key === 'h' || e.key === 'H' || e.key === 'F11') && !isInsideInputOrEditor) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (actions.onToggleZen) actions.onToggleZen();
        return;
      }

      // R: Reset time
      if ((e.key === 'r' || e.key === 'R') && !isInsideInputOrEditor) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (actions.onResetTime) actions.onResetTime();
        return;
      }
    };

    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('keydown', handler);
    }

    return () => {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('keydown', handler);
      }
    };
  }

  /**
   * Alias for bind(actions).
   * @param {Object} actions
   * @returns {() => void}
   */
  static bindAll(actions) {
    return KeybindingsManager.bind(actions);
  }
}
