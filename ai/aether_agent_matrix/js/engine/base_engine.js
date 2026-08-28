/**
 * Aether Agent Matrix - Base LLM Engine Adapter
 * Abstract base class defining the contract for all inference backends.
 */

export class LLMEngineAdapter {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    this.options = options;
    this._loaded = false;
    this._modelId = null;
    this._backendType = 'abstract';
    this._abortController = null;
    this._isGenerating = false;
    this._aborted = false;
  }

  /**
   * Returns the backend identifier ('webgpu', 'wasm-worker', 'mock').
   * @returns {string}
   */
  getBackendType() {
    return this._backendType;
  }

  /**
   * Checks if a model is currently loaded and ready for inference.
   * @returns {boolean}
   */
  isLoaded() {
    return this._loaded;
  }

  /**
   * Gets the loaded model ID.
   * @returns {string|null}
   */
  getLoadedModelId() {
    return this._modelId;
  }

  /**
   * Initializes the engine and downloads/compiles the specified model.
   *
   * @param {string} modelId
   * @param {Function} [onProgress]
   * @returns {Promise<boolean>}
   */
  async init(modelId, onProgress = null) {
    throw new Error('init() must be implemented by subclass');
  }

  /**
   * Generates a streaming completion.
   *
   * @param {Array<{role: string, content: string}>|string} messages
   * @param {Object} [options]
   * @param {Function} [onToken]
   * @returns {Promise<{ fullText: string, tokensGenerated: number, timeMs: number, tokensPerSec: number, aborted: boolean }>}
   */
  async generateStream(messages, options = {}, onToken = null) {
    throw new Error('generateStream() must be implemented by subclass');
  }

  /**
   * Aborts active inference generation.
   */
  abort() {
    this._aborted = true;
    if (this._abortController) {
      this._abortController.abort();
    }
    this._isGenerating = false;
  }

  /**
   * Unloads the model and frees system and GPU resources.
   * @returns {Promise<void>}
   */
  async unload() {
    this.abort();
    this._loaded = false;
    this._modelId = null;
    this._isGenerating = false;
    this._abortController = null;
  }
}
