/**
 * Aether Agent Matrix - Main Application Entrypoint
 * Orchestrates WebGPU / Wasm LLM initialization, hardware diagnostics,
 * reactive state subscriptions, user moderation events, and UI views.
 */

import { detectHardwareCapabilities, getRecommendedModel } from './utils/hardware_detect.js?v=20260828c';
import { appState, DEFAULT_TOPIC } from './state.js?v=20260828c';
import { DEFAULT_PERSONAS, ARCHETYPES, getPersona } from './debate/personas.js?v=20260828c';
import { promptBuilder } from './debate/prompt_builder.js?v=20260828c';
import { createEngine, MODEL_CATALOG, getModelInfo } from './engine/engine_adapter.js?v=20260828c';
import { DebateOrchestrator, DEBATE_STATES } from './debate/orchestrator.js?v=20260828c';
import { ArenaView } from './ui/arena_view.js?v=20260828c';
import { TelemetryView } from './ui/telemetry_view.js?v=20260828c';
import { ExportView } from './ui/export_view.js?v=20260828c';
import { VoiceSynth, voiceSynth } from './audio/voice_synth.js?v=20260828c';

export class AetherAgentMatrixApp {
  constructor() {
    this.state = appState;
    this.arenaView = null;
    this.telemetryView = null;
    this.engine = null;
    this.orchestrator = null;
    this.voiceSynth = voiceSynth;
    this.hardwareCaps = null;
    this.isInitialized = false;
  }

  /**
   * Initializes the application, views, hardware detection, and event bindings.
   */
  async init() {
    if (this.isInitialized) return;

    // 1. Instantiate UI Views
    this.arenaView = new ArenaView();
    this.telemetryView = new TelemetryView({ state: this.state });

    // Initial debater render
    const debaterA = this.state.get('activeDebaters.debaterA') || DEFAULT_PERSONAS.debaterA;
    const debaterB = this.state.get('activeDebaters.debaterB') || DEFAULT_PERSONAS.debaterB;
    const judge = this.state.get('activeDebaters.judge') || DEFAULT_PERSONAS.judge;
    this.arenaView.renderDebaters(debaterA, debaterB, judge);

    // Initial voice mute state from storage
    if (typeof localStorage !== 'undefined') {
      const savedMute = localStorage.getItem('aether_matrix_voice_muted');
      if (savedMute === 'true') {
        this.voiceSynth.setMuted(true);
      }
    }
    this._updateVoiceButtonUI(this.voiceSynth.isMuted);

    // 2. Hardware Diagnostics
    try {
      this.hardwareCaps = await detectHardwareCapabilities();
      const recommendedModel = getRecommendedModel(this.hardwareCaps);

      this.state.set('telemetry.backend', this.hardwareCaps.recommendedBackend);
      this.state.set('telemetry.vramMB', this.hardwareCaps.estimatedVRAM);

      const currentModelId = this.state.get('selectedModel');
      const currentModelInfo = getModelInfo(currentModelId);
      // Check if current model is compatible with the recommended backend.
      // When no WebGPU: recommendedModel is mock (CPU models are too small for
      // coherent output), so only 'mock' models are considered compatible.
      // When WebGPU: webgpu and mock models are both compatible.
      const currentBackend = currentModelInfo?.backend;
      const recBackend = recommendedModel.backend;
      const isCompatible = currentModelInfo && (
        currentBackend === recBackend
        || currentBackend === 'mock'
        || (currentBackend === 'webgpu' && this.hardwareCaps.hasWebGPU)
      );
      if (!isCompatible) {
        this.state.set('selectedModel', recommendedModel.id);
      }

      this.state.set('telemetry.backend', getModelInfo(this.state.get('selectedModel'))?.backend || recBackend);
    } catch (err) {
      console.warn('Hardware detection fallback:', err);
      this.state.set('telemetry.backend', 'mock');
      this.state.set('selectedModel', 'mock-instant-neural-matrix');
    }

    // 3. Instantiate Engine & Orchestrator
    const selectedModelId = this.state.get('selectedModel') || 'SmolLM2-360M-Instruct-q4f16_1-MLC';
    const modelInfo = getModelInfo(selectedModelId);
    const backend = modelInfo?.backend || this.state.get('telemetry.backend') || 'webgpu';
    this.engine = createEngine(backend, { modelId: selectedModelId });

    this.orchestrator = new DebateOrchestrator({
      engine: this.engine,
      state: this.state,
      promptBuilder
    });

    // 4. Wire Orchestrator Events to UI
    this._bindOrchestratorEvents();

    // 5. Wire DOM UI Event Listeners
    if (typeof document !== 'undefined') {
      this._bindUIEventListeners();
      this._populateModelCatalogModal();
    }

    this.isInitialized = true;
    console.log('🛸 Aether Agent Matrix initialized successfully.');
  }

