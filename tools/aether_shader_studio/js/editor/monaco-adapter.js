/**
 * MonacoAdapter - Integrates Monaco Editor for GLSL shader coding in Aether Shader Studio.
 *
 * Configures the Linear Dark theme, sets up C++/GLSL syntax highlighting,
 * manages editor markers for GLSL compilation errors, and exposes two-way code synchronization.
 */
export class MonacoAdapter {
  /**
   * @param {Object|null} [monaco=null] - Optional injected Monaco namespace
   */
  constructor(monaco = null) {
    this.editor = null;
    this.monaco = monaco;
    this.onCodeChange = null;
  }

  /**
   * Asynchronously loads Monaco Editor from CDN or AMD loader if not already available.
   * @returns {Promise<Object>} The global monaco instance
   */
  async loadMonaco() {
    if (this.monaco) {
      return this.monaco;
    }

    if (typeof window !== 'undefined' && window.monaco) {
      this.monaco = window.monaco;
      return window.monaco;
    }

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('window is not defined'));
        return;
      }

      if (typeof window.require === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js';
        script.onload = () => {
          window.require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
          window.require(['vs/editor/editor.main'], () => {
            this.monaco = window.monaco;
            resolve(window.monaco);
          });
        };
        script.onerror = reject;
        document.head.appendChild(script);
      } else {
        window.require(['vs/editor/editor.main'], () => {
          this.monaco = window.monaco;
          resolve(window.monaco);
        });
      }
    });
  }

  /**
   * Initializes the Monaco editor within the specified container.
   * @param {HTMLElement|string} containerEl - DOM element or element ID
   * @param {string} [initialCode=''] - Initial shader code
   * @returns {Promise<Object>} Monaco editor instance
   */
  async init(containerEl, initialCode = '') {
    const monaco = await this.loadMonaco();

    let target = containerEl;
    if (typeof containerEl === 'string' && typeof document !== 'undefined') {
      target = document.getElementById(containerEl) || document.querySelector(containerEl);
    }

    // Define Linear Dark theme
    monaco.editor.defineTheme('linear-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
        { token: 'keyword', foreground: '5e6ad2', fontStyle: 'bold' },
        { token: 'identifier', foreground: 'f8f8f2' },
        { token: 'type', foreground: '00f3ff' },
        { token: 'number', foreground: 'bd93f9' }
      ],
      colors: {
        'editor.background': '#08090a',
        'editor.foreground': '#f8f8f2',
        'editorLineNumber.foreground': '#44475a',
        'editorLineNumber.activeForeground': '#00f3ff',
        'editor.selectionBackground': '#282a36',
        'editor.lineHighlightBackground': '#12151a'
      }
    });

    this.editor = monaco.editor.create(target, {
      value: initialCode,
      language: 'cpp', // GLSL syntax highlighting matches C/C++ tokens cleanly
      theme: 'linear-dark',
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      minimap: { enabled: true },
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 4,
      wordWrap: 'on'
    });

    this.editor.onDidChangeModelContent(() => {
      if (this.onCodeChange) {
        this.onCodeChange(this.editor.getValue());
      }
    });

    return this.editor;
  }

  /**
   * Returns current editor content.
   * @returns {string}
   */
  getCode() {
    return this.editor ? this.editor.getValue() : '';
  }

  /**
   * Updates editor content.
   * @param {string} code
   */
  setCode(code) {
    if (this.editor) {
      this.editor.setValue(code);
    }
  }

  /**
   * Sets compilation error markers in Monaco editor gutter and squiggles.
   * @param {Array<{line: number, column: number, message: string}>} errors
   */
  setMarkers(errors = []) {
    if (!this.monaco || !this.editor) return;
    const model = this.editor.getModel();
    if (!model) return;

    const markers = errors.map(err => ({
      severity: (this.monaco.MarkerSeverity && this.monaco.MarkerSeverity.Error) || 8,
      message: err.message || 'GLSL Error',
      startLineNumber: err.line || 1,
      startColumn: err.column || 1,
      endLineNumber: err.line || 1,
      endColumn: 100
    }));

    this.monaco.editor.setModelMarkers(model, 'glsl', markers);
  }

  /**
   * Navigates editor cursor and viewport to the specified line number.
   * @param {number} lineNumber
   */
  goToLine(lineNumber) {
    if (!this.editor) return;
    this.editor.revealLineInCenter(lineNumber);
    this.editor.setPosition({ lineNumber, column: 1 });
    this.editor.focus();
  }

  /**
   * Disposes of the Monaco editor instance.
   */
  dispose() {
    if (this.editor) {
      this.editor.dispose();
      this.editor = null;
    }
  }
}
