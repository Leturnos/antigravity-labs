/**
 * Aether Neural Canvas - Core Application Logic
 * Integrates TensorFlow.js, Canvas drawing, Web Audio API, and game modes.
 */

// --- Global Constants & Configurations ---
const MODEL_URL_CDN = "https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models@master/models/doodlenet/model.json";
const MODEL_URL_LOCAL = "./model/model.json";
const CANVAS_SIZE = 400;
const PREPROCESS_SIZE = 28;

// --- App State Variables ---
let model = null;
let isModelLoaded = false;
let isLocalModelSource = false; // Loaded from CDN by default
let currentMode = "menu"; // "menu", "sandbox", "challenge"
let score = 0;
let roundsCleared = 0;
let targetWord = "";
let timeLeft = 20;
let timerInterval = null;
let audioCtx = null;
let gameFinished = false;

// Drawing history stacks for Undo/Redo
let drawing = false;
let lastX = 0;
let lastY = 0;
let historyStack = [];
let redoStack = [];
const maxHistory = 20;

// Canvas references
let canvas = null;
let ctx = null;
let offscreenCanvas = null;
let offscreenCtx = null;

// DOM Elements
let menuScreen = null;
let gameScreen = null;
let modalOverlay = null;
let modalIcon = null;
let modalTitle = null;
let modalBody = null;
let modalStats = null;
let modalStatScore = null;
let modalStatRounds = null;
let modalActionBtn = null;
let modalCloseBtn = null;

let hudTargetWord = null;
let timerCircle = null;
let hudTimerText = null;
let hudScoreValue = null;
let modelStatusDisplay = null;
let canvasWrapper = null;

let sandboxGuide = null;
let timeAttackGuide = null;
let gameHud = null;
let toastElement = null;
let toastMessage = null;
let modeSelectors = null;
let loadingOverlay = null;
let btnToggleModelSource = null;

// Cached Guess List elements to prevent repetitive DOM queries
let predictionElements = [];

// --- Initialize App ---
window.addEventListener("DOMContentLoaded", () => {
  initDOMElements();
  initCanvas();
  setupEventListeners();
  loadAIModel();
});

function initDOMElements() {
  menuScreen = document.getElementById("menu-screen");
  gameScreen = document.getElementById("game-screen");
  modalOverlay = document.getElementById("modal-overlay");
  modalIcon = document.getElementById("modal-icon");
  modalTitle = document.getElementById("modal-title");
  modalBody = document.getElementById("modal-body");
  modalStats = document.getElementById("modal-stats");
  modalStatScore = document.getElementById("modal-stat-score");
  modalStatRounds = document.getElementById("modal-stat-rounds");
  modalActionBtn = document.getElementById("modal-action-btn");
  modalCloseBtn = document.getElementById("modal-close-btn");

  hudTargetWord = document.getElementById("hud-target-word");
  timerCircle = document.getElementById("timer-circle");
  hudTimerText = document.getElementById("hud-timer-text");
  hudScoreValue = document.getElementById("hud-score-value");
  modelStatusDisplay = document.getElementById("model-status");
  canvasWrapper = document.getElementById("canvas-wrapper");

  sandboxGuide = document.getElementById("sandbox-guide");
  timeAttackGuide = document.getElementById("time-attack-guide");
  gameHud = document.getElementById("game-hud");
  toastElement = document.getElementById("aether-toast");
  toastMessage = document.getElementById("toast-message");
  modeSelectors = document.querySelector(".mode-selectors");
  loadingOverlay = document.getElementById("loading-overlay");
  btnToggleModelSource = document.getElementById("btn-toggle-model-source");

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

function initCanvas() {
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d", { willReadFrequently: true });
  
  // Set dimensions explicitly
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  
  // Create offscreen canvas for resizing to 28x28
  offscreenCanvas = document.createElement("canvas");
  offscreenCanvas.width = PREPROCESS_SIZE;
  offscreenCanvas.height = PREPROCESS_SIZE;
  offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
  offscreenCtx.imageSmoothingEnabled = false;
  offscreenCtx.mozImageSmoothingEnabled = false;
  offscreenCtx.webkitImageSmoothingEnabled = false;
  offscreenCtx.msImageSmoothingEnabled = false;
  
  clearCanvas();
}

function clearCanvas() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  historyStack = [];
  redoStack = [];
  saveCanvasState();
}

