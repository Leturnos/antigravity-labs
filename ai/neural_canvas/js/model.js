/**
 * Aether Neural Canvas - TensorFlow.js Model & Inference Pipeline
 */

import { CLASS_NAMES } from "./dataset.js";
import { CANVAS_SIZE, PREPROCESS_SIZE, getCanvasContexts } from "./canvas.js";
import { elements, showToast, updateGuessesUI, resetGuessesUI } from "./ui.js";
import { playSound } from "./audio.js";

const MODEL_URL_CDN = "https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models@master/models/doodlenet/model.json";
const MODEL_URL_LOCAL = "./model/model.json";

let model = null;
let isModelLoaded = false;
let isLocalModelSource = false; // Loaded from CDN by default

export function isLoaded() {
  return isModelLoaded;
}

export function getIsLocalSource() {
  return isLocalModelSource;
}

export async function loadAIModel(forceSource = null) {
  if (forceSource !== null) {
    isLocalModelSource = (forceSource === "local");
  }

  if (elements.loadingOverlay) {
    elements.loadingOverlay.classList.remove("hidden");
  }
  if (elements.modeSelectors) {
    elements.modeSelectors.style.pointerEvents = "none";
    elements.modeSelectors.style.opacity = "0.5";
  }

  if (elements.modelStatusDisplay) {
    elements.modelStatusDisplay.innerText = "CARREGANDO...";
    elements.modelStatusDisplay.className = "panel-footer-status loading";
  }
  
  const targetURL = isLocalModelSource ? MODEL_URL_LOCAL : MODEL_URL_CDN;
  
  try {
    console.log("Loading model from:", targetURL);
    model = await tf.loadLayersModel(targetURL);
    onModelLoaded();
  } catch (cdnErr) {
    console.warn("Target source load failed, trying alternative fallback:", cdnErr);
    try {
      const alternativeURL = isLocalModelSource ? MODEL_URL_CDN : MODEL_URL_LOCAL;
      model = await tf.loadLayersModel(alternativeURL);
      isLocalModelSource = !isLocalModelSource;
      onModelLoaded();
    } catch (localErr) {
      console.error("All fallback resources failed:", localErr);
      onModelLoadError();
    }
  }
}

function onModelLoaded() {
  isModelLoaded = true;
  if (elements.modelStatusDisplay) {
    elements.modelStatusDisplay.innerText = isLocalModelSource ? "PRONTO (LOCAL)" : "PRONTO (CDN)";
    elements.modelStatusDisplay.className = "panel-footer-status ready";
  }
  showToast(isLocalModelSource ? "Modelo de IA carregado da máquina local!" : "Modelo de IA carregado da CDN!");
  
  if (elements.loadingOverlay) {
    elements.loadingOverlay.classList.add("hidden");
  }
  if (elements.modeSelectors) {
    elements.modeSelectors.style.pointerEvents = "auto";
    elements.modeSelectors.style.opacity = "1";
  }

  if (elements.btnToggleModelSource) {
    elements.btnToggleModelSource.innerText = isLocalModelSource ? "Carregar Modelo da CDN" : "Carregar Modelo Local";
  }
  
  playSound("chime");
}

function onModelLoadError() {
  isModelLoaded = false;
  if (elements.modelStatusDisplay) {
    elements.modelStatusDisplay.innerText = "ERRO CARREGAMENTO";
    elements.modelStatusDisplay.className = "panel-footer-status error";
  }
  showToast("Falha ao carregar modelo de IA.", true);
  
  if (elements.loadingOverlay) {
    elements.loadingOverlay.classList.add("hidden");
  }
  if (elements.modeSelectors) {
    elements.modeSelectors.style.pointerEvents = "none";
    elements.modeSelectors.style.opacity = "0.5";
  }
}

function getBoundingBox(ctx) {
  const imgData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const data = imgData.data;
  
  let minX = CANVAS_SIZE;
  let maxX = 0;
  let minY = CANVAS_SIZE;
  let maxY = 0;
  let hasStrokes = false;
  
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
  
  const paddedDim = Math.min(CANVAS_SIZE, maxDim * 1.55);
  const squareX = Math.max(0, Math.min(CANVAS_SIZE - paddedDim, centerX - paddedDim / 2));
  const squareY = Math.max(0, Math.min(CANVAS_SIZE - paddedDim, centerY - paddedDim / 2));
  
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

export async function runInference(onPredictionsReadyCallback = null) {
  if (!isModelLoaded || !model) return;
  
  const { canvas, ctx, offscreenCtx } = getCanvasContexts();
  if (!ctx || !offscreenCtx) return;

  const bbox = getBoundingBox(ctx);
  
  if (!bbox.hasStrokes) {
    resetGuessesUI();
    return;
  }
  
  if (elements.canvasWrapper) {
    elements.canvasWrapper.classList.add("state-inferring");
  }
  
  try {
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
    
    try {
      predictionsTensor = tf.tidy(() => {
        const rawTensor = tf.browser.fromPixels(imgData, 1).toFloat();
        const invertedTensor = tf.scalar(255.0).sub(rawTensor);
        const boostedTensor = invertedTensor.mul(tf.scalar(3.0)).clipByValue(0.0, 255.0);
        const normalizedTensor = boostedTensor.div(tf.scalar(255.0));
        
        if (elements.debugCanvas) {
          tf.browser.toPixels(normalizedTensor, elements.debugCanvas);
        }
        
        const inputTensor = normalizedTensor.expandDims(0);
        return model.predict(inputTensor);
      });
      
      scores = await predictionsTensor.data();
    } finally {
      if (predictionsTensor) {
        predictionsTensor.dispose();
      }
    }
    
    if (scores) {
      const results = Array.from(scores).map((scoreVal, index) => {
        const label = CLASS_NAMES[index] || "unknown";
        return {
          label: label,
          confidence: scoreVal
        };
      }).sort((a, b) => b.confidence - a.confidence);
      
      updateGuessesUI(results);
      if (onPredictionsReadyCallback) {
        onPredictionsReadyCallback(results);
      }
    }
  } catch (error) {
    console.error("TF.js Inference Error:", error);
  } finally {
    if (elements.canvasWrapper) {
      elements.canvasWrapper.classList.remove("state-inferring");
    }
  }
}
