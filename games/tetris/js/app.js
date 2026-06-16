/**
 * Aether Tetris — Main Game Logic
 * Designed under Linear.app design guidelines
 */

// Grid Dimensions
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30; // Block size in pixels

// Tetromino Colors (Sleek Linear palette: translucent & glowing)
const COLORS = [
  null,
  '#38bdf8', // I - Cyan/Sky blue
  '#facc15', // O - Yellow
  '#a855f7', // T - Purple/Lavender
  '#22c55e', // S - Green
  '#ef4444', // Z - Red
  '#3b82f6', // J - Blue
  '#f97316'  // L - Orange
];

// Tetromino Shapes Matrices
const SHAPES = [
  null,
  // I
  [[0,0,0,0],
   [1,1,1,1],
   [0,0,0,0],
   [0,0,0,0]],
  // O
  [[2,2],
   [2,2]],
  // T
  [[0,3,0],
   [3,3,3],
   [0,0,0]],
  // S
  [[0,4,4],
   [4,4,0],
   [0,0,0]],
  // Z
  [[5,5,0],
   [0,5,5],
   [0,0,0]],
  // J
  [[6,0,0],
   [6,6,6],
   [0,0,0]],
  // L
  [[0,0,7],
   [7,7,7],
   [0,0,0]]
];

