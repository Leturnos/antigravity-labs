/**
 * Aether-Sweeper - Core 8-Bit Game Engine (OOP Refactored)
 * Coordinates grid, click-safety, chording and scoreboard APIs.
 */

class AetherSweeper {
  constructor() {
    // Game Configs
    this.DIFFICULTIES = {
      easy: { cols: 9, rows: 9, mines: 10, key: 'easy' },
      medium: { cols: 16, rows: 16, mines: 40, key: 'medium' },
      hard: { cols: 30, rows: 16, mines: 99, key: 'hard' }
    };

    this.currentConfig = this.DIFFICULTIES.easy;
    
    // Game State
    this.board = [];
    this.gameStarted = false;
    this.gameOver = false;
    this.gameWon = false;
    this.minesLeft = 0;
    
    // Timer State
    this.secondsElapsed = 0;
    this.timerInterval = null;

    // Sound Config
    this.soundEnabled = true;

    // DOM Bindings
    this.gridElement = document.getElementById('mines-grid');
    this.mineCounterElement = document.getElementById('mine-counter');
    this.timerElement = document.getElementById('game-timer');
    this.btnReset = document.getElementById('btn-reset');
    this.smileyIcon = this.btnReset?.querySelector('.smiley-icon');
    
    this.btnEasy = document.getElementById('btn-easy');
    this.btnMedium = document.getElementById('btn-medium');
    this.btnHard = document.getElementById('btn-hard');
    this.btnSoundToggle = document.getElementById('btn-sound-toggle');
    
    this.consoleContainer = document.querySelector('.console-container');
    this.themeSelector = document.getElementById('theme-selector');

    // Game End Modal Elements
    this.modalGameEnd = document.getElementById('modal-game-end');
    this.gameEndHeading = document.getElementById('game-end-heading');
    this.gameEndMsg = document.getElementById('game-end-msg');
    this.modalBtnRetry = document.getElementById('modal-btn-retry');
    this.modalBtnClose = document.getElementById('modal-btn-close');
    this.modalGameEndClose = document.getElementById('modal-game-end-close');
    this.gameEndBar = document.getElementById('game-end-bar');

    // Stats Elements
    this.statsWins = document.getElementById('stats-wins');
    this.statsLosses = document.getElementById('stats-losses');
    this.statsRecord = document.getElementById('stats-record');
    this.btnShowScores = document.getElementById('btn-show-scores');
    this.btnResetScores = document.getElementById('btn-reset-scores');

    // Modal Elements
    this.btnHowTo = document.getElementById('btn-how-to');
    this.modalHowTo = document.getElementById('modal-how-to');
    this.modalClose = document.getElementById('modal-close');
    this.modalBtnCloseOk = document.getElementById('modal-btn-close-ok');

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.initGame(this.DIFFICULTIES.easy);
    this.fetchScoreboard();
  }

