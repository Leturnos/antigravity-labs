import { CONFIG } from './config.js';
import { FlowField } from './engine/flowfield.js';
import { SpatialHashGrid } from './engine/spatial-hash.js';
import { SwarmEngine } from './engine/swarm.js';
import { TowerSystem } from './engine/tower-system.js';
import { SoundSynth } from './audio/sound-synth.js';
import { GameRenderer } from './ui/renderer.js';
import { HUD } from './ui/hud.js';

/**
 * Calculates progressive wave composition and difficulty parameters.
 * Scales from intro waves up to massive multi-thousand creep swarms.
 *
 * @param {number} wave Wave number (1-based)
 * @returns {object}
 */
export function calculateWaveConfig(wave) {
  const w = Math.max(1, Math.floor(wave));

  // Total creep count scales exponentially then smoothly up to 10,000 capacity
  const totalCreeps = Math.min(10000, Math.floor(45 * Math.pow(w, 1.32) + 15));

  // Creep Archetype composition
  let swarmerRatio = 1.0;
  let bruteRatio = 0.0;
  let disruptorRatio = 0.0;

  if (w === 1) {
    swarmerRatio = 1.0;
  } else if (w < 4) {
    bruteRatio = Math.min(0.25, (w - 1) * 0.08);
    swarmerRatio = 1.0 - bruteRatio;
  } else {
    bruteRatio = Math.min(0.30, 0.15 + (w - 4) * 0.012);
    disruptorRatio = Math.min(0.25, 0.08 + (w - 4) * 0.015);
    swarmerRatio = Math.max(0.45, 1.0 - bruteRatio - disruptorRatio);
  }

  const swarmers = Math.round(totalCreeps * swarmerRatio);
  const brutes = Math.round(totalCreeps * bruteRatio);
  const disruptors = totalCreeps - swarmers - brutes;

  // Duration over which this wave's creeps spawn from portals
  const spawnDuration = Math.min(35, 12 + w * 1.1);

  // Wave completion reward bonuses
  const clearCreditsBonus = 40 + w * 25;
  const clearScoreBonus = 200 + w * 150;

  return {
    wave: w,
    totalCreeps,
    swarmers,
    brutes,
    disruptors: Math.max(0, disruptors),
    spawnDuration,
    clearCreditsBonus,
    clearScoreBonus
  };
}

/**
 * Normalizes client pointer coordinates to logical 1280x720 canvas cells.
 *
 * @param {number} clientX
 * @param {number} clientY
 * @param {DOMRect|object} rect Canvas getBoundingClientRect()
 * @param {number} [canvasWidth=1280]
 * @param {number} [canvasHeight=720]
 * @param {number} [cellSize=20]
 * @returns {{x: number, y: number, col: number, row: number, inBounds: boolean}}
 */
export function normalizePointer(clientX, clientY, rect, canvasWidth = 1280, canvasHeight = 720, cellSize = 20) {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0, col: -1, row: -1, inBounds: false };
  }

  const scaleX = canvasWidth / rect.width;
  const scaleY = canvasHeight / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;

  const col = Math.floor(x / cellSize);
  const row = Math.floor(y / cellSize);
  const cols = Math.floor(canvasWidth / cellSize);
  const rows = Math.floor(canvasHeight / cellSize);

  const inBounds = col >= 0 && col < cols && row >= 0 && row < rows;
  return { x, y, col, row, inBounds };
}

/**
 * Calculates early wave call credit bonus based on remaining preparation time.
 *
 * @param {number} remainingSeconds
 * @param {number} [bonusRate=3]
 * @returns {number}
 */
export function calculateEarlyBonus(remainingSeconds, bonusRate = 3) {
  if (remainingSeconds <= 0) return 0;
  return Math.floor(remainingSeconds * bonusRate);
}

/**
 * Retrieves credit and score reward for killing a creep archetype.
 *
 * @param {number} typeId 0: Swarmer, 1: Brute, 2: Disruptor
 * @returns {{credits: number, score: number}}
 */
