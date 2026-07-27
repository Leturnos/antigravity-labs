/**
 * Aether Neural Canvas - Main Application Entrypoint
 * Boots modules and binds application event listeners.
 */

import { initDOMElements, elements } from "./ui.js";
import {
  initCanvas,
  clearCanvas,
  undoLastStroke,
  redoLastStroke,
  exportCanvasImage,
  startDrawing,
  draw,
  stopDrawing
} from "./canvas.js";
import { loadAIModel, runInference, getIsLocalSource } from "./model.js";
import {
  startSandboxMode,
  startChallengeMode,
  checkChallengeProgress,
  handleModalAction,
  handleModalClose,
  exitToMenu
} from "./game.js";

function triggerInference() {
  runInference((results) => {
    checkChallengeProgress(results);
  });
}

function setupEventListeners() {
  // Mode Selection Cards
  document.getElementById("sandbox-card").addEventListener("click", () => startSandboxMode());
  document.getElementById("time-attack-card").addEventListener("click", () => startChallengeMode());
  
  // Toggle Model Source Button
  elements.btnToggleModelSource.addEventListener("click", () => {
    const newSource = getIsLocalSource() ? "cdn" : "local";
    loadAIModel(newSource);
  });

  // Toolbar Game Actions
  document.getElementById("exit-btn").addEventListener("click", () => exitToMenu());
  document.getElementById("clear-btn").addEventListener("click", () => {
    clearCanvas();
    triggerInference();
  });
  document.getElementById("undo-btn").addEventListener("click", undoLastStroke);
  document.getElementById("redo-btn").addEventListener("click", redoLastStroke);
  document.getElementById("export-btn").addEventListener("click", exportCanvasImage);
  
  // Modal Buttons
  elements.modalActionBtn.addEventListener("click", handleModalAction);
  elements.modalCloseBtn.addEventListener("click", handleModalClose);

  // Mouse Canvas Drawing Listeners
  const canvasEl = document.getElementById("canvas");
  canvasEl.addEventListener("mousedown", startDrawing);
  canvasEl.addEventListener("mousemove", draw);
  window.addEventListener("mouseup", stopDrawing);

  // Touch Canvas Drawing Listeners
  canvasEl.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (e.touches.length === 1) startDrawing(e.touches[0]);
  }, { passive: false });

  canvasEl.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (e.touches.length === 1) draw(e.touches[0]);
  }, { passive: false });

  window.addEventListener("touchend", stopDrawing);
}

// Initialize Application on DOM Ready
window.addEventListener("DOMContentLoaded", () => {
  initDOMElements();
  initCanvas(triggerInference);
  setupEventListeners();
  loadAIModel();
});
