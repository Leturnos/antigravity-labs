/**
 * Aether Agent Matrix - Engine Adapter & Model Catalog
 * Unified interface for local LLM inference engines (WebGPU, Wasm Worker, Mock).
 */

import { LLMEngineAdapter } from './base_engine.js';
import { WebLLMEngine } from './webllm_engine.js';
import { WorkerEngine } from './worker_engine.js';

/**
 * Catalog of supported client-side LLM models with hardware requirements & metadata.
 */
export const MODEL_CATALOG = [
  {
    id: 'mock-instant-neural-matrix',
    name: '⚡ Modo Turbo Instantâneo (Zero Espera / Teste Rápido)',
    backend: 'mock',
    sizeMB: 0,
    vramMB: 0,
    quantization: 'instant',
    speed: 'instant',
    isRecommended: false,
    contextWindow: 4096,
    description: 'Execução instantânea (~50 tok/s) sem downloads nem compilação de shaders. Ideal para testar debates, vozes e vereditos imediatamente.'
  },
  {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 360M (Ultra-Rápido)',
    backend: 'webgpu',
    sizeMB: 250,
    vramMB: 512,
    quantization: 'q4f16_1',
    speed: 'ultra-fast',
    isRecommended: true,
    contextWindow: 4096,
    description: 'Ultra-rápido (>40 tok/s), 100% aberto e sem autenticação. Ideal para início imediato.'
  },
  {
    id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 1.7B (Equilibrado)',
    backend: 'webgpu',
    sizeMB: 1000,
    vramMB: 1536,
    quantization: 'q4f16_1',
    speed: 'fast',
    isRecommended: false,
    contextWindow: 8192,
    description: 'Excelente profundidade argumentativa, raciocínio lógico e vocabulário fluído.'
  },
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 1.5B (Avançado)',
    backend: 'webgpu',
    sizeMB: 1100,
    vramMB: 1536,
    quantization: 'q4f16_1',
    speed: 'moderate',
    isRecommended: false,
    contextWindow: 8192,
    description: 'Excelente profundidade lógica, vocabulário refinado e capacidade de síntese complexa em PT-BR.'
  },
  {
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen 2.5 0.5B (Compacto)',
    backend: 'webgpu',
    sizeMB: 350,
    vramMB: 600,
    quantization: 'q4f16_1',
    speed: 'ultra-fast',
    isRecommended: false,
    contextWindow: 4096,
    description: 'Muito leve e rápido para GPUs com pouca VRAM ou laptops modestos.'
  },
  {
    id: 'Phi-3.5-mini-instruct-q4f16_1-MLC',
    name: 'Phi 3.5 Mini 3.8B (Expert)',
    backend: 'webgpu',
    sizeMB: 2200,
    vramMB: 2560,
    quantization: 'q4f16_1',
    speed: 'moderate',
    isRecommended: false,
    contextWindow: 4096,
    description: 'Alta capacidade analítica e formal para GPUs dedicadas com 4GB+ de VRAM.'
  },
];

export const MODEL_MAP = new Map(MODEL_CATALOG.map(model => [model.id, model]));

/**
 * Retrieves metadata for a given model ID.
 *
 * @param {string|Object} modelId - Model ID string or model object
 * @returns {Object|null} Model metadata or null if not found
 */
export function getModelInfo(modelId) {
  if (!modelId) return null;
  if (typeof modelId === 'object' && modelId.id) {
    return MODEL_MAP.get(modelId.id) || modelId;
  }
  return MODEL_MAP.get(modelId) || null;
}

/**
 * Gets the default recommended model ID for a specific backend type.
 *
 * @param {'webgpu'|'wasm-worker'|'auto'|string} backendType
 * @returns {string} Model ID
 */
export function getDefaultModel(backendType = 'webgpu') {
  const type = String(backendType).toLowerCase();
  if (type === 'mock' || type === 'instant' || type === 'wasm-worker' || type === 'worker' || type === 'cpu') {
    return 'mock-instant-neural-matrix';
  }
  return 'SmolLM2-360M-Instruct-q4f16_1-MLC';
}

/**
 * Mock LLM Engine for test environments, offline execution, and instant simulation.
 */
export class MockEngine extends LLMEngineAdapter {
  constructor(options = {}) {
    super(options);
    this._backendType = 'mock';
  }

  /**
   * Initializes mock engine.
   *
   * @param {string} modelId
   * @param {Function} [onProgress]
   * @returns {Promise<boolean>}
   */
  async init(modelId, onProgress = null) {
    if (typeof onProgress === 'function') {
      onProgress({ progress: 0.5, text: 'Inicializando simulação neural instantânea...', step: 'init' });
      onProgress({ progress: 1.0, text: 'Modo instantâneo pronto!', step: 'ready' });
    }
    this._loaded = true;
    this._modelId = modelId || 'mock-instant-neural-matrix';
    return true;
  }

