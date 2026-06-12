/**
 * App - Connects UI components with ChessEngine and ChessSounds.
 * Handles game state flow, theme changes, scoreboard API, right-click arrows,
 * drag-and-drop, piece animations, confetti effects, PGN export, and chess timer.
 */

let game = null;
let selectedSquare = null;
let activeLegalMovesForSelected = [];
let lastMove = null;
let isCpuThinking = false;
let userColor = 'w';
let gameMode = 'vs-cpu';
let activePromotionMove = null;
let hintTimeout = null;
let isGameActive = false;
let isAnimating = false;

let timerEnabled = false;
let timerWhite = 0; // milliseconds
let timerBlack = 0;
let timerIncrement = 0; // Fischer increment in ms
let timerInterval = null;
let timerLastTick = null;

let rightClickStartSquare = null;
let arrowsList = []; // Holds list of { from, to } keys to avoid duplicates

const boardEl = document.getElementById('board');
const arrowsOverlay = document.getElementById('board-arrows');
const themeSelect = document.getElementById('theme-select');
const modeSelect = document.getElementById('mode-select');
const difficultySelect = document.getElementById('difficulty-select');
const colorSelect = document.getElementById('color-select');
const pieceThemeSelect = document.getElementById('piece-theme-select');
const muteBtn = document.getElementById('mute-btn');
const soundOnIcon = document.getElementById('sound-on-icon');
const soundOffIcon = document.getElementById('sound-off-icon');

const setupSection = document.getElementById('setup-section');
const activeGameSection = document.getElementById('active-game-section');
const historySection = document.getElementById('history-section');
const startGameBtn = document.getElementById('start-game-btn');
const resignBtn = document.getElementById('resign-btn');

const undoBtn = document.getElementById('undo-btn');
const hintBtn = document.getElementById('hint-btn');
const evalWhiteBar = document.getElementById('eval-white-bar');
const evalBlackBar = document.getElementById('eval-black-bar');
const evalScoreText = document.getElementById('eval-score-text');
const opponentStatus = document.getElementById('opponent-status');
const opponentName = document.getElementById('opponent-name');
const playerStatus = document.getElementById('player-status');
const playerName = document.getElementById('player-name');
const playerCaptured = document.getElementById('player-captured');
const opponentCaptured = document.getElementById('opponent-captured');
const moveHistoryLog = document.getElementById('move-history-log');
const emptyHistoryMsg = document.getElementById('empty-history-msg');
const gameStatusLabel = document.getElementById('game-status-label');
const promotionModal = document.getElementById('promotion-modal');

const gameOverModal = document.getElementById('game-over-modal');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverDesc = document.getElementById('game-over-desc');
const gameOverIconBox = document.getElementById('game-over-icon-box');
const modalRestartBtn = document.getElementById('modal-restart-btn');
const modalCloseBtn = document.getElementById('modal-close-btn');

/**
 * Clean Chess Notation Generator
 */
function getMoveNotation(move, isCheck, isCheckmate) {
  if (move.type === 'castling') {
    const castle = move.to.c === 6 ? 'O-O' : 'O-O-O';
    return castle + (isCheckmate ? '#' : isCheck ? '+' : '');
  }
  
  let pieceStr = '';
  if (move.piece.type !== 'p') {
    pieceStr = move.piece.type.toUpperCase();
  }
  
  const fromFile = String.fromCharCode(97 + move.from.c);
  const toFile = String.fromCharCode(97 + move.to.c);
  const toRank = 8 - move.to.r;
  
  let capStr = '';
  if (move.captured) {
    capStr = 'x';
    if (move.piece.type === 'p') {
      pieceStr = fromFile;
    }
  }
  
  let promoStr = '';
  if (move.type === 'promotion') {
    promoStr = '=' + move.promotionPiece.toUpperCase();
  }
  
  let suffix = '';
  if (isCheckmate) suffix = '#';
  else if (isCheck) suffix = '+';
  
  return pieceStr + capStr + toFile + toRank + promoStr + suffix;
}

/**
 * Renders file/rank coordinates dynamically based on board flip
 */
function updateCoordinatesDOM() {
  const coordY = document.querySelector('.board-coordinates-y');
  const coordX = document.querySelector('.board-coordinates-x');
  
  if (userColor === 'b') {
    coordY.innerHTML = '<span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span>';
    coordX.innerHTML = '<span>h</span><span>g</span><span>f</span><span>e</span><span>d</span><span>c</span><span>b</span><span>a</span>';
  } else {
    coordY.innerHTML = '<span>8</span><span>7</span><span>6</span><span>5</span><span>4</span><span>3</span><span>2</span><span>1</span>';
    coordX.innerHTML = '<span>a</span><span>b</span><span>c</span><span>d</span><span>e</span><span>f</span><span>g</span><span>h</span>';
  }
}

/**
 * Initializes the chess board layout
 */
function initBoardDOM() {
  boardEl.innerHTML = '';
  
  if (userColor === 'b') {
    boardEl.classList.add('flipped');
    arrowsOverlay.classList.add('flipped');
  } else {
    boardEl.classList.remove('flipped');
    arrowsOverlay.classList.remove('flipped');
  }
  
  updateCoordinatesDOM();
  clearArrows();

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const square = document.createElement('div');
      square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
      square.dataset.row = r;
      square.dataset.col = c;
      
      square.addEventListener('mousedown', (e) => {
        if (e.button === 0) handleSquareMouseDown(r, c);
      });
      square.addEventListener('mouseup', (e) => {
        if (e.button === 0) handleSquareMouseUp(r, c);
      });
      
      square.addEventListener('contextmenu', (e) => e.preventDefault());
      
      boardEl.appendChild(square);
    }
  }

  // Setup right-click drag events on the board container once
  setupRightClickArrowHandlers();
  
  // Setup HTML5 Drag and Drop event delegation
  setupDragAndDropHandlers();
}

/**
 * Renders board state and highlights
 */
