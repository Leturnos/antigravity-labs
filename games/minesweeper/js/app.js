// Aether-Sweeper - Core 8-Bit Game Engine

document.addEventListener('DOMContentLoaded', () => {
  // Game Configs
  const DIFFICULTIES = {
    easy: { cols: 9, rows: 9, mines: 10, key: 'easy' },
    medium: { cols: 16, rows: 16, mines: 40, key: 'medium' },
    hard: { cols: 30, rows: 16, mines: 99, key: 'hard' }
  };

  let currentConfig = DIFFICULTIES.easy;
  
  // Game State
  let board = [];
  let gameStarted = false;
  let gameOver = false;
  let gameWon = false;
  let minesLeft = 0;
  
  // Timer State
  let secondsElapsed = 0;
  let timerInterval = null;

  // Sound Config (Hooks for Stage 3 sound synthesis)
  let soundEnabled = true;

  // DOM Elements
  const gridElement = document.getElementById('mines-grid');
  const mineCounterElement = document.getElementById('mine-counter');
  const timerElement = document.getElementById('game-timer');
  const btnReset = document.getElementById('btn-reset');
  const smileyIcon = btnReset.querySelector('.smiley-icon');
  
  const btnEasy = document.getElementById('btn-easy');
  const btnMedium = document.getElementById('btn-medium');
  const btnHard = document.getElementById('btn-hard');
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  
  const consoleContainer = document.querySelector('.console-container');
  const themeSelector = document.getElementById('theme-selector');

  // Game End Modal Elements
  const modalGameEnd = document.getElementById('modal-game-end');
  const gameEndHeading = document.getElementById('game-end-heading');
  const gameEndMsg = document.getElementById('game-end-msg');
  const modalBtnRetry = document.getElementById('modal-btn-retry');
  const modalBtnClose = document.getElementById('modal-btn-close');
  const modalGameEndClose = document.getElementById('modal-game-end-close');
  const gameEndBar = document.getElementById('game-end-bar');

  // Stats Elements
  const statsWins = document.getElementById('stats-wins');
  const statsLosses = document.getElementById('stats-losses');
  const statsRecord = document.getElementById('stats-record');
  const btnShowScores = document.getElementById('btn-show-scores');
  const btnResetScores = document.getElementById('btn-reset-scores');

  // Modal Elements
  const btnHowTo = document.getElementById('btn-how-to');
  const modalHowTo = document.getElementById('modal-how-to');
  const modalClose = document.getElementById('modal-close');
  const modalBtnCloseOk = document.getElementById('modal-btn-close-ok');

  /* ==========================================
     Sound Hook Functions (To be filled in Stage 3)
     ========================================== */
  const playSound = (type) => {
    if (!soundEnabled) return;
    if (window.NES_AudioEngine && typeof window.NES_AudioEngine.play === 'function') {
      window.NES_AudioEngine.play(type);
    } else {
      console.log(`[Audio Hook] Play sound: ${type}`);
    }
  };

  /* ==========================================
     API Persistence Functions
     ========================================== */
  async function fetchScoreboard() {
    try {
      const response = await fetch('/api/score');
      if (response.ok) {
        const data = await response.json();
        updateStatsDisplay(data);
      }
    } catch (err) {
      console.warn('Backend API scoreboard offline, using localStorage fallback.', err);
      loadLocalStorageStats();
    }
  }

  async function reportGameResult(result, time) {
    try {
      const response = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result, time })
      });
      if (response.ok) {
        const data = await response.json();
        updateStatsDisplay(data.scores);
      }
    } catch (err) {
      console.warn('Backend API offline. Saving to localStorage fallback.', err);
      saveLocalStorageResult(result, time);
    }
  }

  async function resetScoreboard() {
    if (!confirm('Deseja realmente zerar todo o placar de estatísticas?')) return;
    try {
      const response = await fetch('/api/score', { method: 'DELETE' });
      if (response.ok) {
        const data = await response.json();
        updateStatsDisplay(data.scores);
      }
    } catch (err) {
      console.warn('Backend API offline. Resetting local stats.', err);
      localStorage.removeItem('minesweeper_stats');
      loadLocalStorageStats();
    }
  }

  function updateStatsDisplay(scores) {
    if (statsWins) statsWins.textContent = scores.vitorias || 0;
    if (statsLosses) statsLosses.textContent = scores.derrotas || 0;
    if (statsRecord) {
      statsRecord.textContent = scores.tempo_recorde > 0 
        ? `${scores.tempo_recorde} s` 
        : '-- s';
    }
  }

  // LocalStorage Fallback for score persistence when server is running elsewhere
  function loadLocalStorageStats() {
    let stats = { vitorias: 0, derrotas: 0, tempo_recorde: 0 };
    const saved = localStorage.getItem('minesweeper_stats');
    if (saved) {
      try { stats = JSON.parse(saved); } catch(e){}
    }
    updateStatsDisplay(stats);
  }

  function saveLocalStorageResult(result, time) {
    let stats = { vitorias: 0, derrotas: 0, tempo_recorde: 0 };
    const saved = localStorage.getItem('minesweeper_stats');
    if (saved) {
      try { stats = JSON.parse(saved); } catch(e){}
    }
    if (result === 'win') {
      stats.vitorias += 1;
      if (time !== undefined && (stats.tempo_recorde === 0 || time < stats.tempo_recorde)) {
        stats.tempo_recorde = time;
      }
    } else {
      stats.derrotas += 1;
    }
    localStorage.setItem('minesweeper_stats', JSON.stringify(stats));
    updateStatsDisplay(stats);
  }

  /* ==========================================
     Digital LED Display Formatter
     ========================================== */
  function formatThreeDigits(num) {
    if (num < 0) {
      const positivePart = Math.abs(num);
      const digits = String(positivePart).padStart(2, '0');
      return `-${digits.substring(digits.length - 2)}`;
    }
    const digits = String(num).padStart(3, '0');
    return digits.substring(digits.length - 3);
  }

  function updateDigitalCounter(element, value) {
    if (element) {
      element.textContent = formatThreeDigits(value);
    }
  }

  /* ==========================================
     Core Game Logic Functions
     ========================================== */
  function initGame(config = currentConfig) {
    currentConfig = config;
    
    // Reset state
    gameStarted = false;
    gameOver = false;
    gameWon = false;
    secondsElapsed = 0;
    minesLeft = config.mines;

    stopTimer();
    updateDigitalCounter(timerElement, 0);
    updateDigitalCounter(mineCounterElement, minesLeft);
    smileyIcon.textContent = '🙂';

    // Setup CSS Grid custom variables for scaling
    gridElement.style.setProperty('--grid-cols', config.cols);
    gridElement.style.setProperty('--grid-rows', config.rows);

    if (consoleContainer) {
      consoleContainer.classList.remove('diff-easy', 'diff-medium', 'diff-hard');
      consoleContainer.classList.add(`diff-${config.key}`);
    }

    if (modalGameEnd) {
      modalGameEnd.classList.add('hidden');
    }

    // Build empty board state
    board = [];
    gridElement.innerHTML = '';

    for (let r = 0; r < config.rows; r++) {
      board[r] = [];
      for (let c = 0; c < config.cols; c++) {
        const cell = {
          row: r,
          col: c,
          isMine: false,
          isRevealed: false,
          isFlagged: false,
          neighborMines: 0,
          element: null
        };

        // Create DOM element
        const cellEl = document.createElement('div');
        cellEl.className = 'cell hidden';
        
        // Attach event listeners
        cellEl.addEventListener('mousedown', (e) => onCellMouseDown(e, cell));
        cellEl.addEventListener('mouseup', (e) => onCellMouseUp(e, cell));
        cellEl.addEventListener('click', (e) => onCellLeftClick(cell));
        cellEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          onCellRightClick(cell);
        });
        
        gridElement.appendChild(cellEl);
        cell.element = cellEl;
        board[r][c] = cell;
      }
    }
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      secondsElapsed++;
      if (secondsElapsed >= 999) {
        secondsElapsed = 999;
        stopTimer();
      }
      updateDigitalCounter(timerElement, secondsElapsed);
    }, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // Generate mines guaranteeing the first clicked cell and its neighbors are clear
  function generateMines(firstCell) {
    const config = currentConfig;
    const forbiddenCoords = new Set();
    
    // Add first cell and its immediate 8 neighbors to forbidden list
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = firstCell.row + dr;
        const nc = firstCell.col + dc;
        if (nr >= 0 && nr < config.rows && nc >= 0 && nc < config.cols) {
          forbiddenCoords.add(`${nr},${nc}`);
        }
      }
    }

    let minesPlaced = 0;
    while (minesPlaced < config.mines) {
      const r = Math.floor(Math.random() * config.rows);
      const c = Math.floor(Math.random() * config.cols);
      const key = `${r},${c}`;

      if (!board[r][c].isMine && !forbiddenCoords.has(key)) {
        board[r][c].isMine = true;
        minesPlaced++;
      }
    }

    // Calculate neighbors for all cells
    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        if (!board[r][c].isMine) {
          board[r][c].neighborMines = countAdjacentMines(r, c);
        }
      }
    }
  }

  function countAdjacentMines(row, col) {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < currentConfig.rows && nc >= 0 && nc < currentConfig.cols) {
          if (board[nr][nc].isMine) count++;
        }
      }
    }
    return count;
  }

  /* ==========================================
     Cell Interaction Handlers
     ========================================== */
  function onCellMouseDown(e, cell) {
    if (gameOver || gameWon) return;
    if (cell.isRevealed && cell.neighborMines > 0) return; // ignore chord trigger click mousedown for face
    if (e.button === 0) { // Left click
      smileyIcon.textContent = '😮'; // Scared face
    }
  }

  function onCellMouseUp(e, cell) {
    if (gameOver || gameWon) return;
    smileyIcon.textContent = '🙂';
  }

  function onCellLeftClick(cell) {
    if (gameOver || gameWon || cell.isFlagged) return;

    if (!gameStarted) {
      gameStarted = true;
      generateMines(cell);
      startTimer();
    }

    if (cell.isRevealed) {
      // If clicked a revealed cell with numbers, trigger chord check
      if (cell.neighborMines > 0) {
        triggerChord(cell);
      }
      return;
    }

    revealCell(cell);
  }

  function onCellRightClick(cell) {
    if (gameOver || gameWon || cell.isRevealed) return;

    if (!gameStarted) {
      // Game can be started by flagging, but timer starts on first left click
      gameStarted = true;
      // Generate mines with a random cell as safe anchor if player starts by flagging
      const randomRow = Math.floor(Math.random() * currentConfig.rows);
      const randomCol = Math.floor(Math.random() * currentConfig.cols);
      generateMines(board[randomRow][randomCol]);
      startTimer();
    }

    cell.isFlagged = !cell.isFlagged;
    
    if (cell.isFlagged) {
      cell.element.classList.add('flagged');
      minesLeft--;
      playSound('flag');
    } else {
      cell.element.classList.remove('flagged');
      minesLeft++;
      playSound('unflag');
    }
    
    updateDigitalCounter(mineCounterElement, minesLeft);
  }

  function revealCell(cell) {
    if (cell.isRevealed || cell.isFlagged) return;

    cell.isRevealed = true;
    cell.element.classList.remove('hidden');
    cell.element.classList.add('open');

    if (cell.isMine) {
      // Detonate!
      triggerLoss(cell);
      return;
    }

    playSound('reveal');

    if (cell.neighborMines > 0) {
      cell.element.textContent = cell.neighborMines;
      cell.element.classList.add(`num-${cell.neighborMines}`);
    } else {
      // Recursive reveal for blank tiles
      const neighbors = getAdjacentCells(cell.row, cell.col);
      neighbors.forEach(neigh => {
        if (!neigh.isRevealed) {
          revealCell(neigh);
        }
      });
    }

    checkWinCondition();
  }

  function getAdjacentCells(row, col) {
    const cells = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < currentConfig.rows && nc >= 0 && nc < currentConfig.cols) {
          cells.push(board[nr][nc]);
        }
      }
    }
    return cells;
  }

  /* ==========================================
     Chording Mechanic
     ========================================== */
  function triggerChord(cell) {
    const neighbors = getAdjacentCells(cell.row, cell.col);
    const flagCount = neighbors.filter(n => n.isFlagged).length;

    if (flagCount === cell.neighborMines) {
      playSound('chord');
      neighbors.forEach(neigh => {
        if (!neigh.isRevealed && !neigh.isFlagged) {
          revealCell(neigh);
        }
      });
    }
  }

  /* ==========================================
     Win & Loss End States
     ========================================== */
  function checkWinCondition() {
    let unrevealedCount = 0;
    
    for (let r = 0; r < currentConfig.rows; r++) {
      for (let c = 0; c < currentConfig.cols; c++) {
        if (!board[r][c].isRevealed) {
          unrevealedCount++;
        }
      }
    }

    if (unrevealedCount === currentConfig.mines) {
      triggerWin();
    }
  }

  function triggerWin() {
    gameWon = true;
    stopTimer();
    smileyIcon.textContent = '😎'; // Cool face
    playSound('win');

    // Victory Confetti Particle generator
    const screenChassis = document.querySelector('.screen-chassis');
    if (screenChassis) {
      const confettiContainer = document.createElement('div');
      confettiContainer.className = 'confetti-container';
      screenChassis.appendChild(confettiContainer);

      const colors = ['#f68d1f', '#ecab37', '#e60012', '#9fbee7', '#ffffff'];
      for (let i = 0; i < 60; i++) {
        const particle = document.createElement('div');
        particle.className = 'confetti-particle';
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        particle.style.width = `${4 + Math.random() * 4}px`;
        particle.style.height = `${6 + Math.random() * 6}px`;
        particle.style.animationDelay = `${Math.random() * 0.4}s`;
        particle.style.animationDuration = `${1.2 + Math.random() * 1.5}s`;
        confettiContainer.appendChild(particle);
      }
      setTimeout(() => {
        confettiContainer.remove();
      }, 3000);
    }

    // Automatically flag all remaining mines
    for (let r = 0; r < currentConfig.rows; r++) {
      for (let c = 0; c < currentConfig.cols; c++) {
        if (board[r][c].isMine && !board[r][c].isFlagged) {
          board[r][c].isFlagged = true;
          board[r][c].element.classList.add('flagged');
        }
      }
    }
    minesLeft = 0;
    updateDigitalCounter(mineCounterElement, 0);

    reportGameResult('win', secondsElapsed);
    
    // Show win modal after brief delay for fanfare to play
    setTimeout(() => {
      showGameEndModal(true);
    }, 400);
  }

  function triggerLoss(explodedCell) {
    gameOver = true;
    stopTimer();
    smileyIcon.textContent = '😵'; // Dead face
    playSound('lose');

    // Screen shake animation rumble
    const screenChassis = document.querySelector('.screen-chassis');
    if (screenChassis) {
      screenChassis.classList.add('shake');
      setTimeout(() => {
        screenChassis.classList.remove('shake');
      }, 500);
    }

    explodedCell.element.classList.remove('open');
    explodedCell.element.classList.add('exploded');

    // Reveal all remaining mines
    for (let r = 0; r < currentConfig.rows; r++) {
      for (let c = 0; c < currentConfig.cols; c++) {
        const cell = board[r][c];
        if (cell.isMine && cell !== explodedCell) {
          if (!cell.isFlagged) {
            cell.element.classList.remove('hidden');
            cell.element.classList.add('mine');
          }
        } else if (!cell.isMine && cell.isFlagged) {
          // Highlight incorrect flags with a custom style if wanted (here we just remove flag and show it as error)
          cell.element.classList.remove('flagged');
          cell.element.classList.add('open');
          cell.element.textContent = '❌';
          cell.element.style.fontSize = '12px';
        }
      }
    }

    reportGameResult('loss');

    // Show lose modal after brief delay
    setTimeout(() => {
      showGameEndModal(false);
    }, 600);
  }

  /* ==========================================
     Header Controls & Options Listeners
     ========================================== */
  btnReset.addEventListener('click', () => {
    initGame();
  });

  // Difficulty switch
  btnEasy.addEventListener('click', () => {
    setActiveDifficulty(btnEasy, DIFFICULTIES.easy);
  });

  btnMedium.addEventListener('click', () => {
    setActiveDifficulty(btnMedium, DIFFICULTIES.medium);
  });

  btnHard.addEventListener('click', () => {
    setActiveDifficulty(btnHard, DIFFICULTIES.hard);
  });

  function setActiveDifficulty(activeBtn, config) {
    [btnEasy, btnMedium, btnHard].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
    initGame(config);
  }

  // Sound Toggle
  btnSoundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    btnSoundToggle.textContent = `SOM: ${soundEnabled ? 'ON' : 'OFF'}`;
    btnSoundToggle.style.backgroundColor = soundEnabled ? 'var(--color-amber)' : 'var(--color-muted-indigo)';
    if (window.NES_AudioEngine) {
      window.NES_AudioEngine.setMute(!soundEnabled);
    }
  });

  // Score buttons
  btnShowScores.addEventListener('click', () => {
    fetchScoreboard();
    if (modalGameEnd) {
      gameEndHeading.textContent = '🏆 RECORDES';
      gameEndHeading.style.color = 'var(--color-amber)';
      gameEndMsg.innerHTML = `
        <div style="text-align: center; font-size: 13px; font-weight: bold; margin-top: 8px;">
          Vitórias: ${statsWins.textContent}<br>
          Derrotas: ${statsLosses.textContent}<br>
          Recorde: ${statsRecord.textContent}
        </div>
      `;
      if (gameEndBar) {
        gameEndBar.style.backgroundColor = 'var(--color-canvas)';
      }
      modalGameEnd.classList.remove('hidden');
    }
  });

  btnResetScores.addEventListener('click', () => {
    resetScoreboard();
  });

  // Game End Modal Helper
  function showGameEndModal(isWin) {
    if (!modalGameEnd) return;
    if (isWin) {
      gameEndHeading.textContent = 'VITÓRIA! 🎉';
      gameEndHeading.style.color = 'var(--color-nav-gold)';
      gameEndMsg.textContent = `Parabéns! Você desarmou todas as minas com sucesso em ${secondsElapsed} segundos.`;
      if (gameEndBar) {
        gameEndBar.style.backgroundColor = 'var(--color-periwinkle)';
      }
    } else {
      gameEndHeading.textContent = 'FIM DE JOGO! 💥';
      gameEndHeading.style.color = 'var(--color-primary)';
      gameEndMsg.textContent = 'Você detonou uma mina terrestre. Tente novamente para superar o campo!';
      if (gameEndBar) {
        gameEndBar.style.backgroundColor = 'var(--color-canvas)';
      }
    }
    modalGameEnd.classList.remove('hidden');
  }

  // Game End modal listeners
  if (modalBtnRetry) {
    modalBtnRetry.addEventListener('click', () => {
      modalGameEnd.classList.add('hidden');
      initGame();
    });
  }
  if (modalBtnClose) {
    modalBtnClose.addEventListener('click', () => {
      modalGameEnd.classList.add('hidden');
    });
  }
  if (modalGameEndClose) {
    modalGameEndClose.addEventListener('click', () => {
      modalGameEnd.classList.add('hidden');
    });
  }
  if (modalGameEnd) {
    modalGameEnd.addEventListener('click', (e) => {
      if (e.target === modalGameEnd) {
        modalGameEnd.classList.add('hidden');
      }
    });
  }

  // Theme cycle cycling
  const THEMES = [
    { class: '', label: 'PALETA: CLÁSSICA (PERIWINKLE)' },
    { class: 'theme-emerald', label: 'PALETA: ARCADIA (GREEN)' },
    { class: 'theme-midnight', label: 'PALETA: VAPORWAVE (DARK)' }
  ];
  let currentThemeIndex = 0;

  if (themeSelector && consoleContainer) {
    themeSelector.addEventListener('click', () => {
      // Remove current class
      THEMES.forEach(t => {
        if (t.class) consoleContainer.classList.remove(t.class);
      });
      // Cycle theme
      currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
      const nextTheme = THEMES[currentThemeIndex];
      if (nextTheme.class) {
        consoleContainer.classList.add(nextTheme.class);
      }
      themeSelector.textContent = nextTheme.label;
      playSound('unflag');
    });
  }

  // Modal event listeners
  btnHowTo.addEventListener('click', () => {
    modalHowTo.classList.remove('hidden');
  });

  const closeModal = () => {
    modalHowTo.classList.add('hidden');
  };

  modalClose.addEventListener('click', closeModal);
  modalBtnCloseOk.addEventListener('click', closeModal);

  modalHowTo.addEventListener('click', (e) => {
    if (e.target === modalHowTo) {
      closeModal();
    }
  });

  /* ==========================================
     Initialization
     ========================================== */
  initGame(DIFFICULTIES.easy);
  fetchScoreboard();
});
