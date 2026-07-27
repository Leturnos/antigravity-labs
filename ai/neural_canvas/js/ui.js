/**
 * Aether Neural Canvas - UI & DOM Management Module
 */

import { CLASS_TRANSLATIONS } from "./dataset.js";

// DOM References Cache
export const elements = {};
let predictionElements = [];

export function initDOMElements() {
  elements.menuScreen = document.getElementById("menu-screen");
  elements.gameScreen = document.getElementById("game-screen");
  elements.modalOverlay = document.getElementById("modal-overlay");
  elements.modalIcon = document.getElementById("modal-icon");
  elements.modalTitle = document.getElementById("modal-title");
  elements.modalBody = document.getElementById("modal-body");
  elements.modalStats = document.getElementById("modal-stats");
  elements.modalStatScore = document.getElementById("modal-stat-score");
  elements.modalStatRounds = document.getElementById("modal-stat-rounds");
  elements.modalActionBtn = document.getElementById("modal-action-btn");
  elements.modalCloseBtn = document.getElementById("modal-close-btn");

  elements.hudTargetWord = document.getElementById("hud-target-word");
  elements.timerCircle = document.getElementById("timer-circle");
  elements.hudTimerText = document.getElementById("hud-timer-text");
  elements.hudScoreValue = document.getElementById("hud-score-value");
  elements.modelStatusDisplay = document.getElementById("model-status");
  elements.canvasWrapper = document.getElementById("canvas-wrapper");

  elements.sandboxGuide = document.getElementById("sandbox-guide");
  elements.timeAttackGuide = document.getElementById("time-attack-guide");
  elements.gameHud = document.getElementById("game-hud");
  elements.toastElement = document.getElementById("aether-toast");
  elements.toastMessage = document.getElementById("toast-message");
  elements.modeSelectors = document.querySelector(".mode-selectors");
  elements.loadingOverlay = document.getElementById("loading-overlay");
  elements.btnToggleModelSource = document.getElementById("btn-toggle-model-source");
  elements.debugCanvas = document.getElementById("debug-preview-canvas");

  // Cache guess rows DOM nodes once
  predictionElements = [];
  for (let i = 0; i < 5; i++) {
    const el = document.getElementById(`prediction-${i}`);
    if (el) {
      predictionElements.push({
        labelSpan: el.querySelector(".guess-label"),
        valueSpan: el.querySelector(".guess-value"),
        barElement: el.querySelector(".guess-bar")
      });
    }
  }
}

// Update Top 5 UI Guesses in Portuguese using cached DOM structures
export function updateGuessesUI(results) {
  for (let i = 0; i < 5; i++) {
    const item = results[i];
    const confidencePct = Math.round(item.confidence * 100);
    const cachedRow = predictionElements[i];
    
    if (cachedRow) {
      const ptLabel = CLASS_TRANSLATIONS[item.label] || item.label;
      if (cachedRow.labelSpan) cachedRow.labelSpan.innerText = ptLabel.toUpperCase();
      if (cachedRow.valueSpan) cachedRow.valueSpan.innerText = `${confidencePct}%`;
      if (cachedRow.barElement) cachedRow.barElement.style.width = `${confidencePct}%`;
    }
  }
}

// Reset guess lists to baseline in Portuguese using cached DOM structures
export function resetGuessesUI() {
  for (let i = 0; i < 5; i++) {
    const cachedRow = predictionElements[i];
    if (cachedRow) {
      if (cachedRow.labelSpan) cachedRow.labelSpan.innerText = i === 0 ? "Nenhum desenho" : "-";
      if (cachedRow.valueSpan) cachedRow.valueSpan.innerText = "0%";
      if (cachedRow.barElement) cachedRow.barElement.style.width = "0%";
    }
  }
  
  // Clear real-time model visualizer preview canvas to solid black
  if (elements.debugCanvas) {
    const debugCtx = elements.debugCanvas.getContext("2d");
    debugCtx.fillStyle = "#000000";
    debugCtx.fillRect(0, 0, 28, 28);
  }
}

// Update countdown indicator and path animation colors
export function updateTimerUI(timeLeft) {
  if (!elements.hudTimerText || !elements.timerCircle) return;
  
  elements.hudTimerText.innerText = timeLeft;
  
  // Circumference of radius 20: 2 * PI * 20 = 125.66
  const circumference = 125.66;
  const offset = circumference - (timeLeft / 20) * circumference;
  elements.timerCircle.style.strokeDashoffset = offset;
  
  if (timeLeft <= 2) {
    elements.timerCircle.classList.remove("warning");
    elements.timerCircle.classList.add("danger");
  } else if (timeLeft <= 5) {
    elements.timerCircle.classList.remove("danger");
    elements.timerCircle.classList.add("warning");
  } else {
    elements.timerCircle.classList.remove("warning");
    elements.timerCircle.classList.remove("danger");
  }
}

// Toast Feedback Alert helper
export function showToast(message, isError = false) {
  if (!elements.toastMessage || !elements.toastElement) return;
  
  elements.toastMessage.innerText = message;
  const iconSpan = document.getElementById("toast-icon");
  
  if (isError) {
    elements.toastElement.style.borderLeftColor = "var(--color-error)";
    if (iconSpan) iconSpan.innerText = "❌";
  } else {
    elements.toastElement.style.borderLeftColor = "var(--color-success)";
    if (iconSpan) iconSpan.innerText = "✅";
  }
  
  elements.toastElement.classList.add("show");
  
  setTimeout(() => {
    elements.toastElement.classList.remove("show");
  }, 3000);
}