function updateBoardDOM() {
  const squares = boardEl.querySelectorAll('.square');
  const checkColor = game.isInCheck(game.turn) ? game.turn : null;
  const kingPos = checkColor ? game.findKing(checkColor) : null;

  squares.forEach(sq => {
    const r = parseInt(sq.dataset.row);
    const c = parseInt(sq.dataset.col);
    
    const rightClicked = sq.classList.contains('right-clicked');
    
    sq.innerHTML = '';
    sq.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
    if (rightClicked) sq.classList.add('right-clicked');
    
    const piece = game.getPiece(r, c);
    if (piece) {
      sq.innerHTML = getPieceSVG(piece.type, piece.color);
    }

    if (selectedSquare && selectedSquare.r === r && selectedSquare.c === c) {
      sq.classList.add('selected');
    }

    if (lastMove && (
      (lastMove.from.r === r && lastMove.from.c === c) || 
      (lastMove.to.r === r && lastMove.to.c === c)
    )) {
      sq.classList.add('prev-move');
    }

    if (kingPos && kingPos.r === r && kingPos.c === c) {
      sq.classList.add('in-check');
    }

    const move = activeLegalMovesForSelected.find(m => m.to.r === r && m.to.c === c);
    if (move) {
      const marker = document.createElement('div');
      if (move.captured) {
        marker.className = 'capture-marker';
      } else {
        marker.className = 'move-marker';
      }
      sq.appendChild(marker);
    }
  });

  // Update evaluation bar
  updateEvaluationBar();

  // Update Stats & Panels
  updateGamePanelStatus();
  updateCapturedPieces();
  updateHistoryLog();
}

/**
 * Updates selected state and move/capture indicators on existing squares without rebuilding SVGs.
 * This prevents active HTML5 drag-and-drop operations from being cancelled by DOM removal.
 */
function highlightMoveSuggestions() {
  const squares = boardEl.querySelectorAll('.square');
  squares.forEach(sq => {
    const r = parseInt(sq.dataset.row);
    const c = parseInt(sq.dataset.col);
    
    if (selectedSquare && selectedSquare.r === r && selectedSquare.c === c) {
      sq.classList.add('selected');
    } else {
      sq.classList.remove('selected');
    }

    const marker = sq.querySelector('.move-marker, .capture-marker');
    if (marker) {
      marker.remove();
    }

    const move = activeLegalMovesForSelected.find(m => m.to.r === r && m.to.c === c);
    if (move) {
      const newMarker = document.createElement('div');
      if (move.captured) {
        newMarker.className = 'capture-marker';
      } else {
        newMarker.className = 'move-marker';
      }
      sq.appendChild(newMarker);
    }
  });
}

/**
 * Evaluation bar calculation: supports vertical (desktop) and horizontal (mobile) sizes
 */
function updateEvaluationBar() {
  const score = evaluateBoard(game);
  const scoreVal = score / 100;
  
  const clamped = Math.max(-10, Math.min(10, scoreVal));
  const whitePercent = ((clamped + 10) / 20) * 100;
  const blackPercent = 100 - whitePercent;

  const isMobile = window.innerWidth <= 1024;
  if (isMobile) {
    evalBlackBar.style.width = `${blackPercent}%`;
    evalBlackBar.style.height = '100%';
    evalWhiteBar.style.width = `${whitePercent}%`;
    evalWhiteBar.style.height = '100%';
    
    const labelLeft = Math.max(12, Math.min(88, blackPercent));
    evalScoreText.style.left = `${labelLeft}%`;
    evalScoreText.style.top = '50%';
  } else {
    evalBlackBar.style.height = `${blackPercent}%`;
    evalBlackBar.style.width = '100%';
    evalWhiteBar.style.height = `${whitePercent}%`;
    evalWhiteBar.style.width = '100%';
    
    const labelTop = Math.max(12, Math.min(88, blackPercent));
    evalScoreText.style.top = `${labelTop}%`;
    evalScoreText.style.left = '50%';
  }

  if (Math.abs(scoreVal) < 0.1) {
    evalScoreText.innerText = '0.0';
  } else {
    const sign = scoreVal > 0 ? '+' : '';
    evalScoreText.innerText = `${sign}${scoreVal.toFixed(1)}`;
  }
}

window.addEventListener('resize', updateEvaluationBar);

/**
 * Handle user clicks on squares
 */
let leftClickStartSquare = null;
let wasAlreadySelected = false;

/**
 * Handle left click mousedown on squares to initiate dragging or selection
 */
function handleSquareMouseDown(r, c) {
  if (isCpuThinking) return;
  
  // Clear any right-click outlines/arrows
  clearArrows();
  clearRightClickHighlights();

  const status = game.getGameStatus();
  if (status !== 'active') return;

  clearHintHighlights();

  const piece = game.getPiece(r, c);
  const isSelectMove = activeLegalMovesForSelected.some(m => m.to.r === r && m.to.c === c);

  if (isSelectMove) {
    const move = activeLegalMovesForSelected.find(m => m.to.r === r && m.to.c === c);
    executeHumanMove(move);
    leftClickStartSquare = null;
  } else if (piece && piece.color === game.turn) {
    leftClickStartSquare = { r, c };
    if (selectedSquare && selectedSquare.r === r && selectedSquare.c === c) {
      wasAlreadySelected = true;
    } else {
      wasAlreadySelected = false;
      selectedSquare = { r, c };
      activeLegalMovesForSelected = game.getLegalMoves(game.turn).filter(
        m => m.from.r === r && m.from.c === c
      );
      highlightMoveSuggestions();
    }
  } else {
    leftClickStartSquare = null;
    selectedSquare = null;
    activeLegalMovesForSelected = [];
    highlightMoveSuggestions();
  }
}

/**
 * Handle left click mouseup on squares to complete dragging or selection toggles
 */
