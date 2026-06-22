/**
 * Aether Tic-Tac-Toe — Game Controller and AI Engine (Minimax)
 */

// Global state variables
let board = Array(9).fill(null);
let currentPlayer = 'X'; // X starts by default
let gameActive = false;
let gameMode = 'ai'; // 'ai', 'pvp', 'sim'
let aiDifficulty = 'impossible'; // 'easy', 'medium', 'impossible'
let starter = 'player'; // 'player' (starts as X) or 'ai' (starts as X)
let simSpeed = 'normal'; // 'slow', 'normal', 'fast', 'hyper'

// Session stats
let scoreWins = 0;
let scoreLosses = 0;
let scoreDraws = 0;
let winStreak = 0;

// AI Diagnostics metrics
let nodesSearched = 0;

// Simulation timeout tracker
let simTimeoutId = null;

// Sound Synthesizer instance
const audio = window.sounds;

// DOM Elements
const container = document.getElementById('aether-container');
const boardCells = document.querySelectorAll('.board-cell');
const winningLine = document.getElementById('winning-line');
const winningLineSvg = document.getElementById('winning-line-svg');

// Overlays
const startOverlay = document.getElementById('start-overlay');
const pauseOverlay = document.getElementById('pause-overlay');

// Modals
const modalInfo = document.getElementById('modal-info');
const modalGameOver = document.getElementById('modal-gameover');
const modalConfirm = document.getElementById('modal-confirm');

// Diagnostic DOM Elements
const lblScoreWins = document.getElementById('lbl-score-wins');
const lblScoreLosses = document.getElementById('lbl-score-losses');
const lblScoreDraws = document.getElementById('lbl-score-draws');
const lblScoreStreak = document.getElementById('lbl-score-streak');
const lblAiAlgo = document.getElementById('lbl-ai-algo');
const lblNodesSearched = document.getElementById('lbl-nodes-searched');
const lblCalcTime = document.getElementById('lbl-calc-time');
const lblAiDecision = document.getElementById('lbl-ai-decision');
const lblActiveModeName = document.getElementById('lbl-active-mode-name');

// High score footers
const valRecordWins = document.getElementById('val-record-wins');
const valRecordLosses = document.getElementById('val-record-losses');
const valRecordDraws = document.getElementById('val-record-draws');

// Button controllers
const btnStart = document.getElementById('btn-start');
const btnResume = document.getElementById('btn-resume');
const btnRetry = document.getElementById('btn-retry');
const btnSoundToggle = document.getElementById('btn-sound-toggle');
const btnResetScores = document.getElementById('btn-reset-scores');

// Theme Selector
const themeSelector = document.getElementById('theme-selector');

// Define winning combinations & line geometry mapping
const WINNING_COMBOS = [
  { combo: [0, 1, 2], line: { x1: 20, y1: 50, x2: 280, y2: 50 } },     // Row 1
  { combo: [3, 4, 5], line: { x1: 20, y1: 150, x2: 280, y2: 150 } },   // Row 2
  { combo: [6, 7, 8], line: { x1: 20, y1: 250, x2: 280, y2: 250 } },   // Row 3
  { combo: [0, 3, 6], line: { x1: 50, y1: 20, x2: 50, y2: 280 } },     // Col 1
  { combo: [1, 4, 7], line: { x1: 150, y1: 20, x2: 150, y2: 280 } },   // Col 2
  { combo: [2, 5, 8], line: { x1: 250, y1: 20, x2: 250, y2: 280 } },   // Col 3
  { combo: [0, 4, 8], line: { x1: 30, y1: 30, x2: 270, y2: 270 } },    // Diag 1
  { combo: [2, 4, 6], line: { x1: 270, y1: 30, x2: 30, y2: 270 } }     // Diag 2
];

/**
 * Initialization and event listeners
 */
window.addEventListener('DOMContentLoaded', () => {
  // Load stats from server.py
  loadServerScores();
  
  // Set up event listeners
  setupMenuEventListeners();
  setupBoardEventListeners();
  setupGlobalShortcuts();
});

