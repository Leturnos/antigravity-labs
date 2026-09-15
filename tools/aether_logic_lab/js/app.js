/**
 * Aether Logic Lab - Main Application Controller & Event Orchestrator
 */

import { ToolMode, ComponentType, SignalState } from './types.js';
import { COMPONENT_DEFINITIONS } from './components.js';
import { Circuit } from './circuit.js';
import { Simulator } from './simulator.js';
import { Renderer } from './renderer.js';
import { WaveformAnalyzer } from './waveform.js';
import { SoundEngine } from './sound.js';
import { PRESETS } from './presets.js';

class LogicLabApp {
  constructor() {
    this.canvas = document.getElementById('circuit-canvas');
    this.waveformCanvas = document.getElementById('waveform-canvas');

    this.sound = new SoundEngine();
    this.circuit = new Circuit();
    this.simulator = new Simulator(this.circuit, (buzzerActive, freq) => {
      this.sound.setBuzzerState(buzzerActive, freq);
    });
    this.renderer = new Renderer(this.canvas, this.circuit, this.simulator);
    this.waveformAnalyzer = new WaveformAnalyzer(this.waveformCanvas, this.circuit, this.simulator);

    this.mode = ToolMode.SELECT;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.draggedComponent = null;
    this.dragOffset = { x: 0, y: 0 };
    this.isDraggingSelected = false;
    this.isSpacePressed = false;
    this.clipboard = null;

    // FPS calculation
    this.fps = 60;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;

    this.initUI();
    this.bindEvents();
    this.bindKeyboard();

    // Load initial preset
    this.loadPreset('basic_gates');

    // Start loop
    window.addEventListener('resize', () => this.handleResize());
    this.handleResize();
    requestAnimationFrame((t) => this.loop(t));
  }

  handleResize() {
    this.renderer.resize();
    this.waveformAnalyzer.resize();
  }

