/**
 * Aether Shader Studio - Main Application Bootstrap
 *
 * Orchestrates:
 * - ShaderEngine (WebGL2 render pipeline)
 * - AudioReactor & AudioTexture (reactive audio spectrum & waveform)
 * - MonacoAdapter (in-browser code editing with GLSL syntax)
 * - KeybindingsManager (global shortcuts)
 * - PRESET_LIBRARY & StorageManager (presets, JSON persistence, URL hash)
 * - VideoRecorder & GIFExporter (WebM recording and deterministic loop GIF export)
 * - LayoutManager & StatusBar (split pane, mobile tabs, Zen mode, HUD telemetry)
 */

import { ShaderEngine } from './core/shader-engine.js';
import { AudioReactor } from './audio/audio-reactor.js';
import { AudioTexture } from './audio/audio-texture.js';
import { MonacoAdapter } from './editor/monaco-adapter.js';
import { KeybindingsManager } from './editor/keybindings.js';
import { PRESET_LIBRARY } from './presets/preset-library.js';
import { StorageManager } from './presets/storage.js';
import { VideoRecorder } from './export/video-recorder.js';
import { GIFExporter } from './export/gif-exporter.js';
import { LayoutManager } from './ui/layout.js';
import { StatusBar } from './ui/status-bar.js';

