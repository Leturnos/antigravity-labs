/**
 * Aether Motion Lab — Main Entry Point
 * Orchestrates Canvas Viewport, Particle Loop, Vector Fields, Recorder & Presets
 */

import { ParticleSystem } from './engine/particle-system.js';
import { VectorFields, MouseBrush } from './engine/vector-fields.js';
import { ExportRecorder } from './engine/recorder.js';
import { ControlsManager } from './ui/controls.js';
import { PresetManager } from './ui/preset-manager.js';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('motion-canvas');
  const ctx = canvas.getContext('2d');

  // Engines
  const particleEngine = new ParticleSystem(50000);
  const vectorFields = new VectorFields();
  const mouseBrush = new MouseBrush(canvas);
  const recorder = new ExportRecorder(canvas);
  const presetManager = new PresetManager();
  const uiControls = new ControlsManager();

  uiControls.init();

  // Sync MouseBrush params from UI
  function syncMouseBrush() {
    mouseBrush.mode = uiControls.params.brushMode;
    mouseBrush.radius = uiControls.params.brushRadius;
    mouseBrush.force = uiControls.params.brushForce;
  }
  syncMouseBrush();

  // Viewport & DPI Scaling
  let width = 0;
  let height = 0;
  let dpr = window.devicePixelRatio || 1;

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);
    particleEngine.init(uiControls.params.particleCount, width, height);
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Parameter Change Listener
  uiControls.onChange((key, value, params) => {
    if (key === 'particleCount') {
      particleEngine.setCount(value, width, height);
      const countEl = document.getElementById('particle-counter');
      if (countEl) countEl.textContent = value.toLocaleString('pt-BR');
    }
    syncMouseBrush();
  });

  // Tab Switching Logic
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabButtons.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const activeContent = document.getElementById(targetTab);
      if (activeContent) {
        activeContent.classList.add('active');
      }
    });
  });

  // Preset Card Clicks
  const presetCards = document.querySelectorAll('.preset-card');
  presetCards.forEach((card) => {
    card.addEventListener('click', () => {
      presetCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      const presetKey = card.getAttribute('data-preset');
      presetManager.applyPreset(presetKey, uiControls, particleEngine, width, height);
      syncMouseBrush();
    });
  });

  // Export Buttons
  const btnExportPng = document.getElementById('btn-export-png');
  const btnRecordVideo = document.getElementById('btn-record-video');
  const btnExportPreset = document.getElementById('btn-export-preset');
  const btnImportPreset = document.getElementById('btn-import-preset');
  const inputPresetFile = document.getElementById('input-preset-file');

  if (btnExportPng) {
    btnExportPng.addEventListener('click', () => {
      recorder.exportSnapshot4K(width, height, uiControls.params.bgColor);
    });
  }

  if (btnRecordVideo) {
    btnRecordVideo.addEventListener('click', () => {
      const originalText = btnRecordVideo.textContent;
      btnRecordVideo.disabled = true;

      recorder.recordWebM(
        5,
        () => {
          btnRecordVideo.textContent = '🔴 Gravando... (5s)';
        },
        (elapsed, total) => {
          btnRecordVideo.textContent = `🔴 Gravando... (${total - elapsed}s)`;
        },
        () => {
          btnRecordVideo.textContent = originalText;
          btnRecordVideo.disabled = false;
        }
      );
    });
  }

  if (btnExportPreset) {
    btnExportPreset.addEventListener('click', () => {
      presetManager.exportPresetJSON(uiControls.params);
    });
  }

  if (btnImportPreset && inputPresetFile) {
    btnImportPreset.addEventListener('click', () => inputPresetFile.click());
    inputPresetFile.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        presetManager.importPresetJSON(e.target.files[0], (importedParams) => {
          Object.assign(uiControls.params, importedParams);
          uiControls.syncDomFromParams();
          particleEngine.setCount(uiControls.params.particleCount, width, height);
          particleEngine.clear(width, height, uiControls.params.bgColor);
          syncMouseBrush();
        });
      }
    });
  }

  // UI Deck Toggle & Action Buttons
  const btnToggleUi = document.getElementById('btn-toggle-ui');
  const uiLayer = document.getElementById('ui-layer');
  const controlDeck = document.getElementById('control-deck');
  const btnCollapseDeck = document.getElementById('btn-collapse-deck');
  const btnPause = document.getElementById('btn-pause');
  const btnClear = document.getElementById('btn-clear');
  const btnRandomize = document.getElementById('btn-randomize');

  function toggleZenMode() {
    uiLayer.classList.toggle('hidden');
  }

  function toggleDeck() {
    controlDeck.classList.toggle('collapsed');
  }

  function togglePause() {
    particleEngine.isPaused = !particleEngine.isPaused;
    if (btnPause) {
      btnPause.querySelector('.icon').textContent = particleEngine.isPaused ? '▶️' : '⏸️';
    }
  }

  function clearCanvas() {
    particleEngine.clear(width, height, uiControls.params.bgColor);
  }

  if (btnToggleUi) btnToggleUi.addEventListener('click', toggleZenMode);
  if (btnCollapseDeck) btnCollapseDeck.addEventListener('click', toggleDeck);
  if (btnPause) btnPause.addEventListener('click', togglePause);
  if (btnClear) btnClear.addEventListener('click', clearCanvas);
  if (btnRandomize) {
    btnRandomize.addEventListener('click', () => {
      uiControls.randomize();
      syncMouseBrush();
    });
  }

  // Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.key === 'h' || e.key === 'H') {
      toggleZenMode();
    } else if (e.code === 'Space') {
      e.preventDefault();
      togglePause();
    } else if (e.key === 'c' || e.key === 'C' || e.key === 'Delete') {
      clearCanvas();
    } else if (e.key === 'r' || e.key === 'R') {
      uiControls.randomize();
      syncMouseBrush();
    }
  });

  // Render Loop
  let fpsCount = 0;
  let lastTime = performance.now();
  const fpsElement = document.getElementById('fps-counter');

  function loop(currentTime) {
    const delta = currentTime - lastTime;
    if (delta >= 1000) {
      if (fpsElement) fpsElement.textContent = Math.round((fpsCount * 1000) / delta);
      fpsCount = 0;
      lastTime = currentTime;
    }
    fpsCount++;

    // Update & Render Particle System with Vector Fields and Mouse Brush
    particleEngine.update(width, height, uiControls.params, vectorFields, mouseBrush);
    particleEngine.render(ctx, width, height, uiControls.params);

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
});