class AetherTetris {
  constructor() {
    // DOM Canvas References
    this.canvas = document.getElementById('canvas-board');
    this.ctx = this.canvas.getContext('2d');
    
    this.canvasHold = document.getElementById('canvas-hold');
    this.ctxHold = this.canvasHold.getContext('2d');
    
    this.canvasNext = document.getElementById('canvas-next');
    this.ctxNext = this.canvasNext.getContext('2d');
    
    // UI Label Elements
    this.lblScore = document.getElementById('lbl-score');
    this.lblLines = document.getElementById('lbl-lines');
    this.lblLevel = document.getElementById('lbl-level');
    this.lblTime = document.getElementById('lbl-time');
    this.valCurrentMode = document.getElementById('val-current-mode');
    this.lblActiveModeName = document.getElementById('lbl-active-mode-name');
    
    // Highscore Displays
    this.valRecordClassic = document.getElementById('val-record-classic');
    this.valRecordTimeAttack = document.getElementById('val-record-timeattack');
    
    // Overlays & Modals
    this.aetherContainer = document.getElementById('aether-container');
    this.startOverlay = document.getElementById('start-overlay');
    this.pauseOverlay = document.getElementById('pause-overlay');
    this.modalInfo = document.getElementById('modal-info');
    this.modalGameOver = document.getElementById('modal-gameover');
    this.modalConfirm = document.getElementById('modal-confirm');
    
    // Lobby Settings Elements
    this.lblLobbyStartLevel = document.getElementById('lobby-lbl-start-level');
    this.btnLobbyStart = document.getElementById('btn-start');
    this.btnMenuLobby = document.getElementById('btn-menu-lobby');
    this.btnResume = document.getElementById('btn-resume');
    this.btnRetry = document.getElementById('btn-retry');
    
    // Game State Variables
    this.board = this.createBoard();
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.startLevel = 1;
    this.mode = 'classico'; // 'classico', 'contrarrelogio', 'zen'
    this.isPaused = false;
    this.isGameOver = false;
    this.isPlaying = false;
    
    // Pieces variables
    this.currentPiece = null;
    this.nextPiece = null;
    this.holdPiece = null;
    this.hasHeldThisTurn = false;
    this.bag = [];
    
    // Timing and Loops
    this.gameInterval = null;
    this.timeTickInterval = null;
    this.gameTime = 0; // in seconds
    
    // Lobby State Cache (Temporary choices before game begins)
    this.lobbySelectedMode = 'classico';
    this.lobbySelectedLevel = 1;
    
    // Record flag
    this.isNewRecordThisGame = false;
    
    // Score Cache
    this.highScores = {
      classico: { pontuacao_maxima: 0, linhas_maximas: 0 },
      contrarrelogio: { tempo_recorde: 0 }
    };
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadHighScores();
    this.resizeCanvas();
    this.drawBoard();
    
    // Monitor viewport resize
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.drawAll();
    });
  }

  createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  // Adjusts rendering dimensions based on CSS display sizes
  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width || 300;
    this.canvas.height = rect.height || 600;
    
    this.canvasHold.width = this.canvasHold.clientWidth || 100;
    this.canvasHold.height = this.canvasHold.width; // Force 1:1 aspect ratio
    
    this.canvasNext.width = this.canvasNext.clientWidth || 100;
    this.canvasNext.height = this.canvasNext.width; // Force 1:1 aspect ratio
  }

  // Custom reusable confirmation modal (replaces native confirm popup)
  showConfirm(title, message, onYes, onNo = null) {
    document.getElementById('confirm-heading').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    
    const yesBtn = document.getElementById('btn-confirm-yes');
    const noBtn = document.getElementById('btn-confirm-no');
    
    // Clone nodes to clear previous event listeners
    const newYes = yesBtn.cloneNode(true);
    const newNo = noBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYes, yesBtn);
    noBtn.parentNode.replaceChild(newNo, noBtn);
    
    const pauseBeforeConfirm = this.isPlaying && !this.isPaused && !this.isGameOver;
    if (pauseBeforeConfirm) {
      this.isPaused = true;
      this.pauseOverlay.classList.remove('hidden');
    }
    
    newYes.addEventListener('click', () => {
      this.modalConfirm.classList.add('hidden');
      if (pauseBeforeConfirm) {
        this.isPaused = false;
        this.pauseOverlay.classList.add('hidden');
      }
      if (onYes) onYes();
    });
    
    newNo.addEventListener('click', () => {
      this.modalConfirm.classList.add('hidden');
      if (pauseBeforeConfirm) {
        this.isPaused = false;
        this.pauseOverlay.classList.add('hidden');
      }
      if (onNo) onNo();
    });
    
    this.modalConfirm.classList.remove('hidden');
  }

  // Fetch record stats from local Python backend API
  async loadHighScores() {
    try {
      const response = await fetch('/api/score');
      if (response.ok) {
        const data = await response.json();
        this.highScores = {
          classico: { pontuacao_maxima: 0, linhas_maximas: 0, vitorias: 0, derrotas: 0, ...(data.classico || {}) },
          contrarrelogio: { tempo_recorde: 0, ...(data.contrarrelogio || {}) }
        };
        document.getElementById('api-status').innerText = 'API CONECTADA';
        document.getElementById('api-status').parentElement.querySelector('.dot').style.backgroundColor = 'var(--color-success)';
      } else {
        throw new Error('Server returned error response.');
      }
    } catch (error) {
      console.warn("Using localStorage for scores due to API error:", error);
      document.getElementById('api-status').innerText = 'MODO OFFLINE';
      document.getElementById('api-status').parentElement.querySelector('.dot').style.backgroundColor = 'var(--color-warning)';
      
      const local = localStorage.getItem('aether_tetris_scores');
      if (local) {
        try {
          const data = JSON.parse(local);
          this.highScores = {
            classico: { pontuacao_maxima: 0, linhas_maximas: 0, vitorias: 0, derrotas: 0, ...(data.classico || {}) },
            contrarrelogio: { tempo_recorde: 0, ...(data.contrarrelogio || {}) }
          };
        } catch (e) {
          // Keep default scores structure
        }
      }
    }
    this.updateRecordDisplays();
  }

  // Submits score details to the server
  submitScore(resultType) {
    this.isNewRecordThisGame = false;
    
    if (!this.highScores) {
      this.highScores = {
        classico: { pontuacao_maxima: 0, linhas_maximas: 0, vitorias: 0, derrotas: 0 },
        contrarrelogio: { tempo_recorde: 0 }
      };
    }
    if (!this.highScores.classico) {
      this.highScores.classico = { pontuacao_maxima: 0, linhas_maximas: 0, vitorias: 0, derrotas: 0 };
    }
    if (!this.highScores.contrarrelogio) {
      this.highScores.contrarrelogio = { tempo_recorde: 0 };
    }

    // Optimistic synchronous update of local scores cache
    if (this.mode === 'classico') {
      if (resultType === 'win') this.highScores.classico.vitorias++;
      else if (resultType === 'loss') this.highScores.classico.derrotas++;
      
      const oldMax = this.highScores.classico.pontuacao_maxima || 0;
      if (this.score > oldMax && this.score > 0) {
        this.isNewRecordThisGame = true;
        this.highScores.classico.pontuacao_maxima = this.score;
      }
      const oldLinesMax = this.highScores.classico.linhas_maximas || 0;
      if (this.lines > oldLinesMax) {
        this.highScores.classico.linhas_maximas = this.lines;
      }
    } else if (this.mode === 'contrarrelogio' && resultType === 'win') {
      const oldRecord = this.highScores.contrarrelogio.tempo_recorde || 0;
      if ((oldRecord === 0 || this.gameTime < oldRecord) && this.gameTime > 0) {
        this.isNewRecordThisGame = true;
        this.highScores.contrarrelogio.tempo_recorde = this.gameTime;
      }
    }

    this.updateRecordDisplays();

    const payload = {
      mode: this.mode,
      result: resultType,
      score: this.score,
      lines: this.lines,
      time: this.gameTime
    };

    // Send score update to the server in the background
    fetch('/api/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (response.ok) return response.json();
      throw new Error('API save failed');
    })
    .then(data => {
      this.highScores = data.scores;
      this.updateRecordDisplays();
    })
    .catch(error => {
      console.warn("API save error, backup saved to localStorage:", error);
      localStorage.setItem('aether_tetris_scores', JSON.stringify(this.highScores));
    });
  }

  // Clears historical scores
  async resetScores() {
    this.showConfirm(
      'Zerar Placar',
      'Tem certeza de que deseja zerar todos os recordes salvos? Esta ação não poderá ser desfeita.',
      async () => {
        try {
          const response = await fetch('/api/score', { method: 'DELETE' });
          if (response.ok) {
            const data = await response.json();
            this.highScores = data.scores;
          }
        } catch (error) {
          this.highScores = {
            classico: { pontuacao_maxima: 0, linhas_maximas: 0, vitorias: 0, derrotas: 0 },
            contrarrelogio: { tempo_recorde: 0 }
          };
          localStorage.setItem('aether_tetris_scores', JSON.stringify(this.highScores));
        }
        this.updateRecordDisplays();
      }
    );
  }

  updateRecordDisplays() {
    const maxScore = this.highScores.classico?.pontuacao_maxima || 0;
    this.valRecordClassic.innerText = `${maxScore.toLocaleString('pt-BR')} pts`;
    
    const bestTime = this.highScores.contrarrelogio?.tempo_recorde || 0;
    if (bestTime > 0) {
      this.valRecordTimeAttack.innerText = `${this.formatTime(bestTime)}`;
    } else {
      this.valRecordTimeAttack.innerText = `-- s`;
    }
  }

  // Setup Event Listeners
  setupEventListeners() {
    // Keyboard inputs
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));

    // UI Buttons
    this.btnLobbyStart.addEventListener('click', () => this.startGame());
    this.btnResume.addEventListener('click', () => this.togglePause());
    this.btnRetry.addEventListener('click', () => {
      this.closeModal(this.modalGameOver);
      this.startGame();
    });

    // Close Modals
    document.getElementById('modal-info-close').addEventListener('click', () => this.closeModal(this.modalInfo));
    document.getElementById('btn-info-close-ok').addEventListener('click', () => this.closeModal(this.modalInfo));
    document.getElementById('modal-gameover-close').addEventListener('click', () => this.closeModal(this.modalGameOver));
    document.getElementById('btn-gameover-close-ok').addEventListener('click', () => this.closeModal(this.modalGameOver));

    this.btnInfo = document.getElementById('btn-info');
    this.btnInfo.addEventListener('click', () => this.openModal(this.modalInfo));

    // Reset scores trigger
    document.getElementById('btn-reset-scores').addEventListener('click', () => this.resetScores());

    // Home/Lobby Button (exits game back to lobby)
    this.btnMenuLobby.addEventListener('click', () => {
      if (this.isPlaying && !this.isGameOver) {
        this.showConfirm(
          'Sair para o Menu',
          'Deseja sair para o menu inicial? Seu progresso na partida atual será perdido.',
          () => {
            this.stopGameAndShowLobby();
          }
        );
      } else {
        this.stopGameAndShowLobby();
      }
    });

    // Setup Lobby Mode Selection Buttons
    const selectLobbyMode = (modeCard) => {
      document.querySelectorAll('.lobby-mode-card').forEach(c => c.classList.remove('active'));
      modeCard.classList.add('active');
      this.lobbySelectedMode = modeCard.dataset.mode;
    };

    document.querySelectorAll('.lobby-mode-card').forEach(card => {
      card.addEventListener('click', () => selectLobbyMode(card));
    });

    // Setup Lobby Starting Level Buttons
    document.getElementById('lobby-btn-lvl-dec').addEventListener('click', () => {
      if (this.lobbySelectedLevel > 1) {
        this.lobbySelectedLevel--;
        this.lblLobbyStartLevel.innerText = this.lobbySelectedLevel;
      }
    });

    document.getElementById('lobby-btn-lvl-inc').addEventListener('click', () => {
      if (this.lobbySelectedLevel < 10) {
        this.lobbySelectedLevel++;
        this.lblLobbyStartLevel.innerText = this.lobbySelectedLevel;
      }
    });

    // Toggle Sound Button
    const btnSound = document.getElementById('btn-sound-toggle');
    btnSound.addEventListener('click', () => {
      const isMuted = window.sounds.toggleMute();
      btnSound.querySelector('.icon').innerText = isMuted ? '🔇' : '🔊';
      btnSound.querySelector('.label').innerText = isMuted ? 'Som: DESLIGADO' : 'Som: LIGADO';
    });

    // Mobile controls setup
    this.setupMobileControls();
  }

  // Register mobile touch controls
  setupMobileControls() {
    const triggerAction = (actionName) => {
      if (!this.isPlaying || this.isPaused || this.isGameOver) return;
      window.sounds.init();
      
      switch (actionName) {
        case 'left':
          this.movePiece(-1, 0);
          break;
        case 'right':
          this.movePiece(1, 0);
          break;
        case 'down':
          this.movePiece(0, 1);
          break;
        case 'rotate':
          this.rotatePiece(true);
          break;
        case 'rotate-ccw':
          this.rotatePiece(false);
          break;
        case 'hold':
          this.holdCurrentPiece();
          break;
        case 'drop':
          this.hardDropPiece();
          break;
      }
    };

    const registerTouch = (elementId, action) => {
      const btn = document.getElementById(elementId);
      if (!btn) return;
      
      const preventDefault = (e) => {
        if (e.cancelable) e.preventDefault();
      };
      
      btn.addEventListener('touchstart', (e) => {
        preventDefault(e);
        triggerAction(action);
        btn.classList.add('active');
      }, { passive: false });

      btn.addEventListener('touchend', (e) => {
        preventDefault(e);
        btn.classList.remove('active');
      }, { passive: false });

      // Fallback click listener for desktop simulation testing
      btn.addEventListener('mousedown', () => {
        triggerAction(action);
      });
    };

    registerTouch('ctrl-left', 'left');
    registerTouch('ctrl-right', 'right');
    registerTouch('ctrl-down', 'down');
    registerTouch('ctrl-rotate', 'rotate');
    registerTouch('ctrl-rotate-ccw', 'rotate-ccw');
    registerTouch('ctrl-hold', 'hold');
    registerTouch('ctrl-drop', 'drop');
  }

  // Keyboard controls handler
  handleKeyDown(e) {
    if (!this.isPlaying || this.isGameOver) {
      return;
    }

    if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault();
      this.togglePause();
      return;
    }

    if (this.isPaused) return;

    window.sounds.init();

    switch (e.code) {
      case 'ArrowLeft':
        e.preventDefault();
        this.movePiece(-1, 0);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.movePiece(1, 0);
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.movePiece(0, 1);
        break;
      case 'ArrowUp':
      case 'KeyX':
        e.preventDefault();
        this.rotatePiece(true); // Clockwise
        break;
      case 'KeyZ':
      case 'ControlLeft':
      case 'ControlRight':
        e.preventDefault();
        this.rotatePiece(false); // Counter-Clockwise
        break;
      case 'Space':
        e.preventDefault();
        this.hardDropPiece();
        break;
      case 'KeyC':
      case 'ShiftLeft':
      case 'ShiftRight':
        e.preventDefault();
        this.holdCurrentPiece();
        break;
    }
  }

  // Resets game variables before starting a session
  resetGameValues() {
    this.board = this.createBoard();
    this.score = 0;
    this.isPaused = false;
    this.isGameOver = false;
    this.hasHeldThisTurn = false;
    this.holdPiece = null;
    this.currentPiece = null;
    this.nextPiece = null;
    this.bag = [];
    this.gameTime = 0;
    
    // Set variables configured in the lobby start overlay
    this.mode = this.lobbySelectedMode;
    this.level = this.lobbySelectedLevel;
    this.startLevel = this.lobbySelectedLevel;
    
    // Map mode name display
    let modeText = 'CLÁSSICO';
    if (this.mode === 'contrarrelogio') modeText = 'CONTRARRELÓGIO';
    else if (this.mode === 'zen') modeText = 'ZEN';
    
    this.valCurrentMode.innerText = modeText;
    this.lblActiveModeName.innerText = modeText;
    
    // Align columns
    const statLinesBox = document.getElementById('stat-lines-box');
    const lblLinesTitle = document.getElementById('lbl-lines-title');
    const lblTimeTitle = document.getElementById('lbl-time-title');
    
    if (this.mode === 'contrarrelogio') {
      this.lines = 40; // Remaining lines target
      lblLinesTitle.innerText = 'RESTANTES';
      lblTimeTitle.innerText = 'CRONÔMETRO';
    } else {
      this.lines = 0;
      lblLinesTitle.innerText = 'LINHAS';
      lblTimeTitle.innerText = 'TEMPO';
    }

    this.updateHUD();
  }

  // Starts the active game run
  startGame() {
    window.sounds.init();
    
    this.stopTimers();
    this.resetGameValues();
    this.isPlaying = true;
    this.isGameOver = false;

    // Show side panels and settings bar by removing game-idle class
    this.aetherContainer.classList.remove('game-idle');
    this.startOverlay.classList.add('hidden');
    this.pauseOverlay.classList.add('hidden');

    // Recalculate canvas sizes after removing hide class
    this.resizeCanvas();

    // Retrieve initial pieces
    this.currentPiece = this.getNewPiece();
    this.nextPiece = this.getNewPiece();

    this.startTimers();
    this.drawAll();
  }

  // Halts game execution and resets back to lobby overlay
  stopGameAndShowLobby() {
    this.isPlaying = false;
    this.isGameOver = false;
    this.stopTimers();
    
    // Hide side panels and settings bar by adding game-idle class
    this.aetherContainer.classList.add('game-idle');
    this.startOverlay.classList.remove('hidden');
    this.pauseOverlay.classList.add('hidden');
    
    this.resetGameValues();
    this.drawAll();
  }

  // Stop active game intervals
  stopTimers() {
    if (this.gameInterval) clearInterval(this.gameInterval);
    if (this.timeTickInterval) clearInterval(this.timeTickInterval);
    this.gameInterval = null;
    this.timeTickInterval = null;
  }

  // Start gravity and timer loops
  startTimers() {
    const speed = this.getDropSpeed();
    
    this.gameInterval = setInterval(() => {
      if (!this.isPaused && !this.isGameOver) {
        this.movePiece(0, 1);
      }
    }, speed);

    this.timeTickInterval = setInterval(() => {
      if (!this.isPaused && !this.isGameOver) {
        this.gameTime++;
        this.lblTime.innerText = this.formatTime(this.gameTime);
      }
    }, 1000);
  }

  // Updates active drop speeds upon leveling up
  resetGravityInterval() {
    if (this.gameInterval) clearInterval(this.gameInterval);
    const speed = this.getDropSpeed();
    this.gameInterval = setInterval(() => {
      if (!this.isPaused && !this.isGameOver) {
        this.movePiece(0, 1);
      }
    }, speed);
  }

  // Mapping level to block falling speeds in milliseconds
  getDropSpeed() {
    if (this.mode === 'zen') return 1000;

    const speedMap = [1000, 850, 720, 600, 500, 400, 310, 220, 150, 100];
    const lvlIndex = Math.min(Math.max(this.level, 1), 10) - 1;
    return speedMap[lvlIndex];
  }

  // Format seconds to MM:SS string
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Render stats update
  updateHUD() {
    this.lblScore.innerText = this.score.toString().padStart(6, '0');
    this.lblLines.innerText = this.lines;
    this.lblLevel.innerText = this.level;
    this.lblTime.innerText = this.formatTime(this.gameTime);
  }

  // Grabs next tetromino using 7-bag method
  getNewPiece() {
    if (this.bag.length === 0) {
      this.bag = [1, 2, 3, 4, 5, 6, 7];
      // Shuffle bag
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }

    const type = this.bag.pop();
    const matrix = SHAPES[type];
    
    const x = Math.floor((COLS - matrix[0].length) / 2);
    const y = type === 1 ? -1 : 0; // Center piece I higher up

    return {
      type,
      matrix,
      x,
      y
    };
  }

  // Slide block on grid
  movePiece(dx, dy) {
    if (this.isPaused || this.isGameOver) return false;

    if (!this.checkCollision(this.currentPiece.matrix, this.currentPiece.x + dx, this.currentPiece.y + dy)) {
      this.currentPiece.x += dx;
      this.currentPiece.y += dy;
      
      if (dy > 0) {
        if (this.mode !== 'zen') this.score += 1;
        this.updateHUD();
      } else if (dx !== 0) {
        window.sounds.playMove();
      }
      
      this.drawAll();
      return true;
    }

    // Trigger lock if bottom collision is hit
    if (dy > 0) {
      this.lockPiece();
    }
    return false;
  }

  // Hard drop action
  hardDropPiece() {
    if (this.isPaused || this.isGameOver) return;

    let dropCount = 0;
    while (!this.checkCollision(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y + 1)) {
      this.currentPiece.y++;
      dropCount++;
    }

    if (this.mode !== 'zen') {
      this.score += dropCount * 2;
    }
    
    // Subtle shake on drop
    const boardFrame = document.getElementById('board-frame');
    boardFrame.classList.add('shake');
    setTimeout(() => boardFrame.classList.remove('shake'), 150);

    this.lockPiece();
  }

  // Rotates block using kicks
  rotatePiece(clockwise) {
    if (this.isPaused || this.isGameOver) return;

    const matrix = this.currentPiece.matrix;
    const n = matrix.length;
    const rotated = Array.from({ length: n }, () => Array(n).fill(0));

    // Matrix transposition
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (clockwise) {
          rotated[c][n - 1 - r] = matrix[r][c];
        } else {
          rotated[n - 1 - c][r] = matrix[r][c];
        }
      }
    }

    // Wall kicks kicks table
    const kicks = [
      [0, 0],   
      [-1, 0],  
      [1, 0],   
      [0, -1],  
      [-2, 0],  
      [2, 0]    
    ];

    for (let i = 0; i < kicks.length; i++) {
      const [kx, ky] = kicks[i];
      if (!this.checkCollision(rotated, this.currentPiece.x + kx, this.currentPiece.y + ky)) {
        this.currentPiece.matrix = rotated;
        this.currentPiece.x += kx;
        this.currentPiece.y += ky;
        window.sounds.playRotate();
        this.drawAll();
        return;
      }
    }
  }

  // Hold feature
  holdCurrentPiece() {
    if (this.isPaused || this.isGameOver || this.hasHeldThisTurn) return;

    window.sounds.playHold();
    
    const typeToHold = this.currentPiece.type;

    if (this.holdPiece === null) {
      this.holdPiece = typeToHold;
      this.currentPiece = this.nextPiece;
      this.nextPiece = this.getNewPiece();
    } else {
      const temp = this.holdPiece;
      this.holdPiece = typeToHold;
      
      const matrix = SHAPES[temp];
      const x = Math.floor((COLS - matrix[0].length) / 2);
      const y = temp === 1 ? -1 : 0;

      this.currentPiece = {
        type: temp,
        matrix,
        x,
        y
      };
    }

    this.hasHeldThisTurn = true;
    this.drawAll();
  }

  // Check collision boundary limits
  checkCollision(matrix, xOffset, yOffset) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          const boardX = xOffset + c;
          const boardY = yOffset + r;

          if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
            return true;
          }

          if (boardY >= 0 && this.board[boardY][boardX] !== 0) {
            return true;
          }
        }
      }
    }
    return false;
  }

  // Lock current piece to board
  lockPiece() {
    const matrix = this.currentPiece.matrix;
    const px = this.currentPiece.x;
    const py = this.currentPiece.y;

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          if (py + r < 0) {
            this.handleGameOver();
            return;
          }
          this.board[py + r][px + c] = this.currentPiece.type;
        }
      }
    }

    window.sounds.playLock();
    this.clearLines();

    // Spawn next piece
    this.currentPiece = this.nextPiece;
    this.nextPiece = this.getNewPiece();
    this.hasHeldThisTurn = false;

    // Check immediate spawn collision
    if (this.checkCollision(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y)) {
      this.handleGameOver();
    }

    this.drawAll();
  }

  // Clear completed rows
  clearLines() {
    let clearedLinesThisTurn = 0;
    
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.board[r].every(cell => cell !== 0)) {
        this.board.splice(r, 1);
        this.board.unshift(Array(COLS).fill(0));
        clearedLinesThisTurn++;
        r++; // Adjust index
      }
    }

    if (clearedLinesThisTurn > 0) {
      if (clearedLinesThisTurn === 4) {
        window.sounds.playTetris();
        const boardFrame = document.getElementById('board-frame');
        boardFrame.classList.add('shake');
        setTimeout(() => boardFrame.classList.remove('shake'), 300);
      } else {
        window.sounds.playLineClear();
      }

      // Mode logic stats calculations
      if (this.mode === 'contrarrelogio') {
        this.lines = Math.max(0, this.lines - clearedLinesThisTurn);
        
        if (this.lines === 0) {
          this.handleVictory();
          return;
        }
      } else {
        this.lines += clearedLinesThisTurn;
        
        if (this.mode === 'classico') {
          const scoreMap = [0, 100, 300, 500, 800];
          this.score += scoreMap[clearedLinesThisTurn] * this.level;

          const targetLevel = Math.floor(this.lines / 10) + this.startLevel;
          if (targetLevel > this.level && this.level < 10) {
            this.level = Math.min(10, targetLevel);
            window.sounds.playLevelUp();
            this.resetGravityInterval();
          }
        }
      }

      this.updateHUD();
    }
  }

  // Zen limit handler (clears top half to continue gameplay endlessly)
  handleZenLimit() {
    for (let r = 0; r < ROWS / 2; r++) {
      this.board[r].fill(0);
    }
    this.currentPiece.y = 0;
    this.currentPiece.x = Math.floor((COLS - this.currentPiece.matrix[0].length) / 2);
    this.drawAll();
  }

  // Game Over trigger
  handleGameOver() {
    if (this.mode === 'zen') {
      this.handleZenLimit();
      return;
    }

    this.isGameOver = true;
    this.isPlaying = false;
    this.stopTimers();
    
    window.sounds.playGameOver();
    this.submitScore('loss');

    // Setup modal elements
    document.getElementById('gameover-header').style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
    document.getElementById('gameover-title').innerText = 'FIM DE JOGO';
    document.getElementById('gameover-heading').innerText = 'Fim de Jogo!';
    document.getElementById('gameover-heading').style.color = 'var(--color-error)';
    document.getElementById('gameover-status-icon').innerText = '💀';
    document.getElementById('gameover-message').innerText = 
      this.mode === 'contrarrelogio' 
        ? 'Você atingiu o topo antes de limpar as 40 linhas.' 
        : 'Sua pilha de blocos atingiu o topo do tabuleiro.';

    this.showGameOverModal();
  }

  // Victory (exclusive to Time Attack)
  handleVictory() {
    this.isGameOver = true;
    this.isPlaying = false;
    this.stopTimers();
    
    window.sounds.playLevelUp();
    this.submitScore('win');

    document.getElementById('gameover-header').style.backgroundColor = 'rgba(39, 166, 68, 0.1)';
    document.getElementById('gameover-title').innerText = 'DESAFIO CONCLUÍDO';
    document.getElementById('gameover-heading').innerText = 'Parabéns!';
    document.getElementById('gameover-heading').style.color = 'var(--color-success)';
    document.getElementById('gameover-status-icon').innerText = '🏆';
    document.getElementById('gameover-message').innerText = 'Você limpou as 40 linhas no Contrarrelógio!';

    this.showGameOverModal();
  }

  showGameOverModal() {
    document.getElementById('sum-score').innerText = this.score.toLocaleString('pt-BR');
    
    if (this.mode === 'contrarrelogio') {
      document.getElementById('sum-lines').innerText = '40 / 40';
    } else {
      document.getElementById('sum-lines').innerText = this.lines;
    }
    
    document.getElementById('sum-level').innerText = this.level;
    document.getElementById('sum-time').innerText = this.formatTime(this.gameTime);

    const recordNotice = document.getElementById('record-notice');
    if (this.isNewRecordThisGame) {
      recordNotice.classList.remove('hidden');
    } else {
      recordNotice.classList.add('hidden');
    }

    this.openModal(this.modalGameOver);
  }

  // Pause toggle
  togglePause() {
    if (!this.isPlaying || this.isGameOver) return;

    this.isPaused = !this.isPaused;
    
    if (this.isPaused) {
      this.pauseOverlay.classList.remove('hidden');
    } else {
      this.pauseOverlay.classList.add('hidden');
    }
  }

  // Open Modal
  openModal(modal) {
    modal.classList.remove('hidden');
  }

  // Close Modal
  closeModal(modal) {
    modal.classList.add('hidden');
  }

  // ==========================================================================
  // GRAPHICAL RENDERING MODULE (Canvas Drawing)
  // ==========================================================================

  drawAll() {
    this.drawBoard();
    this.drawHold();
    this.drawNext();
  }

  // Renders individual block with subtle volume gradients
  drawBlock(ctx, x, y, colorIndex, isGhost = false, scaleFactor = 1) {
    const size = BLOCK_SIZE * scaleFactor;
    const drawX = x * size;
    const drawY = y * size;

    if (isGhost) {
      ctx.strokeStyle = COLORS[colorIndex];
      ctx.lineWidth = 2;
      ctx.strokeRect(drawX + 2, drawY + 2, size - 4, size - 4);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fillRect(drawX + 2, drawY + 2, size - 4, size - 4);
    } else {
      const gradient = ctx.createLinearGradient(drawX, drawY, drawX + size, drawY + size);
      gradient.addColorStop(0, COLORS[colorIndex]);
      gradient.addColorStop(1, this.adjustBrightness(COLORS[colorIndex], -40)); 
      ctx.fillStyle = gradient;
      
      ctx.beginPath();
      ctx.roundRect(drawX + 1, drawY + 1, size - 2, size - 2, 4); 
      ctx.fill();

      // Top-left border highlight
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // Darken colors for gradients
  adjustBrightness(hex, percent) {
    let R = parseInt(hex.substring(1, 3), 16);
    let G = parseInt(hex.substring(3, 5), 16);
    let B = parseInt(hex.substring(5, 7), 16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = (R < 255) ? R : 255;
    G = (G < 255) ? G : 255;
    B = (B < 255) ? B : 255;

    R = (R > 0) ? R : 0;
    G = (G > 0) ? G : 0;
    B = (B > 0) ? B : 0;

    const rHex = R.toString(16).padStart(2, '0');
    const gHex = G.toString(16).padStart(2, '0');
    const bHex = B.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
  }

  // Draw board background grid lines
  drawGridLines() {
    this.ctx.strokeStyle = 'rgba(35, 37, 42, 0.25)'; 
    this.ctx.lineWidth = 1;

    const size = this.canvas.width / COLS;

    // Vertical grid lines
    for (let c = 1; c < COLS; c++) {
      this.ctx.beginPath();
      this.ctx.moveTo(c * size, 0);
      this.ctx.lineTo(c * size, this.canvas.height);
      this.ctx.stroke();
    }

    // Horizontal grid lines
    for (let r = 1; r < ROWS; r++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, r * size);
      this.ctx.lineTo(this.canvas.width, r * size);
      this.ctx.stroke();
    }
  }

  // Main board rendering
  drawBoard() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    this.drawGridLines();

    const scale = this.canvas.width / (COLS * BLOCK_SIZE);

    // 1. Draw static grid blocks
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.board[r][c] !== 0) {
          this.drawBlock(this.ctx, c, r, this.board[r][c], false, scale);
        }
      }
    }

    // 2. Draw ghost drop piece
    if (this.isPlaying && this.currentPiece && !this.isPaused && !this.isGameOver) {
      let ghostY = this.currentPiece.y;
      while (!this.checkCollision(this.currentPiece.matrix, this.currentPiece.x, ghostY + 1)) {
        ghostY++;
      }
      
      if (ghostY !== this.currentPiece.y) {
        const matrix = this.currentPiece.matrix;
        for (let r = 0; r < matrix.length; r++) {
          for (let c = 0; c < matrix[r].length; c++) {
            if (matrix[r][c] !== 0) {
              this.drawBlock(this.ctx, this.currentPiece.x + c, ghostY + r, this.currentPiece.type, true, scale);
            }
          }
        }
      }

      // 3. Draw active block
      const matrix = this.currentPiece.matrix;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c] !== 0 && this.currentPiece.y + r >= 0) {
            this.drawBlock(this.ctx, this.currentPiece.x + c, this.currentPiece.y + r, this.currentPiece.type, false, scale);
          }
        }
      }
    }
  }

  // Render static piece preview (hold & next displays)
  drawStaticPiece(ctx, canvas, type) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!type) return;

    const matrix = SHAPES[type];
    const n = matrix.length;

    let minRow = n, maxRow = -1, minCol = n, maxCol = -1;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (matrix[r][c] !== 0) {
          if (r < minRow) minRow = r;
          if (r > maxRow) maxRow = r;
          if (c < minCol) minCol = c;
          if (c > maxCol) maxCol = c;
        }
      }
    }

    const pieceWidth = maxCol - minCol + 1;
    const pieceHeight = maxRow - minRow + 1;

    const size = canvas.width / 4.5;
    
    // Offset calculation for centering
    const xOffset = (canvas.width - pieceWidth * size) / 2 - minCol * size;
    const yOffset = (canvas.height - pieceHeight * size) / 2 - minRow * size;

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (matrix[r][c] !== 0) {
          const drawX = xOffset + c * size;
          const drawY = yOffset + r * size;

          const gradient = ctx.createLinearGradient(drawX, drawY, drawX + size, drawY + size);
          gradient.addColorStop(0, COLORS[type]);
          gradient.addColorStop(1, this.adjustBrightness(COLORS[type], -40));
          ctx.fillStyle = gradient;

          ctx.beginPath();
          ctx.roundRect(drawX + 1, drawY + 1, size - 2, size - 2, 3);
          ctx.fill();

          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  drawHold() {
    this.drawStaticPiece(this.ctxHold, this.canvasHold, this.holdPiece);
  }

  drawNext() {
    const nextType = this.nextPiece ? this.nextPiece.type : null;
    this.drawStaticPiece(this.ctxNext, this.canvasNext, nextType);
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new AetherTetris();
});