  setupEventListeners() {
    // Reset button
    if (this.btnReset) {
      this.btnReset.addEventListener('click', () => {
        this.initGame();
      });
    }

    // Difficulties
    if (this.btnEasy) {
      this.btnEasy.addEventListener('click', () => {
        this.setActiveDifficulty(this.btnEasy, this.DIFFICULTIES.easy);
      });
    }
    if (this.btnMedium) {
      this.btnMedium.addEventListener('click', () => {
        this.setActiveDifficulty(this.btnMedium, this.DIFFICULTIES.medium);
      });
    }
    if (this.btnHard) {
      this.btnHard.addEventListener('click', () => {
        this.setActiveDifficulty(this.btnHard, this.DIFFICULTIES.hard);
      });
    }

    // Sound toggle
    if (this.btnSoundToggle) {
      this.btnSoundToggle.addEventListener('click', () => {
        this.soundEnabled = !this.soundEnabled;
        this.btnSoundToggle.textContent = `SOM: ${this.soundEnabled ? 'ON' : 'OFF'}`;
        this.btnSoundToggle.style.backgroundColor = this.soundEnabled ? 'var(--color-amber)' : 'var(--color-muted-indigo)';
        if (window.NES_AudioEngine) {
          window.NES_AudioEngine.setMute(!this.soundEnabled);
        }
      });
    }

    // Score show/reset
    if (this.btnShowScores) {
      this.btnShowScores.addEventListener('click', () => {
        this.fetchScoreboard();
        if (this.modalGameEnd) {
          this.gameEndHeading.textContent = '🏆 RECORDES';
          this.gameEndHeading.style.color = 'var(--color-amber)';
          this.gameEndMsg.innerHTML = `
            <div style="text-align: center; font-size: 13px; font-weight: bold; margin-top: 8px;">
              Vitórias: ${this.statsWins.textContent}<br>
              Derrotas: ${this.statsLosses.textContent}<br>
              Recorde: ${this.statsRecord.textContent}
            </div>
          `;
          if (this.gameEndBar) {
            this.gameEndBar.style.backgroundColor = 'var(--color-canvas)';
          }
          this.modalGameEnd.classList.remove('hidden');
        }
      });
    }

    if (this.btnResetScores) {
      this.btnResetScores.addEventListener('click', () => {
        this.resetScoreboard();
      });
    }

    // Instructions modal
    if (this.btnHowTo) {
      this.btnHowTo.addEventListener('click', () => {
        this.modalHowTo.classList.remove('hidden');
      });
    }

    const closeModal = () => {
      this.modalHowTo.classList.add('hidden');
    };
    if (this.modalClose) this.modalClose.addEventListener('click', closeModal);
    if (this.modalBtnCloseOk) this.modalBtnCloseOk.addEventListener('click', closeModal);
    if (this.modalHowTo) {
      this.modalHowTo.addEventListener('click', (e) => {
        if (e.target === this.modalHowTo) {
          closeModal();
        }
      });
    }

    // Game End modal actions
    if (this.modalBtnRetry) {
      this.modalBtnRetry.addEventListener('click', () => {
        this.modalGameEnd.classList.add('hidden');
        this.initGame();
      });
    }
    if (this.modalBtnClose) {
      this.modalBtnClose.addEventListener('click', () => {
        this.modalGameEnd.classList.add('hidden');
      });
    }
    if (this.modalGameEndClose) {
      this.modalGameEndClose.addEventListener('click', () => {
        this.modalGameEnd.classList.add('hidden');
      });
    }
    if (this.modalGameEnd) {
      this.modalGameEnd.addEventListener('click', (e) => {
        if (e.target === this.modalGameEnd) {
          this.modalGameEnd.classList.add('hidden');
        }
      });
    }

    // Theme switching
    const THEMES = [
      { class: '', label: 'PALETA: CLÁSSICA (PERIWINKLE)' },
      { class: 'theme-emerald', label: 'PALETA: ARCADIA (GREEN)' },
      { class: 'theme-midnight', label: 'PALETA: VAPORWAVE (DARK)' }
    ];
    let currentThemeIndex = 0;
    if (this.themeSelector && this.consoleContainer) {
      this.themeSelector.addEventListener('click', () => {
        THEMES.forEach(t => {
          if (t.class) this.consoleContainer.classList.remove(t.class);
        });
        currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
        const nextTheme = THEMES[currentThemeIndex];
        if (nextTheme.class) {
          this.consoleContainer.classList.add(nextTheme.class);
        }
        this.themeSelector.textContent = nextTheme.label;
        this.playSound('unflag');
      });
    }
  }

  playSound(type) {
    if (!this.soundEnabled) return;
    if (window.NES_AudioEngine && typeof window.NES_AudioEngine.play === 'function') {
      window.NES_AudioEngine.play(type);
    }
  }