function saveCanvasState() {
  if (historyStack.length >= maxHistory) {
    historyStack.shift();
  }
  historyStack.push(ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE));
}

function undoLastStroke() {
  if (historyStack.length > 1) {
    const currentState = historyStack.pop();
    redoStack.push(currentState);
    const prevState = historyStack[historyStack.length - 1];
    ctx.putImageData(prevState, 0, 0);
    runInference();
  }
}

function redoLastStroke() {
  if (redoStack.length > 0) {
    const nextState = redoStack.pop();
    historyStack.push(nextState);
    ctx.putImageData(nextState, 0, 0);
    runInference();
  }
}

// --- Audio Synthesizer Engine ---
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSound(type) {
  try {
    const audioContext = getAudioContext();
    const now = audioContext.currentTime;
    
    if (type === "tick") {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.04);
    } else if (type === "win") {
      const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      freqs.forEach((freq, idx) => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.08, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.3);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.35);
      });
    } else if (type === "lose") {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(293.66, now); // D4
      osc.frequency.linearRampToValueAtTime(146.83, now + 0.5); // D3
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === "chime") {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.2); // E6
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) {
    console.warn("Audio Context blocked or unsupported:", e);
  }
}

// --- Event Listeners Setup ---
function setupEventListeners() {
  // Mode Selection Cards click handlers
  document.getElementById("sandbox-card").addEventListener("click", () => startSandboxMode());
  document.getElementById("time-attack-card").addEventListener("click", () => startChallengeMode());
  
  // Toggle Model Source Button click handler
  btnToggleModelSource.addEventListener("click", () => {
    const newSource = isLocalModelSource ? "cdn" : "local";
    loadAIModel(newSource);
  });

  // Game Actions controls
  document.getElementById("exit-btn").addEventListener("click", () => exitToMenu());
  document.getElementById("clear-btn").addEventListener("click", () => {
    clearCanvas();
    runInference();
  });
  document.getElementById("undo-btn").addEventListener("click", undoLastStroke);
  document.getElementById("redo-btn").addEventListener("click", redoLastStroke);
  document.getElementById("export-btn").addEventListener("click", exportCanvasImage);
  
  // Modal buttons click handlers
  modalActionBtn.addEventListener("click", () => {
    modalOverlay.classList.add("hidden");
    if (currentMode === "challenge") {
      if (gameFinished) {
        startChallengeMode();
      } else {
        nextChallengeRound();
      }
    }
  });

  modalCloseBtn.addEventListener("click", () => {
    modalOverlay.classList.add("hidden");
    exitToMenu();
  });

  // Mouse canvas drawing listeners
  canvas.addEventListener("mousedown", startDrawing);
  canvas.addEventListener("mousemove", draw);
  window.addEventListener("mouseup", stopDrawing);

  // Touch canvas drawing listeners
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (e.touches.length === 1) startDrawing(e.touches[0]);
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (e.touches.length === 1) draw(e.touches[0]);
  }, { passive: false });

  window.addEventListener("touchend", stopDrawing);
}

// --- Drawing Coords helper ---
function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function startDrawing(e) {
  drawing = true;
  canvasWrapper.classList.remove("state-idle");
  canvasWrapper.classList.add("state-drawing");
  
  const coords = getCanvasCoords(e);
  lastX = coords.x;
  lastY = coords.y;
  
  // Initialize audio context on user interaction
  getAudioContext();
}