// Configure options panels and toggles
function setupMenuEventListeners() {
  // Sound toggle
  btnSoundToggle.addEventListener('click', () => {
    const isMuted = audio.toggleMute();
    btnSoundToggle.querySelector('.icon').textContent = isMuted ? '🔇' : '🔊';
    btnSoundToggle.querySelector('.label').textContent = isMuted ? 'Som: DESLIGADO' : 'Som: LIGADO';
    audio.playHover();
  });

  // How to play modal
  document.getElementById('btn-info').addEventListener('click', () => {
    audio.playHover();
    modalInfo.classList.remove('hidden');
  });
  document.getElementById('modal-info-close').addEventListener('click', () => {
    audio.playHover();
    modalInfo.classList.add('hidden');
  });
  document.getElementById('btn-info-close-ok').addEventListener('click', () => {
    audio.playHover();
    modalInfo.classList.add('hidden');
  });

  // Game Mode select
  const btnModeAI = document.getElementById('btn-mode-ai');
  const btnModePvP = document.getElementById('btn-mode-pvp');
  const btnModeSim = document.getElementById('btn-mode-sim');
  
  [btnModeAI, btnModePvP, btnModeSim].forEach(btn => {
    btn.addEventListener('click', () => {
      audio.playHover();
      [btnModeAI, btnModePvP, btnModeSim].forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      gameMode = btn.dataset.mode;
      updateControlsVisibility();
      resetBoard();
    });
  });

  // Difficulty select
  const btnDiffEasy = document.getElementById('diff-easy');
  const btnDiffMed = document.getElementById('diff-medium');
  const btnDiffImp = document.getElementById('diff-impossible');

  [btnDiffEasy, btnDiffMed, btnDiffImp].forEach(btn => {
    btn.addEventListener('click', () => {
      audio.playHover();
      [btnDiffEasy, btnDiffMed, btnDiffImp].forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      aiDifficulty = btn.dataset.diff;
      resetBoard();
    });
  });

  // Starting Player select
  const btnStartPlayer = document.getElementById('btn-start-player');
  const btnStartAI = document.getElementById('btn-start-ai');

  [btnStartPlayer, btnStartAI].forEach(btn => {
    btn.addEventListener('click', () => {
      audio.playHover();
      [btnStartPlayer, btnStartAI].forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      starter = btn.dataset.starter;
      resetBoard();
    });
  });

  // Sim speed select
  const speeds = ['slow', 'normal', 'fast', 'hyper'];
  speeds.forEach(spd => {
    document.getElementById(`speed-${spd}`).addEventListener('click', (e) => {
      audio.playHover();
      speeds.forEach(s => document.getElementById(`speed-${s}`).classList.remove('active'));
      e.target.classList.add('active');
      simSpeed = spd;
    });
  });

  // Theme selector
  themeSelector.addEventListener('change', () => {
    audio.playHover();
    const selectedTheme = themeSelector.value;
    document.body.className = ''; // Reset
    if (selectedTheme !== 'cyberpunk') {
      document.body.classList.add(`theme-${selectedTheme}`);
    }
  });

  // Start Lobby Buttons
  btnStart.addEventListener('click', () => {
    audio.init();
    audio.playHover();
    startOverlay.classList.add('hidden');
    container.classList.remove('game-idle');
    startGame();
  });

  btnResume.addEventListener('click', () => {
    audio.playHover();
    resumeGame();
  });

  btnRetry.addEventListener('click', () => {
    audio.playHover();
    modalGameOver.classList.add('hidden');
    resetBoard();
  });
  
  document.getElementById('btn-gameover-close-ok').addEventListener('click', () => {
    audio.playHover();
    modalGameOver.classList.add('hidden');
  });

  // Reset Globals
  btnResetScores.addEventListener('click', () => {
    audio.playHover();
    modalConfirm.classList.remove('hidden');
  });

  document.getElementById('btn-confirm-yes').addEventListener('click', async () => {
    audio.playHover();
    modalConfirm.classList.add('hidden');
    await resetServerScores();
  });

  document.getElementById('btn-confirm-no').addEventListener('click', () => {
    audio.playHover();
    modalConfirm.classList.add('hidden');
  });
}