  /**
   * Generates mock streaming tokens with configurable delay and content.
   *
   * @param {Array<{role: string, content: string}>|string} messages
   * @param {Object} [options]
   * @param {string} [options.mockResponse] - Custom text to generate
   * @param {number} [options.tokenDelayMs=20] - Delay between tokens in ms
   * @param {Function} [onToken]
   * @returns {Promise<{ fullText: string, tokensGenerated: number, timeMs: number, tokensPerSec: number, aborted: boolean }>}
   */
  async generateStream(messages, options = {}, onToken = null) {
    if (!this._loaded) {
      throw new Error('MockEngine is not initialized. Call init(modelId) before generating.');
    }

    this._aborted = false;
    this._abortController = new AbortController();
    this._isGenerating = true;
    const startTime = performance.now();

    let fullResponse = options.mockResponse;
    if (!fullResponse) {
      const systemMsg = Array.isArray(messages) ? (messages.find(m => m.role === 'system')?.content || '') : '';
      const userMsg = Array.isArray(messages) ? (messages.find(m => m.role === 'user')?.content || '') : String(messages);

      const isJudge = systemMsg.includes('Lexis-9') || systemMsg.includes('juiz') || systemMsg.includes('árbitro') || userMsg.includes('veredito');
      const isDebaterA = systemMsg.includes('Marcus') || systemMsg.includes('Tecnocrata') || userMsg.includes('Como Dr. Marcus');
      const isDebaterB = systemMsg.includes('Helena') || systemMsg.includes('Humanista') || userMsg.includes('Como Dra. Helena');

      const isOpening = userMsg.includes('fala inicial') || userMsg.includes('Sua posição:');
      const isRebuttal = userMsg.includes('réplica') || userMsg.includes('rebatendo');
      const isClosing = userMsg.includes('encerramento') || userMsg.includes('considerações finais');
      const isAudience = userMsg.includes('Pergunta do público') || userMsg.includes('público');

      if (isJudge) {
        const votes = options.votes || { debaterA: 0, debaterB: 0 };
        let scoreA = 88;
        let scoreB = 92;
        let winnerName = 'Dra. Helena Rios';
        let reason = 'a fundamentação ética e a salvaguarda de direitos inalienáveis demonstradas pela Dra. Helena Rios foram determinantes';

        if (votes.debaterA > votes.debaterB) {
          scoreA = 94;
          scoreB = 87;
          winnerName = 'Dr. Marcus Vance';
          reason = 'o pragmatismo técnico, o respaldo de métricas de produtividade e a expressiva adesão popular apresentados pelo Dr. Marcus Vance superaram as objeções teóricas';
        } else if (votes.debaterB > votes.debaterA) {
          scoreA = 86;
          scoreB = 95;
          winnerName = 'Dra. Helena Rios';
          reason = 'a primazia da dignidade humana, a precaução contra riscos sistêmicos e o apoio maciço da audiência à Dra. Helena Rios foram decisivos';
        } else {
          // Dynamic variance based on topic seed
          const seed = Math.abs((userMsg.length * 7 + systemMsg.length * 13 + 17) % 100);
          if (seed % 3 === 0) {
            scoreA = 92;
            scoreB = 89;
            winnerName = 'Dr. Marcus Vance';
            reason = 'a clareza empírica dos argumentos de viabilidade socioeconômica e a defesa audaciosa da inovação expostas pelo Dr. Marcus Vance';
          } else if (seed % 3 === 1) {
            scoreA = 88;
            scoreB = 93;
            winnerName = 'Dra. Helena Rios';
            reason = 'a consistência analítica e a ênfase primordial em tratados internacionais de salvaguarda defendidas pela Dra. Helena Rios';
          } else {
            scoreA = 90;
            scoreB = 90;
            winnerName = 'Empate Técnico';
            reason = 'o equilíbrio de excelência entre a urgência da aceleração técnica e a indispensabilidade de salvaguardas éticas';
          }
        }

        fullResponse = `Após criteriosa análise das teses apresentadas, reconheço que ${reason}. Pontuação final: Dr. Marcus Vance ${scoreA}/100, Dra. Helena Rios ${scoreB}/100. Vencedor: ${winnerName}.`;
      } else if (isAudience) {
        if (isDebaterA) {
          fullResponse = `A provocação da audiência é legítima: a automação gera transições exigentes, mas a história comprova que a criação de novos setores e a produtividade multiplicada superam os custos de transição quando há capacitação e investimento contínuo.`;
        } else {
          fullResponse = `A intervenção do público atinge o ponto nevrálgico: nenhuma tecnologia pode ser considerada bem-sucedida se seus ganhos forem privatizados e seus riscos sociais e humanos forem repassados aos trabalhadores mais vulneráveis.`;
        }
      } else if (isDebaterA) {
        if (isClosing) {
          fullResponse = `Para encerrar, reitero que a evolução humana sempre foi impulsionada pela coragem de construir ferramentas superiores. Devemos governar a inovação com métricas objetivas e visão de futuro, e não com restrições que asfixiam o potencial da nossa civilização.`;
        } else if (isRebuttal) {
          fullResponse = `Com o devido respeito à Dra. Helena, seu raciocínio confunde precaução com paralisia. Riscos complexos não são superados com moratórias ou medo, mas com engenharia rigorosa, testes empíricos e modelos mais robustos. A estagnação é a maior ameaça ao bem-estar coletivo.`;
        } else {
          fullResponse = `A aceleração científica e tecnológica é o motor indispensável para resolver as maiores crises da humanidade, da erradicação de doenças à abundância de energia. Freios burocráticos excessivos não protegem a sociedade; apenas adiam soluções cruciais e transferem a vanguarda global para atores sem compromisso ético.`;
        }
      } else if (isDebaterB) {
        if (isClosing) {
          fullResponse = `Em minhas considerações finais, afirmo que a inteligência artificial deve existir a serviço da humanidade, e não o inverso. Sem tratados globais vinculantes e prioridade absoluta à dignidade humana, sacrificamos nosso futuro em nome de uma velocidade cega.`;
        } else if (isRebuttal) {
          fullResponse = `O Dr. Marcus recai no reducionismo utilitarista ao tratar direitos fundamentais como meras variáveis ajustáveis. Quando um algoritmo reproduz danos sociais ou desestrutura empregos essenciais, o custo humano não pode ser mitigado como uma simples atualização de código posterior.`;
        } else {
          fullResponse = `O avanço sem balizas éticas não é progresso autêntico, é temeridade. Desenvolver sistemas com impacto existencial sem governança democrática e limites claros coloca em risco a dignidade, a privacidade e a própria autonomia humana. Princípios morais inegociáveis devem ditar o ritmo da técnica.`;
        }
      } else {
        fullResponse = `A ponderação equilibrada entre evidências empíricas e salvaguardas éticas é essencial para orientar o desenvolvimento responsável deste debate.`;
      }
    }

    // Split text into word-level token chunks
    const rawTokens = fullResponse.match(/(\s*\S+|\s+)/g) || [fullResponse];
    let accumulatedText = '';
    let tokensGenerated = 0;
    const delayMs = options.tokenDelayMs !== undefined ? options.tokenDelayMs : 35;

    for (const tokenChunk of rawTokens) {
      if (this._aborted || this._abortController?.signal?.aborted) {
        break;
      }

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      if (this._aborted || this._abortController?.signal?.aborted) {
        break;
      }

      accumulatedText += tokenChunk;
      tokensGenerated += 1;

      const elapsedMs = Math.max(1, performance.now() - startTime);
      const tokensPerSec = parseFloat((tokensGenerated / (elapsedMs / 1000)).toFixed(2));

      if (typeof onToken === 'function') {
        onToken(tokenChunk, accumulatedText, {
          tokensGenerated,
          tokensPerSec,
          elapsedMs
        });
      }
    }

    const timeMs = Math.max(1, performance.now() - startTime);
    const tokensPerSec = parseFloat((timeMs > 0 ? (tokensGenerated / (timeMs / 1000)) : 0).toFixed(2));
    const wasAborted = Boolean(this._aborted || this._abortController?.signal?.aborted);

    this._isGenerating = false;

    return {
      fullText: accumulatedText,
      tokensGenerated,
      timeMs,
      tokensPerSec,
      aborted: wasAborted
    };
  }