function draw(e) {
  if (!drawing) return;
  const coords = getCanvasCoords(e);
  
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(coords.x, coords.y);
  
  ctx.strokeStyle = "#111111"; // Black stroke
  ctx.lineWidth = 20;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  
  lastX = coords.x;
  lastY = coords.y;
}

function stopDrawing() {
  if (!drawing) return;
  drawing = false;
  canvasWrapper.classList.remove("state-drawing");
  canvasWrapper.classList.add("state-idle");
  
  // Clear redo stack on new brush stroke
  redoStack = [];
  saveCanvasState();
  runInference();
}

// --- Image Preprocessing & TF.js Pipeline ---
function getBoundingBox() {
  const imgData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const data = imgData.data;
  
  let minX = CANVAS_SIZE;
  let maxX = 0;
  let minY = CANVAS_SIZE;
  let maxY = 0;
  let hasStrokes = false;
  
  // Find boundaries of black drawing strokes (R, G, B < 240) in a single loop
  const totalPixels = CANVAS_SIZE * CANVAS_SIZE;
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    
    if (r < 240 || g < 240 || b < 240) {
      hasStrokes = true;
      const x = i % CANVAS_SIZE;
      const y = Math.floor(i / CANVAS_SIZE);
      
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  
  if (!hasStrokes) {
    return { x: 0, y: 0, w: CANVAS_SIZE, h: CANVAS_SIZE, hasStrokes: false };
  }
  
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  
  const maxDim = Math.max(w, h, 120);
  const centerX = minX + w / 2;
  const centerY = minY + h / 2;
  
  // Cap the padded dimension at max CANVAS_SIZE to prevent crop overflows
  const paddedDim = Math.min(CANVAS_SIZE, maxDim * 1.55);
  const squareX = Math.max(0, Math.min(CANVAS_SIZE - paddedDim, centerX - paddedDim / 2));
  const squareY = Math.max(0, Math.min(CANVAS_SIZE - paddedDim, centerY - paddedDim / 2));
  
  // Fix rounding error (off-by-one pixel boundaries check)
  const x1 = Math.round(squareX);
  const y1 = Math.round(squareY);
  const x2 = Math.round(squareX + paddedDim);
  const y2 = Math.round(squareY + paddedDim);
  
  return {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
    hasStrokes: true
  };
}

async function runInference() {
  if (!isModelLoaded || !model) return;
  
  // 1. Get cropped square drawing region
  const bbox = getBoundingBox();
  
  // Fix Auto-Win: If the canvas is empty, skip inference and reset guesses UI
  if (!bbox.hasStrokes) {
    resetGuessesUI();
    return;
  }
  
  canvasWrapper.classList.add("state-inferring");
  
  try {
    // 2. Downsample cropped image to 28x28
    offscreenCtx.fillStyle = "#ffffff";
    offscreenCtx.fillRect(0, 0, PREPROCESS_SIZE, PREPROCESS_SIZE);
    offscreenCtx.drawImage(
      canvas,
      bbox.x, bbox.y, bbox.w, bbox.h,
      0, 0, PREPROCESS_SIZE, PREPROCESS_SIZE
    );
    
    const imgData = offscreenCtx.getImageData(0, 0, PREPROCESS_SIZE, PREPROCESS_SIZE);
    
    let scores = null;
    let predictionsTensor = null;
    
    // Non-blocking asynchronous tensor data download
    try {
      predictionsTensor = tf.tidy(() => {
        // Convert to Grayscale float32 tensor [28, 28, 1]
        const rawTensor = tf.browser.fromPixels(imgData, 1).toFloat();
        
        // Invert colors: DoodleNet expects white strokes on black background
        const invertedTensor = tf.scalar(255.0).sub(rawTensor);
        
        // Boost contrast to make strokes solid and thick in 28x28 space
        const boostedTensor = invertedTensor.mul(tf.scalar(3.0)).clipByValue(0.0, 255.0);
        
        // Normalize to [0, 1.0]
        const normalizedTensor = boostedTensor.div(tf.scalar(255.0));
        
        // Draw real-time visualization of what DoodleNet sees onto the debug preview canvas
        const debugCanvas = document.getElementById("debug-preview-canvas");
        if (debugCanvas) {
          tf.browser.toPixels(normalizedTensor, debugCanvas);
        }
        
        // Reshape to Batch shape [1, 28, 28, 1]
        const inputTensor = normalizedTensor.expandDims(0);
        
        // Return prediction tensor
        return model.predict(inputTensor);
      });
      
      scores = await predictionsTensor.data();
    } finally {
      if (predictionsTensor) {
        predictionsTensor.dispose();
      }
    }
    
    if (scores) {
      // 5. Map to categories list and sort descending with fallback protection
      const results = Array.from(scores).map((scoreVal, index) => {
        const label = (window.CLASS_NAMES && window.CLASS_NAMES[index]) || "unknown";
        return {
          label: label,
          confidence: scoreVal
        };
      }).sort((a, b) => b.confidence - a.confidence);
      
      updateGuessesUI(results);
      checkChallengeProgress(results);
    }
  } catch (error) {
    console.error("TF.js Inference Error:", error);
  } finally {
    canvasWrapper.classList.remove("state-inferring");
  }
}

// Update Top 5 UI Guesses in Portuguese using cached DOM structures
function updateGuessesUI(results) {
  for (let i = 0; i < 5; i++) {
    const item = results[i];
    const confidencePct = Math.round(item.confidence * 100);
    const cachedRow = predictionElements[i];
    
    if (cachedRow) {
      // Map label to Portuguese translation
      const ptLabel = (window.CLASS_TRANSLATIONS && window.CLASS_TRANSLATIONS[item.label]) || item.label;
      if (cachedRow.labelSpan) cachedRow.labelSpan.innerText = ptLabel.toUpperCase();
      if (cachedRow.valueSpan) cachedRow.valueSpan.innerText = `${confidencePct}%`;
      if (cachedRow.barElement) cachedRow.barElement.style.width = `${confidencePct}%`;
    }
  }
}

// Reset guess lists to baseline in Portuguese using cached DOM structures
function resetGuessesUI() {
  for (let i = 0; i < 5; i++) {
    const cachedRow = predictionElements[i];
    if (cachedRow) {
      if (cachedRow.labelSpan) cachedRow.labelSpan.innerText = i === 0 ? "Nenhum desenho" : "-";
      if (cachedRow.valueSpan) cachedRow.valueSpan.innerText = "0%";
      if (cachedRow.barElement) cachedRow.barElement.style.width = "0%";
    }
  }
  
  // Clear real-time model visualizer preview canvas to solid black
  const debugCanvas = document.getElementById("debug-preview-canvas");
  if (debugCanvas) {
    const debugCtx = debugCanvas.getContext("2d");
    debugCtx.fillStyle = "#000000";
    debugCtx.fillRect(0, 0, 28, 28);
  }
}

// --- AI Model Loader ---
async function loadAIModel(forceSource = null) {
  if (forceSource !== null) {
    isLocalModelSource = (forceSource === "local");
  }

  // Display loading blocker spinner and lock selectors
  if (loadingOverlay) {
    loadingOverlay.classList.remove("hidden");
  }
  if (modeSelectors) {
    modeSelectors.style.pointerEvents = "none";
    modeSelectors.style.opacity = "0.5";
  }

  modelStatusDisplay.innerText = "CARREGANDO...";
  modelStatusDisplay.className = "panel-footer-status loading";
  
  const targetURL = isLocalModelSource ? MODEL_URL_LOCAL : MODEL_URL_CDN;
  
  try {
    console.log("Loading model from:", targetURL);
    model = await tf.loadLayersModel(targetURL);
    onModelLoaded();
  } catch (cdnErr) {
    console.warn("Target source load failed, trying alternative fallback:", cdnErr);
    // If targeted source failed, try fallback
    try {
      const alternativeURL = isLocalModelSource ? MODEL_URL_CDN : MODEL_URL_LOCAL;
      model = await tf.loadLayersModel(alternativeURL);
      isLocalModelSource = !isLocalModelSource; // Swapped source
      onModelLoaded();
    } catch (localErr) {
      console.error("All fallback resources failed:", localErr);
      onModelLoadError();
    }
  }
}

function onModelLoaded() {
  isModelLoaded = true;
  modelStatusDisplay.innerText = isLocalModelSource ? "PRONTO (LOCAL)" : "PRONTO (CDN)";
  modelStatusDisplay.className = "panel-footer-status ready";
  showToast(isLocalModelSource ? "Modelo de IA carregado da máquina local!" : "Modelo de IA carregado da CDN!");
  
  // Hide loading spinner blocker and unlock selectors
  if (loadingOverlay) {
    loadingOverlay.classList.add("hidden");
  }
  if (modeSelectors) {
    modeSelectors.style.pointerEvents = "auto";
    modeSelectors.style.opacity = "1";
  }

  // Toggle button indicator text
  if (btnToggleModelSource) {
    btnToggleModelSource.innerText = isLocalModelSource ? "Carregar Modelo da CDN" : "Carregar Modelo Local";
  }
  
  playSound("chime");
}

function onModelLoadError() {
  isModelLoaded = false;
  modelStatusDisplay.innerText = "ERRO CARREGAMENTO";
  modelStatusDisplay.className = "panel-footer-status error";
  showToast("Falha ao carregar modelo de IA.", true);
  
  // Hide blocker overlay so users can try clicking model source switch
  if (loadingOverlay) {
    loadingOverlay.classList.add("hidden");
  }
  if (modeSelectors) {
    modeSelectors.style.pointerEvents = "none";
    modeSelectors.style.opacity = "0.5";
  }
}

// --- Mode Switch Managers ---
function startSandboxMode() {
  currentMode = "sandbox";
  menuScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  
  // Setup Sandbox sidebar guides and hide HUD
  sandboxGuide.classList.remove("hidden");
  timeAttackGuide.classList.add("hidden");
  gameHud.classList.add("hidden");
  
  playSound("chime");
  clearCanvas();
  runInference();
}

function startChallengeMode() {
  currentMode = "challenge";
  score = 0;
  roundsCleared = 0;
  gameFinished = false;
  hudScoreValue.innerText = score;
  
  menuScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  
  // Setup Challenge sidebar guides and display game HUD
  sandboxGuide.classList.add("hidden");
  timeAttackGuide.classList.remove("hidden");
  gameHud.classList.remove("hidden");
  
  // Make sure stats are clean inside modal elements
  modalStats.classList.remove("hidden");
  
  playSound("chime");
  nextChallengeRound();
}

function nextChallengeRound() {
  // Select a random easy-to-draw target word from global CHALLENGE_CLASSES array
  const classesList = window.CHALLENGE_CLASSES || [];
  const randomIdx = Math.floor(Math.random() * classesList.length);
  targetWord = classesList[randomIdx];
  
  // Translate target word to Portuguese for the HUD
  const ptWord = (window.CLASS_TRANSLATIONS && window.CLASS_TRANSLATIONS[targetWord]) || targetWord;
  hudTargetWord.innerText = ptWord.toUpperCase();
  
  clearCanvas();
  runInference();
  startTimer();
}

// --- Timer Controllers ---
function startTimer() {
  clearInterval(timerInterval);
  timeLeft = 20;
  updateTimerUI();
  
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerUI();
    playSound("tick");
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      onChallengeGameOver();
    }
  }, 1000);
}