function updateControlsVisibility() {
  const grpDifficulty = document.getElementById('grp-difficulty');
  const grpOrder = document.getElementById('grp-order');
  const grpSimSpeed = document.getElementById('grp-sim-speed');

  if (gameMode === 'ai') {
    grpDifficulty.classList.remove('hidden');
    grpOrder.classList.remove('hidden');
    grpSimSpeed.classList.add('hidden');
    lblActiveModeName.textContent = 'VS INTELIGÊNCIA ARTIFICIAL';
  } else if (gameMode === 'pvp') {
    grpDifficulty.classList.add('hidden');
    grpOrder.classList.add('hidden');
    grpSimSpeed.classList.add('hidden');
    lblActiveModeName.textContent = 'PvP LOCAL (HUMANO VS HUMANO)';
  } else if (gameMode === 'sim') {
    grpDifficulty.classList.add('hidden'); // Sim will always use unbeatable minimax vs unbeatable minimax
    grpOrder.classList.add('hidden');
    grpSimSpeed.classList.remove('hidden');
    lblActiveModeName.textContent = 'SIMULAÇÃO CONTÍNUA (IA VS IA)';
  }
}

function setupBoardEventListeners() {
  boardCells.forEach(cell => {
    cell.addEventListener('mouseenter', () => {
      if (gameActive && !board[cell.dataset.index] && gameMode !== 'sim') {
        audio.playHover();
      }
    });

    cell.addEventListener('click', () => {
      if (!gameActive || board[cell.dataset.index] || gameMode === 'sim') return;
      makeMove(parseInt(cell.dataset.index));
    });
  });
}

function setupGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
      // Prevent scrolling page
      e.preventDefault();
      if (!startOverlay.classList.contains('hidden') || !modalGameOver.classList.contains('hidden')) return;
      togglePause();
    } else if (e.key.toLowerCase() === 'r') {
      if (!startOverlay.classList.contains('hidden') || !modalGameOver.classList.contains('hidden')) return;
      audio.playHover();
      resetBoard();
    } else if (e.key.toLowerCase() === 's') {
      btnSoundToggle.click();
    }
  });
}

/**
 * Game Core Logic
 */

function startGame() {
  gameActive = true;
  resetBoard();
}

function resetBoard() {
  if (simTimeoutId) {
    clearTimeout(simTimeoutId);
    simTimeoutId = null;
  }
  
  board = Array(9).fill(null);
  gameActive = true;
  pauseOverlay.classList.add('hidden');
  
  // Clear HTML grid cells
  boardCells.forEach(cell => {
    cell.className = 'board-cell';
  });

  // Hide winning line
  winningLine.setAttribute('stroke', 'transparent');
  winningLine.setAttribute('stroke-dasharray', '0');
  
  // Reset diagnostic counters
  lblNodesSearched.textContent = '0';
  lblCalcTime.textContent = '0 ms';
  lblAiDecision.textContent = '--';

  // Determine starting player
  if (gameMode === 'ai') {
    currentPlayer = 'X'; // X always plays first
    if (starter === 'ai') {
      // AI starts as X, Player is O
      triggerAiMove();
    }
  } else if (gameMode === 'sim') {
    currentPlayer = 'X';
    triggerSimulationStep();
  } else {
    // PvP local
    currentPlayer = 'X';
  }
}

function togglePause() {
  if (!gameActive) {
    resumeGame();
  } else {
    gameActive = false;
    pauseOverlay.classList.remove('hidden');
    if (simTimeoutId) {
      clearTimeout(simTimeoutId);
      simTimeoutId = null;
    }
  }
}

function resumeGame() {
  gameActive = true;
  pauseOverlay.classList.add('hidden');
  if (gameMode === 'sim') {
    triggerSimulationStep();
  } else if (gameMode === 'ai' && ((starter === 'ai' && currentPlayer === 'X') || (starter === 'player' && currentPlayer === 'O'))) {
    triggerAiMove();
  }
}