function handleSquareMouseUp(r, c) {
  if (isCpuThinking) return;
  
  const isSelectMove = activeLegalMovesForSelected.some(m => m.to.r === r && m.to.c === c);
  if (isSelectMove && !leftClickStartSquare) {
    return;
  }

  if (leftClickStartSquare) {
    const start = leftClickStartSquare;
    leftClickStartSquare = null;

    if (start.r === r && start.c === c) {
      if (wasAlreadySelected) {
        selectedSquare = null;
        activeLegalMovesForSelected = [];
        highlightMoveSuggestions();
      }
    } else {
      const move = activeLegalMovesForSelected.find(
        m => m.from.r === start.r && m.from.c === start.c && m.to.r === r && m.to.c === c
      );
      if (move) {
        executeHumanMove(move);
      } else {
        selectedSquare = null;
        activeLegalMovesForSelected = [];
        highlightMoveSuggestions();
      }
    }
  }
}

/**
 * HTML5 Drag & Drop event listener setup
 */
function setupDragAndDropHandlers() {
  boardEl.addEventListener('dragstart', (e) => {
    if (isCpuThinking) {
      e.preventDefault();
      return;
    }
    const piece = e.target.closest('.piece-svg');
    if (!piece) return;

    const sq = piece.closest('.square');
    const r = parseInt(sq.dataset.row);
    const c = parseInt(sq.dataset.col);
    
    // Only allow dragging own turn pieces
    const boardPiece = game.getPiece(r, c);
    if (!boardPiece || boardPiece.color !== game.turn) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.setData('text/plain', JSON.stringify({ r, c }));
    e.dataTransfer.effectAllowed = 'move';
    
    selectedSquare = { r, c };
    activeLegalMovesForSelected = game.getLegalMoves(game.turn).filter(
      m => m.from.r === r && m.from.c === c
    );
    highlightMoveSuggestions();
  });

  boardEl.addEventListener('dragover', (e) => {
    const sq = e.target.closest('.square');
    if (sq) {
      const r = parseInt(sq.dataset.row);
      const c = parseInt(sq.dataset.col);
      const isValid = activeLegalMovesForSelected.some(m => m.to.r === r && m.to.c === c);
      if (isValid) {
        e.preventDefault(); // Standard drop permission
      }
    }
  });

  boardEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const sq = e.target.closest('.square');
    if (!sq) return;

    const targetR = parseInt(sq.dataset.row);
    const targetC = parseInt(sq.dataset.col);
    
    let sourceR = null;
    let sourceC = null;
    try {
      const startData = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (startData) {
        sourceR = startData.r;
        sourceC = startData.c;
      }
    } catch(err) {
      // Fallback
    }

    if (sourceR === null && selectedSquare) {
      sourceR = selectedSquare.r;
      sourceC = selectedSquare.c;
    }

    if (sourceR !== null) {
      const move = activeLegalMovesForSelected.find(
        m => m.from.r === sourceR && m.from.c === sourceC && m.to.r === targetR && m.to.c === targetC
      );
      if (move) {
        executeHumanMove(move);
      }
    }
    
    selectedSquare = null;
    activeLegalMovesForSelected = [];
    updateBoardDOM();
  });

  boardEl.addEventListener('dragend', () => {
    // If drop was cancelled, we refresh
    setTimeout(() => {
      if (!isCpuThinking) {
        selectedSquare = null;
        activeLegalMovesForSelected = [];
        highlightMoveSuggestions();
      }
    }, 100);
  });
}

/**
 * Right Click Arrow Drawing & Highlighting Event Handlers
 */
function setupRightClickArrowHandlers() {
  boardEl.addEventListener('mousedown', (e) => {
    if (e.button === 2) { // Right Click
      e.preventDefault();
      const sq = e.target.closest('.square');
      if (sq) {
        rightClickStartSquare = {
          r: parseInt(sq.dataset.row),
          c: parseInt(sq.dataset.col)
        };
      }
    }
  });

  boardEl.addEventListener('mouseup', (e) => {
    if (e.button === 2) { // Right Click
      e.preventDefault();
      const sq = e.target.closest('.square');
      if (sq && rightClickStartSquare) {
        const endSquare = {
          r: parseInt(sq.dataset.row),
          c: parseInt(sq.dataset.col)
        };
        
        if (rightClickStartSquare.r === endSquare.r && rightClickStartSquare.c === endSquare.c) {
          sq.classList.toggle('right-clicked');
        } else {
          drawVectorArrow(rightClickStartSquare, endSquare);
        }
      }
      rightClickStartSquare = null;
    }
  });
}

function drawVectorArrow(start, end) {
  // Center coordinates on 8x8 viewBox mapping
  const x1 = start.c + 0.5;
  const y1 = start.r + 0.5;
  const x2 = end.c + 0.5;
  const y2 = end.r + 0.5;

  const key = `${start.r},${start.c}->${end.r},${end.c}`;
  
  const existingIndex = arrowsList.findIndex(a => a.key === key);
  if (existingIndex !== -1) {
    arrowsList.splice(existingIndex, 1);
    redrawArrowsOverlay();
    return;
  }

  arrowsList.push({ key, x1, y1, x2, y2 });
  redrawArrowsOverlay();
}

function redrawArrowsOverlay() {
  const defs = arrowsOverlay.querySelector('defs');
  arrowsOverlay.innerHTML = '';
  arrowsOverlay.appendChild(defs);

  arrowsList.forEach(arrow => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', arrow.x1);
    line.setAttribute('y1', arrow.y1);
    line.setAttribute('x2', arrow.x2);
    line.setAttribute('y2', arrow.y2);
    arrowsOverlay.appendChild(line);
  });
}

function clearArrows() {
  arrowsList = [];
  redrawArrowsOverlay();
}

function clearRightClickHighlights() {
  const squares = boardEl.querySelectorAll('.square');
  squares.forEach(sq => sq.classList.remove('right-clicked'));
}

/**
 * Performs a human move, handles promotion checks and AI turns
 */
