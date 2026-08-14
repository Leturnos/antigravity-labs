/**
 * Formatting and Syntax Highlighting Utilities for Aether API Workbench.
 */

/**
 * Format bytes into human-readable string (B, KB, MB, GB).
 * @param {number} bytes - Number of bytes.
 * @returns {string} Formatted string.
 */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes < 0) {
    return '0 B';
  }
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  if (i === 0) {
    return `${bytes} B`;
  }

  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(val < 10 ? 2 : 1)} ${sizes[i]}`;
}

/**
 * Format milliseconds into human-readable duration (ms or s).
 * @param {number} ms - Milliseconds.
 * @returns {string} Formatted duration string.
 */
export function formatMs(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) {
    return '0 ms';
  }
  if (ms < 1 && ms > 0) {
    return `${ms.toFixed(2)} ms`;
  }
  if (ms < 1000) {
    return `${Math.round(ms * 10) / 10} ms`;
  }
  const s = ms / 1000;
  return `${s.toFixed(2)} s`;
}

/**
 * Escape HTML special characters for safe template rendering.
 * @param {string} str - Raw string.
 * @returns {string} Escaped string.
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') {
    str = String(str ?? '');
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Highlight JSON string or object into HTML with syntax color tokens.
 * @param {string|object} jsonInput - Object or JSON string to format.
 * @returns {string} HTML string with colored tokens.
 */
export function highlightJson(jsonInput) {
  if (jsonInput === null || jsonInput === undefined) {
    return '<span class="json-null">null</span>';
  }

  let formatted = '';
  if (typeof jsonInput === 'object') {
    try {
      formatted = JSON.stringify(jsonInput, null, 2);
    } catch {
      formatted = String(jsonInput);
    }
  } else if (typeof jsonInput === 'string') {
    try {
      const parsed = JSON.parse(jsonInput);
      formatted = JSON.stringify(parsed, null, 2);
    } catch {
      // If it is not valid JSON, treat as plain text escaped
      return escapeHtml(jsonInput);
    }
  } else {
    formatted = String(jsonInput);
  }

  const escaped = escapeHtml(formatted);

  // Regex to tokenize JSON
  const jsonTokenRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;

  return escaped.replace(jsonTokenRegex, (match) => {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'json-key';
        return `<span class="${cls}">${match.slice(0, -1)}</span>:`;
      } else {
        cls = 'json-string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return `<span class="${cls}">${match}</span>`;
  });
}
