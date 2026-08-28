/**
 * Aether Vision Sandbox - Application Orchestrator
 * 
 * Central controller coordinating WebRTC camera stream, MediaPipe hand tracking,
 * Web Audio synthesizers, interactive modes (Theremin, Arcade, Debugger),
 * HUD telemetry overlays, and responsive user event handling.
 */

import { CameraManager } from './core/camera.js?v=2';
import { StateManager, appState } from './core/state.js?v=2';
import { HandTracker } from './vision/hand_tracker.js?v=2';
import { SynthEngine, synthEngine } from './audio/synth_engine.js?v=2';
import { CanvasRenderer } from './ui/renderer.js?v=2';
import { HudManager } from './ui/hud.js?v=2';
import { ThereminMode } from './modes/theremin_mode.js?v=2';
import { ArcadeMode } from './modes/arcade_mode.js?v=2';
import { DebuggerMode } from './modes/debugger_mode.js?v=2';

export class AetherVisionApp {
    /**
     * @param {Object} [options={}] - Custom configuration and overrides
     */
    constructor(options = {}) {
        this.options = {
            videoSelector: '#webcam-video',
            canvasSelector: '#vision-canvas',
            splashSelector: '#splash-screen',
            defaultMode: 'theremin',
            ...options
        };

        // Core Infrastructure Singletons / Instances
        this.state = options.state || appState;
        this.camera = options.camera || new CameraManager();
        this.synth = options.synth || synthEngine;
        this.tracker = options.tracker || new HandTracker();
        this.hud = options.hud || new HudManager();

        // Canvas & Renderer references
        this.canvasElement = null;
        this.videoElement = null;
        this.splashElement = null;
        this.renderer = null;

        // Experience Modes
        this.modes = {};
        this.activeModeName = this.options.defaultMode || 'theremin';

        // Runtime state
        this.isRunning = false;
        this.isMuted = false;
        this.previousVolume = 0.7;
        this.lastFrameTime = 0;
        this.fps = 60;
        this.latency = 0;
        this.animationFrameId = null;
        this.isProcessingInference = false;
        this.lastTrackingResults = { hands: [], timestamp: 0 };
        this.boundKeyHandler = null;
    }

    /**
     * Initializes DOM elements, renderer, audio unlock listeners, mode instances, and event bindings.
     * @returns {Promise<AetherVisionApp>}
     */
    async init() {
        if (typeof document !== 'undefined') {
            this.videoElement = document.querySelector(this.options.videoSelector);
            this.canvasElement = document.querySelector(this.options.canvasSelector);
            this.splashElement = document.querySelector(this.options.splashSelector);
        }

        // 1. Initialize Canvas Renderer
        if (this.canvasElement) {
            this.renderer = new CanvasRenderer(this.canvasElement, { maxParticles: 300 });
        } else {
            this.renderer = options.renderer || new CanvasRenderer({ width: 1280, height: 720 });
        }

        // 2. Initialize HUD
        if (this.hud && typeof this.hud.init === 'function') {
            this.hud.init();
        }

        // 3. Initialize Experience Modes
        this.modes = {
            theremin: new ThereminMode({
                synth: this.synth,
                state: this.state,
                renderer: this.renderer,
                hud: this.hud
            }),
            arcade: new ArcadeMode({
                synth: this.synth,
                state: this.state,
                renderer: this.renderer,
                hud: this.hud
            }),
            debugger: new DebuggerMode({
                state: this.state,
                renderer: this.renderer,
                hud: this.hud
            })
        };

        // 4. Bind UI Controls & Event Listeners
        this.bindEvents();

        // 5. Activate Default Mode
        this.switchMode(this.activeModeName);

        // 6. Sync Mirror state and visual button
        if (this.tracker && this.camera) {
            this.tracker.setMirrored(this.camera.isMirrored);
        }
        this.updateMirrorUI();

        // 7. Handle Window Resizing
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('resize', () => this.handleResize());
        }