function executeHumanMove(move) {
  selectedSquare = null;
  activeLegalMovesForSelected = [];
  
  if (!isGameActive) {
    setGameActiveUI(true);
  }

  if (move.type === 'promotion') {
    activePromotionMove = move;
    openPromotionModal();
    return;
  }

  animatePieceMove(move, () => {
    game.makeMove(move);
    lastMove = move;
    
    if (move.captured) {
      ChessSounds.playCapture();
    } else {
      ChessSounds.playMove();
    }

    if (timerEnabled) {
      if (game.turn === 'b') { // White just moved
        timerWhite += timerIncrement;
      } else {
        timerBlack += timerIncrement;
      }
      timerLastTick = Date.now();
      updateTimerDisplay();
    }

    const isCheck = game.isInCheck(game.turn);
    const status = game.getGameStatus();
    const isCheckmate = status === 'checkmate';
    move.notation = getMoveNotation(move, isCheck, isCheckmate);

    updateBoardDOM();
    
    if (status !== 'active') {
      handleGameOver(status);
      return;
    } else if (isCheck) {
      ChessSounds.playCheck();
    }

    // Trigger CPU move if CPU turn
    if (gameMode === 'vs-cpu' && game.turn !== userColor) {
      triggerCpuMove();
    }
  });
}

/**
 * Animates a piece sliding from one square to another.
 */
function animatePieceMove(move, callback) {
  const fromSq = boardEl.querySelector(`.square[data-row='${move.from.r}'][data-col='${move.from.c}']`);
  const toSq = boardEl.querySelector(`.square[data-row='${move.to.r}'][data-col='${move.to.c}']`);
  
  if (!fromSq || !toSq) {
    callback();
    return;
  }

  const pieceSvg = fromSq.querySelector('.piece-svg');
  if (!pieceSvg) {
    callback();
    return;
  }

  isAnimating = true;

  const fromRect = fromSq.getBoundingClientRect();
  const toRect = toSq.getBoundingClientRect();
  const deltaX = toRect.left - fromRect.left;
  const deltaY = toRect.top - fromRect.top;

  // Account for board flip
  const isFlipped = boardEl.classList.contains('flipped');
  const dx = isFlipped ? -deltaX : deltaX;
  const dy = isFlipped ? -deltaY : deltaY;

  pieceSvg.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  pieceSvg.style.transform = `translate(${dx}px, ${dy}px)`;
  pieceSvg.style.zIndex = '50';
  pieceSvg.style.position = 'relative';

  // If capturing, add a shake effect to the target square
  if (move.captured) {
    setTimeout(() => {
      toSq.classList.add('capture-shake');
      setTimeout(() => toSq.classList.remove('capture-shake'), 300);
    }, 150);
  }

  setTimeout(() => {
    pieceSvg.style.transition = '';
    pieceSvg.style.transform = '';
    pieceSvg.style.zIndex = '';
    pieceSvg.style.position = '';
    isAnimating = false;
    callback();
  }, 220);
}

/**
 * Creates a confetti explosion effect for victory celebrations.
 */
function launchConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#f43f5e', '#a855f7'];
  const particleCount = 80;

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'confetti-particle';
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.animationDelay = `${Math.random() * 0.6}s`;
    particle.style.animationDuration = `${1.5 + Math.random() * 2}s`;
    
    // Random size
    const size = 4 + Math.random() * 8;
    particle.style.width = `${size}px`;
    particle.style.height = `${size * (Math.random() > 0.5 ? 1 : 0.6)}px`;
    particle.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    
    // Random rotation
    particle.style.setProperty('--rotation', `${Math.random() * 720 - 360}deg`);
    particle.style.setProperty('--drift', `${Math.random() * 200 - 100}px`);
    
    container.appendChild(particle);
  }

  setTimeout(() => container.remove(), 4000);
}

/**
 * Generates PGN (Portable Game Notation) string from the current game.
 */
function generatePGN() {
  const date = new Date();
  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  
  const status = game.getGameStatus();
  let result = '*';
  if (status === 'checkmate') {
    result = game.turn === 'w' ? '0-1' : '1-0';
  } else if (status === 'stalemate' || status === 'draw' || status === 'draw-repetition') {
    result = '1/2-1/2';
  }

  let pgn = '';
  pgn += `[Event "Aether Chess Game"]\n`;
  pgn += `[Site "localhost"]\n`;
  pgn += `[Date "${dateStr}"]\n`;
  pgn += `[White "${userColor === 'w' ? 'Jogador' : 'Aether Bot'}"]\n`;
  pgn += `[Black "${userColor === 'b' ? 'Jogador' : 'Aether Bot'}"]\n`;
  pgn += `[Result "${result}"]\n\n`;

  for (let i = 0; i < movesList.length; i++) {
    if (i % 2 === 0) {
      pgn += `${Math.floor(i / 2) + 1}. `;
    }
    pgn += (movesList[i].notation || '...') + ' ';
  }
  pgn += result;

  return pgn;
}

/**
 * Starts the CPU bot thinking process
 */
function triggerCpuMove() {
  isCpuThinking = true;
  opponentStatus.innerText = 'Processando...';
  opponentStatus.classList.add('pulse');
  undoBtn.disabled = true;
  resignBtn.disabled = true;

  if (!isGameActive) {
    setGameActiveUI(true);
  }

  const depth = parseInt(difficultySelect.value) || 3;

  setTimeout(() => {
    const result = getBestMove(game, depth);
    
    if (!result.move) {
      isCpuThinking = false;
      resignBtn.disabled = false;
      return;
    }

    game.makeMove(result.move);
    lastMove = result.move;
    
    if (result.move.captured) {
      ChessSounds.playCapture();
    } else {
      ChessSounds.playMove();
    }

    if (timerEnabled) {
      if (game.turn === 'w') { // Black (CPU) just moved
        timerBlack += timerIncrement;
      } else {
        timerWhite += timerIncrement;
      }
      timerLastTick = Date.now();
      updateTimerDisplay();
    }

    // Notation
    const isCheck = game.isInCheck(game.turn);
    const status = game.getGameStatus();
    const isCheckmate = status === 'checkmate';
    result.move.notation = getMoveNotation(result.move, isCheck, isCheckmate);

    isCpuThinking = false;
    opponentStatus.classList.remove('pulse');
    undoBtn.disabled = false;
    resignBtn.disabled = false;

    updateBoardDOM();

    if (status !== 'active') {
      handleGameOver(status);
    } else if (isCheck) {
      ChessSounds.playCheck();
    }
  }, 400);
}

