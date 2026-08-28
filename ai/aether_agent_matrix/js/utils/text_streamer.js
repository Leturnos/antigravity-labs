/**
 * Aether Agent Matrix - Text Streamer & Markdown Renderer
 * Lightweight, zero-dependency, XSS-safe Markdown to HTML parser and
 * incremental token streaming writer with blinking cursor support.
 */

/**
 * Escapes unsafe HTML characters to prevent XSS attacks.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Lightweight, safe Markdown to HTML parser.
 * Supports bold, italics, blockquotes, bullet lists, numbered lists,
 * code blocks, inline code, headers, and line breaks.
 *
 * @param {string} markdownText
 * @returns {string} Safe HTML string
 */
export function renderMarkdown(markdownText) {
  if (!markdownText || typeof markdownText !== 'string') {
    return '';
  }

  let text = markdownText.trim();
  if (!text) return '';

  // 1. Extract and protect fenced code blocks
  const codeBlocks = [];
  text = text.replace(/```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g, (match, lang, code) => {
    const placeholder = `\x00CODEBLOCK_${codeBlocks.length}\x00`;
    const escapedCode = escapeHtml(code.trimEnd());
    const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    codeBlocks.push(`<pre><code${langClass}>${escapedCode}</code></pre>`);
    return placeholder;
  });

  // Also handle single-line fenced code blocks ```code```
  text = text.replace(/```([\s\S]*?)```/g, (match, code) => {
    const placeholder = `\x00CODEBLOCK_${codeBlocks.length}\x00`;
    const escapedCode = escapeHtml(code.trim());
    codeBlocks.push(`<pre><code>${escapedCode}</code></pre>`);
    return placeholder;
  });

  // 2. Extract and protect inline code
  const inlineCodes = [];
  text = text.replace(/`([^`\n]+)`/g, (match, code) => {
    const placeholder = `\x00INLINECODE_${inlineCodes.length}\x00`;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return placeholder;
  });

  // 3. Escape all remaining HTML entities to prevent XSS
  text = escapeHtml(text);

  // 4. Parse Headers (h1 to h6)
  text = text.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  text = text.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  text = text.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  text = text.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // 5. Parse Horizontal Rules
  text = text.replace(/^(\*{3,}|-{3,}|_{3,})$/gm, '<hr>');

  // 6. Parse Blockquotes
  text = text.replace(/^(?:&gt;|>)\s*(.+)$/gm, '<blockquote>$1</blockquote>');
  // Merge adjacent blockquotes
  text = text.replace(/<\/blockquote>\n<blockquote>/g, '<br>');

  // 7. Parse Bold and Italics
  // Bold: **text** or __text__
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // Italics: *text* or _text_
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

  // Strikethrough: ~~text~~
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // 8. Parse Lists (Ordered & Unordered)
  const lines = text.split('\n');
  const processedLines = [];
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);

    if (ulMatch) {
      if (inOl) {
        processedLines.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        processedLines.push('<ul>');
        inUl = true;
      }
      processedLines.push(`<li>${ulMatch[2]}</li>`);
    } else if (olMatch) {
      if (inUl) {
        processedLines.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        processedLines.push('<ol>');
        inOl = true;
      }
      processedLines.push(`<li>${olMatch[2]}</li>`);
    } else {
      if (inUl) {
        processedLines.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        processedLines.push('</ol>');
        inOl = false;
      }
      processedLines.push(line);
    }
  }

  if (inUl) processedLines.push('</ul>');
  if (inOl) processedLines.push('</ol>');

  text = processedLines.join('\n');

  // 9. Paragraphs and line breaks
  const blocks = text.split(/\n{2,}/);
  const formattedBlocks = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';

    // If block starts with a block tag, don't wrap in <p>
    if (/^<(h[1-6]|pre|ul|ol|blockquote|hr)/i.test(trimmed)) {
      return trimmed;
    }
    // If it's a single block placeholder
    if (trimmed.startsWith('\x00CODEBLOCK_')) {
      return trimmed;
    }

    const withBreaks = trimmed.replace(/\n/g, '<br>');
    return `<p>${withBreaks}</p>`;
  });

  text = formattedBlocks.filter(Boolean).join('\n');

  // 10. Restore Code Blocks & Inline Code
  text = text.replace(/\x00CODEBLOCK_(\d+)\x00/g, (match, idx) => codeBlocks[Number(idx)] || '');
  text = text.replace(/\x00INLINECODE_(\d+)\x00/g, (match, idx) => inlineCodes[Number(idx)] || '');

  return text;
}