export function downloadBlob(blob, filename) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class ShaderStudioApp {
  constructor(options = {}) {
    this.options = options;
    this.doc = options.document || (typeof document !== 'undefined' ? document : null);
    this.win = options.window || (typeof window !== 'undefined' ? window : null);

    // Core instances
    this.canvas = null;
    this.shaderEngine = null;
    this.audioReactor = null;
    this.audioTexture = null;
    this.monacoAdapter = null;
    this.layoutManager = null;
    this.statusBar = null;

    // State & Timers
    this.compileDebounceTimer = null;
    this.isProgrammaticChange = false;
    this.currentPresetIndex = 0;
    this.currentTagFilter = 'all';
    this.currentSearchQuery = '';
    this.activeVideoRecorder = null;
    this.unbindKeybindings = null;

    // Cached DOM elements
    this.elements = {};
  }

  async init() {
    this._cacheElements();

    // 1. Initialize Layout and Status telemetry
    this.layoutManager = new LayoutManager({
      errorDrawerEl: this.elements.errorDrawer,
      btnZenEl: this.elements.btnZen,
      btnCloseErrorsEl: this.elements.btnCloseErrors,
      onResize: () => {
        if (this.shaderEngine) {
          this.shaderEngine.resize();
        }
      }
    });

    this.statusBar = new StatusBar();

    // 2. Initialize Canvas & ShaderEngine
    this.canvas = this.elements.canvas || (this.doc ? this.doc.getElementById('gl-canvas') : null);
    this.shaderEngine = new ShaderEngine(this.canvas);

    // 3. Initialize Audio Pipeline
    this.audioReactor = new AudioReactor();
    if (this.shaderEngine && this.shaderEngine.gl) {
      try {
        this.audioTexture = new AudioTexture(this.shaderEngine.gl);
        this.shaderEngine.setAudioTexture(this.audioTexture);
      } catch (err) {
        console.warn('AudioTexture initialization skipped:', err);
      }
    }

    // 4. Determine Initial Shader Code
    let initialCode = '';
    if (this.win?.location?.hash) {
      initialCode = StorageManager.decodeURLHash(this.win.location.hash) || '';
    }
    if (!initialCode) {
      initialCode = StorageManager.loadCurrent() || '';
    }
    if (!initialCode) {
      initialCode = PRESET_LIBRARY[0]?.code || '';
    }

    // 5. Initialize Monaco Editor
    this.monacoAdapter = new MonacoAdapter(this.options.monaco || null);
    try {
      await this.monacoAdapter.init('monaco-editor-container', initialCode);
    } catch (err) {
      console.warn('Monaco Editor load skipped or deferred:', err);
    }

    // 6. Setup Code Change Debounce (400ms)
    this.monacoAdapter.onCodeChange = (code) => {
      if (this.isProgrammaticChange) return;
      this.statusBar.setCompileStatus('compiling');
      if (this.compileDebounceTimer) clearTimeout(this.compileDebounceTimer);
      this.compileDebounceTimer = setTimeout(() => {
        this.compileShader(code);
        StorageManager.saveCurrent(code);
      }, 400);
    };

    // 7. Initial Shader Compilation
    this.compileShader(initialCode);

    // 8. Wire Render Loop Telemetry & Audio Feed
    this.shaderEngine.onFrame(({ time, frame, width, height }) => {
      if (this.audioReactor && this.audioTexture && this.audioReactor.currentMode !== 'none') {
        this.audioReactor.update();
        this.audioTexture.update(this.audioReactor.getPackedTextureData());
      }
      this.statusBar.recordFrame();
      this.statusBar.updateTime(time, frame);
      this.statusBar.updateResolution(width, height, this.shaderEngine.resolutionScale);
    });

    // 9. Start Rendering Engine if autoStart is enabled
    if (this.options.autoStart !== false) {
      this.shaderEngine.start();
    }

    // 10. Bind Event Listeners
    this._bindCanvasInteractions();
    this._bindActionButtons();
    this._bindAudioControls();
    this._bindPresetsGallery();
    this._bindExportModals();
    this._bindGlobalKeybindings();

    return this;
  }

  _cacheElements() {
    if (!this.doc) return;
    const d = this.doc;
    this.elements = {
      canvas: d.getElementById('gl-canvas'),
      btnPlay: d.getElementById('btn-play'),
      btnReset: d.getElementById('btn-reset'),
      btnPresets: d.getElementById('btn-presets'),
      btnExport: d.getElementById('btn-export'),
      btnZen: d.getElementById('btn-zen'),
      resScaleSelect: d.getElementById('resolution-scale-select'),
      audioSourceSelect: d.getElementById('audio-source-select'),
      btnAudioFile: d.getElementById('btn-audio-file'),
      audioFileInput: d.getElementById('audio-file-input'),
      errorDrawer: d.getElementById('error-drawer'),
      errorList: d.getElementById('error-list'),
      errorCountBadge: d.getElementById('error-count-badge'),
      presetsModal: d.getElementById('presets-modal'),
      btnClosePresets: d.getElementById('btn-close-presets'),
      presetCards: d.getElementById('preset-cards'),
      presetSearchInput: d.getElementById('preset-search-input'),
      presetTagFilters: d.getElementById('preset-tag-filters'),
      btnImportPreset: d.getElementById('btn-import-preset'),
      btnExportPreset: d.getElementById('btn-export-preset'),
      btnShareUrl: d.getElementById('btn-share-url'),
      presetFileInput: d.getElementById('preset-file-input'),
      exportModal: d.getElementById('export-modal'),
      btnCloseExport: d.getElementById('btn-close-export'),
      exportVideoDuration: d.getElementById('export-video-duration'),
      exportIncludeAudio: d.getElementById('export-include-audio'),
      btnRecordVideo: d.getElementById('btn-record-video'),
      exportGifDuration: d.getElementById('export-gif-duration'),
      exportGifFps: d.getElementById('export-gif-fps'),
      exportGifResolution: d.getElementById('export-gif-resolution'),
      btnExportGif: d.getElementById('btn-export-gif'),
      exportProgressContainer: d.getElementById('export-progress-container'),
      exportProgressFill: d.getElementById('export-progress-fill'),
      exportStatusText: d.getElementById('export-status-text')
    };
  }

  compileShader(code) {
    if (!code) return { success: false, errors: ['No code provided'] };
    const result = this.shaderEngine.compileShader(code);

    if (result.success) {
      this.statusBar.setCompileStatus('ok');
      this.layoutManager.setErrorCount(0);
      this.layoutManager.closeErrorDrawer();
      this.monacoAdapter.setMarkers([]);
      this._clearErrorList();
    } else {
      const errors = result.errors || [];
      const firstMsg = errors[0]?.message || 'GLSL Error';
      this.statusBar.setCompileStatus('error', firstMsg);
      this.layoutManager.setErrorCount(errors.length);
      this.monacoAdapter.setMarkers(errors);
      this._populateErrorList(errors);
      this.layoutManager.openErrorDrawer();
    }

    return result;
  }

  _clearErrorList() {
    if (this.elements.errorList) {
      this.elements.errorList.innerHTML = '';
    }
  }

  _populateErrorList(errors) {
    if (!this.elements.errorList) return;
    this.elements.errorList.innerHTML = '';

    errors.forEach((err) => {
      const li = this.doc.createElement('li');
      li.className = 'error-item';
      li.title = `Ir para linha ${err.line}`;
      li.setAttribute('role', 'button');
      li.tabIndex = 0;

      const badge = this.doc.createElement('span');
      badge.className = 'error-line-badge';
      badge.textContent = `Linha ${err.line}`;

      const msg = this.doc.createElement('span');
      msg.className = 'error-message';
      msg.textContent = err.message || 'Erro de sintaxe';

      li.appendChild(badge);
      li.appendChild(msg);

      const onSelect = () => {
        this.monacoAdapter.goToLine(err.line);
      };

      li.addEventListener('click', onSelect);
      li.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.preventDefault) e.preventDefault();
          onSelect();
        }
      });

      this.elements.errorList.appendChild(li);
    });
  }

  _bindCanvasInteractions() {
    const canvas = this.canvas;
    if (!canvas || typeof canvas.addEventListener !== 'function') return;

    let isPointerDown = false;
    let lastX = 0;
    let lastY = 0;

    const getCanvasCoords = (clientX, clientY) => {
      const rect = typeof canvas.getBoundingClientRect === 'function'
        ? canvas.getBoundingClientRect()
        : { left: 0, top: 0, width: canvas.width || 1, height: canvas.height || 1 };

      const scaleX = rect.width > 0 ? (canvas.width || rect.width) / rect.width : 1;
      const scaleY = rect.height > 0 ? (canvas.height || rect.height) / rect.height : 1;
      const x = (clientX - rect.left) * scaleX;
      const y = (clientY - rect.top) * scaleY;
      return { x, y };
    };

    canvas.addEventListener('mousedown', (e) => {
      if (typeof e.button === 'number' && e.button !== 0) return;
      isPointerDown = true;
      const { x, y } = getCanvasCoords(e.clientX, e.clientY);
      lastX = x;
      lastY = y;
      this.shaderEngine.updateMouse(x, y, true);
    });

    canvas.addEventListener('mousemove', (e) => {
      const { x, y } = getCanvasCoords(e.clientX, e.clientY);
      lastX = x;
      lastY = y;
      this.shaderEngine.updateMouse(x, y, isPointerDown);
    });

    const onPointerUp = () => {
      if (isPointerDown) {
        isPointerDown = false;
        this.shaderEngine.updateMouse(lastX, lastY, false);
      }
    };

    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('mouseleave', onPointerUp);
    if (typeof window !== 'undefined') {
      window.addEventListener('mouseup', onPointerUp);
    }

    // Touch Support for mobile and tablets
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) {
        isPointerDown = true;
        const t = e.touches[0];
        const { x, y } = getCanvasCoords(t.clientX, t.clientY);
        lastX = x;
        lastY = y;
        this.shaderEngine.updateMouse(x, y, true);
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0];
        const { x, y } = getCanvasCoords(t.clientX, t.clientY);
        lastX = x;
        lastY = y;
        this.shaderEngine.updateMouse(x, y, isPointerDown);
      }
    }, { passive: true });

    canvas.addEventListener('touchend', onPointerUp);
    canvas.addEventListener('touchcancel', onPointerUp);
  }

  _bindActionButtons() {
    // Play / Pause
    if (this.elements.btnPlay) {
      this.elements.btnPlay.addEventListener('click', () => this.togglePlay());
    }

    // Reset Time
    if (this.elements.btnReset) {
      this.elements.btnReset.addEventListener('click', () => this.resetTime());
    }

    // Resolution Scale
    if (this.elements.resScaleSelect) {
      this.elements.resScaleSelect.addEventListener('change', (e) => {
        const scale = parseFloat(e.target.value) || 1.0;
        this.setResolutionScale(scale);
      });
    }
  }

  togglePlay() {
    if (this.shaderEngine.isRunning) {
      this.shaderEngine.stop();
      this._updatePlayButtonUI(false);
    } else {
      this.shaderEngine.start();
      this._updatePlayButtonUI(true);
    }
    return this.shaderEngine.isRunning;
  }

  _updatePlayButtonUI(isRunning) {
    if (!this.elements.btnPlay) return;
    const icon = this.elements.btnPlay.querySelector?.('.icon');
    const text = this.elements.btnPlay.querySelector?.('.btn-text');

    if (isRunning) {
      if (icon) icon.textContent = '⏸';
      if (text) text.textContent = 'Pausar';
      this.elements.btnPlay.title = 'Pausar / Retomar (Espaço)';
    } else {
      if (icon) icon.textContent = '▶';
      if (text) text.textContent = 'Retomar';
      this.elements.btnPlay.title = 'Retomar Animação (Espaço)';
    }
  }

  resetTime() {
    this.shaderEngine.resetTime();
    this.statusBar.reset();
  }

  setResolutionScale(scale) {
    this.shaderEngine.setResolutionScale(scale);
    if (this.canvas) {
      this.statusBar.updateResolution(this.canvas.width, this.canvas.height, scale);
    }
  }

  _bindAudioControls() {
    const { audioSourceSelect, btnAudioFile, audioFileInput } = this.elements;

    if (audioSourceSelect) {
      audioSourceSelect.addEventListener('change', async (e) => {
        const mode = e.target.value;
        if (mode === 'off') {
          this.audioReactor.stopCurrentSource();
          if (btnAudioFile) btnAudioFile.style.display = 'none';
          if (this.audioTexture) this.audioTexture.update(this.audioReactor.getPackedTextureData());
        } else if (mode === 'mic') {
          if (btnAudioFile) btnAudioFile.style.display = 'none';
          try {
            await this.audioReactor.startMicrophone();
          } catch (err) {
            console.error('Microphone activation failed:', err);
            if (this.win?.alert) this.win.alert('Não foi possível acessar o microfone: ' + (err.message || 'Permissão negada'));
            audioSourceSelect.value = 'off';
            this.audioReactor.stopCurrentSource();
          }
        } else if (mode === 'file') {
          if (btnAudioFile) btnAudioFile.style.display = 'inline-flex';
          if (audioFileInput) audioFileInput.click();
        }
      });
    }

    if (btnAudioFile && audioFileInput) {
      btnAudioFile.addEventListener('click', () => audioFileInput.click());
    }

    if (audioFileInput) {
      audioFileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          await this.audioReactor.loadAudioFile(file);
        } catch (err) {
          console.error('Audio file load error:', err);
          if (this.win?.alert) this.win.alert('Erro ao carregar arquivo de áudio: ' + err.message);
          if (audioSourceSelect) audioSourceSelect.value = 'off';
          this.audioReactor.stopCurrentSource();
        }
      });
    }
  }

  _bindPresetsGallery() {
    const {
      btnPresets,
      btnClosePresets,
      presetsModal,
      presetSearchInput,
      presetTagFilters,
      btnImportPreset,
      btnExportPreset,
      btnShareUrl,
      presetFileInput
    } = this.elements;

    if (btnPresets) {
      btnPresets.addEventListener('click', () => this.openPresetsModal());
    }

    if (btnClosePresets) {
      btnClosePresets.addEventListener('click', () => this.closePresetsModal());
    }

    if (presetsModal) {
      presetsModal.addEventListener('click', (e) => {
        if (e.target === presetsModal) this.closePresetsModal();
      });
    }

    if (presetSearchInput) {
      presetSearchInput.addEventListener('input', (e) => {
        this.currentSearchQuery = e.target.value;
        this.renderPresetCards();
      });
    }

    if (presetTagFilters) {
      presetTagFilters.addEventListener('click', (e) => {
        const btn = e.target.closest?.('.tag-filter-btn');
        if (!btn) return;
        const allBtns = presetTagFilters.querySelectorAll?.('.tag-filter-btn') || [];
        allBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentTagFilter = btn.dataset?.tag || 'all';
        this.renderPresetCards();
      });
    }

    if (btnImportPreset && presetFileInput) {
      btnImportPreset.addEventListener('click', () => presetFileInput.click());
      presetFileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          let codeToLoad = text;
          if (file.name.endsWith('.json')) {
            try {
              const parsed = StorageManager.importJSON(text);
              codeToLoad = parsed.code || text;
            } catch {
              codeToLoad = text;
            }
          }
          this.loadPreset(codeToLoad);
          this.closePresetsModal();
        } catch (err) {
          if (this.win?.alert) this.win.alert('Erro ao carregar arquivo de preset: ' + err.message);
        } finally {
          presetFileInput.value = '';
        }
      });
    }

    if (btnExportPreset) {
      btnExportPreset.addEventListener('click', () => this.exportPresetJSON());
    }

    if (btnShareUrl) {
      btnShareUrl.addEventListener('click', () => this.shareURL());
    }
  }

  openPresetsModal() {
    if (this.elements.presetsModal) {
      this.elements.presetsModal.classList.remove('hidden');
      this.renderPresetCards();
    }
  }

  closePresetsModal() {
    if (this.elements.presetsModal) {
      this.elements.presetsModal.classList.add('hidden');
    }
  }

  renderPresetCards() {
    const container = this.elements.presetCards;
    if (!container) return;
    container.innerHTML = '';

    const query = (this.currentSearchQuery || '').toLowerCase().trim();
    const tagFilter = (this.currentTagFilter || 'all').toLowerCase();

    const filtered = PRESET_LIBRARY.filter(preset => {
      let matchesTag = true;
      if (tagFilter !== 'all') {
        matchesTag = preset.tags.some(t => {
          const tLower = t.toLowerCase();
          if (tagFilter === 'audio' && (tLower.includes('audio') || tLower.includes('áudio'))) return true;
          if (tagFilter === 'starter' && (tLower.includes('starter') || tLower.includes('iniciante') || tLower.includes('tutorial'))) return true;
          return tLower.includes(tagFilter);
        });
      }

      let matchesQuery = true;
      if (query) {
        const inName = preset.name.toLowerCase().includes(query);
        const inDesc = preset.description.toLowerCase().includes(query);
        const inTags = preset.tags.some(t => t.toLowerCase().includes(query));
        matchesQuery = inName || inDesc || inTags;
      }

      return matchesTag && matchesQuery;
    });

    if (filtered.length === 0) {
      const emptyMsg = this.doc.createElement('div');
      emptyMsg.style.gridColumn = '1 / -1';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--text-muted)';
      emptyMsg.style.padding = '30px 10px';
      emptyMsg.textContent = 'Nenhum shader encontrado para esta busca.';
      container.appendChild(emptyMsg);
      return;
    }

    filtered.forEach(preset => {
      const card = this.doc.createElement('div');
      card.className = 'preset-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');

      const title = this.doc.createElement('div');
      title.className = 'preset-card-title';
      title.textContent = preset.name;

      const desc = this.doc.createElement('div');
      desc.className = 'preset-card-desc';
      desc.textContent = preset.description;

      const tagsDiv = this.doc.createElement('div');
      tagsDiv.className = 'preset-card-tags';
      preset.tags.forEach(t => {
        const tagSpan = this.doc.createElement('span');
        tagSpan.className = 'preset-card-tag';
        tagSpan.textContent = t;
        tagsDiv.appendChild(tagSpan);
      });

      card.appendChild(title);
      card.appendChild(desc);
      card.appendChild(tagsDiv);

      const onSelect = () => {
        this.loadPreset(preset.code);
        this.closePresetsModal();
      };

      card.addEventListener('click', onSelect);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.preventDefault) e.preventDefault();
          onSelect();
        }
      });

      container.appendChild(card);
    });
  }

  loadPreset(code) {
    if (this.compileDebounceTimer) clearTimeout(this.compileDebounceTimer);
    this.isProgrammaticChange = true;
    this.monacoAdapter.setCode(code);
    this.isProgrammaticChange = false;

    this.compileShader(code);
    StorageManager.saveCurrent(code);
    this.resetTime();
  }

  exportPresetJSON() {
    const code = this.monacoAdapter.getCode();
    const payload = {
      name: 'Aether Custom Shader',
      version: '1.0',
      createdAt: new Date().toISOString(),
      code
    };
    const jsonStr = StorageManager.exportJSON(payload);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    downloadBlob(blob, 'shader-preset.json');
  }

  async shareURL() {
    const code = this.monacoAdapter.getCode();
    const hash = StorageManager.encodeURLHash(code);
    if (!this.win) return;

    this.win.location.hash = hash;
    const shareUrl = this.win.location.href;

    const btn = this.elements.btnShareUrl;
    try {
      if (this.win.navigator?.clipboard?.writeText) {
        await this.win.navigator.clipboard.writeText(shareUrl);
        if (btn) {
          const original = btn.textContent;
          btn.textContent = 'Copiado!';
          setTimeout(() => { btn.textContent = original; }, 2000);
        }
      } else if (this.win.prompt) {
        this.win.prompt('Copie o link abaixo:', shareUrl);
      }
    } catch {
      if (this.win.prompt) {
        this.win.prompt('Copie o link abaixo:', shareUrl);
      }
    }
  }

  _bindExportModals() {
    const {
      btnExport,
      btnCloseExport,
      exportModal,
      btnRecordVideo,
      exportVideoDuration,
      exportIncludeAudio,
      btnExportGif,
      exportGifDuration,
      exportGifFps,
      exportGifResolution
    } = this.elements;

    if (btnExport) {
      btnExport.addEventListener('click', () => this.openExportModal());
    }

    if (btnCloseExport) {
      btnCloseExport.addEventListener('click', () => this.closeExportModal());
    }

    if (exportModal) {
      exportModal.addEventListener('click', (e) => {
        if (e.target === exportModal) this.closeExportModal();
      });
    }

    // Video Recording
    if (btnRecordVideo) {
      btnRecordVideo.addEventListener('click', async () => {
        if (this.activeVideoRecorder && this.activeVideoRecorder.isRecording) {
          this.activeVideoRecorder.stop();
          return;
        }

        const includeAudio = exportIncludeAudio ? exportIncludeAudio.checked : true;
        this.activeVideoRecorder = new VideoRecorder(this.canvas, includeAudio ? this.audioReactor : null);

        if (!this.activeVideoRecorder.isSupported()) {
          if (this.win?.alert) {
            this.win.alert('Seu navegador não suporta gravação de vídeo via MediaRecorder ou canvas.captureStream.');
          }
          return;
        }

        const duration = parseFloat(exportVideoDuration?.value || '10');
        btnRecordVideo.textContent = 'Parar Gravação';
        btnRecordVideo.classList.add('btn-recording');
        this.setExportProgress(0, duration > 0 ? `Gravando (${duration}s)...` : 'Gravando (Manual)...');

        try {
          const blob = await this.activeVideoRecorder.record({
            durationSeconds: duration,
            fps: 60,
            onProgress: (p) => {
              this.setExportProgress(p, `Gravando... ${Math.round(p * 100)}%`);
            }
          });

          this.setExportProgress(1.0, 'Download iniciado!');
          downloadBlob(blob, `aether-shader-${Date.now()}.webm`);
          this.hideExportProgress(2500);
        } catch (err) {
          console.error('Video recording failed:', err);
          this.setExportProgress(0, 'Erro na gravação.');
          if (this.win?.alert) this.win.alert('Erro na gravação: ' + (err.message || err));
          this.hideExportProgress(2500);
        } finally {
          btnRecordVideo.textContent = 'Iniciar Gravação WebM';
          btnRecordVideo.classList.remove('btn-recording');
          this.activeVideoRecorder = null;
        }
      });
    }

    // GIF Export
    if (btnExportGif) {
      btnExportGif.addEventListener('click', async () => {
        const durationSeconds = parseFloat(exportGifDuration?.value || '2.0');
        const fps = parseInt(exportGifFps?.value || '30', 10);
        const resVal = exportGifResolution?.value || '480x270';
        const [w, h] = resVal.split('x').map(n => parseInt(n, 10));

        btnExportGif.disabled = true;
        const originalText = btnExportGif.textContent;
        btnExportGif.textContent = 'Renderizando GIF...';
        this.setExportProgress(0, 'Iniciando captura determinística de frames...');

        try {
          const blob = await GIFExporter.renderDeterministicLoop(this.shaderEngine, {
            durationSeconds,
            fps,
            width: w,
            height: h,
            onProgress: (p) => {
              this.setExportProgress(p, `Renderizando GIF: ${Math.round(p * 100)}%`);
            }
          });

          this.setExportProgress(1.0, 'GIF Concluído! Baixando...');
          downloadBlob(blob, `aether-shader-loop-${Date.now()}.gif`);
          this.hideExportProgress(2500);
        } catch (err) {
          console.error('GIF export error:', err);
          this.setExportProgress(0, 'Erro na exportação do GIF.');
          if (this.win?.alert) this.win.alert('Erro ao exportar GIF: ' + (err.message || err));
          this.hideExportProgress(2500);
        } finally {
          btnExportGif.disabled = false;
          btnExportGif.textContent = originalText;
        }
      });
    }
  }

  openExportModal() {
    if (this.elements.exportModal) {
      this.elements.exportModal.classList.remove('hidden');
    }
  }

  closeExportModal() {
    if (this.elements.exportModal) {
      this.elements.exportModal.classList.add('hidden');
    }
  }

  setExportProgress(percent, message = '') {
    const { exportProgressContainer, exportProgressFill, exportStatusText } = this.elements;
    if (exportProgressContainer) exportProgressContainer.classList.remove('hidden');
    const clamped = Math.min(100, Math.max(0, Math.round(percent * 100)));
    if (exportProgressFill) exportProgressFill.style.width = `${clamped}%`;
    if (exportStatusText) exportStatusText.textContent = message || `${clamped}%`;
  }

  hideExportProgress(delay = 2000) {
    const { exportProgressContainer, exportProgressFill, exportStatusText } = this.elements;
    setTimeout(() => {
      if (exportProgressContainer) exportProgressContainer.classList.add('hidden');
      if (exportProgressFill) exportProgressFill.style.width = '0%';
      if (exportStatusText) exportStatusText.textContent = 'Pronto';
    }, delay);
  }

  _bindGlobalKeybindings() {
    this.unbindKeybindings = KeybindingsManager.bind({
      onCompile: () => {
        const code = this.monacoAdapter.getCode();
        this.compileShader(code);
        StorageManager.saveCurrent(code);
      },
      onSave: () => {
        const code = this.monacoAdapter.getCode();
        StorageManager.saveCurrent(code);
        this.exportPresetJSON();
      },
      onTogglePlay: () => this.togglePlay(),
      onToggleZen: () => this.layoutManager.toggleZen(),
      onResetTime: () => this.resetTime()
    });
  }

  dispose() {
    if (this.compileDebounceTimer) {
      clearTimeout(this.compileDebounceTimer);
    }
    if (this.unbindKeybindings) {
      this.unbindKeybindings();
    }
    if (this.shaderEngine) {
      this.shaderEngine.stop();
    }
    if (this.audioReactor) {
      this.audioReactor.stopCurrentSource();
    }
    if (this.layoutManager) {
      this.layoutManager.dispose();
    }
    if (this.monacoAdapter) {
      this.monacoAdapter.dispose();
    }
  }
}

// Auto-bootstrap in browser environment
let appInstance = null;
if (typeof window !== 'undefined') {
  const startApp = async () => {
    if (!appInstance) {
      appInstance = new ShaderStudioApp();
      await appInstance.init();
      window.__shaderStudioApp = appInstance;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }
}

export default ShaderStudioApp;