export function getCreepRewards(typeId) {
  if (typeId === 1) { // Brute
    return { credits: 10, score: 50 };
  }
  if (typeId === 2) { // Disruptor
    return { credits: 6, score: 30 };
  }
  // Swarmer
  return { credits: 2, score: 10 };
}

/**
 * Main Orchestrator and Game State Machine for Aether Flowfield TD.
 */
export class Game {
  /**
   * @param {object} [options={}]
   */
  constructor(options = {}) {
    this.headless = Boolean(options.headless);

    // Canvas & UI references
    this.canvas = options.canvas || (typeof document !== 'undefined' ? document.getElementById('gameCanvas') : null);
    this.hud = options.hud || new HUD();
    this.soundSynth = options.soundSynth || new SoundSynth();
    this.renderer = options.renderer || (this.canvas ? new GameRenderer(this.canvas) : null);

    // Grid dimensions
    this.cols = (CONFIG && CONFIG.GRID) ? CONFIG.GRID.COLS : 64;
    this.rows = (CONFIG && CONFIG.GRID) ? CONFIG.GRID.ROWS : 36;
    this.cellSize = (CONFIG && CONFIG.GRID) ? CONFIG.GRID.CELL_SIZE : 20;
    this.canvasWidth = (CONFIG && CONFIG.GRID) ? CONFIG.GRID.WIDTH : 1280;
    this.canvasHeight = (CONFIG && CONFIG.GRID) ? CONFIG.GRID.HEIGHT : 720;

    // Central Core & Spawns
    this.coreCol = (CONFIG && CONFIG.CORE) ? CONFIG.CORE.COL : 32;
    this.coreRow = (CONFIG && CONFIG.CORE) ? CONFIG.CORE.ROW : 18;
    this.maxCoreHp = (CONFIG && CONFIG.CORE) ? CONFIG.CORE.MAX_HP : 100;
    this.spawns = (CONFIG && CONFIG.SPAWNS) ? CONFIG.SPAWNS : [
      { col: 1, row: 1 },
      { col: 62, row: 1 },
      { col: 1, row: 34 },
      { col: 62, row: 34 }
    ];

    // Engine subsystems
    this.flowField = new FlowField(this.cols, this.rows, this.cellSize);
    this.spatialGrid = new SpatialHashGrid(this.canvasWidth, this.canvasHeight, 40, 10000);
    this.swarm = new SwarmEngine(10000);
    this.towerSystem = new TowerSystem(this.flowField, {
      coreCol: this.coreCol,
      coreRow: this.coreRow,
      spawns: this.spawns
    });

    // Recalculate initial clean flowfield
    this.flowField.recalculate(this.coreCol, this.coreRow, this.spawns);

    // Gameplay State
    this.state = 'WAVE_INTERMISSION'; // 'WAVE_ACTIVE', 'WAVE_INTERMISSION', 'GAME_OVER'
    this.coreHp = this.maxCoreHp;
    this.credits = (CONFIG && CONFIG.ECONOMY) ? CONFIG.ECONOMY.INITIAL_CREDITS : 450;
    this.score = 0;
    this.wave = 1;
    this.totalKills = 0;
    this.gameSpeed = 1;
    this.debugFlow = false;

    // Selection & Placement
    this.selectedBuildType = null;
    this.selectedTower = null;
    this.mousePreview = null;
    this.mouseCoords = { col: -1, row: -1 };

    // Wave Spawning Queue & Timers
    this.spawnsRemaining = [];
    this.totalWaveCreeps = 0;
    this.spawnInterval = 0.1;
    this.spawnTimer = 0;
    this.currentPortalIndex = 0;
    this.intermissionTimer = 12;

    // FPS Counter
    this.fps = 60;
    this._frameCount = 0;
    this._fpsTime = 0;
    this._lastTime = 0;
    this._animFrameId = null;

    // Wire up HUD callbacks
    this._initHUDCallbacks();

    // Attach listeners if in a browser DOM environment
    if (!this.headless && typeof window !== 'undefined') {
      this._bindKeyboardEvents();
      this._bindPointerEvents();
    }

    // Refresh HUD initial state
    this._syncHUD();
  }