  loop(now) {
    // FPS tracking
    this.frameCount++;
    if (now - this.lastFrameTime >= 1000) {
      this.fps = (this.frameCount * 1000) / (now - this.lastFrameTime);
      this.frameCount = 0;
      this.lastFrameTime = now;
      const fpsEl = document.getElementById('fps-val');
      if (fpsEl) fpsEl.textContent = this.fps.toFixed(1);
    }

    // Step simulation
    this.simulator.update(now);

    // Render Canvas
    this.renderer.render(now);

    // Render Waveforms if drawer is active
    const drawer = document.getElementById('waveform-drawer');
    if (drawer && !drawer.classList.contains('collapsed')) {
      this.waveformAnalyzer.render();
    }

    // Update status bar indicators
    const oscPill = document.getElementById('osc-pill');
    if (oscPill) {
      oscPill.style.display = this.simulator.isOscillating ? 'inline-flex' : 'none';
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  initUI() {
    // Play / Pause Button
    const btnPlay = document.getElementById('btn-play');
    btnPlay?.addEventListener('click', () => {
      const isRunning = this.simulator.toggle();
      const icon = isRunning ? '⏸' : '▶';
      const text = isRunning ? 'Pausar' : 'Iniciar';
      btnPlay.innerHTML = `<span class="btn-icon">${icon}</span> <span class="btn-text">${text}</span>`;
      btnPlay.classList.toggle('active', isRunning);
    });

    // Step Button
    const btnStep = document.getElementById('btn-step');
    btnStep?.addEventListener('click', () => {
      this.simulator.pause();
      if (btnPlay) {
        btnPlay.innerHTML = `<span class="btn-icon">▶</span> <span class="btn-text">Iniciar</span>`;
        btnPlay.classList.remove('active');
      }
      this.simulator.stepOnce();
      this.sound.playClick(true);
    });

    // Clock Frequency Select
    const freqSelect = document.getElementById('clock-freq-select');
    freqSelect?.addEventListener('change', (e) => {
      const freq = parseFloat(e.target.value);
      for (const comp of this.circuit.components.values()) {
        if (comp.type === 'CLOCK') {
          comp.props.freq = freq;
        }
      }
    });

    // Sound Toggle
    const btnSound = document.getElementById('btn-sound');
    btnSound?.addEventListener('click', () => {
      const isMuted = this.sound.toggleMute();
      const icon = isMuted ? '🔇' : '🔊';
      const text = isMuted ? 'Mudo' : 'Áudio';
      btnSound.innerHTML = `<span class="btn-icon">${icon}</span> <span class="btn-text">${text}</span>`;
      btnSound.classList.toggle('muted', isMuted);
    });

    // Waveform Drawer Toggle (Centralized on drawer header and toggle button)
    const drawer = document.getElementById('waveform-drawer');
    const btnToggleDrawer = document.getElementById('btn-toggle-drawer');
    const drawerHeader = document.getElementById('drawer-header');

    const updateDrawerButton = (isCollapsed) => {
      if (btnToggleDrawer) {
        btnToggleDrawer.innerHTML = isCollapsed ? '▲ Expandir' : '▼ Recolher';
        btnToggleDrawer.title = isCollapsed ? 'Expandir Analisador Lógico' : 'Recolher Analisador Lógico';
        btnToggleDrawer.classList.toggle('primary', isCollapsed);
      }
    };

    const toggleDrawer = (forceState = null) => {
      if (!drawer) return;
      const willCollapse = forceState !== null ? forceState : !drawer.classList.contains('collapsed');
      drawer.classList.toggle('collapsed', willCollapse);
      updateDrawerButton(willCollapse);
      if (!willCollapse) {
        this.handleResize();
      }
    };

    btnToggleDrawer?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDrawer();
    });

    drawerHeader?.addEventListener('click', (e) => {
      if (e.target.closest('#btn-clear-waves') || e.target.closest('#btn-toggle-drawer')) return;
      toggleDrawer();
    });

    if (drawer) {
      updateDrawerButton(drawer.classList.contains('collapsed'));
    }

    // Clear Waveforms Button
    const btnClearWaves = document.getElementById('btn-clear-waves');
    btnClearWaves?.addEventListener('click', () => {
      this.simulator.clearWaveforms();
    });

    // Presets Modal
    this.initPresetsUI();

    // Export / Import
    this.initExportImportUI();

    // Clear Canvas Button
    const btnClear = document.getElementById('btn-clear-canvas');
    btnClear?.addEventListener('click', async () => {
      const confirmed = await this.showConfirmDialog({
        title: 'Limpar Bancada',
        message: 'Deseja realmente limpar todo o circuito atual? Todos os componentes e fios serão removidos.',
        icon: '🗑',
        confirmText: 'Limpar Tudo',
        cancelText: 'Cancelar',
        isDanger: true
      });
      if (confirmed) {
        this.circuit.clear();
        this.simulator.clearWaveforms();
        this.sound.playClick(false);
      }
    });

    // Center View Button
    const btnCenter = document.getElementById('btn-center-view');
    btnCenter?.addEventListener('click', () => {
      this.renderer.panX = 100;
      this.renderer.panY = 100;
      this.renderer.zoom = 1.0;
    });
  }

  initPresetsUI() {
    const modal = document.getElementById('presets-modal');
    const btnOpen = document.getElementById('btn-presets');
    const btnClose = document.getElementById('btn-close-presets');
    const list = document.getElementById('presets-list');

    btnOpen?.addEventListener('click', () => {
      modal?.classList.remove('hidden');
    });

    btnClose?.addEventListener('click', () => {
      modal?.classList.add('hidden');
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });

    if (list) {
      list.innerHTML = '';
      PRESETS.forEach(preset => {
        const item = document.createElement('div');
        item.className = 'preset-card';
        item.innerHTML = `
          <div class="preset-header">
            <h4>${preset.name}</h4>
          </div>
          <p class="preset-desc">${preset.description}</p>
          <button class="btn-load-preset" data-id="${preset.id}">Carregar Esquema</button>
        `;
        item.querySelector('.btn-load-preset').addEventListener('click', () => {
          this.loadPreset(preset.id);
          modal?.classList.add('hidden');
        });
        list.appendChild(item);
      });
    }
  }

  loadPreset(presetId) {
    const p = PRESETS.find(pr => pr.id === presetId);
    if (!p) return;
    this.circuit.deserialize(p.data);
    this.simulator.clearWaveforms();
    this.renderer.panX = 80;
    this.renderer.panY = 80;
    this.renderer.zoom = 1.0;
  }

