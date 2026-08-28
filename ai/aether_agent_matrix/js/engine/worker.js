/**
 * Aether Agent Matrix - Web Worker for Wasm/CPU LLM Inference
 * Runs Transformers.js in a dedicated background worker to keep UI responsive.
 */

export class WorkerPipelineManager {
  /**
   * @param {Object} [options]
   * @param {Object} [options.transformersModule] - Injected transformers library (useful for testing)
   * @param {Function} [options.postMessageFn] - Custom postMessage handler
   */
  constructor(options = {}) {
    this.pipeline = null;
    this.modelId = null;
    this.isGenerating = false;
    this.aborted = false;
    this.transformersModule = options.transformersModule || null;
    this.postMessageFn = options.postMessageFn || (
      typeof self !== 'undefined' && typeof self.postMessage === 'function'
        ? self.postMessage.bind(self)
        : () => {}
    );
  }

  /**
   * Initializes Transformers.js pipeline in CPU/Wasm mode.
   *
   * @param {string} modelId
   * @param {string|number} requestId
   * @param {Object} [options]
   */
  async init(modelId, requestId, options = {}) {
    this.modelId = modelId;
    this.postMessageFn({
      type: 'progress',
      requestId,
      progress: 0.1,
      text: 'Carregando runtime Transformers.js (CPU/Wasm)...',
      step: 'init_runtime'
    });

    let transformers = this.transformersModule;
    if (!transformers) {
      try {
        transformers = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3');
      } catch (err) {
        transformers = await import('https://esm.run/@huggingface/transformers');
      }
    }

    if (transformers.env) {
      transformers.env.allowLocalModels = false;
      transformers.env.useBrowserCache = true;
    }

    this.postMessageFn({
      type: 'progress',
      requestId,
      progress: 0.3,
      text: `Baixando modelo ONNX/Wasm (${modelId})...`,
      step: 'download_weights'
    });

    const progressCallback = (report) => {
      let progressVal = 0.5;
      if (report && typeof report.progress === 'number') {
        progressVal = 0.3 + (report.progress / 100) * 0.6;
      }
      this.postMessageFn({
        type: 'progress',
        requestId,
        progress: parseFloat(progressVal.toFixed(2)),
        text: report?.status || report?.file || 'Carregando tensores ONNX...',
        step: 'loading_tensors'
      });
    };

    const pipelineFn = transformers.pipeline || transformers.default?.pipeline;
    if (typeof pipelineFn !== 'function') {
      throw new Error('Transformers.js pipeline function not found.');
    }

    this._transformers = transformers;

    this.pipeline = await pipelineFn('text-generation', modelId, {
      progress_callback: progressCallback,
      device: 'wasm',
      dtype: 'q4',
      ...(options.pipelineOptions || {})
    });

    this.postMessageFn({
      type: 'progress',
      requestId,
      progress: 1.0,
      text: 'Modelo Wasm inicializado com sucesso!',
      step: 'ready'
    });

    this.postMessageFn({
      type: 'init_done',
      requestId,
      modelId,
      success: true
    });
  }