/**
 * StreamWriter class for managing real-time token streaming to a DOM element.
 */
export class StreamWriter {
  /**
   * @param {HTMLElement|Object|null} domElement - Target DOM container or mock
   * @param {Object} [options]
   * @param {string} [options.cursorClass='streaming-cursor']
   * @param {string} [options.cursorChar='▋']
   * @param {boolean} [options.autoScroll=true]
   * @param {boolean} [options.renderMarkdownOnComplete=true]
   */
  constructor(domElement = null, options = {}) {
    this.domElement = domElement;
    this.options = {
      cursorClass: options.cursorClass || 'streaming-cursor',
      cursorChar: options.cursorChar || '▋',
      autoScroll: options.autoScroll !== undefined ? options.autoScroll : true,
      renderMarkdownOnComplete: options.renderMarkdownOnComplete !== undefined ? options.renderMarkdownOnComplete : true,
      ...options
    };

    this.buffer = '';
    this._isStreaming = false;
  }

  /**
   * Appends a token to the stream buffer and updates the DOM display.
   * @param {string} token
   * @returns {string} Current accumulated buffer
   */
  append(token) {
    if (token === null || token === undefined) return this.buffer;
    const tokenStr = String(token);

    this.buffer += tokenStr;
    this._isStreaming = true;

    if (this.domElement) {
      const cursorHtml = `<span class="${this.options.cursorClass}">${this.options.cursorChar}</span>`;
      const escaped = escapeHtml(this.buffer).replace(/\n/g, '<br>');

      if ('innerHTML' in this.domElement) {
        this.domElement.innerHTML = `${escaped}${cursorHtml}`;
      } else if ('textContent' in this.domElement) {
        this.domElement.textContent = `${this.buffer}${this.options.cursorChar}`;
      }

      if (this.options.autoScroll) {
        if (typeof this.domElement.scrollTo === 'function') {
          this.domElement.scrollTo({ top: this.domElement.scrollHeight, behavior: 'smooth' });
        } else if ('scrollTop' in this.domElement) {
          this.domElement.scrollTop = this.domElement.scrollHeight;
        }
      }
    }

    return this.buffer;
  }

  /**
   * Completes the stream, removes the cursor, and renders formatted markdown.
   * @param {string|null} [finalText=null] - Optional final text override
   * @returns {string} Rendered HTML or final text
   */
  complete(finalText = null) {
    if (finalText !== null && finalText !== undefined) {
      this.buffer = String(finalText);
    }

    this._isStreaming = false;
    const rawText = this.buffer;

    if (this.domElement) {
      if (this.options.renderMarkdownOnComplete) {
        const html = renderMarkdown(rawText);
        if ('innerHTML' in this.domElement) {
          this.domElement.innerHTML = html;
        }
        return html;
      } else {
        if ('textContent' in this.domElement) {
          this.domElement.textContent = rawText;
        }
      }
    }

    return rawText;
  }

  /**
   * Clears the buffer and resets the DOM element.
   */
  clear() {
    this.buffer = '';
    this._isStreaming = false;
    if (this.domElement) {
      if ('innerHTML' in this.domElement) {
        this.domElement.innerHTML = '';
      } else if ('textContent' in this.domElement) {
        this.domElement.textContent = '';
      }
    }
  }

  /**
   * Gets the raw accumulated text buffer.
   * @returns {string}
   */
  getText() {
    return this.buffer;
  }

  /**
   * Checks if currently in streaming mode.
   * @returns {boolean}
   */
  isStreaming() {
    return this._isStreaming;
  }

  /**
   * Updates target DOM element.
   * @param {HTMLElement|Object|null} element
   */
  attachElement(element) {
    this.domElement = element;
  }
}

/**
 * Factory function to create a StreamWriter instance.
 * @param {HTMLElement|Object|null} domElement
 * @param {Object} [options]
 * @returns {StreamWriter}
 */
export function createStreamWriter(domElement = null, options = {}) {
  return new StreamWriter(domElement, options);
}