  showConfirmDialog({ title, message, icon = '⚠️', confirmText = 'Confirmar', cancelText = 'Cancelar', isDanger = false }) {
    return new Promise((resolve) => {
      const modal = document.getElementById('dialog-modal');
      const iconEl = document.getElementById('dialog-icon');
      const titleEl = document.getElementById('dialog-title');
      const msgEl = document.getElementById('dialog-message');
      const btnCancel = document.getElementById('dialog-btn-cancel');
      const btnConfirm = document.getElementById('dialog-btn-confirm');

      if (!modal) {
        resolve(true);
        return;
      }

      if (iconEl) iconEl.textContent = icon;
      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;

      if (btnCancel) {
        btnCancel.style.display = 'inline-flex';
        btnCancel.textContent = cancelText;
      }
      if (btnConfirm) {
        btnConfirm.textContent = confirmText;
        btnConfirm.className = isDanger ? 'pill-btn danger' : 'pill-btn primary';
      }

      modal.classList.remove('hidden');

      const cleanup = (result) => {
        modal.classList.add('hidden');
        btnCancel?.removeEventListener('click', onCancel);
        btnConfirm?.removeEventListener('click', onConfirm);
        modal.removeEventListener('click', onBackdrop);
        resolve(result);
      };

      const onCancel = () => cleanup(false);
      const onConfirm = () => cleanup(true);
      const onBackdrop = (e) => {
        if (e.target === modal) cleanup(false);
      };

      btnCancel?.addEventListener('click', onCancel);
      btnConfirm?.addEventListener('click', onConfirm);
      modal.addEventListener('click', onBackdrop);
    });
  }

  showAlertDialog({ title, message, icon = 'ℹ️', confirmText = 'OK' }) {
    return new Promise((resolve) => {
      const modal = document.getElementById('dialog-modal');
      const iconEl = document.getElementById('dialog-icon');
      const titleEl = document.getElementById('dialog-title');
      const msgEl = document.getElementById('dialog-message');
      const btnCancel = document.getElementById('dialog-btn-cancel');
      const btnConfirm = document.getElementById('dialog-btn-confirm');

      if (!modal) {
        resolve();
        return;
      }

      if (iconEl) iconEl.textContent = icon;
      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message;

      if (btnCancel) {
        btnCancel.style.display = 'none';
      }
      if (btnConfirm) {
        btnConfirm.textContent = confirmText;
        btnConfirm.className = 'pill-btn primary';
      }

      modal.classList.remove('hidden');

      const cleanup = () => {
        modal.classList.add('hidden');
        btnConfirm?.removeEventListener('click', onConfirm);
        modal.removeEventListener('click', onBackdrop);
        resolve();
      };

      const onConfirm = () => cleanup();
      const onBackdrop = (e) => {
        if (e.target === modal) cleanup();
      };

      btnConfirm?.addEventListener('click', onConfirm);
      modal.addEventListener('click', onBackdrop);
    });
  }

  initExportImportUI() {
    const btnExportJson = document.getElementById('btn-export-json');
    btnExportJson?.addEventListener('click', () => {
      const data = this.circuit.serialize();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aether-logic-circuit-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const btnExportPng = document.getElementById('btn-export-png');
    btnExportPng?.addEventListener('click', () => {
      const url = this.canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `aether-logic-schematic-${Date.now()}.png`;
      a.click();
    });

    const fileInput = document.getElementById('import-file-input');
    const btnImport = document.getElementById('btn-import-json');
    btnImport?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const json = JSON.parse(evt.target.result);
          this.circuit.deserialize(json);
          this.simulator.clearWaveforms();
          await this.showAlertDialog({
            title: 'Circuito Importado',
            message: 'O esquema foi importado e carregado com sucesso no Logic Lab!',
            icon: '✅',
            confirmText: 'Continuar'
          });
        } catch (err) {
          await this.showAlertDialog({
            title: 'Erro ao Importar',
            message: 'Não foi possível ler o arquivo JSON selecionado. O formato é inválido ou incompatível.',
            icon: '❌',
            confirmText: 'Entendido'
          });
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
  }

  bindEvents() {
    const canvas = this.canvas;

    // Palette item dragging or clicking to spawn
    document.querySelectorAll('.palette-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        const type = item.getAttribute('data-type');
        e.dataTransfer.setData('text/plain', type);
      });

      // Quick click to spawn at center
      item.addEventListener('click', () => {
        const type = item.getAttribute('data-type');
        const wx = (-this.renderer.panX + this.renderer.width / 2) / this.renderer.zoom;
        const wy = (-this.renderer.panY + this.renderer.height / 2) / this.renderer.zoom;
        const comp = this.circuit.addComponent(type, wx - 30, wy - 20);
        if (comp) {
          this.circuit.selectedComponentIds.clear();
          this.circuit.selectedComponentIds.add(comp.id);
          this.sound.playClick(true);
        }
      });
    });