/**
 * Game Over flow with Modal Popup and Score update
 */
function handleGameOver(status) {
  let title = 'Fim de Jogo!';
  let desc = 'A partida terminou.';
  let iconHTML = '';
  let iconClass = '';
  let scoreResult = ''; // 'win', 'loss', 'draw'

  if (status === 'checkmate') {
    const isLoss = game.turn === userColor;
    if (gameMode === 'vs-cpu') {
      scoreResult = isLoss ? 'loss' : 'win';
      title = isLoss ? 'Derrota!' : 'Vitória!';
      desc = isLoss ? 'O Aether Bot deu xeque-mate em suas peças.' : 'Parabéns! Você venceu o Aether Bot com um xeque-mate!';
      iconClass = isLoss ? 'loss' : 'win';
    } else {
      title = 'Xeque-mate!';
      desc = `Vitória das peças ${game.turn === 'w' ? 'Pretas' : 'Brancas'}.`;
      iconClass = '';
    }
  } else if (status === 'stalemate') {
    title = 'Empate!';
    desc = 'Empate por afogamento (Stalemate). O jogador não possui movimentos legais.';
    scoreResult = 'draw';
  } else if (status === 'draw') {
    title = 'Empate!';
    desc = 'Empate por material insuficiente ou regra de 50 lances.';
    scoreResult = 'draw';
  } else if (status === 'draw-repetition') {
    title = 'Empate!';
    desc = 'Empate por repetição de três posições (Threefold Repetition).';
    scoreResult = 'draw';
  }

  // Set modal icon SVGs
  if (iconClass === 'win') {
    iconHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
        <circle cx="12" cy="8" r="7"/>
        <path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/>
      </svg>`;
    ChessSounds.playGameOver(true);
    launchConfetti();
  } else if (iconClass === 'loss') {
    iconHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <line x1="9" y1="12" x2="15" y2="12"/>
      </svg>`;
    ChessSounds.playGameOver(false);
  } else {
    iconHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>`;
    ChessSounds.playGameOver(false);
  }

  gameOverTitle.innerText = title;
  gameOverDesc.innerText = desc;
  gameOverIconBox.className = `game-over-icon ${iconClass}`;
  gameOverIconBox.innerHTML = iconHTML;
  gameOverModal.style.display = 'flex';

  // Push score record to server if playing against CPU
  if (gameMode === 'vs-cpu' && scoreResult) {
    submitMatchResult(scoreResult);
  }

  // Re-show setup panel so they can adjust details for next game
  setGameActiveUI(false);
}

/**
 * Scoreboard API Rest Integration
 */
async function fetchScoreboard() {
  try {
    const res = await fetch('/api/score');
    const scores = await res.json();
    document.getElementById('score-wins').innerText = scores.vitorias || 0;
    document.getElementById('score-losses').innerText = scores.derrotas || 0;
    document.getElementById('score-draws').innerText = scores.empates || 0;
  } catch (err) {
    console.error('Falha ao buscar placar local', err);
  }
}

async function submitMatchResult(result) {
  try {
    const res = await fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('score-wins').innerText = data.scores.vitorias;
      document.getElementById('score-losses').innerText = data.scores.derrotas;
      document.getElementById('score-draws').innerText = data.scores.empates;
    }
  } catch (err) {
    console.error('Falha ao gravar resultado localmente', err);
  }
}

/**
 * Collapsible configurations and actions toggle
 */
function setGameActiveUI(active) {
  isGameActive = active;
  if (active) {
    setupSection.style.display = 'none';
    activeGameSection.style.display = 'block';
    historySection.style.display = 'block'; // Always display the history section during an active game to keep layouts balanced
  } else {
    setupSection.style.display = 'block';
    activeGameSection.style.display = 'none';
    historySection.style.display = 'none';
  }
}

/**
 * UI State Refreshers
 */
function updateGamePanelStatus() {
  const status = game.getGameStatus();
  
  if (status === 'active') {
    if (game.turn === userColor) {
      playerStatus.innerText = 'Sua vez';
      opponentStatus.innerText = 'Aguardando...';
      gameStatusLabel.innerText = 'Em andamento';
    } else {
      playerStatus.innerText = 'Aguardando...';
      opponentStatus.innerText = gameMode === 'vs-cpu' ? 'Processando...' : 'Vez do oponente';
      gameStatusLabel.innerText = 'Em andamento';
    }
  } else if (status === 'checkmate') {
    const winner = game.turn === 'w' ? 'Pretas' : 'Brancas';
    gameStatusLabel.innerText = `Xequemate! Vitória das ${winner}`;
    playerStatus.innerText = game.turn === userColor ? 'Derrota!' : 'Vitória!';
    opponentStatus.innerText = game.turn === userColor ? 'Vitória!' : 'Derrota!';
  } else {
    gameStatusLabel.innerText = status === 'stalemate' ? 'Empate (Afogamento)' : 'Empate (Técnico)';
    playerStatus.innerText = 'Empate';
    opponentStatus.innerText = 'Empate';
  }
}

function updateCapturedPieces() {
  if (!playerCaptured || !opponentCaptured) return;

  playerCaptured.innerHTML = '';
  opponentCaptured.innerHTML = '';

  const startingCounts = {
    w: { p: 8, n: 2, b: 2, r: 2, q: 1 },
    b: { p: 8, n: 2, b: 2, r: 2, q: 1 }
  };

  const currentCounts = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
  };

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = game.getPiece(r, c);
      if (piece && piece.type !== 'k') {
        currentCounts[piece.color][piece.type]++;
      }
    }
  }

  // Pieces scores tally weights
  const weights = { q: 9, r: 5, b: 3, n: 3, p: 1 };
  const order = ['q', 'r', 'b', 'n', 'p'];

  const whiteCapturedList = [];
  order.forEach(type => {
    const diff = startingCounts.w[type] - currentCounts.w[type];
    for (let i = 0; i < diff; i++) {
      whiteCapturedList.push({ type, color: 'w', value: weights[type] });
    }
  });

  const blackCapturedList = [];
  order.forEach(type => {
    const diff = startingCounts.b[type] - currentCounts.b[type];
    for (let i = 0; i < diff; i++) {
      blackCapturedList.push({ type, color: 'b', value: weights[type] });
    }
  });

  const playerCapturedPieces = [];
  const opponentCapturedPieces = [];
  let playerCapturedScore = 0;
  let opponentCapturedScore = 0;

  if (userColor === 'w') {
    // Player is White, has captured Black pieces
    blackCapturedList.forEach(item => {
      playerCapturedPieces.push(item);
      playerCapturedScore += item.value;
    });
    // Opponent is Black, has captured White pieces
    whiteCapturedList.forEach(item => {
      opponentCapturedPieces.push(item);
      opponentCapturedScore += item.value;
    });
  } else {
    // Player is Black, has captured White pieces
    whiteCapturedList.forEach(item => {
      playerCapturedPieces.push(item);
      playerCapturedScore += item.value;
    });
    // Opponent is White, has captured Black pieces
    blackCapturedList.forEach(item => {
      opponentCapturedPieces.push(item);
      opponentCapturedScore += item.value;
    });
  }

  // Draw player captured pieces
  playerCapturedPieces.forEach(item => {
    const pieceSVG = getPieceSVG(item.type, item.color);
    const div = document.createElement('div');
    div.className = 'captured-img';
    div.innerHTML = pieceSVG;
    playerCaptured.appendChild(div);
  });

  // Draw opponent captured pieces
  opponentCapturedPieces.forEach(item => {
    const pieceSVG = getPieceSVG(item.type, item.color);
    const div = document.createElement('div');
    div.className = 'captured-img';
    div.innerHTML = pieceSVG;
    opponentCaptured.appendChild(div);
  });

  // Display score difference badge
  const scoreDiffVal = playerCapturedScore - opponentCapturedScore;
  if (scoreDiffVal > 0) {
    const badge = document.createElement('span');
    badge.className = 'score-diff plus';
    badge.innerText = `+${scoreDiffVal}`;
    playerCaptured.appendChild(badge);
  } else if (scoreDiffVal < 0) {
    const badge = document.createElement('span');
    badge.className = 'score-diff plus';
    badge.innerText = `+${Math.abs(scoreDiffVal)}`;
    opponentCaptured.appendChild(badge);
  }
}

// Separate move log tracker to populate history UI correctly
let movesList = [];

// Override history updates to keep movesList in sync
const originalMakeMove = ChessGame.prototype.makeMove;
ChessGame.prototype.makeMove = function(move) {
  originalMakeMove.call(this, move);
  movesList.push(move);
};

const originalUndoMove = ChessGame.prototype.undoMove;
ChessGame.prototype.undoMove = function() {
  const ok = originalUndoMove.call(this);
  if (ok) {
    movesList.pop();
  }
  return ok;
};

function updateHistoryLog() {
  moveHistoryLog.innerHTML = '';
  
  if (movesList.length === 0) {
    moveHistoryLog.appendChild(emptyHistoryMsg);
    emptyHistoryMsg.style.display = 'block';
    undoBtn.disabled = true;
    return;
  } else {
    emptyHistoryMsg.style.display = 'none';
    undoBtn.disabled = false;
  }

  for (let i = 0; i < movesList.length; i += 2) {
    const roundNum = Math.floor(i / 2) + 1;
    const whiteMove = movesList[i];
    const blackMove = movesList[i + 1];

    const row = document.createElement('div');
    row.className = 'history-row';

    const roundSpan = document.createElement('span');
    roundSpan.className = 'history-round';
    roundSpan.innerText = `${roundNum}.`;
    row.appendChild(roundSpan);

    const whiteSpan = document.createElement('span');
    whiteSpan.innerText = whiteMove ? (whiteMove.notation || '...') : '';
    row.appendChild(whiteSpan);

    const blackSpan = document.createElement('span');
    blackSpan.innerText = blackMove ? (blackMove.notation || '...') : '';
    row.appendChild(blackSpan);

    moveHistoryLog.appendChild(row);
  }

  moveHistoryLog.scrollTop = moveHistoryLog.scrollHeight;
}

/**
 * Controller Button Event Listeners
 */

// Reset/New Game
function startNewGame(isActive = false) {
  gameOverModal.style.display = 'none';
  clearHintHighlights();
  clearArrows();
  clearRightClickHighlights();

  // Determine user color
  const selectedColor = colorSelect.value;
  if (selectedColor === 'random') {
    userColor = Math.random() < 0.5 ? 'w' : 'b';
  } else {
    userColor = selectedColor;
  }

  // Update profile panel labels
  if (userColor === 'w') {
    playerName.innerText = 'Você (Brancas)';
    opponentName.innerText = gameMode === 'vs-cpu' ? 'Aether Bot (CPU - Pretas)' : 'Jogador 2 (Pretas)';
  } else {
    playerName.innerText = 'Você (Pretas)';
    opponentName.innerText = gameMode === 'vs-cpu' ? 'Aether Bot (CPU - Brancas)' : 'Jogador 2 (Brancas)';
  }

  game = new ChessGame();
  selectedSquare = null;
  activeLegalMovesForSelected = [];
  lastMove = null;
  movesList = [];
  isCpuThinking = false;
  activePromotionMove = null;

  resignBtn.disabled = false;
  undoBtn.disabled = true;

  setGameActiveUI(isActive);
  initBoardDOM();
  updateBoardDOM();
  ChessSounds.playStart();
}

// Button Bindings
startGameBtn.addEventListener('click', () => {
  startNewGame(true);
  
  // If playing vs CPU and user is Black, CPU plays first (White)
  if (gameMode === 'vs-cpu' && userColor === 'b') {
    triggerCpuMove();
  }
});

// Abandon/Resign button
resignBtn.addEventListener('click', () => {
  if (isCpuThinking) return;
  
  const confirmResign = confirm("Tem certeza de que deseja abandonar a partida? Será gravada uma derrota.");
  if (confirmResign) {
    if (gameMode === 'vs-cpu') {
      submitMatchResult('loss');
    }
    // Show game over overlay manually
    gameOverTitle.innerText = 'Derrota por Abandono!';
    gameOverDesc.innerText = 'Você abandonou a partida. Vitória do Aether Bot.';
    gameOverIconBox.className = 'game-over-icon loss';
    gameOverIconBox.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>
      </svg>`;
    gameOverModal.style.display = 'flex';
    ChessSounds.playGameOver(false);
    setGameActiveUI(false);
  }
});

