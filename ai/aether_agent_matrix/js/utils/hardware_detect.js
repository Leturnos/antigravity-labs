/**
 * Aether Agent Matrix - Hardware Capabilities & Diagnostics
 * Detects WebGPU availability, adapter limits, CPU cores, device memory,
 * and recommends the optimal inference backend and LLM model.
 */

/**
 * Checks system hardware capabilities for client-side LLM execution.
 * Gracefully handles SSR / Node.js environments and unsupported browsers.
 *
 * @returns {Promise<{
 *   hasWebGPU: boolean,
 *   adapterInfo: { vendor: string, architecture: string, device: string, description: string } | null,
 *   limits: Object | null,
 *   estimatedVRAM: number,
 *   cores: number,
 *   deviceMemoryGB: number,
 *   recommendedBackend: 'webgpu' | 'wasm-worker',
 *   summary: string
 * }>}
 */
export async function detectHardwareCapabilities() {
  const hasNavigator = typeof navigator !== 'undefined' && navigator !== null;
  const cores = hasNavigator && typeof navigator.hardwareConcurrency === 'number'
    ? navigator.hardwareConcurrency
    : 4;
  const deviceMemoryGB = hasNavigator && typeof navigator.deviceMemory === 'number'
    ? navigator.deviceMemory
    : 8;

  let hasWebGPU = false;
  let adapter = null;
  let adapterInfo = null;
  let limits = null;
  let estimatedVRAM = 0;

  if (hasNavigator && navigator.gpu && typeof navigator.gpu.requestAdapter === 'function') {
    try {
      adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        hasWebGPU = true;

        // Extract adapter info across WebGPU spec revisions
        const rawInfo = adapter.info || (typeof adapter.requestAdapterInfo === 'function'
          ? await adapter.requestAdapterInfo().catch(() => ({}))
          : {});

        adapterInfo = {
          vendor: rawInfo?.vendor || 'WebGPU Vendor',
          architecture: rawInfo?.architecture || 'Generic Architecture',
          device: rawInfo?.device || 'GPU Device',
          description: rawInfo?.description || 'WebGPU Graphics Adapter'
        };

        // Extract limits
        if (adapter.limits) {
          limits = {
            maxBufferSize: adapter.limits.maxBufferSize || 0,
            maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize || 0,
            maxComputeWorkgroupStorageSize: adapter.limits.maxComputeWorkgroupStorageSize || 0
          };

          // Compute estimated VRAM in Megabytes based on max buffer allocation
          if (limits.maxBufferSize > 0) {
            estimatedVRAM = Math.round(limits.maxBufferSize / (1024 * 1024));
          }
        }

        // If limits didn't yield estimated VRAM, estimate from device memory heuristic
        if (!estimatedVRAM) {
          estimatedVRAM = Math.max(1024, Math.round(deviceMemoryGB * 1024 * 0.5));
        }
      }
    } catch (err) {
      console.warn('WebGPU adapter request failed:', err);
      hasWebGPU = false;
    }
  }

  const recommendedBackend = hasWebGPU ? 'webgpu' : 'wasm-worker';

  let summary = '';
  if (hasWebGPU) {
    const gpuName = adapterInfo?.description || adapterInfo?.vendor || 'WebGPU';
    summary = `WebGPU disponível (${gpuName}, VRAM est.: ~${estimatedVRAM} MB, ${cores} núcleos, ${deviceMemoryGB} GB RAM) - Backend: WebGPU`;
  } else {
    summary = `WebGPU indisponível - Fallback CPU/Wasm ativado (${cores} núcleos, ${deviceMemoryGB} GB RAM) - Backend: Wasm Worker`;
  }

  return {
    hasWebGPU,
    adapterInfo,
    limits,
    estimatedVRAM,
    cores,
    deviceMemoryGB,
    recommendedBackend,
    summary
  };
}

/**
 * Recommends an optimal model preset based on detected hardware capabilities.
 * @param {Object} caps - Result from detectHardwareCapabilities()
 * @returns {{ id: string, name: string, backend: string, description: string }}
 */
export function getRecommendedModel(caps) {
  if (!caps || !caps.hasWebGPU || caps.recommendedBackend === 'wasm-worker') {
    // The 135M CPU model is too small to follow instructions coherently.
    // Default to the mock instant engine which provides usable, coherent debates.
    // Users can still manually select the CPU model from the catalog if desired.
    return {
      id: 'mock-instant-neural-matrix',
      name: '⚡ Modo Turbo Instantâneo (Zero Espera / Teste Rápido)',
      backend: 'mock',
      description: 'Debates instantâneos e coerentes sem necessidade de WebGPU'
    };
  }

  if (caps.estimatedVRAM >= 3000 || caps.deviceMemoryGB >= 16) {
    return {
      id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
      name: 'Qwen 2.5 1.5B (Avançado)',
      backend: 'webgpu',
      description: 'Raciocínio profundo, vocabulário refinado e excelente capacidade argumentativa'
    };
  }

  if (caps.estimatedVRAM >= 1500 || caps.deviceMemoryGB >= 8) {
    return {
      id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC',
      name: 'SmolLM2 1.7B (Equilibrado)',
      backend: 'webgpu',
      description: 'Equilíbrio ideal entre velocidade, coerência lógica e vocabulário'
    };
  }

  return {
    id: 'SmolLM2-360M-Instruct-q4f16_1-MLC',
    name: 'SmolLM2 360M (Ultra-Rápido)',
    backend: 'webgpu',
    description: 'Geração ultra-rápida (>40 tok/s) para hardware leve com WebGPU'
  };
}