  /**
   * Updates Voice button icon and classes based on mute state.
   * @param {boolean} isMuted
   * @private
   */
  _updateVoiceButtonUI(isMuted) {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('btn-toggle-voice');
    const icon = document.getElementById('voice-icon');
    const label = document.getElementById('voice-label');

    if (!btn) return;
    if (isMuted) {
      btn.classList.add('muted');
      if (icon) icon.textContent = '🔇';
      if (label) label.textContent = 'Voz Mutada';
      btn.title = 'Voz das IAs mutada. Clique para ativar voz.';
    } else {
      btn.classList.remove('muted');
      if (icon) icon.textContent = '🔊';
      if (label) label.textContent = 'Voz Ativa';
      btn.title = 'Voz das IAs ativa. Clique para mutar.';
    }
  }

  /**
   * Configures max tokens per turn based on selected speed preset.
   * @param {'micro'|'standard'|'detailed'} speed
   * @private
   */
  _applyTurnSpeed(speed = 'micro') {
    if (speed === 'micro') {
      this.state.set('settings.maxTokensPerTurn', 65);
      this.state.set('settings.maxTokensJudge', 130);
    } else if (speed === 'standard') {
      this.state.set('settings.maxTokensPerTurn', 100);
      this.state.set('settings.maxTokensJudge', 160);
    } else if (speed === 'detailed') {
      this.state.set('settings.maxTokensPerTurn', 160);
      this.state.set('settings.maxTokensJudge', 220);
    }
  }

