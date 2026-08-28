/**
 * Aether Agent Matrix - Worker Engine Adapter (CPU/Wasm)
 * Communicates with background Web Worker for off-thread CPU inference.
 */

import { LLMEngineAdapter } from './base_engine.js';

export class WorkerEngine extends LLMEngineAdapter {
  /**
   * @param {Object} [options]
   * @param {string} [options.workerUrl] - Path or URL to worker.js
   * @param {Worker|Object} [options.workerInstance] - Custom Worker instance (useful for testing)
   */
  constructor(options = {}) {
    super(options);
    this._backendType = 'wasm-worker';
    this.workerUrl = options.workerUrl || new URL('./worker.js', import.meta.url).href;
    this.workerInstance = options.workerInstance || null;
    this._worker = null;
    this._messageId = 0;
    this._pendingRequests = new Map();
    this._activeStream = null;
  }

  /**
   * Instantiates the Web Worker and binds message handlers.
   * @private
   */
  _ensureWorker() {
    if (this._worker) return this._worker;

    if (this.workerInstance) {
      this._worker = this.workerInstance;
    } else if (typeof Worker !== 'undefined') {
      this._worker = new Worker(this.workerUrl, { type: 'module' });
    } else {
      throw new Error('Web Worker is not supported in this environment.');
    }

    const messageHandler = (event) => {
      const data = event?.data !== undefined ? event.data : event;
      this._handleWorkerMessage(data);
    };

    const errorHandler = (err) => {
      this._handleWorkerError(err);
    };

    if (typeof this._worker.addEventListener === 'function') {
      this._worker.addEventListener('message', messageHandler);
      this._worker.addEventListener('error', errorHandler);
    } else {
      this._worker.onmessage = messageHandler;
      this._worker.onerror = errorHandler;
    }

    return this._worker;
  }

  /**
   * Dispatches incoming worker messages to pending request handlers.
   * @private
   */
  _handleWorkerMessage(data) {
    if (!data || typeof data !== 'object') return;

    const reqId = data.requestId || data.id;
    const pending = this._pendingRequests.get(reqId);

    switch (data.type) {
      case 'progress':
        if (pending?.onProgress) {
          pending.onProgress({
            progress: typeof data.progress === 'number' ? data.progress : 0,
            text: data.text || 'Processando no Worker...',
            step: data.step || 'progress'
          });
        }
        break;

      case 'init_done':
        if (pending) {
          pending.resolve(true);
          this._pendingRequests.delete(reqId);
        }
        break;

      case 'token':
        if (pending) {
          pending.tokensGenerated = (pending.tokensGenerated || 0) + 1;
          const elapsedMs = Math.max(1, performance.now() - pending.startTime);
          const tokensPerSec = parseFloat((pending.tokensGenerated / (elapsedMs / 1000)).toFixed(2));
          pending.fullText = data.fullText !== undefined ? data.fullText : ((pending.fullText || '') + (data.token || ''));

          if (typeof pending.onToken === 'function') {
            pending.onToken(data.token || '', pending.fullText, {
              tokensGenerated: pending.tokensGenerated,
              tokensPerSec,
              elapsedMs
            });
          }
        }
        break;

      case 'done':
        if (pending) {
          const timeMs = Math.max(1, data.timeMs || (performance.now() - pending.startTime));
          const tokensGenerated = data.tokensGenerated !== undefined ? data.tokensGenerated : (pending.tokensGenerated || 0);
          const tokensPerSec = parseFloat((data.tokensPerSec !== undefined ? data.tokensPerSec : (timeMs > 0 ? (tokensGenerated / (timeMs / 1000)) : 0)).toFixed(2));
          const fullText = data.fullText !== undefined ? data.fullText : (pending.fullText || '');

          pending.resolve({
            fullText,
            tokensGenerated,
            timeMs,
            tokensPerSec,
            aborted: Boolean(data.aborted)
          });
          this._pendingRequests.delete(reqId);
          if (this._activeStream === reqId) {
            this._activeStream = null;
          }
          this._isGenerating = false;
        }
        break;

      case 'error':
        if (pending) {
          pending.reject(new Error(data.error || 'Worker execution error'));
          this._pendingRequests.delete(reqId);
          if (this._activeStream === reqId) {
            this._activeStream = null;
          }
          this._isGenerating = false;
        }
        break;

      case 'unload_done':
        if (pending) {
          pending.resolve(true);
          this._pendingRequests.delete(reqId);
        }
        break;
    }
  }

  /**
   * Handles unexpected worker level errors.
   * @private
   */
  _handleWorkerError(err) {
    console.error('Worker error occurred:', err);
    for (const [reqId, pending] of this._pendingRequests.entries()) {
      pending.reject(new Error(err?.message || 'Worker thread failed'));
      this._pendingRequests.delete(reqId);
    }
    this._isGenerating = false;
    this._activeStream = null;
  }

  /**
   * Initializes the Wasm model in the worker thread.
   *
   * @param {string} modelId
   * @param {Function} [onProgress]
   * @returns {Promise<boolean>}
   */
  async init(modelId, onProgress = null) {
    this._ensureWorker();

    const reqId = `init_${++this._messageId}`;

    return new Promise((resolve, reject) => {
      this._pendingRequests.set(reqId, {
        resolve: () => {
          this._loaded = true;
          this._modelId = modelId;
          resolve(true);
        },
        reject,
        onProgress
      });

      this._worker.postMessage({
        type: 'init',
        requestId: reqId,
        id: reqId,
        modelId,
        options: this.options
      });
    });
  }

  /**
   * Generates a streaming completion via the background worker.
   *
   * @param {Array<{role: string, content: string}>|string} messages
   * @param {Object} [options]
   * @param {Function} [onToken]
   * @returns {Promise<{ fullText: string, tokensGenerated: number, timeMs: number, tokensPerSec: number, aborted: boolean }>}
   */
  async generateStream(messages, options = {}, onToken = null) {
    if (!this._loaded) {
      throw new Error('WorkerEngine is not initialized. Call init(modelId) before generating.');
    }

    this._ensureWorker();

    this._abortController = new AbortController();
    this._isGenerating = true;
    const reqId = `gen_${++this._messageId}`;
    this._activeStream = reqId;

    return new Promise((resolve, reject) => {
      this._pendingRequests.set(reqId, {
        resolve,
        reject,
        onToken,
        startTime: performance.now(),
        tokensGenerated: 0,
        fullText: ''
      });

      this._worker.postMessage({
        type: 'generate',
        requestId: reqId,
        id: reqId,
        messages,
        options: {
          temperature: options.temperature ?? 0.7,
          max_tokens: options.max_tokens ?? options.maxTokens ?? 256,
          top_p: options.top_p ?? options.topP ?? 0.95,
          ...options
        }
      });
    });
  }

  /**
   * Aborts active worker generation.
   */
  abort() {
    if (this._activeStream && this._worker) {
      try {
        this._worker.postMessage({
          type: 'abort',
          requestId: this._activeStream,
          id: this._activeStream
        });
      } catch (e) {
        // Ignore postMessage error on abort
      }
    }
    super.abort();
  }

  /**
   * Signals worker to unload model and optionally terminates worker thread.
   *
   * @returns {Promise<void>}
   */
  async unload() {
    this.abort();
    if (this._worker) {
      try {
        this._worker.postMessage({ type: 'unload' });
        if (!this.workerInstance && typeof this._worker.terminate === 'function') {
          this._worker.terminate();
        }
      } catch (e) {
        // Ignore error
      }
    }
    this._worker = null;
    this._pendingRequests.clear();
    await super.unload();
  }
}