function makeMove(index) {
  if (!gameActive || board[index]) return;

  board[index] = currentPlayer;
  
  // Draw marker
  const cell = document.getElementById(`cell-${index}`);
  cell.classList.add(`mark-${currentPlayer.toLowerCase()}`);
  
  // Sound
  if (currentPlayer === 'X') {
    audio.playMoveX();
  } else {
    audio.playMoveO();
  }

  // Check Game State
  const winState = checkWin(board);
  
  if (winState) {
    handleGameOver(winState.winner, winState.lineCombo);
    return;
  }

  if (checkDraw(board)) {
    handleGameOver('draw', null);
    return;
  }

  // Switch turn
  currentPlayer = currentPlayer === 'X' ? 'O' : 'X';

  // AI Turn trigger
  if (gameActive && gameMode === 'ai') {
    const isAiTurn = (starter === 'ai' && currentPlayer === 'X') || (starter === 'player' && currentPlayer === 'O');
    if (isAiTurn) {
      triggerAiMove();
    }
  }
}

function triggerAiMove() {
  if (!gameActive) return;
  
  lblAiDecision.textContent = 'Pensando...';
  
  // Minimal delay to let player see their mark and make AI feel natural
  setTimeout(() => {
    if (!gameActive) return;
    
    const startTime = performance.now();
    
    // Choose human and ai labels
    const aiPlayer = currentPlayer;
    const humanPlayer = currentPlayer === 'X' ? 'O' : 'X';
    
    let bestMove;
    nodesSearched = 0;
    
    if (aiDifficulty === 'easy') {
      bestMove = getRandomMove();
      lblAiAlgo.textContent = 'RANDOM CHOICE';
    } else if (aiDifficulty === 'medium') {
      if (Math.random() < 0.5) {
        bestMove = findBestMove(board, aiPlayer, humanPlayer);
        lblAiAlgo.textContent = 'MINIMAX (50%)';
      } else {
        bestMove = getRandomMove();
        lblAiAlgo.textContent = 'RANDOM (50%)';
      }
    } else {
      bestMove = findBestMove(board, aiPlayer, humanPlayer);
      lblAiAlgo.textContent = 'MINIMAX + ALPHA-BETA';
    }
    
    const calcTime = (performance.now() - startTime).toFixed(1);
    
    // Update AI stats
    lblNodesSearched.textContent = nodesSearched;
    lblCalcTime.textContent = `${calcTime} ms`;
    
    const row = Math.floor(bestMove / 3) + 1;
    const col = (bestMove % 3) + 1;
    lblAiDecision.textContent = `Lin ${row}, Col ${col}`;
    
    makeMove(bestMove);
  }, 350);
}

function triggerSimulationStep() {
  if (!gameActive || gameMode !== 'sim') return;

  const delayMap = {
    'slow': 1000,
    'normal': 500,
    'fast': 150,
    'hyper': 10
  };

  simTimeoutId = setTimeout(() => {
    if (!gameActive || gameMode !== 'sim') return;

    const startTime = performance.now();
    const aiPlayer = currentPlayer;
    const humanPlayer = currentPlayer === 'X' ? 'O' : 'X';
    
    lblAiAlgo.textContent = 'MINIMAX + ALPHA-BETA';
    nodesSearched = 0;
    
    const bestMove = findBestMove(board, aiPlayer, humanPlayer);
    
    const calcTime = (performance.now() - startTime).toFixed(1);
    lblNodesSearched.textContent = nodesSearched;
    lblCalcTime.textContent = `${calcTime} ms`;
    
    const row = Math.floor(bestMove / 3) + 1;
    const col = (bestMove % 3) + 1;
    lblAiDecision.textContent = `${currentPlayer}: L${row} C${col}`;

    makeMove(bestMove);

    // If game is still active, schedule next simulation turn
    if (gameActive) {
      triggerSimulationStep();
    }
  }, delayMap[simSpeed] || 500);
}

/**
 * Minimax AI Search Algorithms
 */

function getAvailableMoves(b) {
  const moves = [];
  for (let i = 0; i < 9; i++) {
    if (b[i] === null) moves.push(i);
  }
  return moves;
}

function getRandomMove() {
  const moves = getAvailableMoves(board);
  return moves[Math.floor(Math.random() * moves.length)];
}

