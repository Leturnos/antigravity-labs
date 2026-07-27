/**
 * Aether Neural Canvas - Game State & Rules Engine
 */

import { CHALLENGE_CLASSES, CLASS_TRANSLATIONS } from "./dataset.js";
import { elements, updateTimerUI } from "./ui.js";
import { playSound } from "./audio.js";
import { clearCanvas } from "./canvas.js";
import { runInference } from "./model.js";

let currentMode = "menu"; // "menu", "sandbox", "challenge"
let score = 0;
let roundsCleared = 0;
let targetWord = "";
let timeLeft = 20;
let timerInterval = null;
let gameFinished = false;

export function getCurrentMode() {
  return currentMode;
}

export function startSandboxMode() {
  currentMode = "sandbox";
  elements.menuScreen.classList.add("hidden");
  elements.gameScreen.classList.remove("hidden");
  
  elements.sandboxGuide.classList.remove("hidden");
  elements.timeAttackGuide.classList.add("hidden");
  elements.gameHud.classList.add("hidden");
  
  playSound("chime");
  clearCanvas();
  runInference();
}

export function startChallengeMode() {
  currentMode = "challenge";
  score = 0;
  roundsCleared = 0;
  gameFinished = false;
  elements.hudScoreValue.innerText = score;
  
  elements.menuScreen.classList.add("hidden");
  elements.gameScreen.classList.remove("hidden");
  
  elements.sandboxGuide.classList.add("hidden");
  elements.timeAttackGuide.classList.remove("hidden");
  elements.gameHud.classList.remove("hidden");
  
  elements.modalStats.classList.remove("hidden");
  
  playSound("chime");
  nextChallengeRound();
}

export function nextChallengeRound() {
  const randomIdx = Math.floor(Math.random() * CHALLENGE_CLASSES.length);
  targetWord = CHALLENGE_CLASSES[randomIdx];
  
  const ptWord = CLASS_TRANSLATIONS[targetWord] || targetWord;
  elements.hudTargetWord.innerText = ptWord.toUpperCase();
  
  clearCanvas();
  runInference();
  startTimer();
}

export function startTimer() {
  clearInterval(timerInterval);
  timeLeft = 20;
  updateTimerUI(timeLeft);
  
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerUI(timeLeft);
    playSound("tick");
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      onChallengeGameOver();
    }
  }, 1000);
}

export function checkChallengeProgress(results) {
  if (currentMode !== "challenge" || timeLeft <= 0 || gameFinished) return;
  
  const top3 = results.slice(0, 3).map(item => item.label.toLowerCase());
  if (top3.includes(targetWord.toLowerCase())) {
    clearInterval(timerInterval);
    onRoundSuccess();
  }
}

function onRoundSuccess() {
  score += 10;
  roundsCleared++;
  elements.hudScoreValue.innerText = score;
  playSound("win");
  
  const ptWord = CLASS_TRANSLATIONS[targetWord] || targetWord;
  
  elements.modalIcon.innerText = "🏆";
  elements.modalTitle.innerText = "CORRETO!";
  elements.modalBody.innerHTML = `Excelente! Você desenhou um(a) <strong>"${ptWord.toUpperCase()}"</strong> e a IA reconheceu com sucesso! +10 pontos.`;
  
  elements.modalStats.classList.remove("hidden");
  elements.modalStatScore.innerText = score;
  elements.modalStatRounds.innerText = roundsCleared;
  
  elements.modalActionBtn.innerText = "PRÓXIMO ROUND";
  elements.modalOverlay.classList.remove("hidden");
}

function onChallengeGameOver() {
  gameFinished = true;
  playSound("lose");
  
  const ptWord = CLASS_TRANSLATIONS[targetWord] || targetWord;
  
  elements.modalIcon.innerText = "⏱️";
  elements.modalTitle.innerText = "FIM DE JOGO!";
  elements.modalBody.innerHTML = `O tempo acabou! O objeto solicitado era <strong>"${ptWord.toUpperCase()}"</strong>.`;
  
  elements.modalStats.classList.remove("hidden");
  elements.modalStatScore.innerText = score;
  elements.modalStatRounds.innerText = roundsCleared;
  
  elements.modalActionBtn.innerText = "TENTAR NOVAMENTE";
  elements.modalOverlay.classList.remove("hidden");
}

export function handleModalAction() {
  elements.modalOverlay.classList.add("hidden");
  if (currentMode === "challenge") {
    if (gameFinished) {
      startChallengeMode();
    } else {
      nextChallengeRound();
    }
  }
}

export function handleModalClose() {
  elements.modalOverlay.classList.add("hidden");
  exitToMenu();
}

export function exitToMenu() {
  clearInterval(timerInterval);
  currentMode = "menu";
  elements.gameScreen.classList.add("hidden");
  elements.menuScreen.classList.remove("hidden");
  elements.modalOverlay.classList.add("hidden");
}
