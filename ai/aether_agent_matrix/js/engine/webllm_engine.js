/**
 * Aether Agent Matrix - WebLLM Engine Driver (WebGPU)
 * Executes local LLM inference directly on GPU using MLC WebLLM.
 */

import { LLMEngineAdapter } from './base_engine.js';

export class WebLLMEngine extends LLMEngineAdapter {
  /**
   * @param {Object} options
   * @param {string} [options.moduleUrl] - CDN URL or local path to @mlc-ai/web-llm
   * @param {Object} [options.webllmModule] - Injected webllm module (useful for testing/SSR)
   * @param {Object} [options.engineInstance] - Injected engine instance (useful for testing)
   * @param {Object} [options.engineConfig] - Additional MLCEngine configuration options
   */
  constructor(options = {}) {
    super(options);
    this._backendType = 'webgpu';
    this.moduleUrl = options.moduleUrl || 'https://esm.run/@mlc-ai/web-llm';
    this.webllmModule = options.webllmModule || null;
    this.engineInstance = options.engineInstance || null;
    this._engine = null;
  }

  /**
   * Initializes and loads the WebLLM model into WebGPU VRAM.
   *
   * @param {string} modelId - Model identifier from MODEL_CATALOG
   * @param {Function} [onProgress] - Callback for loading and shader compilation progress
   * @returns {Promise<boolean>}
   */
  async init(modelId, onProgress = null) {
    const hasNavigatorGpu = typeof navigator !== 'undefined' && Boolean(navigator?.gpu);

    if (!this.webllmModule && !this.engineInstance && !hasNavigatorGpu) {
      throw new Error('WebGPU is not supported in this environment. Cannot initialize WebLLMEngine.');
    }

    if (this._loaded && this._modelId === modelId && this._engine) {
      return true;
    }

    if (this._loaded && this._engine) {
      await this.unload();
    }

    const initProgressCallback = (report) => {
      if (typeof onProgress === 'function' && report) {
        onProgress({
          progress: typeof report.progress === 'number' ? report.progress : 0,
          text: report.text || 'Carregando pesos e compilando shaders WebGPU...',
          step: report.step || 'loading'
        });
      }
    };

    if (this.engineInstance) {
      this._engine = this.engineInstance;
      if (typeof this._engine.setInitProgressCallback === 'function') {
        this._engine.setInitProgressCallback(initProgressCallback);
      }
      if (typeof this._engine.reload === 'function') {
        await this._engine.reload(modelId);
      }
    } else {
      let webllm = this.webllmModule;
      if (!webllm) {
        webllm = await import(this.moduleUrl);
      }

      if (typeof webllm.CreateMLCEngine === 'function') {
        this._engine = await webllm.CreateMLCEngine(modelId, {
          initProgressCallback,
          ...(this.options.engineConfig || {})
        });
      } else if (webllm.MLCEngine) {
        this._engine = new webllm.MLCEngine();
        if (typeof this._engine.setInitProgressCallback === 'function') {
          this._engine.setInitProgressCallback(initProgressCallback);
        }
        await this._engine.reload(modelId);
      } else {
        throw new Error('Invalid WebLLM module: CreateMLCEngine or MLCEngine constructor not found.');
      }
    }

    this._loaded = true;
    this._modelId = modelId;
    return true;
  }

  /**
   * Generates a streaming completion for the given chat messages.
   *
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} [options]
   * @param {number} [options.temperature=0.7]
   * @param {number} [options.max_tokens=512]
   * @param {number} [options.top_p=0.95]
   * @param {number} [options.repetition_penalty=1.1]
   * @param {Function} [onToken] - Callback for streamed token delta: (delta, fullText, stats) => void
   * @returns {Promise<{ fullText: string, tokensGenerated: number, timeMs: number, tokensPerSec: number, aborted: boolean }>}
   */
  async generateStream(messages, options = {}, onToken = null) {
    if (!this._loaded || !this._engine) {
      throw new Error('WebLLMEngine is not initialized. Call init(modelId) before generating.');
    }

    this._aborted = false;
    this._abortController = new AbortController();
    this._isGenerating = true;

    const startTime = performance.now();
    let fullText = '';
    let tokensGenerated = 0;

    const temperature = options.temperature ?? 0.7;
    const max_tokens = options.max_tokens ?? options.maxTokens ?? 512;
    const top_p = options.top_p ?? options.topP ?? 0.95;
    const frequency_penalty = options.frequency_penalty ?? options.frequencyPenalty ?? 0.5;
    const presence_penalty = options.presence_penalty ?? options.presencePenalty ?? 0.5;

    try {
      const requestPayload = {
        messages,
        stream: true,
        temperature,
        max_tokens,
        top_p,
        frequency_penalty,
        presence_penalty,
        ...(options.extra || {})
      };

      const chunks = await this._engine.chat.completions.create(requestPayload);

      for await (const chunk of chunks) {
        if (this._aborted || this._abortController?.signal?.aborted) {
          break;
        }

        const delta = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.text || '';
        if (delta) {
          fullText += delta;
          tokensGenerated += 1;

          const elapsedMs = Math.max(1, performance.now() - startTime);
          const tokensPerSec = parseFloat((tokensGenerated / (elapsedMs / 1000)).toFixed(2));

          if (typeof onToken === 'function') {
            onToken(delta, fullText, {
              tokensGenerated,
              tokensPerSec,
              elapsedMs
            });
          }
        }
      }

      if ((this._aborted || this._abortController?.signal?.aborted) && typeof this._engine.interruptGenerate === 'function') {
        try {
          await this._engine.interruptGenerate();
        } catch (e) {
          // Ignore interrupt error if already stopped
        }
      }
    } catch (err) {
      if (this._aborted || this._abortController?.signal?.aborted) {
        // Handled abort gracefully
      } else {
        throw err;
      }
    } finally {
      this._isGenerating = false;
    }

    const timeMs = Math.max(1, performance.now() - startTime);
    const tokensPerSec = parseFloat((timeMs > 0 ? (tokensGenerated / (timeMs / 1000)) : 0).toFixed(2));
    const wasAborted = Boolean(this._aborted || this._abortController?.signal?.aborted);

    return {
      fullText,
      tokensGenerated,
      timeMs,
      tokensPerSec,
      aborted: wasAborted
    };
  }

  /**
   * Aborts ongoing generation and interrupts WebGPU shader execution.
   */
  abort() {
    if (this._engine && typeof this._engine.interruptGenerate === 'function') {
      try {
        this._engine.interruptGenerate();
      } catch (e) {
        // Ignore interrupt failure
      }
    }
    super.abort();
  }

  /**
   * Unloads model from WebGPU memory and frees GPU buffers.
   *
   * @returns {Promise<void>}
   */
  async unload() {
    this.abort();
    if (this._engine && typeof this._engine.unload === 'function') {
      try {
        await this._engine.unload();
      } catch (e) {
        console.warn('Error during WebLLM unload:', e);
      }
    }
    this._engine = null;
    await super.unload();
  }
}