function findBestMove(b, ai, human) {
  let bestVal = -Infinity;
  let bestMove = -1;
  const moves = getAvailableMoves(b);
  
  // Fresh board opening speedup & variety
  if (moves.length === 9) {
    const cornersAndCenter = [0, 2, 4, 6, 8];
    return cornersAndCenter[Math.floor(Math.random() * cornersAndCenter.length)];
  }

  for (let move of moves) {
    b[move] = ai;
    let moveVal = minimax(b, 0, false, -Infinity, Infinity, ai, human);
    b[move] = null;
    
    if (moveVal > bestVal) {
      bestVal = moveVal;
      bestMove = move;
    }
  }
  return bestMove;
}

function minimax(tempBoard, depth, isMax, alpha, beta, aiPlayer, humanPlayer) {
  nodesSearched++;
  
  const score = evaluateBoard(tempBoard, aiPlayer, humanPlayer);
  if (score === 10) return score - depth; // Win fast
  if (score === -10) return score + depth; // Delay defeat
  if (getAvailableMoves(tempBoard).length === 0) return 0;
  
  const moves = getAvailableMoves(tempBoard);
  
  if (isMax) {
    let maxEval = -Infinity;
    for (let move of moves) {
      tempBoard[move] = aiPlayer;
      let evaluation = minimax(tempBoard, depth + 1, false, alpha, beta, aiPlayer, humanPlayer);
      tempBoard[move] = null;
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break; // Alpha-Beta pruning
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let move of moves) {
      tempBoard[move] = humanPlayer;
      let evaluation = minimax(tempBoard, depth + 1, true, alpha, beta, aiPlayer, humanPlayer);
      tempBoard[move] = null;
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break; // Alpha-Beta pruning
    }
    return minEval;
  }
}

function evaluateBoard(b, ai, human) {
  // Check rows
  for (let i = 0; i < 9; i += 3) {
    if (b[i] && b[i] === b[i+1] && b[i] === b[i+2]) {
      return b[i] === ai ? 10 : -10;
    }
  }
  // Check cols
  for (let i = 0; i < 3; i++) {
    if (b[i] && b[i] === b[i+3] && b[i] === b[i+6]) {
      return b[i] === ai ? 10 : -10;
    }
  }
  // Diagonals
  if (b[0] && b[0] === b[4] && b[0] === b[8]) {
    return b[0] === ai ? 10 : -10;
  }
  if (b[2] && b[2] === b[4] && b[2] === b[6]) {
    return b[2] === ai ? 10 : -10;
  }
  return 0;
}

function checkWin(b) {
  for (let c of WINNING_COMBOS) {
    const [p1, p2, p3] = c.combo;
    if (b[p1] && b[p1] === b[p2] && b[p1] === b[p3]) {
      return { winner: b[p1], lineCombo: c };
    }
  }
  return null;
}

function checkDraw(b) {
  return b.every(cell => cell !== null);
}

/**
 * Handle game over states, animation, score submission
 */