        this.isRunning = true;
        this.startLoop();

        if (this.hud && typeof this.hud.showToast === 'function') {
            this.hud.showToast('Aether Vision pronto! Clique em Iniciar Câmera.', 'info', 3000);
        }

        return this;
    }

    /**
     * Binds click events, form selectors, switches, and keyboard shortcuts.
     * @private
     */
    bindEvents() {
        // Hud Actions (Camera, Mute, Mirror, Mode Navigation)
        if (this.hud && typeof this.hud.bindEvents === 'function') {
            this.hud.bindEvents({
                onToggleCamera: () => this.toggleCamera(),
                onToggleMute: () => this.toggleMute(),
                onToggleMirror: () => this.toggleMirror(),
                onSwitchMode: (mode) => this.switchMode(mode),
                onResetScore: () => {
                    if (this.modes.arcade) {
                        this.modes.arcade.resetGame();
                        if (this.hud) this.hud.showToast('Pontuação reiniciada!', 'info', 1500);
                    }
                }
            });
        }

        if (typeof document === 'undefined') return;

        // Start Camera Splash Button
        const btnStartCamera = document.getElementById('btn-start-camera');
        if (btnStartCamera) {
            btnStartCamera.addEventListener('click', () => this.startCamera());
        }

        // Theremin Controls
        const scaleSelect = document.getElementById('scale-select');
        if (scaleSelect) {
            scaleSelect.addEventListener('change', (e) => {
                const scaleKey = e.target.value;
                this.modes.theremin?.setScale(scaleKey);
                if (this.hud) this.hud.showToast(`Escala: ${scaleKey.replace('_', ' ').toUpperCase()}`, 'info', 1500);
            });
        }

        const octaveSelect = document.getElementById('octave-select');
        if (octaveSelect) {
            octaveSelect.addEventListener('change', (e) => {
                const oct = parseInt(e.target.value, 10);
                this.modes.theremin?.setOctaves(oct, 2);
            });
        }

        const waveformSelect = document.getElementById('waveform-select');
        if (waveformSelect) {
            waveformSelect.addEventListener('change', (e) => {
                this.modes.theremin?.setWaveform(e.target.value);
            });
        }

        const toggleQuantize = document.getElementById('toggle-quantize');
        if (toggleQuantize) {
            toggleQuantize.addEventListener('change', (e) => {
                this.modes.theremin?.setQuantized(e.target.checked);
            });
        }

        const leadHandSelect = document.getElementById('lead-hand-select');
        if (leadHandSelect) {
            leadHandSelect.addEventListener('change', (e) => {
                this.modes.theremin?.setLeadHand(e.target.value);
                const label = e.target.value === 'left' ? 'Canhoto (Mão Esquerda)' : (e.target.value === 'right' ? 'Destro (Mão Direita)' : 'Automático');
                if (this.hud) this.hud.showToast(`Mão das notas: ${label}`, 'info', 1500);
            });
        }

        const btnToggleGrid = document.getElementById('btn-toggle-grid');
        if (btnToggleGrid) {
            btnToggleGrid.addEventListener('click', () => {
                const current = this.state.get('showGrid', true);
                this.state.set('showGrid', !current);
                if (this.hud) this.hud.showToast(`Grade musical ${!current ? 'visível' : 'oculta'}`, 'info', 1500);
            });
        }

        // Arcade Minigame Selector
        const arcadeSubmodeSelect = document.getElementById('arcade-submode-select');
        if (arcadeSubmodeSelect) {
            arcadeSubmodeSelect.addEventListener('change', (e) => {
                this.modes.arcade?.setSubMode(e.target.value);
                if (this.hud) this.hud.showToast(`Minijogo: ${e.target.value.toUpperCase()}`, 'info', 1500);
            });
        }

        // Debugger Toggles
        const toggleIndices = document.getElementById('toggle-indices');
        if (toggleIndices) {
            toggleIndices.addEventListener('change', (e) => {
                if (this.modes.debugger) this.modes.debugger.showLandmarkIndices = e.target.checked;
            });
        }

        const toggleAngles = document.getElementById('toggle-angles');
        if (toggleAngles) {
            toggleAngles.addEventListener('change', (e) => {
                if (this.modes.debugger) this.modes.debugger.showJointAngles = e.target.checked;
            });
        }

        const toggleDistances = document.getElementById('toggle-distances');
        if (toggleDistances) {
            toggleDistances.addEventListener('change', (e) => {
                if (this.modes.debugger) this.modes.debugger.showDistanceLines = e.target.checked;
            });
        }

        const toggleBbox = document.getElementById('toggle-bbox');
        if (toggleBbox) {
            toggleBbox.addEventListener('change', (e) => {
                if (this.modes.debugger) this.modes.debugger.showBoundingBox = e.target.checked;
            });
        }

        const smoothingSlider = document.getElementById('smoothing-slider');
        const smoothingVal = document.getElementById('smoothing-val');
        if (smoothingSlider) {
            smoothingSlider.addEventListener('input', (e) => {
                const alpha = parseInt(e.target.value, 10) / 100;
                this.tracker.setSmoothingAlpha(alpha);
                if (smoothingVal) smoothingVal.innerText = alpha.toFixed(2);
            });
        }

        // Master Volume Slider
        const volumeSlider = document.getElementById('volume-slider');
        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                const vol = parseInt(e.target.value, 10) / 100;
                this.synth.setMasterVolume(vol);
                this.previousVolume = vol;
            });
        }

        // Global Keyboard Shortcuts
        this.boundKeyHandler = (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;

            switch (e.code) {
                case 'Digit1':
                    this.switchMode('theremin');
                    break;
                case 'Digit2':
                    this.switchMode('arcade');
                    break;
                case 'Digit3':
                    this.switchMode('debugger');
                    break;
                case 'KeyC':
                    this.toggleCamera();
                    break;
                case 'KeyM':
                    this.toggleMute();
                    break;
                case 'KeyF':
                    this.toggleMirror();
                    break;
                case 'Space':
                    if (this.activeModeName === 'arcade' && this.modes.arcade) {
                        this.modes.arcade.resetGame();
                    }
                    break;
            }
        };

        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('keydown', this.boundKeyHandler);
        }
    }

    /**
     * Starts WebRTC video acquisition, unlocks Web Audio, and initializes MediaPipe Hands.
     * @returns {Promise<boolean>}
     */
    async startCamera() {
        try {
            if (this.hud) {
                this.hud.updateStatus('INICIALIZANDO...', false);
                this.hud.showToast('Conectando câmera e áudio espacial...', 'info', 2500);
            }

            // 1. Unlock AudioContext on user gesture
            await this.synth.unlock();

            // 2. Initialize WebRTC Camera Stream
            await this.camera.init(this.videoElement);

            // 3. Initialize MediaPipe Hand Tracker
            await this.tracker.init(this.videoElement, (results) => {
                this.onTrackingResults(results);
            });

            // 4. Hide splash overlay
            if (this.splashElement && this.splashElement.classList) {
                this.splashElement.classList.add('hidden');
            }

            // 5. Update UI Button States
            const btnCam = document.getElementById('btn-toggle-camera');
            if (btnCam && btnCam.classList) btnCam.classList.add('active');

            if (this.hud) {
                this.hud.updateStatus('RASTREAMENTO ATIVO', false);
                this.hud.showToast('Câmera conectada com sucesso!', 'success', 2500);
            }

            return true;
        } catch (err) {
            console.error('AetherVisionApp: Failed to start camera / hand tracker:', err);
            if (this.hud) {
                this.hud.updateStatus('ERRO NA CÂMERA', true);
                this.hud.showToast(`Erro na câmera: ${err.message || err}`, 'error', 4000);
            }
            return false;
        }
    }

    /**
     * Stops camera hardware stream and releases locks.
     */
    stopCamera() {
        this.camera.stop();
        this.synth.silence();

        if (this.splashElement && this.splashElement.classList) {
            this.splashElement.classList.remove('hidden');
        }

        const btnCam = document.getElementById('btn-toggle-camera');
        if (btnCam && btnCam.classList) btnCam.classList.remove('active');

        if (this.hud) {
            this.hud.updateStatus('CÂMERA DESLIGADA', false);
            this.hud.showToast('Câmera desconectada', 'info', 2000);
        }
    }

    /**
     * Toggles camera stream on / off.
     */
    toggleCamera() {
        if (this.camera.isStreamActive()) {
            this.stopCamera();
        } else {
            this.startCamera();
        }
    }

    /**
     * Toggles audio synthesis mute state.
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            this.synth.setMasterVolume(0.0);
            this.synth.silence();
        } else {
            this.synth.setMasterVolume(this.previousVolume || 0.7);
        }

        const btnMute = document.getElementById('btn-toggle-mute');
        if (btnMute) {
            if (this.isMuted) {
                btnMute.classList.add('btn-muted');
                btnMute.innerText = '🔇 Mudo';
            } else {
                btnMute.classList.remove('btn-muted');
                btnMute.innerText = '🔊 Áudio';
            }
        }

        if (this.hud) {
            this.hud.showToast(`Áudio ${this.isMuted ? 'mutado' : 'ativado'}`, this.isMuted ? 'warning' : 'info', 1500);
        }
    }

    /**
     * Updates mirror button visual active indicator and text in DOM.
     */
    updateMirrorUI() {
        if (typeof document === 'undefined') return;
        const btnMirror = document.getElementById('btn-toggle-mirror');
        if (btnMirror) {
            const isMirrored = this.camera ? this.camera.isMirrored : true;
            btnMirror.classList.toggle('active', isMirrored);
            btnMirror.innerText = isMirrored ? '🪞 Espelho (Ativo)' : '🪞 Espelho (Desat.)';
        }
    }

    /**
     * Toggles video horizontal mirror inversion.
     */
    toggleMirror() {
        const mirrored = this.camera.toggleMirror();
        if (this.tracker) {
            this.tracker.setMirrored(mirrored);
        }
        this.updateMirrorUI();
        if (this.state) {
            this.state.set('mirrored', mirrored);
        }
        if (this.hud) {
            this.hud.showToast(`Espelho ${mirrored ? 'Ativado' : 'Desativado'}`, 'info', 1500);
        }
    }

    /**
     * Switches the active interactive experience mode.
     * @param {'theremin'|'arcade'|'debugger'} modeName 
     */
    switchMode(modeName) {
        if (!this.modes[modeName]) return;

        // Deactivate previous mode
        if (this.modes[this.activeModeName]) {
            this.modes[this.activeModeName].deactivate();
        }

        this.activeModeName = modeName;
        this.modes[modeName].activate();

        // Update mode contextual side panels in DOM
        if (typeof document !== 'undefined') {
            const panels = document.querySelectorAll('.mode-panel');
            for (const panel of panels) {
                if (panel.id === `panel-${modeName}`) {
                    panel.classList.add('active');
                } else {
                    panel.classList.remove('active');
                }
            }
        }

        if (this.hud) {
            this.hud.setActiveMode(modeName);
        }
    }

    /**
     * MediaPipe results handler: dispatches landmarks to active mode and telemetry.
     * @param {Object} results - Processed tracking results from HandTracker
     */
    onTrackingResults(results) {
        this.lastTrackingResults = results;
        this.isProcessingInference = false;

        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (results?.timestamp) {
            this.latency = Math.max(1, now - results.timestamp);
        }

        const activeMode = this.modes[this.activeModeName];
        if (activeMode && activeMode.isActive) {
            activeMode.update(results, 0.016);
        }
    }

    /**
     * Starts continuous animation rendering loop.
     * @private
     */
    startLoop() {
        const loop = (timestamp) => {
            if (!this.isRunning) return;

            const now = timestamp || (typeof performance !== 'undefined' ? performance.now() : Date.now());
            const dt = this.lastFrameTime > 0 ? Math.max(0.001, (now - this.lastFrameTime) / 1000) : 0.016;
            this.lastFrameTime = now;

            if (dt > 0) {
                const instantFps = 1 / dt;
                this.fps = this.fps * 0.9 + instantFps * 0.1;
            }

            // Send video frame for inference if camera active and pipeline ready
            if (this.camera.isStreamActive() && !this.isProcessingInference && this.tracker.isInitialized) {
                this.isProcessingInference = true;
                this.tracker.sendFrame(this.camera.getVideoElement()).catch(() => {
                    this.isProcessingInference = false;
                });
            }

            // Render current frame
            this.renderFrame(dt);

            // Update HUD telemetry
            if (this.hud) {
                this.hud.updateTelemetry({
                    fps: this.fps,
                    latency: this.latency,
                    handsCount: this.lastTrackingResults?.hands?.length || 0,
                    leftGesture: this.lastTrackingResults?.hands?.find(h => h.handedness === 'Left')?.gesture?.name || 'NONE',
                    rightGesture: this.lastTrackingResults?.hands?.find(h => h.handedness === 'Right')?.gesture?.name || 'NONE',
                    activeMode: this.activeModeName
                });
            }

            if (typeof window !== 'undefined' && window.requestAnimationFrame) {
                this.animationFrameId = window.requestAnimationFrame(loop);
            }
        };

        if (typeof window !== 'undefined' && window.requestAnimationFrame) {
            this.animationFrameId = window.requestAnimationFrame(loop);
        }
    }

    /**
     * Renders video feed, active mode graphics, and particles to the canvas.
     * @param {number} [dt=0.016] 
     */
    renderFrame(dt = 0.016) {
        if (!this.renderer) return;

        // Clear canvas
        this.renderer.clear('#000000');

        // Draw camera video feed if active
        if (this.camera.isStreamActive()) {
            this.renderer.drawVideo(this.camera.getVideoElement(), {
                mirrored: this.camera.isMirrored,
                opacity: 0.92
            });
        }

        // Render active mode overlays
        const activeMode = this.modes[this.activeModeName];
        if (activeMode && activeMode.isActive) {
            activeMode.render(this.renderer);
        }
    }

    /**
     * Handles canvas resizing.
     * @private
     */
    handleResize() {
        if (this.canvasElement && this.renderer) {
            const rect = this.canvasElement.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                this.renderer.resize(this.canvasElement.width, this.canvasElement.height);
            }
        }
    }

    /**
     * Cleans up all running loops, hardware streams, audio graphs, and listeners.
     */
    destroy() {
        this.isRunning = false;
        if (this.animationFrameId && typeof window !== 'undefined') {
            window.cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        this.stopCamera();

        for (const mode of Object.values(this.modes)) {
            if (mode && typeof mode.destroy === 'function') {
                mode.destroy();
            }
        }

        if (this.synth && typeof this.synth.destroy === 'function') {
            this.synth.destroy();
        }

        if (this.tracker && typeof this.tracker.destroy === 'function') {
            this.tracker.destroy();
        }

        if (this.hud && typeof this.hud.destroy === 'function') {
            this.hud.destroy();
        }

        if (this.boundKeyHandler && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('keydown', this.boundKeyHandler);
            this.boundKeyHandler = null;
        }
    }
}

// Auto-instantiate and initialize app reliably across DOM ready states
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const startApp = () => {
        if (window.aetherApp) return;
        const app = new AetherVisionApp();
        app.init().then(() => {
            window.aetherApp = app;
        }).catch(err => {
            console.error('Failed to initialize AetherVisionApp:', err);
        });
    };

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', startApp);
    } else {
        startApp();
    }
}