  /**
   * Initializes callbacks from HUD buttons.
   * @private
   */
  _initHUDCallbacks() {
    this.hud.callbacks.onBuildSelect = (type) => this.selectBuildType(type);
    this.hud.callbacks.onUpgrade = () => this.upgradeSelectedTower();
    this.hud.callbacks.onSell = () => this.sellSelectedTower();
    this.hud.callbacks.onCloseInspector = () => this.deselectTower();
    this.hud.callbacks.onNextWave = () => this.startNextWave();
    this.hud.callbacks.onSpeedChange = (speed) => this.setGameSpeed(speed);
    this.hud.callbacks.onToggleFlowDebug = () => this.toggleFlowDebug();
    this.hud.callbacks.onToggleAudio = () => this.toggleAudio();
    this.hud.callbacks.onRestart = () => this.restart();
    this.hud.callbacks.onSubmitScore = (callsign) => this.submitScore(callsign);
  }

  /**
   * Binds global keyboard hotkeys.
   * @private
   */
  _bindKeyboardEvents() {
    window.addEventListener('keydown', (e) => {
      // Avoid hotkeys when typing in callsign input
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        return;
      }

      switch (e.key) {
        case '1':
          this.selectBuildType('GATLING');
          break;
        case '2':
          this.selectBuildType('MORTAR');
          break;
        case '3':
          this.selectBuildType('STASIS');
          break;
        case 'u':
        case 'U':
          this.upgradeSelectedTower();
          break;
        case 's':
        case 'S':
        case 'Delete':
          this.sellSelectedTower();
          break;
        case ' ':
          e.preventDefault();
          this.setGameSpeed(this.gameSpeed === 0 ? 1 : 0);
          break;
        case 'f':
        case 'F':
          this.toggleFlowDebug();
          break;
        case 'n':
        case 'N':
          this.startNextWave();
          break;
        case 'Escape':
          if (this.selectedBuildType) {
            this.selectBuildType(null);
          } else if (this.selectedTower) {
            this.deselectTower();
          }
          break;
      }
    });
  }

  /**
   * Binds mouse and touch events on the canvas viewport.
   * @private
   */
  _bindPointerEvents() {
    if (!this.canvas) return;

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const pointer = normalizePointer(e.clientX, e.clientY, rect, this.canvasWidth, this.canvasHeight, this.cellSize);
      this.mouseCoords = { col: pointer.col, row: pointer.row };

      if (this.selectedBuildType && pointer.inBounds) {
        const tDef = CONFIG.TOWERS[this.selectedBuildType];
        const canAfford = this.credits >= (tDef ? tDef.cost : 100);
        const isValid = this.towerSystem.getTowerAt(pointer.col, pointer.row) === null &&
          !(pointer.col === this.coreCol && pointer.row === this.coreRow) &&
          !this.spawns.some(s => s.col === pointer.col && s.row === pointer.row) &&
          this.flowField.getCost(pointer.col, pointer.row) < 255;

        this.mousePreview = {
          col: pointer.col,
          row: pointer.row,
          typeKey: this.selectedBuildType,
          isValid,
          canAfford
        };
      } else {
        this.mousePreview = null;
      }
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.mousePreview = null;
      this.mouseCoords = { col: -1, row: -1 };
    });

    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const pointer = normalizePointer(e.clientX, e.clientY, rect, this.canvasWidth, this.canvasHeight, this.cellSize);
      if (!pointer.inBounds) return;

      this.handleCellClick(pointer.col, pointer.row);
    });

    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.selectedBuildType) {
        this.selectBuildType(null);
      } else if (this.selectedTower) {
        this.deselectTower();
      }
    });
  }

  /**
   * Synchronizes HUD vital metrics and tower card states.
   * @private
   */
  _syncHUD() {
    this.hud.updateMetrics({
      coreHp: this.coreHp,
      maxCoreHp: this.maxCoreHp,
      credits: this.credits,
      wave: this.wave,
      creepCount: this.swarm.activeCount,
      maxCreeps: this.swarm.maxParticles,
      fps: this.fps
    });
    this.hud.updateTowerCardStates(this.credits);
  }

  /**
   * Handles player clicking on a grid cell (either building or selecting a tower).
   *
   * @param {number} col
   * @param {number} row
   * @returns {boolean} True if an action was taken
   */
  handleCellClick(col, row) {
    if (this.state === 'GAME_OVER') return false;

    // 1. Build mode active: attempt placement
    if (this.selectedBuildType) {
      const towerDef = CONFIG.TOWERS[this.selectedBuildType];
      if (!towerDef) return false;

      if (this.credits < towerDef.cost) {
        return false;
      }

      const tower = this.towerSystem.build(this.selectedBuildType, col, row);
      if (tower) {
        this.credits -= towerDef.cost;
        this.soundSynth.playLaser(); // Build confirmation chirp
        this.selectTower(tower);
        this._syncHUD();
        return true;
      }
      return false;
    }

    // 2. Normal selection mode: check if clicking on placed tower
    const existing = this.towerSystem.getTowerAt(col, row);
    if (existing) {
      this.selectTower(existing);
      return true;
    } else {
      this.deselectTower();
      return false;
    }
  }

  /**
   * Sets active tower type for building, or clears build mode if null / already active.
   *
   * @param {string|null} typeKey 'GATLING', 'MORTAR', 'STASIS', or null
   */
  selectBuildType(typeKey) {
    if (this.selectedBuildType === typeKey || typeKey === null) {
      this.selectedBuildType = null;
    } else {
      this.selectedBuildType = typeKey;
      this.deselectTower();
    }
    this.hud.setSelectedBuildType(this.selectedBuildType);
  }

  /**
   * Selects a tower for inspection, showing upgrade/sell actions.
   *
   * @param {object} tower Tower instance
   */
  selectTower(tower) {
    this.selectedTower = tower;
    this.selectedBuildType = null;
    this.hud.setSelectedBuildType(null);

    const towerDef = CONFIG.TOWERS[tower.typeKey];
    const currentStats = towerDef.levels[tower.level - 1];
    const upgradeCost = currentStats ? (currentStats.upgradeCost || 0) : 0;
    const refundRate = (CONFIG && CONFIG.ECONOMY) ? CONFIG.ECONOMY.REFUND_RATE : 0.75;
    const refundAmount = Math.floor(tower.investedCost * refundRate);
    const canAfford = this.credits >= upgradeCost;

    this.hud.showTowerInspector(tower, tower.investedCost, upgradeCost, refundAmount, canAfford);
  }

  /**
   * Deselects current tower and hides inspector.
   */
  deselectTower() {
    this.selectedTower = null;
    this.hud.hideTowerInspector();
  }

  /**
   * Upgrades the currently selected tower if player has sufficient credits.
   *
   * @returns {boolean}
   */
  upgradeSelectedTower() {
    if (!this.selectedTower) return false;

    const towerDef = CONFIG.TOWERS[this.selectedTower.typeKey];
    if (!towerDef || this.selectedTower.level >= 3) return false;

    const currentStats = towerDef.levels[this.selectedTower.level - 1];
    const upgradeCost = currentStats ? (currentStats.upgradeCost || 0) : 0;
    if (this.credits < upgradeCost) return false;

    const success = this.towerSystem.upgrade(this.selectedTower.col, this.selectedTower.row);
    if (success) {
      this.credits -= upgradeCost;
      this.soundSynth.playWaveStart(); // Upgrade ascending chime
      this.selectTower(this.selectedTower);
      this._syncHUD();
      return true;
    }
    return false;
  }

  /**
   * Sells the currently selected tower and grants refund credits.
   *
   * @returns {number} Refund amount received
   */
  sellSelectedTower() {
    if (!this.selectedTower) return 0;

    const col = this.selectedTower.col;
    const row = this.selectedTower.row;
    const refund = this.towerSystem.sell(col, row);
    if (refund > 0) {
      this.credits += refund;
      this.soundSynth.playExplosion(0.4); // Demolish sound
      this.deselectTower();
      this._syncHUD();
    }
    return refund;
  }

  /**
   * Starts the next wave immediately, granting early bonus credits if in intermission.
   */
  startNextWave() {
    if (this.state !== 'WAVE_INTERMISSION') return;

    if (this.state === 'WAVE_INTERMISSION' && this.wave > 1) {
      const earlyBonus = calculateEarlyBonus(this.intermissionTimer);
      if (earlyBonus > 0) {
        this.credits += earlyBonus;
        this.score += earlyBonus * 10;
      }
    }

    const config = calculateWaveConfig(this.wave);

    // Assemble randomized creep spawn queue
    const queue = [];
    for (let i = 0; i < config.swarmers; i++) queue.push(0);
    for (let i = 0; i < config.brutes; i++) queue.push(1);
    for (let i = 0; i < config.disruptors; i++) queue.push(2);

    // Fisher-Yates shuffle
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = queue[i];
      queue[i] = queue[j];
      queue[j] = tmp;
    }

    this.spawnsRemaining = queue;
    this.totalWaveCreeps = queue.length;
    this.spawnInterval = Math.max(0.01, config.spawnDuration / this.totalWaveCreeps);
    this.spawnTimer = this.spawnInterval;
    this.currentPortalIndex = 0;

    this.state = 'WAVE_ACTIVE';
    this.soundSynth.playWaveStart();
    this._syncHUD();
  }

  /**
   * Spawns a single creep at a designated portal with slight positional jitter.
   *
   * @param {number} typeId
   * @param {number} portalIndex
   */
  spawnCreep(typeId, portalIndex) {
    const portal = this.spawns[portalIndex % this.spawns.length];
    const jitterX = (Math.random() - 0.5) * 8;
    const jitterY = (Math.random() - 0.5) * 8;
    const px = (portal.col + 0.5) * this.cellSize + jitterX;
    const py = (portal.row + 0.5) * this.cellSize + jitterY;

    this.swarm.spawn(typeId, px, py);
  }

  /**
   * Handles wave clear, awarding bonuses and transitioning to intermission countdown.
   */
  completeWave() {
    const config = calculateWaveConfig(this.wave);
    this.credits += config.clearCreditsBonus;
    this.score += config.clearScoreBonus;

    this.soundSynth.playWaveClear();
    this.wave++;
    this.state = 'WAVE_INTERMISSION';
    this.intermissionTimer = 15;
    this._syncHUD();
  }

  /**
   * Deals damage to the Central Core. Triggers Game Over when depleted.
   *
   * @param {number} damage
   */
  takeCoreDamage(damage) {
    if (this.state === 'GAME_OVER') return;

    this.coreHp = Math.max(0, this.coreHp - damage);
    this.soundSynth.playCoreDamage();

    if (this.coreHp <= 0) {
      this.coreHp = 0;
      this.gameOver();
    }
    this._syncHUD();
  }

  /**
   * Sets game speed multiplier (0: Pause, 1: Normal, 2: Fast, 4: Turbo).
   *
   * @param {number} speed
   */
  setGameSpeed(speed) {
    this.gameSpeed = speed;
    this.hud.setSpeed(speed);
  }

  /**
   * Toggles flowfield vector and Dijkstra distance heatmap debug overlay.
   */
  toggleFlowDebug() {
    this.debugFlow = !this.debugFlow;
    this.hud.setFlowDebug(this.debugFlow);
  }

  /**
   * Toggles audio mute state.
   */
  toggleAudio() {
    const isMuted = this.soundSynth.toggleMute();
    this.hud.setAudioState(isMuted);
  }

  /**
   * Triggers Game Over state and displays stats modal.
   */
  gameOver() {
    this.state = 'GAME_OVER';
    this.hud.showGameOver({
      wavesSurvived: Math.max(0, this.wave - 1),
      totalKills: this.totalKills,
      finalScore: this.score
    });
  }

  /**
   * Submits player callsign and score to backend API with fallback to localStorage.
   *
   * @param {string} callsign
   * @returns {Promise<boolean>}
   */
  async submitScore(callsign) {
    const payload = {
      game: 'aether_flowfield_td',
      name: callsign,
      result: this.coreHp > 0 ? 'win' : 'loss',
      score: this.score,
      wave: this.wave,
      kills: this.totalKills
    };

    try {
      if (typeof fetch !== 'undefined') {
        const res = await fetch('/api/scores/aether_flowfield_td', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          this.hud.setScoreFeedback(`✅ Pontuação de ${this.score.toLocaleString('pt-BR')} gravada no banco neural!`, 'success');
          return true;
        }
      }
    } catch {
      // Fetch failed or backend unavailable
    }

    // Local storage fallback
    try {
      if (typeof localStorage !== 'undefined') {
        const key = 'aether_flowfield_td_scores';
        const existing = JSON.parse(localStorage.getItem(key) || '[]');
        existing.push({ ...payload, timestamp: new Date().toISOString() });
        localStorage.setItem(key, JSON.stringify(existing));
        this.hud.setScoreFeedback(`✅ Pontuação salva localmente no terminal para ${callsign}.`, 'success');
        return true;
      }
    } catch {}

    this.hud.setScoreFeedback('Pontuação processada localmente.', 'success');
    return true;
  }

  /**
   * Resets entire game world, economy, towers, swarm, and restarts cleanly.
   */
  restart() {
    this.swarm.reset();

    // Remove all towers and reset flowfield costs
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.flowField.setCost(c, r, 1);
      }
    }
    this.towerSystem.towers.length = 0;
    this.towerSystem._grid.fill(null);
    this.towerSystem.projectiles.length = 0;
    this.flowField.recalculate(this.coreCol, this.coreRow, this.spawns);

    // Clear effects
    if (this.renderer) {
      this.renderer.clearEffects();
    }

    // Reset gameplay values
    this.coreHp = this.maxCoreHp;
    this.credits = (CONFIG && CONFIG.ECONOMY) ? CONFIG.ECONOMY.INITIAL_CREDITS : 450;
    this.score = 0;
    this.wave = 1;
    this.totalKills = 0;
    this.state = 'WAVE_INTERMISSION';
    this.intermissionTimer = 12;
    this.spawnsRemaining.length = 0;
    this.selectedBuildType = null;
    this.selectedTower = null;

    this.hud.hideGameOver();
    this.hud.hideTowerInspector();
    this.hud.setSelectedBuildType(null);
    this.hud.setBreachAlert(false);
    this._syncHUD();
  }

  /**
   * Main simulation step for delta time dt.
   *
   * @param {number} rawDt Delta time in seconds
   */
  update(rawDt) {
    const dt = Math.min(rawDt, 0.1);
    const simDt = dt * this.gameSpeed;

    if (this.state !== 'GAME_OVER' && simDt > 0) {
      // 1. Intermission Countdown
      if (this.state === 'WAVE_INTERMISSION') {
        this.intermissionTimer -= simDt;
        const earlyBonus = calculateEarlyBonus(this.intermissionTimer);
        this.hud.updateWaveTimer({
          timeRemaining: this.intermissionTimer,
          canCallEarly: true,
          earlyBonus,
          isWaveActive: false,
          waveNumber: this.wave
        });

        if (this.intermissionTimer <= 0) {
          this.startNextWave();
        }
      }

      // 2. Active Wave Spawning
      if (this.state === 'WAVE_ACTIVE') {
        this.hud.updateWaveTimer({
          timeRemaining: 0,
          canCallEarly: false,
          earlyBonus: 0,
          isWaveActive: true,
          waveNumber: this.wave
        });

        if (this.spawnsRemaining.length > 0) {
          this.spawnTimer += simDt;
          while (this.spawnTimer >= this.spawnInterval && this.spawnsRemaining.length > 0) {
            this.spawnTimer -= this.spawnInterval;
            const typeId = this.spawnsRemaining.pop();
            this.spawnCreep(typeId, this.currentPortalIndex++);
          }
        } else if (this.swarm.activeCount === 0) {
          this.completeWave();
        }
      }

      // 3. Swarm Simulation Update
      this.swarm.update(
        simDt,
        this.flowField,
        this.spatialGrid,
        this.coreCol,
        this.coreRow,
        this.cellSize,
        (id, dmg) => this.takeCoreDamage(dmg),
        (col, row, dmg) => {
          this.towerSystem.takeBreachDamage(col, row, dmg, (destroyed) => {
            if (this.selectedTower && this.selectedTower.col === col && this.selectedTower.row === row) {
              this.deselectTower();
            }
          });
        }
      );

      // 4. Tower System Update
      this.towerSystem.update(simDt, this.swarm, this.spatialGrid, (effect) => {
        if (this.renderer) {
          this.renderer.addEffect(effect);
        }

        // Sound triggers
        if (effect.type === 'laser') this.soundSynth.playLaser();
        else if (effect.type === 'explosion') this.soundSynth.playExplosion();
        else if (effect.type === 'stasis_pulse') this.soundSynth.playStasisPulse();

        // Kills handling
        if (effect.killed) {
          if (Array.isArray(effect.killed)) {
            for (let k = 0; k < effect.killed.length; k++) {
              const kid = effect.killed[k];
              const reward = getCreepRewards(this.swarm.type[kid]);
              this.credits += reward.credits;
              this.score += reward.score;
              this.totalKills++;
            }
          } else if (effect.targetId !== undefined) {
            const reward = getCreepRewards(this.swarm.type[effect.targetId]);
            this.credits += reward.credits;
            this.score += reward.score;
            this.totalKills++;
          }
        }
      });

      // 5. Check Breach Alert & Sound Alarm
      const isBreach = Boolean(this.flowField && this.flowField.isBreachActive && this.flowField.isBreachActive());
      if (isBreach && !this._lastBreachState) {
        if (this.soundSynth && typeof this.soundSynth.playBreachAlarm === 'function') {
          this.soundSynth.playBreachAlarm();
        }
      }
      this._lastBreachState = isBreach;
      this.hud.setBreachAlert(isBreach);
    }

    // Update HUD metrics
    this._syncHUD();
  }

  /**
   * Main rendering routine.
   *
   * @param {number} renderDt
   */
  render(renderDt) {
    if (!this.renderer) return;

    const core = {
      col: this.coreCol,
      row: this.coreRow,
      hp: this.coreHp,
      maxHp: this.maxCoreHp
    };

    const selectedCoords = this.selectedTower
      ? { col: this.selectedTower.col, row: this.selectedTower.row }
      : null;

    this.renderer.render(
      this.flowField,
      this.swarm,
      this.towerSystem,
      core,
      this.debugFlow,
      selectedCoords,
      this.mousePreview,
      renderDt
    );
  }

  /**
   * Initiates the requestAnimationFrame game loop.
   */
  startLoop() {
    if (this._animFrameId || typeof window === 'undefined') return;

    this._lastTime = performance.now();

    const loop = (now) => {
      const deltaSec = Math.max(0.001, Math.min(0.1, (now - this._lastTime) / 1000));
      this._lastTime = now;

      // FPS tracking
      this._frameCount++;
      this._fpsTime += deltaSec;
      if (this._fpsTime >= 0.5) {
        this.fps = this._frameCount / this._fpsTime;
        this._frameCount = 0;
        this._fpsTime = 0;
      }

      this.update(deltaSec);
      this.render(deltaSec);

      this._animFrameId = requestAnimationFrame(loop);
    };

    this._animFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stops the animation frame loop.
   */
  stopLoop() {
    if (this._animFrameId && typeof window !== 'undefined') {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }
}

// Auto-bootstrap when loaded in browser
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
    window.game.startLoop();
  });
}