function handleGameOver(winner, winningLineCombo) {
  gameActive = false;
  
  if (simTimeoutId) {
    clearTimeout(simTimeoutId);
    simTimeoutId = null;
  }

  const modalIcon = document.getElementById('gameover-status-icon');
  const modalHeading = document.getElementById('gameover-heading');
  const modalMessage = document.getElementById('gameover-message');
  const sumMode = document.getElementById('sum-mode');
  const sumResult = document.getElementById('sum-result');
  const sumStreak = document.getElementById('sum-streak');

  // Fill modal basics
  sumMode.textContent = gameMode.toUpperCase();

  if (winner === 'draw') {
    audio.playDraw();
    scoreDraws++;
    winStreak = 0;
    
    modalIcon.textContent = '🤝';
    modalHeading.textContent = 'Empate!';
    modalMessage.textContent = 'Uma partida equilibrada até o final.';
    sumResult.textContent = 'EMPATE';
    
    lblScoreDraws.textContent = scoreDraws;
    lblScoreStreak.textContent = winStreak;

    if (gameMode === 'ai') {
      postServerScore('draw');
    }
  } else {
    // Winner exists (X or O)
    drawWinningLine(winningLineCombo.line);

    // Apply win-highlight class to cells
    winningLineCombo.combo.forEach(idx => {
      document.getElementById(`cell-${idx}`).classList.add('win-highlight');
    });

    if (gameMode === 'ai') {
      const isPlayerWinner = (starter === 'player' && winner === 'X') || (starter === 'ai' && winner === 'O');
      
      if (isPlayerWinner) {
        audio.playWin();
        scoreWins++;
        winStreak++;
        
        modalIcon.textContent = '🏆';
        modalHeading.textContent = 'Você Venceu!';
        modalMessage.textContent = 'Excelente vitória estratégica contra o algoritmo.';
        sumResult.textContent = 'VITÓRIA';
        
        postServerScore('win');
      } else {
        // AI wins (Player lost)
        audio.playLoss();
        scoreLosses++;
        winStreak = 0;
        
        // Shake board frame on defeat
        document.getElementById('board-frame').classList.add('shake-anim');
        setTimeout(() => {
          document.getElementById('board-frame').classList.remove('shake-anim');
        }, 400);

        modalIcon.textContent = '💀';
        modalHeading.textContent = 'Você Perdeu!';
        modalMessage.textContent = 'A Inteligência Artificial calculou sua derrota.';
        sumResult.textContent = 'DERROTA';
        
        postServerScore('loss');
      }
      
      lblScoreWins.textContent = scoreWins;
      lblScoreLosses.textContent = scoreLosses;
      lblScoreStreak.textContent = winStreak;
    } else if (gameMode === 'pvp') {
      audio.playWin();
      scoreWins++; // Just track raw wins/losses session counters
      modalIcon.textContent = '🎉';
      modalHeading.textContent = `Vitória de ${winner}!`;
      modalMessage.textContent = `Jogador ${winner} fechou a linha primeiro.`;
      sumResult.textContent = `VITÓRIA DO JOGADOR ${winner}`;
      
      lblScoreWins.textContent = scoreWins;
    } else {
      // Simulation: watch only
      audio.playDraw(); // neutral chord
      modalIcon.textContent = '🤖';
      modalHeading.textContent = `Simulação Concluída!`;
      modalMessage.textContent = `A Inteligência Artificial ${winner} venceu a rodada.`;
      sumResult.textContent = `VITÓRIA DA IA ${winner}`;
    }
  }

  sumStreak.textContent = winStreak;

  // Show Modal after a slight delay
  setTimeout(() => {
    modalGameOver.classList.remove('hidden');
  }, 1000);
}

function drawWinningLine(lineCoords) {
  const { x1, y1, x2, y2 } = lineCoords;
  winningLine.setAttribute('x1', x1);
  winningLine.setAttribute('y1', y1);
  winningLine.setAttribute('x2', x2);
  winningLine.setAttribute('y2', y2);

  // Animate line stroke
  const strokeColor = getComputedStyle(document.body).getPropertyValue('--theme-x-color').trim() || '#f43f5e';
  winningLine.setAttribute('stroke', strokeColor);
  
  // Line length calculation for stroke animation
  const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  winningLine.setAttribute('stroke-dasharray', length);
  winningLine.setAttribute('stroke-dashoffset', length);
  
  // Force reflow
  winningLine.getBoundingClientRect();
  winningLine.setAttribute('stroke-dashoffset', 0);
}

/**
 * Server.py Database API Integration
 */

async function loadServerScores() {
  const statusEl = document.getElementById('api-status');
  try {
    const res = await fetch('/api/score?game=tictactoe');
    if (res.ok) {
      const data = await res.json();
      valRecordWins.textContent = data.vitorias;
      valRecordLosses.textContent = data.derrotas;
      valRecordDraws.textContent = data.empates;
      
      statusEl.textContent = 'API CONECTADA';
      statusEl.parentElement.querySelector('.dot').className = 'dot pulse';
    } else {
      throw new Error();
    }
  } catch (err) {
    statusEl.textContent = 'SEM API (OFFLINE)';
    statusEl.parentElement.querySelector('.dot').className = 'dot';
  }
}

async function postServerScore(result) {
  try {
    await fetch('/api/score?game=tictactoe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: result })
    });
    loadServerScores();
  } catch (err) {
    console.error('Failed to post score.', err);
  }
}

async function resetServerScores() {
  try {
    await fetch('/api/score?game=tictactoe', { method: 'DELETE' });
    loadServerScores();
  } catch (err) {
    console.error('Failed to delete scores.', err);
  }
}