    canvas.addEventListener('dragover', (e) => e.preventDefault());
    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      const type = e.dataTransfer.getData('text/plain');
      if (!type) return;
      const rect = canvas.getBoundingClientRect();
      const pos = this.renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const comp = this.circuit.addComponent(type, pos.x - 30, pos.y - 20);
      if (comp) {
        this.circuit.selectedComponentIds.clear();
        this.circuit.selectedComponentIds.add(comp.id);
        this.sound.playClick(true);
      }
    });

    // Mouse Down
    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.renderer.screenToWorld(sx, sy);

      // Pan with Middle Click or Space + Left Click
      if (e.button === 1 || (e.button === 0 && this.isSpacePressed)) {
        this.isPanning = true;
        this.panStart = { x: sx - this.renderer.panX, y: sy - this.renderer.panY };
        canvas.style.cursor = 'grabbing';
        return;
      }

      // Left click
      if (e.button === 0) {
        // 1. Check if clicking a pin
        const pin = this.circuit.findPinAt(world.x, world.y, 14 / this.renderer.zoom);
        if (pin) {
          this.renderer.activeWireStart = pin;
          return;
        }

        // 2. Check if clicking a component
        const comp = this.circuit.findComponentAt(world.x, world.y);
        if (comp) {
          // Interactive elements click: Toggle switch or push button or hex
          if (comp.type === ComponentType.SWITCH) {
            comp.props.state = comp.props.state === 1 ? 0 : 1;
            this.sound.playClick(comp.props.state === 1);
            this.circuit.saveHistoryState();
            return;
          } else if (comp.type === ComponentType.PUSH_BUTTON) {
            comp.props.pressed = true;
            this.sound.playClick(true);
            this.draggedComponent = comp; // for mouse up release
            return;
          } else if (comp.type === ComponentType.HEX_INPUT) {
            comp.props.value = (comp.props.value + 1) & 0xF;
            this.sound.playClick(true);
            this.circuit.saveHistoryState();
            return;
          }

          // Select component
          if (!e.shiftKey && !this.circuit.selectedComponentIds.has(comp.id)) {
            this.circuit.selectedComponentIds.clear();
            this.circuit.selectedWireIds.clear();
          }
          this.circuit.selectedComponentIds.add(comp.id);

          this.isDraggingSelected = true;
          this.dragStartWorld = { x: world.x, y: world.y };
          this.initialCompPositions = new Map();
          for (const id of this.circuit.selectedComponentIds) {
            const c = this.circuit.components.get(id);
            if (c) this.initialCompPositions.set(id, { x: c.x, y: c.y });
          }
          return;
        }

        // 3. Check if clicking a wire
        const wire = this.circuit.findWireAt(world.x, world.y, 8 / this.renderer.zoom);
        if (wire) {
          if (!e.shiftKey) {
            this.circuit.selectedComponentIds.clear();
            this.circuit.selectedWireIds.clear();
          }
          this.circuit.selectedWireIds.add(wire.id);
          return;
        }

        // 4. Clicked on empty space -> start selection box
        if (!e.shiftKey) {
          this.circuit.selectedComponentIds.clear();
          this.circuit.selectedWireIds.clear();
        }
        this.renderer.selectionBox = { x1: world.x, y1: world.y, x2: world.x, y2: world.y };
      }
    });

    // Mouse Move
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.renderer.screenToWorld(sx, sy);
      this.renderer.currentMouseWorld = world;

      // Handle Pan
      if (this.isPanning) {
        this.renderer.panX = sx - this.panStart.x;
        this.renderer.panY = sy - this.panStart.y;
        return;
      }

      // Handle Dragging Components
      if (this.isDraggingSelected) {
        const dx = world.x - this.dragStartWorld.x;
        const dy = world.y - this.dragStartWorld.y;

        for (const [id, initPos] of this.initialCompPositions.entries()) {
          const comp = this.circuit.components.get(id);
          if (comp) {
            comp.x = Math.round((initPos.x + dx) / 10) * 10;
            comp.y = Math.round((initPos.y + dy) / 10) * 10;
          }
        }
        return;
      }

      // Handle Selection Box
      if (this.renderer.selectionBox) {
        this.renderer.selectionBox.x2 = world.x;
        this.renderer.selectionBox.y2 = world.y;
        return;
      }

      // Update hover state for pins
      const pin = this.circuit.findPinAt(world.x, world.y, 14 / this.renderer.zoom);
      this.renderer.hoveredPin = pin;
      canvas.style.cursor = pin ? 'crosshair' : (this.isSpacePressed ? 'grab' : 'default');
    });

    // Mouse Up
    window.addEventListener('mouseup', (e) => {
      if (this.isPanning) {
        this.isPanning = false;
        canvas.style.cursor = this.isSpacePressed ? 'grab' : 'default';
      }

      // Release push buttons
      for (const comp of this.circuit.components.values()) {
        if (comp.type === ComponentType.PUSH_BUTTON && comp.props.pressed) {
          comp.props.pressed = false;
          this.sound.playClick(false);
        }
      }

      if (this.isDraggingSelected) {
        this.isDraggingSelected = false;
        this.circuit.saveHistoryState();
      }

      // Finalize Wire connection
      if (this.renderer.activeWireStart) {
        const startPin = this.renderer.activeWireStart;
        const endPin = this.renderer.hoveredPin;

        if (endPin && (startPin.compId !== endPin.compId || startPin.pinId !== endPin.pinId)) {
          const wire = this.circuit.addWire(startPin.compId, startPin.pinId, endPin.compId, endPin.pinId);
          if (wire) {
            this.sound.playClick(true);
          }
        }
        this.renderer.activeWireStart = null;
      }

      // Finalize Selection Box
      if (this.renderer.selectionBox) {
        const sb = this.renderer.selectionBox;
        const x1 = Math.min(sb.x1, sb.x2);
        const x2 = Math.max(sb.x1, sb.x2);
        const y1 = Math.min(sb.y1, sb.y2);
        const y2 = Math.max(sb.y1, sb.y2);

        for (const comp of this.circuit.components.values()) {
          if (comp.x + comp.width >= x1 && comp.x <= x2 &&
              comp.y + comp.height >= y1 && comp.y <= y2) {
            this.circuit.selectedComponentIds.add(comp.id);
          }
        }
        this.renderer.selectionBox = null;
      }
    });

    // Zoom on Wheel
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const newZoom = Math.max(this.renderer.minZoom, Math.min(this.renderer.maxZoom, this.renderer.zoom * zoomFactor));

      // Zoom centered at mouse position
      this.renderer.panX = sx - (sx - this.renderer.panX) * (newZoom / this.renderer.zoom);
      this.renderer.panY = sy - (sy - this.renderer.panY) * (newZoom / this.renderer.zoom);
      this.renderer.zoom = newZoom;
    }, { passive: false });

    // Right Click Context Menu for Probing / Removing
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const world = this.renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

      const pin = this.circuit.findPinAt(world.x, world.y, 14 / this.renderer.zoom);
      if (pin) {
        const added = this.circuit.toggleProbe(pin.compId, pin.pinId);
        this.sound.playClick(added);
        return;
      }

      const wire = this.circuit.findWireAt(world.x, world.y, 8 / this.renderer.zoom);
      if (wire) {
        this.circuit.removeWire(wire.id);
        this.sound.playClick(false);
        return;
      }

      const comp = this.circuit.findComponentAt(world.x, world.y);
      if (comp) {
        this.circuit.removeComponent(comp.id);
        this.sound.playClick(false);
      }
    });
  }

  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Space for Pan
      if (e.code === 'Space' && !this.isSpacePressed && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        this.isSpacePressed = true;
        this.canvas.style.cursor = 'grab';
      }

      // Delete / Backspace
      if (e.code === 'Delete' || e.code === 'Backspace') {
        if (e.target.tagName === 'INPUT') return;
        let removed = false;
        for (const id of this.circuit.selectedComponentIds) {
          if (this.circuit.removeComponent(id)) removed = true;
        }
        for (const id of this.circuit.selectedWireIds) {
          if (this.circuit.removeWire(id)) removed = true;
        }
        if (removed) {
          this.sound.playClick(false);
        }
      }

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          this.circuit.redo();
        } else {
          this.circuit.undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.circuit.redo();
      }

      // Select All
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        if (e.target.tagName !== 'INPUT') {
          e.preventDefault();
          for (const id of this.circuit.components.keys()) {
            this.circuit.selectedComponentIds.add(id);
          }
        }
      }

      // Escape to cancel wire or deselect
      if (e.code === 'Escape') {
        this.renderer.activeWireStart = null;
        this.circuit.selectedComponentIds.clear();
        this.circuit.selectedWireIds.clear();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.isSpacePressed = false;
        this.canvas.style.cursor = 'default';
      }
    });
  }
}

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new LogicLabApp();
});