modalRestartBtn.addEventListener('click', () => startNewGame(true));

// Closes the game-over popup without starting a new game (allows inspection of final board)
modalCloseBtn.addEventListener('click', () => {
  gameOverModal.style.display = 'none';
  setGameActiveUI(false); // Restore setup panel for starting next game
});

// Undo Action
undoBtn.addEventListener('click', () => {
  if (isCpuThinking) return;
  clearHintHighlights();
  clearArrows();
  clearRightClickHighlights();

  if (gameMode === 'vs-cpu') {
    if (movesList.length >= 2) {
      game.undoMove();
      game.undoMove();
    } else if (movesList.length === 1 && userColor === 'b') {
      game.undoMove();
    }
  } else {
    game.undoMove();
  }

  lastMove = movesList.length > 0 ? movesList[movesList.length - 1] : null;
  selectedSquare = null;
  activeLegalMovesForSelected = [];

  updateBoardDOM();
  ChessSounds.playMove();
});

// Hint Finder with pulsing gold highlight
hintBtn.addEventListener('click', () => {
  if (isCpuThinking) return;
  clearHintHighlights();
  
  const status = game.getGameStatus();
  if (status !== 'active') return;

  hintBtn.disabled = true;
  hintBtn.innerText = 'Calculando...';

  const depth = parseInt(difficultySelect.value) || 3;

  setTimeout(() => {
    const result = getBestMove(game, depth);
    hintBtn.disabled = false;
    hintBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
        <path d="M9 18h6M10 22h4"/>
      </svg>
      Pedir Dica
    `;

    if (result.move) {
      const squares = boardEl.querySelectorAll('.square');
      squares.forEach(sq => {
        const r = parseInt(sq.dataset.row);
        const c = parseInt(sq.dataset.col);
        
        if (
          (result.move.from.r === r && result.move.from.c === c) ||
          (result.move.to.r === r && result.move.to.c === c)
        ) {
          sq.classList.add('hint');
        }
      });

      hintTimeout = setTimeout(clearHintHighlights, 3500);
    }
  }, 100);
});

function clearHintHighlights() {
  if (hintTimeout) {
    clearTimeout(hintTimeout);
    hintTimeout = null;
  }
  const squares = boardEl.querySelectorAll('.square');
  squares.forEach(sq => sq.classList.remove('hint'));
}

/**
 * Opens promotion selection popup and renders choice SVGs in user's color.
 */
function openPromotionModal() {
  const buttons = promotionModal.querySelectorAll('.promo-choice-btn');
  buttons.forEach(btn => {
    const pieceType = btn.dataset.piece;
    const existingSvg = btn.querySelector('.piece-svg');
    if (existingSvg) existingSvg.remove();
    
    const svgHtml = getPieceSVG(pieceType, userColor);
    const container = document.createElement('div');
    container.innerHTML = svgHtml;
    const svgEl = container.firstChild;
    btn.insertBefore(svgEl, btn.firstChild);
  });

  promotionModal.style.display = 'flex';
}

function handlePromotionChoice(pieceType) {
  if (!activePromotionMove) return;

  const move = { ...activePromotionMove, promotionPiece: pieceType };
  activePromotionMove = null;
  promotionModal.style.display = 'none';

  game.makeMove(move);
  lastMove = move;

  if (move.captured) {
    ChessSounds.playCapture();
  } else {
    ChessSounds.playMove();
  }

  const isCheck = game.isInCheck(game.turn);
  const status = game.getGameStatus();
  const isCheckmate = status === 'checkmate';
  move.notation = getMoveNotation(move, isCheck, isCheckmate);

  updateBoardDOM();

  if (status !== 'active') {
    handleGameOver(status);
    return;
  } else if (isCheck) {
    ChessSounds.playCheck();
  }

  if (gameMode === 'vs-cpu' && game.turn !== userColor) {
    triggerCpuMove();
  }
}

// Bind promotion choice buttons once
document.querySelectorAll('.promo-choice-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const pieceType = btn.dataset.piece;
    handlePromotionChoice(pieceType);
  });
});


// Mode Selection
modeSelect.addEventListener('change', (e) => {
  gameMode = e.target.value;
  
  const diffGroup = document.getElementById('difficulty-group');
  const colorGroup = document.getElementById('color-group');
  
  if (gameMode === 'vs-cpu') {
    diffGroup.style.display = 'flex';
    colorGroup.style.display = 'flex';
  } else {
    diffGroup.style.display = 'none';
    colorGroup.style.display = 'none';
  }
});

// Dynamic Piece Theme updates on selector change
pieceThemeSelect.addEventListener('change', () => {
  updateBoardDOM();
});

// Theme Selection
themeSelect.addEventListener('change', (e) => {
  const newTheme = e.target.value;
  document.body.className = newTheme;
  updateEvaluationBar(); // Recalculate alignments
});

// Sound Toggle
muteBtn.addEventListener('click', () => {
  const isMuted = ChessSounds.toggleMute();
  if (isMuted) {
    soundOnIcon.style.display = 'none';
    soundOffIcon.style.display = 'block';
  } else {
    soundOnIcon.style.display = 'block';
    soundOffIcon.style.display = 'none';
  }
});

// ============================================================
// Timer System
// ============================================================
function formatTimerDisplay(ms) {
  if (ms <= 0) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function updateTimerDisplay() {
  const playerTimerEl = document.getElementById('player-timer');
  const opponentTimerEl = document.getElementById('opponent-timer');
  if (!playerTimerEl || !opponentTimerEl) return;

  if (!timerEnabled) {
    playerTimerEl.style.display = 'none';
    opponentTimerEl.style.display = 'none';
    return;
  }

  playerTimerEl.style.display = 'flex';
  opponentTimerEl.style.display = 'flex';

  if (userColor === 'w') {
    playerTimerEl.textContent = formatTimerDisplay(timerWhite);
    opponentTimerEl.textContent = formatTimerDisplay(timerBlack);
  } else {
    playerTimerEl.textContent = formatTimerDisplay(timerBlack);
    opponentTimerEl.textContent = formatTimerDisplay(timerWhite);
  }

  // Low time warning
  const playerTime = userColor === 'w' ? timerWhite : timerBlack;
  playerTimerEl.classList.toggle('timer-low', playerTime < 30000 && playerTime > 0);
}

function startTimerTick() {
  if (timerInterval) clearInterval(timerInterval);
  timerLastTick = Date.now();
  
  timerInterval = setInterval(() => {
    if (!isGameActive || !timerEnabled) return;
    
    const now = Date.now();
    const elapsed = now - timerLastTick;
    timerLastTick = now;

    if (game.turn === 'w') {
      timerWhite -= elapsed;
    } else {
      timerBlack -= elapsed;
    }

    // Clamp to 0
    if (timerWhite <= 0) {
      timerWhite = 0;
      updateTimerDisplay();
      clearInterval(timerInterval);
      // White loses on time
      handleTimeOut('w');
      return;
    }
    if (timerBlack <= 0) {
      timerBlack = 0;
      updateTimerDisplay();
      clearInterval(timerInterval);
      // Black loses on time
      handleTimeOut('b');
      return;
    }

    updateTimerDisplay();
  }, 100);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function handleTimeOut(loserColor) {
  const isPlayerLoss = loserColor === userColor;
  
  if (gameMode === 'vs-cpu') {
    submitMatchResult(isPlayerLoss ? 'loss' : 'win');
  }

  gameOverTitle.innerText = isPlayerLoss ? 'Tempo Esgotado!' : 'Vitória por Tempo!';
  gameOverDesc.innerText = isPlayerLoss
    ? 'Seu tempo acabou. Vitória do Aether Bot.'
    : 'O tempo do oponente acabou. Você venceu!';
  
  const iconClass = isPlayerLoss ? 'loss' : 'win';
  gameOverIconBox.className = `game-over-icon ${iconClass}`;
  
  if (isPlayerLoss) {
    gameOverIconBox.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>`;
    ChessSounds.playGameOver(false);
  } else {
    gameOverIconBox.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
        <circle cx="12" cy="8" r="7"/><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12"/>
      </svg>`;
    ChessSounds.playGameOver(true);
    launchConfetti();
  }

  gameOverModal.style.display = 'flex';
  setGameActiveUI(false);
  stopTimer();
}

// ============================================================
// PGN Export
// ============================================================
const pgnBtn = document.getElementById('pgn-btn');
if (pgnBtn) {
  pgnBtn.addEventListener('click', () => {
    const pgn = generatePGN();
    navigator.clipboard.writeText(pgn).then(() => {
      const originalText = pgnBtn.innerHTML;
      pgnBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Copiado!
      `;
      pgnBtn.classList.add('btn-success');
      setTimeout(() => {
        pgnBtn.innerHTML = originalText;
        pgnBtn.classList.remove('btn-success');
      }, 2000);
    }).catch(() => {
      // Fallback: show in prompt
      prompt('Copie o PGN abaixo:', pgn);
    });
  });
}