  async fetchScoreboard() {
    try {
      const response = await fetch('/api/score?game=minesweeper');
      if (response.ok) {
        const data = await response.json();
        this.updateStatsDisplay(data);
      }
    } catch (err) {
      console.warn('Backend API scoreboard offline, using localStorage fallback.', err);
      this.loadLocalStorageStats();
    }
  }

  async reportGameResult(result, time) {
    try {
      const response = await fetch('/api/score?game=minesweeper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result, time })
      });
      if (response.ok) {
        const data = await response.json();
        this.updateStatsDisplay(data.scores);
      }
    } catch (err) {
      console.warn('Backend API offline. Saving to localStorage fallback.', err);
      this.saveLocalStorageResult(result, time);
    }
  }

  async resetScoreboard() {
    if (!confirm('Deseja realmente zerar todo o placar de estatísticas?')) return;
    try {
      const response = await fetch('/api/score?game=minesweeper', { method: 'DELETE' });
      if (response.ok) {
        const data = await response.json();
        this.updateStatsDisplay(data.scores);
      }
    } catch (err) {
      console.warn('Backend API offline. Resetting local stats.', err);
      localStorage.removeItem('minesweeper_stats');
      this.loadLocalStorageStats();
    }
  }

  updateStatsDisplay(scores) {
    if (this.statsWins) this.statsWins.textContent = scores.vitorias || 0;
    if (this.statsLosses) this.statsLosses.textContent = scores.derrotas || 0;
    if (this.statsRecord) {
      this.statsRecord.textContent = scores.tempo_recorde > 0 
        ? `${scores.tempo_recorde} s` 
        : '-- s';
    }
  }

  loadLocalStorageStats() {
    let stats = { vitorias: 0, derrotas: 0, tempo_recorde: 0 };
    const saved = localStorage.getItem('minesweeper_stats');
    if (saved) {
      try { stats = JSON.parse(saved); } catch(e){}
    }
    this.updateStatsDisplay(stats);
  }

  saveLocalStorageResult(result, time) {
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
    this.updateStatsDisplay(stats);
  }

  formatThreeDigits(num) {
    if (num < 0) {
      const positivePart = Math.abs(num);
      const digits = String(positivePart).padStart(2, '0');
      return `-${digits.substring(digits.length - 2)}`;
    }
    const digits = String(num).padStart(3, '0');
    return digits.substring(digits.length - 3);
  }

  updateDigitalCounter(element, value) {
    if (element) {
      element.textContent = this.formatThreeDigits(value);
    }
  }

  setActiveDifficulty(activeBtn, config) {
    [this.btnEasy, this.btnMedium, this.btnHard].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
    this.initGame(config);
  }

  initGame(config = this.currentConfig) {
    this.currentConfig = config;
    
    // Reset state
    this.gameStarted = false;
    this.gameOver = false;
    this.gameWon = false;
    this.secondsElapsed = 0;
    this.minesLeft = config.mines;

    this.stopTimer();
    this.updateDigitalCounter(this.timerElement, 0);
    this.updateDigitalCounter(this.mineCounterElement, this.minesLeft);
    if (this.smileyIcon) this.smileyIcon.textContent = '🙂';

    // Setup CSS Grid custom variables for scaling
    if (this.gridElement) {
      this.gridElement.style.setProperty('--grid-cols', config.cols);
      this.gridElement.style.setProperty('--grid-rows', config.rows);
      this.gridElement.innerHTML = '';
    }

    if (this.consoleContainer) {
      this.consoleContainer.classList.remove('diff-easy', 'diff-medium', 'diff-hard');
      this.consoleContainer.classList.add(`diff-${config.key}`);
    }

    if (this.modalGameEnd) {
      this.modalGameEnd.classList.add('hidden');
    }

    // Build empty board state
    this.board = [];

    for (let r = 0; r < config.rows; r++) {
      this.board[r] = [];
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
        cellEl.addEventListener('mousedown', (e) => this.onCellMouseDown(e, cell));
        cellEl.addEventListener('mouseup', (e) => this.onCellMouseUp(e, cell));
        cellEl.addEventListener('click', (e) => this.onCellLeftClick(cell));
        cellEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          this.onCellRightClick(cell);
        });
        
        if (this.gridElement) this.gridElement.appendChild(cellEl);
        cell.element = cellEl;
        this.board[r][c] = cell;
      }
    }
  }

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.secondsElapsed++;
      if (this.secondsElapsed >= 999) {
        this.secondsElapsed = 999;
        this.stopTimer();
      }
      this.updateDigitalCounter(this.timerElement, this.secondsElapsed);
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  generateMines(firstCell) {
    const config = this.currentConfig;
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

      if (!this.board[r][c].isMine && !forbiddenCoords.has(key)) {
        this.board[r][c].isMine = true;
        minesPlaced++;
      }
    }

    // Calculate neighbors for all cells
    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.cols; c++) {
        if (!this.board[r][c].isMine) {
          this.board[r][c].neighborMines = this.countAdjacentMines(r, c);
        }
      }
    }
  }

  countAdjacentMines(row, col) {
    let count = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < this.currentConfig.rows && nc >= 0 && nc < this.currentConfig.cols) {
          if (this.board[nr][nc].isMine) count++;
        }
      }
    }
    return count;
  }

  onCellMouseDown(e, cell) {
    if (this.gameOver || this.gameWon) return;
    if (cell.isRevealed && cell.neighborMines > 0) return;
    if (e.button === 0 && this.smileyIcon) {
      this.smileyIcon.textContent = '😮';
    }
  }

  onCellMouseUp(e, cell) {
    if (this.gameOver || this.gameWon) return;
    if (this.smileyIcon) this.smileyIcon.textContent = '🙂';
  }

  onCellLeftClick(cell) {
    if (this.gameOver || this.gameWon || cell.isFlagged) return;

    if (!this.gameStarted) {
      this.gameStarted = true;
      this.generateMines(cell);
      this.startTimer();
    }

    if (cell.isRevealed) {
      if (cell.neighborMines > 0) {
        this.triggerChord(cell);
      }
      return;
    }

    this.revealCell(cell);
  }

  onCellRightClick(cell) {
    if (this.gameOver || this.gameWon || cell.isRevealed) return;

    if (!this.gameStarted) {
      this.gameStarted = true;
      const randomRow = Math.floor(Math.random() * this.currentConfig.rows);
      const randomCol = Math.floor(Math.random() * this.currentConfig.cols);
      this.generateMines(this.board[randomRow][randomCol]);
      this.startTimer();
    }

    cell.isFlagged = !cell.isFlagged;
    
    if (cell.isFlagged) {
      cell.element.classList.add('flagged');
      this.minesLeft--;
      this.playSound('flag');
    } else {
      cell.element.classList.remove('flagged');
      this.minesLeft++;
      this.playSound('unflag');
    }
    
    this.updateDigitalCounter(this.mineCounterElement, this.minesLeft);
  }

  revealCell(cell) {
    if (cell.isRevealed || cell.isFlagged) return;

    cell.isRevealed = true;
    cell.element.classList.remove('hidden');
    cell.element.classList.add('open');

    if (cell.isMine) {
      this.triggerLoss(cell);
      return;
    }

    this.playSound('reveal');

    if (cell.neighborMines > 0) {
      cell.element.textContent = cell.neighborMines;
      cell.element.classList.add(`num-${cell.neighborMines}`);
    } else {
      const neighbors = this.getAdjacentCells(cell.row, cell.col);
      neighbors.forEach(neigh => {
        if (!neigh.isRevealed) {
          this.revealCell(neigh);
        }
      });
    }

    this.checkWinCondition();
  }

  getAdjacentCells(row, col) {
    const cells = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < this.currentConfig.rows && nc >= 0 && nc < this.currentConfig.cols) {
          cells.push(this.board[nr][nc]);
        }
      }
    }
    return cells;
  }

  triggerChord(cell) {
    const neighbors = this.getAdjacentCells(cell.row, cell.col);
    const flagCount = neighbors.filter(n => n.isFlagged).length;

    if (flagCount === cell.neighborMines) {
      this.playSound('chord');
      neighbors.forEach(neigh => {
        if (!neigh.isRevealed && !neigh.isFlagged) {
          this.revealCell(neigh);
        }
      });
    }
  }

  checkWinCondition() {
    let unrevealedCount = 0;
    for (let r = 0; r < this.currentConfig.rows; r++) {
      for (let c = 0; c < this.currentConfig.cols; c++) {
        if (!this.board[r][c].isRevealed) {
          unrevealedCount++;
        }
      }
    }
    if (unrevealedCount === this.currentConfig.mines) {
      this.triggerWin();
    }
  }

  triggerWin() {
    this.gameWon = true;
    this.stopTimer();
    if (this.smileyIcon) this.smileyIcon.textContent = '😎';
    this.playSound('win');

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
      setTimeout(() => confettiContainer.remove(), 3000);
    }

    for (let r = 0; r < this.currentConfig.rows; r++) {
      for (let c = 0; c < this.currentConfig.cols; c++) {
        if (this.board[r][c].isMine && !this.board[r][c].isFlagged) {
          this.board[r][c].isFlagged = true;
          this.board[r][c].element.classList.add('flagged');
        }
      }
    }
    this.minesLeft = 0;
    this.updateDigitalCounter(this.mineCounterElement, 0);

    this.reportGameResult('win', this.secondsElapsed);
    
    setTimeout(() => this.showGameEndModal(true), 400);
  }

  triggerLoss(explodedCell) {
    this.gameOver = true;
    this.stopTimer();
    if (this.smileyIcon) this.smileyIcon.textContent = '😵';
    this.playSound('lose');

    const screenChassis = document.querySelector('.screen-chassis');
    if (screenChassis) {
      screenChassis.classList.add('shake');
      setTimeout(() => screenChassis.classList.remove('shake'), 500);
    }

    explodedCell.element.classList.remove('open');
    explodedCell.element.classList.add('exploded');

    for (let r = 0; r < this.currentConfig.rows; r++) {
      for (let c = 0; c < this.currentConfig.cols; c++) {
        const cell = this.board[r][c];
        if (cell.isMine && cell !== explodedCell) {
          if (!cell.isFlagged) {
            cell.element.classList.remove('hidden');
            cell.element.classList.add('mine');
          }
        } else if (!cell.isMine && cell.isFlagged) {
          cell.element.classList.remove('flagged');
          cell.element.classList.add('open');
          cell.element.textContent = '❌';
          cell.element.style.fontSize = '12px';
        }
      }
    }

    this.reportGameResult('loss');

    setTimeout(() => this.showGameEndModal(false), 600);
  }

  showGameEndModal(isWin) {
    if (!this.modalGameEnd) return;
    if (isWin) {
      this.gameEndHeading.textContent = 'VITÓRIA! 🎉';
      this.gameEndHeading.style.color = 'var(--color-nav-gold)';
      this.gameEndMsg.textContent = `Parabéns! Você desarmou todas as minas com sucesso em ${this.secondsElapsed} segundos.`;
      if (this.gameEndBar) {
        this.gameEndBar.style.backgroundColor = 'var(--color-periwinkle)';
      }
    } else {
      this.gameEndHeading.textContent = 'FIM DE JOGO! 💥';
      this.gameEndHeading.style.color = 'var(--color-primary)';
      this.gameEndMsg.textContent = 'Você detonou uma mina terrestre. Tente novamente para superar o campo!';
      if (this.gameEndBar) {
        this.gameEndBar.style.backgroundColor = 'var(--color-canvas)';
      }
    }
    this.modalGameEnd.classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.game = new AetherSweeper();
});