  /**
   * Resets mock engine state.
   */
  async unload() {
    await super.unload();
  }
}

/**
 * Factory to instantiate the appropriate LLM engine driver.
 *
 * @param {'auto'|'webgpu'|'wasm-worker'|'worker'|'mock'} backendType
 * @param {Object} [options]
 * @returns {LLMEngineAdapter}
 */
export function createEngine(backendType = 'auto', options = {}) {
  const type = String(backendType).toLowerCase();

  if (type === 'mock' || type === 'instant' || options.modelId === 'mock-instant-neural-matrix') {
    return new MockEngine(options);
  }

  if (type === 'webgpu') {
    return new WebLLMEngine(options);
  }

  if (type === 'wasm-worker' || type === 'worker') {
    return new WorkerEngine(options);
  }

  if (type === 'auto') {
    // Check WebGPU availability in environment
    const hasWebGPU = typeof options.hasWebGPU === 'boolean'
      ? options.hasWebGPU
      : (typeof navigator !== 'undefined' && Boolean(navigator?.gpu));

    if (hasWebGPU) {
      return new WebLLMEngine(options);
    }

    // Check Worker support
    const hasWorker = typeof Worker !== 'undefined' || Boolean(options.workerInstance);
    if (hasWorker) {
      return new WorkerEngine(options);
    }

    // Fallback to MockEngine in unsupported environments (e.g. Node tests without mocks)
    return new MockEngine(options);
  }

  throw new Error(`Unsupported engine backend type: ${backendType}`);
}

export { LLMEngineAdapter, WebLLMEngine, WorkerEngine };
