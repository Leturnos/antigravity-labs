/**
 * Aether Neural Canvas - Canvas Drawing & Undo/Redo Engine
 */

import { elements, showToast } from "./ui.js";
import { getAudioContext } from "./audio.js";

export const CANVAS_SIZE = 400;
export const PREPROCESS_SIZE = 28;
const MAX_HISTORY = 20;

let canvas = null;
let ctx = null;
let offscreenCanvas = null;
let offscreenCtx = null;

let drawing = false;
let lastX = 0;
let lastY = 0;
let historyStack = [];
let redoStack = [];
let onStrokeEndCallback = null;

export function initCanvas(onStrokeEnd) {
  onStrokeEndCallback = onStrokeEnd;
  canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d", { willReadFrequently: true });
  
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  
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

export function getCanvasContexts() {
  return { canvas, ctx, offscreenCanvas, offscreenCtx };
}

export function clearCanvas() {
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  historyStack = [];
  redoStack = [];
  saveCanvasState();
}

export function saveCanvasState() {
  if (historyStack.length >= MAX_HISTORY) {
    historyStack.shift();
  }
  historyStack.push(ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE));
}

export function undoLastStroke() {
  if (historyStack.length > 1) {
    const currentState = historyStack.pop();
    redoStack.push(currentState);
    const prevState = historyStack[historyStack.length - 1];
    ctx.putImageData(prevState, 0, 0);
    if (onStrokeEndCallback) onStrokeEndCallback();
  }
}

export function redoLastStroke() {
  if (redoStack.length > 0) {
    const nextState = redoStack.pop();
    historyStack.push(nextState);
    ctx.putImageData(nextState, 0, 0);
    if (onStrokeEndCallback) onStrokeEndCallback();
  }
}

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

export function startDrawing(e) {
  drawing = true;
  if (elements.canvasWrapper) {
    elements.canvasWrapper.classList.remove("state-idle");
    elements.canvasWrapper.classList.add("state-drawing");
  }
  
  const coords = getCanvasCoords(e);
  lastX = coords.x;
  lastY = coords.y;
  
  getAudioContext();
}

export function draw(e) {
  if (!drawing) return;
  const coords = getCanvasCoords(e);
  
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(coords.x, coords.y);
  
  ctx.strokeStyle = "#111111";
  ctx.lineWidth = 20;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  
  lastX = coords.x;
  lastY = coords.y;
}

export function stopDrawing() {
  if (!drawing) return;
  drawing = false;
  if (elements.canvasWrapper) {
    elements.canvasWrapper.classList.remove("state-drawing");
    elements.canvasWrapper.classList.add("state-idle");
  }
  
  redoStack = [];
  saveCanvasState();
  if (onStrokeEndCallback) onStrokeEndCallback();
}

export function exportCanvasImage() {
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