  /**
   * Shows a non-blocking toast notification.
   * @param {string} message
   * @param {'info'|'success'|'error'|'warning'} [type='info']
   * @param {number} [duration=3500]
   */
  showToast(message, type = 'info', duration = 3500) {
    if (typeof document === 'undefined') return;
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  /**
   * Shows a custom glassmorphism modal alert / error box instead of window.alert.
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.message
   * @param {string} [options.details]
   * @param {'error'|'warning'|'info'|'success'} [options.type='error']
   * @param {string} [options.icon]
   */
  showAlertModal({ title = 'Aviso', message = '', details = null, type = 'error', icon = null }) {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-alert');
    const titleEl = document.getElementById('modal-alert-title');
    const msgEl = document.getElementById('modal-alert-message');
    const iconEl = document.getElementById('modal-alert-icon');
    const detailsContainer = document.getElementById('modal-alert-details-container');
    const detailsEl = document.getElementById('modal-alert-details');
    const boxEl = modal?.querySelector('.modal-alert-box');

    if (!modal || !titleEl || !msgEl) return;

    titleEl.textContent = title;
    msgEl.textContent = message;

    if (iconEl) {
      iconEl.textContent = icon || (type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️');
    }

    if (boxEl) {
      boxEl.className = `modal-box modal-alert-box type-${type}`;
    }

    if (details && detailsContainer && detailsEl) {
      detailsEl.textContent = typeof details === 'object' ? JSON.stringify(details, null, 2) : String(details);
      detailsContainer.classList.remove('hidden');
      detailsContainer.style.display = 'block';
    } else if (detailsContainer) {
      detailsContainer.classList.add('hidden');
      detailsContainer.style.display = 'none';
    }

    modal.classList.remove('hidden', 'd-none');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  }

  /**
   * Shows a custom glassmorphism confirmation modal instead of window.confirm.
   * @param {Object} options
   * @param {string} options.title
   * @param {string} options.message
   * @param {Function} options.onConfirm
   */
  showConfirmModal({ title = 'Confirmar', message = 'Deseja prosseguir?', onConfirm }) {
    if (typeof document === 'undefined') return;
    const modal = document.getElementById('modal-confirm');
    const titleEl = document.getElementById('modal-confirm-title');
    const msgEl = document.getElementById('modal-confirm-message');
    const okBtn = document.getElementById('btn-confirm-ok');

    if (!modal || !titleEl || !msgEl) return;

    titleEl.textContent = title;
    msgEl.textContent = message;

    const handleConfirm = () => {
      modal.classList.add('hidden');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
      if (typeof onConfirm === 'function') onConfirm();
    };

    if (okBtn) {
      const newOkBtn = okBtn.cloneNode(true);
      okBtn.parentNode.replaceChild(newOkBtn, okBtn);
      newOkBtn.addEventListener('click', handleConfirm);
    }

    modal.classList.remove('hidden', 'd-none');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  }

  /**
   * Binds orchestrator events to ArenaView and TelemetryView updates.
   * @private
   */
  _bindOrchestratorEvents() {
    // State Changes
    this.orchestrator.on('stateChange', ({ state, speaker, persona, round, scores, verdict }) => {
      const rounds = this.state.get('rounds') || 3;
      this.telemetryView.updateState(state, round, rounds);

      if (state === DEBATE_STATES.COMPLETED && scores) {
        this.arenaView.renderVerdict({
          winner: scores.winner,
          winnerKey: scores.winnerKey,
          scores: scores,
          verdict: verdict
        });
        this._updateControlButtonsState('completed');
      } else if (state === DEBATE_STATES.IDLE) {
        this._updateControlButtonsState('idle');
      }
    });

    // Turn Start: Set status to thinking
    this.orchestrator.on('turnStart', ({ state, speaker, persona, round }) => {
      this.arenaView.setActiveSpeaker(speaker, '🧠 Pensando...');
      this._updateControlButtonsState('running');
    });

    // Streaming Token: Set status to speaking
    this.orchestrator.on('token', ({ token, speaker }) => {
      this.arenaView.setActiveSpeaker(speaker, '🎙️ Falando...');
      this.arenaView.appendToken(speaker, token);
    });

    // Turn Finalized: Complete markdown, scroll timeline, and speak text if voice active
    this.orchestrator.on('turnEnd', ({ entry, isCompleted }) => {
      this.arenaView.finalizeTurn(entry);

      if (this.voiceSynth && !this.voiceSynth.isMuted && this.voiceSynth.isSupported()) {
        this.arenaView.setActiveSpeaker(entry.speaker, '🗣️ Narrando (Voz)...');
        this.voiceSynth.speak(entry.content, entry.speaker, () => {
          this.arenaView.setActiveSpeaker(entry.speaker, '✓ Concluído');
          if (this.orchestrator.autoplay && !this.orchestrator.isPaused && !isCompleted) {
            this.orchestrator.scheduleNextTurn(1500);
          }
        });
      } else {
        this.arenaView.setActiveSpeaker(entry.speaker, '✓ Concluído');
        if (this.orchestrator.autoplay && !this.orchestrator.isPaused && !isCompleted) {
          this.orchestrator.scheduleNextTurn(2000);
        }
      }
    });

    // Pause / Resume
    this.orchestrator.on('pause', () => {
      this.voiceSynth?.stop();
      this._updateControlButtonsState('paused');
    });

    this.orchestrator.on('resume', () => {
      this._updateControlButtonsState('running');
    });

    // Audience Vote
    this.orchestrator.on('vote', ({ votes }) => {
      this.arenaView.updateVotes(votes);
    });

    // Errors
    this.orchestrator.on('error', ({ error, state, speaker }) => {
      console.error(`Debate error at ${state} (${speaker}):`, error);
      this.voiceSynth?.stop();
      this.arenaView.clearActiveSpeaker();
      this.showAlertModal({
        title: 'Erro Durante o Debate',
        message: `Ocorreu uma falha no turno de ${speaker || 'sistema'}.`,
        details: String(error),
        type: 'error'
      });
      this._updateControlButtonsState('idle');
    });
  }

  /**
   * Updates disabled and label states of moderation control buttons.
   * @param {'idle'|'running'|'paused'|'completed'} status
   * @private
   */
  _updateControlButtonsState(status) {
    const btnStart = document.getElementById('btn-start');
    const btnPause = document.getElementById('btn-pause');
    const btnNextTurn = document.getElementById('btn-next-turn');

    if (!btnStart || !btnPause || !btnNextTurn) return;

    if (status === 'running') {
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnPause.innerHTML = '<span>⏸</span> Pausar';
      btnNextTurn.disabled = true;
    } else if (status === 'paused') {
      btnStart.disabled = true;
      btnPause.disabled = false;
      btnPause.innerHTML = '<span>▶</span> Retomar';
      btnNextTurn.disabled = false;
    } else if (status === 'idle' || status === 'completed') {
      btnStart.disabled = false;
      btnStart.innerHTML = '<span>▶</span> Iniciar Debate';
      btnPause.disabled = true;
      btnPause.innerHTML = '<span>⏸</span> Pausar';
      btnNextTurn.disabled = true;
    }
  }

  /**
   * Binds browser DOM click and change events to application workflows.
   * @private
   */
  _bindUIEventListeners() {
    // 1. Topic Input & Preset Topic Chips
    const topicInput = document.getElementById('topic-input');
    if (topicInput) {
      topicInput.addEventListener('input', (e) => {
        this.state.set('topic', e.target.value.trim());
      });
    }

    const presetChips = document.querySelectorAll('.preset-chip');
    presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const topic = chip.getAttribute('data-topic');
        if (topic && topicInput) {
          topicInput.value = topic;
          this.state.set('topic', topic);
          this.showToast('Tema selecionado!', 'info', 2000);
        }
      });
    });

    // Turn Speed / Length Selection
    const turnSpeedSelect = document.getElementById('select-turn-speed');
    if (turnSpeedSelect) {
      const savedSpeed = (typeof localStorage !== 'undefined' && localStorage.getItem('aether_matrix_turn_speed')) || 'micro';
      turnSpeedSelect.value = savedSpeed;
      this._applyTurnSpeed(savedSpeed);

      turnSpeedSelect.addEventListener('change', (e) => {
        const speed = e.target.value;
        this._applyTurnSpeed(speed);
        try {
          localStorage.setItem('aether_matrix_turn_speed', speed);
        } catch (err) {}
        this.showToast(
          speed === 'micro' ? '⚡ Modo Micro-Turnos ativado (Geração Ultra-Rápida)' :
          speed === 'standard' ? '⚖️ Modo Padrão ativado' : '📜 Modo Extenso ativado',
          'info', 2000
        );
      });
    }

    // 2. Start / Play Button
    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
      btnStart.addEventListener('click', async () => {
        // Unlock speech synthesis context on user click gesture
        this.voiceSynth?.unlockAudio();

        const topic = topicInput ? topicInput.value.trim() : (this.state.get('topic') || DEFAULT_TOPIC);
        const autoplayToggle = document.getElementById('toggle-autoplay');
        const autoplay = autoplayToggle ? autoplayToggle.checked : true;

        const modelId = this.state.get('selectedModel') || 'SmolLM2-360M-Instruct-q4f16_1-MLC';
        const modelInfo = getModelInfo(modelId);
        const targetBackend = modelInfo?.backend || (this.hardwareCaps?.hasWebGPU ? 'webgpu' : 'wasm-worker');

        // Ensure engine instance matches the model's backend driver
        if (!this.engine || this.engine.getBackendType() !== targetBackend) {
          this.engine = createEngine(targetBackend, { modelId });
          this.orchestrator.setEngine(this.engine);
          this.state.set('telemetry.backend', targetBackend);
        }
        
        // Ensure engine is loaded before start
        if (!this.engine.isLoaded() || this.engine.getLoadedModelId() !== modelId) {
          this.telemetryView.showModelLoading(0.1, `Carregando pesos de ${modelInfo?.name || modelId}...`);
          try {
            await this.engine.init(modelId, (p) => {
              const pct = typeof p === 'object' ? p.progress : p;
              const text = typeof p === 'object' ? (p.text || 'Baixando pesos...') : 'Carregando...';
              this.telemetryView.showModelLoading(pct, text);
            });
          } catch (err) {
            this.telemetryView.hideModelLoading();
            this.showAlertModal({
              title: 'Falha ao Carregar Modelo',
              message: `Não foi possível carregar os pesos do modelo "${modelId}".`,
              details: `${err.message}\n\nDica: Se você não possui WebGPU ativa ou conexão de alta velocidade, selecione o "⚡ Modo Turbo Instantâneo" no menu de modelos para debates imediatos com voz e vereditos.`,
              type: 'error'
            });
            return;
          } finally {
            this.telemetryView.hideModelLoading();
          }
        }

        this.arenaView.reset();
        await this.orchestrator.startDebate({
          topic,
          debaterA: this.state.get('activeDebaters.debaterA'),
          debaterB: this.state.get('activeDebaters.debaterB'),
          judge: this.state.get('activeDebaters.judge'),
          autoplay,
          turnDelayMs: 2000,
          manualScheduleTurnEnd: true
        });
      });
    }

    // 3. Pause / Resume Button
    const btnPause = document.getElementById('btn-pause');
    if (btnPause) {
      btnPause.addEventListener('click', () => {
        if (this.orchestrator.isPaused) {
          this.orchestrator.resume();
        } else {
          this.orchestrator.pause();
        }
      });
    }

    // 4. Next Turn Button
    const btnNextTurn = document.getElementById('btn-next-turn');
    if (btnNextTurn) {
      btnNextTurn.addEventListener('click', async () => {
        btnNextTurn.disabled = true;
        try {
          await this.orchestrator.nextTurn();
        } catch (e) {
          console.error('Error executing next turn:', e);
        } finally {
          btnNextTurn.disabled = false;
        }
      });
    }

    // 5. Reset Button
    const btnReset = document.getElementById('btn-reset');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.showConfirmModal({
          title: 'Reiniciar Debate',
          message: 'Deseja realmente cancelar o progresso e reiniciar o debate atual?',
          onConfirm: () => {
            this.voiceSynth?.stop();
            this.orchestrator.reset();
            this.arenaView.reset();
            this.arenaView.clearActiveSpeaker();
            this.telemetryView.reset();
            this._updateControlButtonsState('idle');
            this.showToast('Debate reiniciado.', 'info');
          }
        });
      });
    }

    // 6. Voice Mute/Unmute Toggle Button
    const btnToggleVoice = document.getElementById('btn-toggle-voice');
    if (btnToggleVoice) {
      btnToggleVoice.addEventListener('click', () => {
        const isMuted = this.voiceSynth.toggleMute();
        this._updateVoiceButtonUI(isMuted);
        try {
          localStorage.setItem('aether_matrix_voice_muted', isMuted ? 'true' : 'false');
        } catch (e) {}
        this.showToast(isMuted ? 'Voz das IAs mutada 🔇' : 'Voz das IAs ativada 🔊', 'info', 2000);
      });
    }

    // 7. Audience Voting Buttons
    const btnVoteA = document.getElementById('btn-vote-a');
    if (btnVoteA) {
      btnVoteA.addEventListener('click', () => {
        this.orchestrator.vote('debaterA');
        this.showToast('Voto computado para o Debatedor A!', 'info', 1500);
      });
    }

    const btnVoteB = document.getElementById('btn-vote-b');
    if (btnVoteB) {
      btnVoteB.addEventListener('click', () => {
        this.orchestrator.vote('debaterB');
        this.showToast('Voto computado para o Debatedor B!', 'info', 1500);
      });
    }

    // 7. Modals Open / Close Wiring
    this._bindModalControls();
  }

  /**
   * Sets up all modal toggles, forms, and submission buttons.
   * @private
   */
  _bindModalControls() {
    // Helper to toggle modal display
    const toggleModal = (modalId, show) => {
      const modal = document.getElementById(modalId);
      if (modal) {
        if (show) {
          modal.classList.remove('hidden', 'd-none');
          modal.style.display = 'flex';
          modal.setAttribute('aria-hidden', 'false');
        } else {
          modal.classList.add('hidden');
          modal.style.display = 'none';
          modal.setAttribute('aria-hidden', 'true');
        }
      }
    };

    // Close buttons by class / id
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const overlay = e.target.closest('.modal-overlay');
        if (overlay) {
          overlay.classList.add('hidden');
          overlay.style.display = 'none';
          overlay.setAttribute('aria-hidden', 'true');
        }
      });
    });

    // Alert & Confirm Modal Buttons
    const btnAlertOk = document.getElementById('btn-alert-ok');
    if (btnAlertOk) {
      btnAlertOk.addEventListener('click', () => toggleModal('modal-alert', false));
    }
    const btnCloseAlert = document.getElementById('btn-close-alert');
    if (btnCloseAlert) {
      btnCloseAlert.addEventListener('click', () => toggleModal('modal-alert', false));
    }

    const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
    if (btnConfirmCancel) {
      btnConfirmCancel.addEventListener('click', () => toggleModal('modal-confirm', false));
    }
    const btnCloseConfirm = document.getElementById('btn-close-confirm');
    if (btnCloseConfirm) {
      btnCloseConfirm.addEventListener('click', () => toggleModal('modal-confirm', false));
    }

    // Model Selector Modal
    const btnModelSelect = document.getElementById('btn-model-select');
    if (btnModelSelect) {
      btnModelSelect.addEventListener('click', () => toggleModal('modal-model-select', true));
    }
    const btnCloseModelSelect = document.getElementById('btn-close-model-select');
    if (btnCloseModelSelect) {
      btnCloseModelSelect.addEventListener('click', () => toggleModal('modal-model-select', false));
    }

    // Personas Modal
    const btnPersonas = document.getElementById('btn-personas');
    if (btnPersonas) {
      btnPersonas.addEventListener('click', () => toggleModal('modal-personas', true));
    }
    const btnClosePersonas = document.getElementById('btn-close-personas');
    if (btnClosePersonas) {
      btnClosePersonas.addEventListener('click', () => toggleModal('modal-personas', false));
    }

    // Persona Archetype Dropdown
    const personaPresetSelect = document.getElementById('persona-preset-select');
    const nameInput = document.getElementById('persona-custom-name');
    const roleInput = document.getElementById('persona-custom-role');
    const promptInput = document.getElementById('persona-custom-prompt');

    if (personaPresetSelect) {
      personaPresetSelect.addEventListener('change', (e) => {
        const archKey = e.target.value;
        const arch = ARCHETYPES[archKey];
        if (arch) {
          if (nameInput) nameInput.value = arch.name;
          if (roleInput) roleInput.value = arch.role;
          if (promptInput) promptInput.value = arch.systemPrompt;
        }
      });
    }

    // Save Persona Button
    const btnSavePersona = document.getElementById('btn-save-persona');
    if (btnSavePersona) {
      btnSavePersona.addEventListener('click', () => {
        const slot = document.getElementById('persona-target-slot')?.value || 'debaterA';
        const name = nameInput?.value.trim() || 'Debatedor Custom';
        const role = roleInput?.value.trim() || 'Agente';
        const systemPrompt = promptInput?.value.trim() || 'Seja articulado e conciso.';

        const updatedPersona = {
          id: `custom_${Date.now()}`,
          name,
          role,
          avatar: slot === 'judge' ? '⚖️' : slot === 'debaterB' ? '🌿' : '🤖',
          accentColor: slot === 'judge' ? '#8b5cf6' : slot === 'debaterB' ? '#ec4899' : '#00f3ff',
          systemPrompt
        };

        const activeDebaters = this.state.get('activeDebaters') || {};
        activeDebaters[slot] = updatedPersona;
        this.state.set('activeDebaters', activeDebaters);

        this.arenaView.renderDebaters(
          activeDebaters.debaterA,
          activeDebaters.debaterB,
          activeDebaters.judge
        );

        toggleModal('modal-personas', false);
        this.showToast(`Persona "${name}" aplicada com sucesso!`, 'success');
      });
    }

    // Audience Intervention Modal
    const btnIntervene = document.getElementById('btn-intervene');
    if (btnIntervene) {
      btnIntervene.addEventListener('click', () => toggleModal('modal-intervene', true));
    }
    const btnCloseIntervene = document.getElementById('btn-close-intervene');
    if (btnCloseIntervene) {
      btnCloseIntervene.addEventListener('click', () => toggleModal('modal-intervene', false));
    }

    const btnSubmitIntervene = document.getElementById('btn-submit-intervene');
    if (btnSubmitIntervene) {
      btnSubmitIntervene.addEventListener('click', () => {
        const target = document.getElementById('intervene-target')?.value || 'debaterB';
        const questionText = document.getElementById('intervene-question')?.value.trim();

        if (!questionText) {
          this.showToast('Por favor, digite sua pergunta ou contestação antes de injetar.', 'warning');
          return;
        }

        this.orchestrator.injectAudienceQuestion(questionText, target);
        toggleModal('modal-intervene', false);
        document.getElementById('intervene-question').value = '';
        this.showToast('Intervenção agendada para a próxima oportunidade!', 'info');
      });
    }

    // Export Modal
    const btnExport = document.getElementById('btn-export');
    if (btnExport) {
      btnExport.addEventListener('click', () => toggleModal('modal-export', true));
    }
    const btnCloseExport = document.getElementById('btn-close-export');
    if (btnCloseExport) {
      btnCloseExport.addEventListener('click', () => toggleModal('modal-export', false));
    }

    const getSessionData = () => ({
      topic: this.state.get('topic'),
      selectedModel: this.state.get('selectedModel'),
      backend: this.state.get('telemetry.backend'),
      rounds: this.state.get('rounds') || 3,
      timestamp: new Date().toISOString(),
      activeDebaters: this.state.get('activeDebaters'),
      audienceVotes: this.state.get('audienceVotes'),
      transcript: this.state.get('transcriptHistory') || [],
      scores: this.orchestrator?.scores,
      verdict: this.orchestrator?.verdict
    });

    const btnExportMd = document.getElementById('btn-export-md');
    if (btnExportMd) {
      btnExportMd.addEventListener('click', () => {
        ExportView.downloadMarkdown(getSessionData());
        this.showToast('Relatório Markdown gerado e baixado.', 'success');
      });
    }

    const btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => {
        ExportView.downloadJSON(getSessionData());
        this.showToast('Arquivo JSON gerado e baixado.', 'success');
      });
    }

    const btnCopyTranscript = document.getElementById('btn-copy-transcript');
    if (btnCopyTranscript) {
      btnCopyTranscript.addEventListener('click', async () => {
        const success = await ExportView.copyTranscriptToClipboard(getSessionData());
        if (success) {
          this.showToast('Transcrição copiada para a área de transferência!', 'success');
        } else {
          this.showToast('Não foi possível copiar automaticamente.', 'warning');
        }
      });
    }

    // Verdict Modal Actions
    const btnCloseVerdict = document.getElementById('btn-close-verdict');
    if (btnCloseVerdict) {
      btnCloseVerdict.addEventListener('click', () => toggleModal('modal-verdict', false));
    }

    const btnVerdictExportMd = document.getElementById('btn-verdict-export-md');
    if (btnVerdictExportMd) {
      btnVerdictExportMd.addEventListener('click', () => {
        ExportView.downloadMarkdown(getSessionData());
        this.showToast('Relatório Markdown baixado.', 'success');
      });
    }

    const btnVerdictExportJson = document.getElementById('btn-verdict-export-json');
    if (btnVerdictExportJson) {
      btnVerdictExportJson.addEventListener('click', () => {
        ExportView.downloadJSON(getSessionData());
        this.showToast('Arquivo JSON baixado.', 'success');
      });
    }

    const btnVerdictNewDebate = document.getElementById('btn-verdict-new-debate');
    if (btnVerdictNewDebate) {
      btnVerdictNewDebate.addEventListener('click', () => {
        toggleModal('modal-verdict', false);
        this.orchestrator.reset();
        this.arenaView.reset();
        this._updateControlButtonsState('idle');
        this.showToast('Novo debate pronto para ser iniciado!', 'info');
      });
    }

    // Fullscreen Toggle
    const btnFullscreen = document.getElementById('btn-fullscreen');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(err => console.warn(err));
        } else {
          document.exitFullscreen().catch(err => console.warn(err));
        }
      });
    }
  }

  /**
   * Populates model catalog listing inside the Model Selection modal.
   * @private
   */
  _populateModelCatalogModal() {
    const listContainer = document.getElementById('model-catalog-list');
    if (!listContainer) return;

    const currentModelId = this.state.get('selectedModel');
    listContainer.innerHTML = '';

    MODEL_CATALOG.forEach(model => {
      const card = document.createElement('div');
      card.className = `model-catalog-card ${model.id === currentModelId ? 'active' : ''}`;
      card.innerHTML = `
        <div>
          <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">${model.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">
            ${model.description}
          </div>
          <div style="font-size: 0.72rem; color: var(--accent-purple); font-family: var(--font-mono); margin-top: 4px;">
            Backend: ${model.backend.toUpperCase()} • Download: ~${model.sizeMB} MB • VRAM: ~${model.vramMB} MB
          </div>
        </div>
        <button class="btn-ctrl btn-secondary" style="padding: 6px 12px; font-size: 0.78rem;">
          ${model.id === currentModelId ? '✓ Ativo' : 'Selecionar'}
        </button>
      `;

      card.addEventListener('click', async () => {
        this.state.set('selectedModel', model.id);
        const modal = document.getElementById('modal-model-select');
        if (modal) {
          modal.classList.add('hidden');
          modal.style.display = 'none';
        }

        // Re-populate modal to reflect active item
        this._populateModelCatalogModal();

        // Switch engine backend if needed
        if (model.backend !== this.engine.getBackendType()) {
          this.engine = createEngine(model.backend, { modelId: model.id });
          this.orchestrator.setEngine(this.engine);
          this.state.set('telemetry.backend', model.backend);
        }

        this.showToast(`Modelo selecionado: ${model.name}`, 'info');

        // Initialize new model
        this.telemetryView.showModelLoading(0.1, `Carregando pesos de ${model.name}...`);
        try {
          await this.engine.init(model.id, (p) => {
            const pct = typeof p === 'object' ? p.progress : p;
            const text = typeof p === 'object' ? (p.text || 'Baixando pesos...') : 'Carregando...';
            this.telemetryView.showModelLoading(pct, text);
          });
          this.showToast(`Modelo ${model.name} pronto para inferência!`, 'success');
        } catch (e) {
          this.showAlertModal({
            title: 'Erro ao Inicializar Modelo',
            message: `Não foi possível carregar o modelo "${model.name}".`,
            details: `${e.message}\n\nDica: Se você não possui aceleração WebGPU ativa no navegador, selecione o "⚡ Modo Turbo Instantâneo" para rodar debates completos instantaneamente.`,
            type: 'error'
          });
        } finally {
          this.telemetryView.hideModelLoading();
        }
      });

      listContainer.appendChild(card);
    });
  }
}

// Auto-instantiate and initialize on DOM content loaded
let matrixAppInstance = null;

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', async () => {
    matrixAppInstance = new AetherAgentMatrixApp();
    await matrixAppInstance.init();
    window.matrixApp = matrixAppInstance;
  });
}

export const matrixApp = matrixAppInstance;