// Update countdown indicator and path animation colors
function updateTimerUI() {
  hudTimerText.innerText = timeLeft;
  
  // Circunferência de raio 20: 2 * PI * 20 = 125.66
  const circumference = 125.66;
  const offset = circumference - (timeLeft / 20) * circumference;
  timerCircle.style.strokeDashoffset = offset;
  
  if (timeLeft <= 5) {
    timerCircle.classList.remove("danger");
    timerCircle.classList.add("warning");
  } else if (timeLeft <= 2) {
    timerCircle.classList.remove("warning");
    timerCircle.classList.add("danger");
  } else {
    timerCircle.classList.remove("warning");
    timerCircle.classList.remove("danger");
  }
}

// --- Rules Evaluator ---
function checkChallengeProgress(results) {
  if (currentMode !== "challenge" || timeLeft <= 0 || gameFinished) return;
  
  // Success if correct category appears in the top 3
  const top3 = results.slice(0, 3).map(item => item.label.toLowerCase());
  if (top3.includes(targetWord.toLowerCase())) {
    clearInterval(timerInterval);
    onRoundSuccess();
  }
}

function onRoundSuccess() {
  score += 10;
  roundsCleared++;
  hudScoreValue.innerText = score;
  playSound("win");
  
  // Display translated word in the modal
  const ptWord = (window.CLASS_TRANSLATIONS && window.CLASS_TRANSLATIONS[targetWord]) || targetWord;
  
  modalIcon.innerText = "🏆";
  modalTitle.innerText = "CORRETO!";
  modalBody.innerHTML = `Excelente! Você desenhou um(a) <strong>"${ptWord.toUpperCase()}"</strong> e a IA reconheceu com sucesso! +10 pontos.`;
  
  // Show stats
  modalStats.classList.remove("hidden");
  modalStatScore.innerText = score;
  modalStatRounds.innerText = roundsCleared;
  
  modalActionBtn.innerText = "PRÓXIMO ROUND";
  modalOverlay.classList.remove("hidden");
}