// ============================================================
// Board Entry Animation (staggered fade-in on game start)
// ============================================================
function animateBoardEntry() {
  const squares = boardEl.querySelectorAll('.square');
  squares.forEach((sq, index) => {
    const piece = sq.querySelector('.piece-svg');
    if (piece) {
      piece.style.opacity = '0';
      piece.style.transform = 'scale(0.3)';
      
      const delay = index * 12; // Stagger by 12ms per square
      setTimeout(() => {
        piece.style.transition = 'opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
        piece.style.opacity = '1';
        piece.style.transform = 'scale(1)';
        
        setTimeout(() => {
          piece.style.transition = '';
        }, 350);
      }, delay);
    }
  });
}

// ============================================================
// Start Game on Page Load and Fetch scoreboard records
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  fetchScoreboard();
  startNewGame();
  
  // Timer select handler
  const timerSelect = document.getElementById('timer-select');
  if (timerSelect) {
    timerSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      timerEnabled = val !== 'none';
    });
  }
});

// Override startNewGame to include timer init and board entry animation
const _originalStartNewGame = startNewGame;
startNewGame = function(isActive = false) {
  stopTimer();
  _originalStartNewGame(isActive);
  
  // Initialize timer based on selection
  const timerSelect = document.getElementById('timer-select');
  if (timerSelect) {
    const val = timerSelect.value;
    if (val === 'none') {
      timerEnabled = false;
    } else {
      timerEnabled = true;
      const [baseMinutes, incSeconds] = val.split('+').map(Number);
      const baseMs = baseMinutes * 60 * 1000;
      const incMs = (incSeconds || 0) * 1000;
      timerWhite = baseMs;
      timerBlack = baseMs;
      timerIncrement = incMs;
    }
  }
  
  updateTimerDisplay();
  
  if (timerEnabled && isActive) {
    startTimerTick();
  }
  
  // Animate pieces entering the board
  if (isActive) {
    animateBoardEntry();
  }
};