  /**
   * Generates text streaming tokens back to the main thread.
   *
   * @param {Array|string} messages
   * @param {Object} [options]
   * @param {string|number} requestId
   */
  async generate(messages, options = {}, requestId) {
    if (!this.pipeline) {
      this.postMessageFn({
        type: 'error',
        requestId,
        error: 'Pipeline not initialized. Call init() first.'
      });
      return;
    }

    this.isGenerating = true;
    this.aborted = false;
    const startTime = performance.now();
    let fullText = '';
    let tokensGenerated = 0;

    const max_new_tokens = options.max_tokens ?? options.maxTokens ?? 256;
    const temperature = options.temperature ?? 0.7;
    const top_p = options.top_p ?? options.topP ?? 0.95;

    // Convert messages array into formatted prompt using chat template if possible
    let prompt = '';
    if (Array.isArray(messages)) {
      if (typeof this.pipeline?.tokenizer?.apply_chat_template === 'function') {
        try {
          prompt = this.pipeline.tokenizer.apply_chat_template(messages, {
            tokenize: false,
            add_generation_prompt: true
          });
        } catch (e) {
          prompt = messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>`).join('\n') + '\n<|im_start|>assistant\n';
        }
      } else {
        prompt = messages.map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>`).join('\n') + '\n<|im_start|>assistant\n';
      }
    } else if (typeof messages === 'string') {
      prompt = messages;
    }

    const callback_function = (tokenText) => {
      if (this.aborted) return;
      tokensGenerated++;
      fullText += tokenText;
      this.postMessageFn({
        type: 'token',
        requestId,
        token: tokenText,
        fullText
      });
    };

    let streamer = null;
    if (this._transformers?.TextStreamer && this.pipeline?.tokenizer) {
      try {
        streamer = new this._transformers.TextStreamer(this.pipeline.tokenizer, {
          skip_prompt: true,
          callback_function
        });
      } catch (e) {
        streamer = null;
      }
    }

    try {
      const pipelineOptions = {
        max_new_tokens,
        temperature,
        top_p,
        do_sample: temperature > 0,
        repetition_penalty: 1.15,
        ...(streamer ? { streamer } : { callback_function }),
        ...(options.extra || {})
      };

      const output = await this.pipeline(prompt, pipelineOptions);

      if (output) {
        const gen = Array.isArray(output) ? output[0]?.generated_text : output.generated_text;
        if (typeof gen === 'string') {
          let cleanGen = gen;
          if (prompt && cleanGen.startsWith(prompt)) {
            cleanGen = cleanGen.slice(prompt.length);
          }
          cleanGen = cleanGen
            .replace(/^<\|im_start\|>assistant\s*/i, '')
            .replace(/^<\|im_end\|>/g, '')
            .replace(/^assistant\s*/i, '')
            .trim();

          if (!fullText || fullText.length < cleanGen.length || fullText.includes('<|im_start|>')) {
            fullText = cleanGen;
            tokensGenerated = fullText.trim().split(/\s+/).filter(Boolean).length;
          }
        }
      }

      // Final sanitize of fullText
      if (prompt && fullText.startsWith(prompt)) {
        fullText = fullText.slice(prompt.length);
      }
      fullText = fullText
        .replace(/^<\|im_start\|>assistant\s*/i, '')
        .replace(/<\|im_end\|>/g, '')
        .replace(/^assistant\s*/i, '')
        .trim();

      const timeMs = Math.max(1, performance.now() - startTime);
      const tokensPerSec = parseFloat((timeMs > 0 ? (tokensGenerated / (timeMs / 1000)) : 0).toFixed(2));

      this.postMessageFn({
        type: 'done',
        requestId,
        fullText,
        tokensGenerated,
        timeMs,
        tokensPerSec,
        aborted: this.aborted
      });
    } catch (err) {
      if (this.aborted) {
        this.postMessageFn({
          type: 'done',
          requestId,
          fullText,
          tokensGenerated,
          timeMs: Math.max(1, performance.now() - startTime),
          tokensPerSec: 0,
          aborted: true
        });
      } else {
        this.postMessageFn({
          type: 'error',
          requestId,
          error: err?.message || String(err)
        });
      }
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Aborts ongoing generation.
   *
   * @param {string|number} [requestId]
   */
  abort(requestId) {
    this.aborted = true;
    this.isGenerating = false;
  }

  /**
   * Unloads model pipeline and cleans up memory.
   */
  unload() {
    this.pipeline = null;
    this.modelId = null;
    this.isGenerating = false;
    this.aborted = false;
  }
}

// Global worker event listener when executed in Web Worker scope
let defaultManager = null;

if (typeof self !== 'undefined' && typeof self.addEventListener === 'function' && typeof window === 'undefined') {
  defaultManager = new WorkerPipelineManager();

  self.addEventListener('message', async (e) => {
    const data = e.data || {};
    const { type, modelId, requestId, id, messages, options } = data;
    const reqId = requestId || id;

    if (type === 'init') {
      try {
        await defaultManager.init(modelId, reqId, options);
      } catch (err) {
        self.postMessage({ type: 'error', requestId: reqId, error: err?.message || String(err) });
      }
    } else if (type === 'generate') {
      try {
        await defaultManager.generate(messages, options, reqId);
      } catch (err) {
        self.postMessage({ type: 'error', requestId: reqId, error: err?.message || String(err) });
      }
    } else if (type === 'abort') {
      defaultManager.abort(reqId);
    } else if (type === 'unload') {
      defaultManager.unload();
      self.postMessage({ type: 'unload_done', requestId: reqId });
    }
  });
}