function onChallengeGameOver() {
  gameFinished = true;
  playSound("lose");
  
  // Display translated word in the modal
  const ptWord = (window.CLASS_TRANSLATIONS && window.CLASS_TRANSLATIONS[targetWord]) || targetWord;
  
  modalIcon.innerText = "⏱️";
  modalTitle.innerText = "FIM DE JOGO!";
  modalBody.innerHTML = `O tempo acabou! O objeto solicitado era <strong>"${ptWord.toUpperCase()}"</strong>.`;
  
  // Show stats
  modalStats.classList.remove("hidden");
  modalStatScore.innerText = score;
  modalStatRounds.innerText = roundsCleared;
  
  modalActionBtn.innerText = "TENTAR NOVAMENTE";
  modalOverlay.classList.remove("hidden");
}

function exitToMenu() {
  clearInterval(timerInterval);
  currentMode = "menu";
  gameScreen.classList.add("hidden");
  menuScreen.classList.remove("hidden");
  modalOverlay.classList.add("hidden");
}

// --- Toast Feedback Alert helper ---
function showToast(message, isError = false) {
  toastMessage.innerText = message;
  const iconSpan = document.getElementById("toast-icon");
  
  if (isError) {
    toastElement.style.borderLeftColor = "var(--color-error)";
    if (iconSpan) iconSpan.innerText = "❌";
  } else {
    toastElement.style.borderLeftColor = "var(--color-success)";
    if (iconSpan) iconSpan.innerText = "✅";
  }
  
  toastElement.classList.add("show");
  
  setTimeout(() => {
    toastElement.classList.remove("show");
  }, 3000);
}

// --- PNG Exporter helper ---
function exportCanvasImage() {
  try {
    const dataURL = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `aether-doodle-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
    showToast("Desenho exportado em PNG com sucesso!");
  } catch (error) {
    console.error("Failed to export PNG:", error);
    showToast("Falha ao exportar desenho.", true);
  }
}
