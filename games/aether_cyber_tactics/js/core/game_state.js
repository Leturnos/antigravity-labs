/**
 * GameState - Central State Machine & Turn Management Loop for Aether Cyber Tactics.
 * Coordinates GridManager, IsometricRenderer, SoundSynth, TelegraphRenderer, AI, and Skills.
 */

import { GridManager } from '../engine/grid_manager.js';
import { IsometricRenderer } from '../engine/isometric_renderer.js';
import { SoundSynth } from '../audio/sound_synth.js';
import { TelegraphRenderer } from '../ai/telegraph.js';
import { evaluateAllEnemies, evaluateEnemyIntent } from '../ai/utility_ai.js';
import { findPath, getReachableTiles } from '../ai/pathfinding.js';
import { executeSkill, SKILLS_REGISTRY } from './skills.js';
import { createPlayerSquad, createEnemyUnit, Unit } from './units.js';

/**
 * State Machine Phase Constants
 */
export const PHASE_PLAYER_TURN = 'PLAYER_TURN';
export const PHASE_ENEMY_RESOLVE = 'ENEMY_RESOLVE';
export const PHASE_VICTORY = 'VICTORY';
export const PHASE_DEFEAT = 'DEFEAT';

export class GameState {
  static PHASE_PLAYER_TURN = PHASE_PLAYER_TURN;
  static PHASE_ENEMY_RESOLVE = PHASE_ENEMY_RESOLVE;
  static PHASE_VICTORY = PHASE_VICTORY;
  static PHASE_DEFEAT = PHASE_DEFEAT;

  /**
   * @param {HTMLCanvasElement|null} [canvas=null]
   * @param {Object} [options={}]
   */
  constructor(canvas = null, options = {}) {
    this.canvas = canvas;
    this.options = options;

    // Core Systems
    this.gridManager = options.gridManager || new GridManager(options.width || 8, options.height || 8);
    this.renderer = options.renderer || (canvas ? new IsometricRenderer(canvas, this.gridManager) : null);
    this.soundSynth = options.soundSynth || new SoundSynth();
    this.telegraphRenderer = options.telegraphRenderer || (canvas && this.renderer ? new TelegraphRenderer(canvas, this.renderer, this.gridManager) : null);

    // Turn & Phase State
    this.phase = PHASE_PLAYER_TURN;
    this.turnNumber = 1;
    this.score = 0;
    this.units = [];

    // Player Selection State
    this.selectedUnit = null;
    this.selectedSkill = null;
    this.reachableTiles = [];

    // Event Logs & Callbacks
    this.logs = [];
    this.onLog = options.onLog || null;
    this.onPhaseChange = options.onPhaseChange || null;
    this.onStateUpdate = options.onStateUpdate || null;

    this.isResolvingEnemies = false;
  }

  /**
   * Synchronizes spatial unit references on GridManager tiles.
   */
  syncGridUnits() {
    for (let y = 0; y < this.gridManager.height; y++) {
      for (let x = 0; x < this.gridManager.width; x++) {
        const tile = this.gridManager.getTile(x, y);
        if (tile) {
          tile.unit = null;
        }
      }
    }

    for (const unit of this.units) {
      if (unit.isAlive()) {
        const tile = this.gridManager.getTile(unit.x, unit.y);
        if (tile) {
          tile.unit = unit;
        }
      }
    }
  }

  /**
   * Initializes level setup, spawns player squad and enemies, and triggers intent telegraphing.
   * @param {Object} [levelData={}]
   */
  initLevel(levelData = {}) {
    if (levelData.width || levelData.height) {
      this.gridManager = new GridManager(levelData.width || 8, levelData.height || 8);
      if (this.renderer) {
        this.renderer.gridManager = this.gridManager;
      }
      if (this.telegraphRenderer) {
        this.telegraphRenderer.gridManager = this.gridManager;
      }
    }

    if (levelData.populateSampleMap !== false) {
      this.gridManager.populateSampleMap();
    }

    // Spawn Player Squad
    const playerSquad = levelData.playerSquad
      ? levelData.playerSquad
      : createPlayerSquad(levelData.playerStartPositions || null);

    // Spawn Enemy Units
    let enemies = [];
    if (levelData.enemies && Array.isArray(levelData.enemies)) {
      enemies = levelData.enemies.map(e => {
        if (e instanceof Unit) return e;
        return createEnemyUnit(e.type || 'GRUNT', e.x, e.y);
      });
    } else {
      enemies = [
        createEnemyUnit('GRUNT', 5, 2),
        createEnemyUnit('CHARGER', 6, 4),
        createEnemyUnit('ARTILLERY_DRONE', 6, 1)
      ];
    }

    this.units = [...playerSquad, ...enemies];
    this.syncGridUnits();

    this.phase = PHASE_PLAYER_TURN;
    this.turnNumber = 1;
    this.score = 0;

    this.selectedUnit = null;
    this.selectedSkill = null;
    this.reachableTiles = [];

    // Trigger initial enemy intent evaluation & telegraphing
    evaluateAllEnemies(this.units, this.gridManager);
    if (this.telegraphRenderer) {
      this.telegraphRenderer.updateIntents(this.units);
    }

    this.log('Level initialized. Tactical Grid online. Operatives deployed.', 'system');

    if (this.onPhaseChange) this.onPhaseChange(PHASE_PLAYER_TURN);
    if (this.onStateUpdate) this.onStateUpdate();
  }

  /**
   * Appends entry to internal log list and notifies external log listeners.
   * @param {string} text
   * @param {string} [category='system']
   */
  log(text, category = 'system') {
    const entry = {
      timestamp: new Date().toLocaleTimeString(),
      text,
      category
    };
    this.logs.push(entry);
    if (this.onLog) {
      this.onLog(text, category, entry);
    }
  }

  /**
   * Selects a unit, highlights it, and calculates reachable move tiles.
   * @param {Unit|string|{x: number, y: number}|null} unitOrTarget
   * @returns {Array<Object>} Reachable tiles array
   */
  selectUnit(unitOrTarget) {
    if (!unitOrTarget) {
      this.deselectUnit();
      return [];
    }

    let targetUnit = null;
    if (unitOrTarget instanceof Unit) {
      targetUnit = unitOrTarget;
    } else if (typeof unitOrTarget === 'string') {
      targetUnit = this.units.find(u => u.id === unitOrTarget);
    } else if (typeof unitOrTarget === 'object' && unitOrTarget.x !== undefined && unitOrTarget.y !== undefined) {
      targetUnit = this.units.find(u => u.isAlive() && u.x === unitOrTarget.x && u.y === unitOrTarget.y);
    }

    if (!targetUnit || !targetUnit.isAlive()) {
      this.deselectUnit();
      return [];
    }

    this.selectedUnit = targetUnit;
    this.selectedSkill = null;

    if (targetUnit.faction === 'player' && targetUnit.ap > 0 && this.phase === PHASE_PLAYER_TURN) {
      this.reachableTiles = getReachableTiles(
        { x: targetUnit.x, y: targetUnit.y },
        targetUnit.moveRange,
        this.gridManager,
        targetUnit
      );
      if (this.soundSynth) this.soundSynth.playMove();
    } else {
      this.reachableTiles = [];
    }

    this.log(`Selected unit: ${targetUnit.name} (${targetUnit.type}) at (${targetUnit.x}, ${targetUnit.y}). AP: ${targetUnit.ap}/${targetUnit.maxAp}`, 'tactical');

    if (this.onStateUpdate) this.onStateUpdate();
    return this.reachableTiles;
  }

  /**
   * Selects an active skill for the selected unit.
   * @param {string|null} skillId
   */
  selectSkill(skillId) {
    if (!this.selectedUnit || this.selectedUnit.faction !== 'player' || this.phase !== PHASE_PLAYER_TURN) {
      this.selectedSkill = null;
      return false;
    }

    if (skillId && !this.selectedUnit.skills.includes(skillId)) {
      this.log(`Unit ${this.selectedUnit.name} does not possess skill '${skillId}'.`, 'system');
      return false;
    }

    this.selectedSkill = skillId;
    this.log(`Selected skill: ${skillId ? SKILLS_REGISTRY[skillId]?.name || skillId : 'None'}`, 'tactical');

    if (this.onStateUpdate) this.onStateUpdate();
    return true;
  }

  /**
   * Clears currently selected unit, skill, and reachability highlights.
   */
  deselectUnit() {
    this.selectedUnit = null;
    this.selectedSkill = null;
    this.reachableTiles = [];
    if (this.onStateUpdate) this.onStateUpdate();
  }

  /**
   * Consumes AP and moves the selected unit along an A* path step-by-step to target cell.
   * @param {number} targetX
   * @param {number} targetY
   * @returns {{ success: boolean, reason?: string, unit?: Unit, x?: number, y?: number }}
   */
  moveSelectedUnit(targetX, targetY) {
    if (this.phase !== PHASE_PLAYER_TURN) {
      return { success: false, reason: 'Not player turn.' };
    }

    const unit = this.selectedUnit;
    if (!unit || !unit.isAlive() || unit.faction !== 'player' || unit.ap <= 0) {
      return { success: false, reason: 'No active player unit selected or insufficient AP.' };
    }

    // Check if target is in reachable tiles or find path
    const reachable = this.reachableTiles.find(t => t.x === targetX && t.y === targetY);
    let path = reachable ? reachable.path : null;

    if (!path || path.length === 0) {
      path = findPath({ x: unit.x, y: unit.y }, { x: targetX, y: targetY }, this.gridManager, unit);
    }

    if (!path || path.length <= 1) {
      return { success: false, reason: 'Target tile is unreachable or blocked.' };
    }

    // Deduct 1 AP for movement action
    unit.ap -= 1;

    // Traversal step-by-step
    for (let i = 1; i < path.length; i++) {
      const step = path[i];
      unit.x = step.x;
      unit.y = step.y;
      this.syncGridUnits();

      const tile = this.gridManager.getTile(unit.x, unit.y);
      if (tile) {
        if (tile.type === 'HAZARDOUS') {
          unit.takeDamage(1);
          this.log(`${unit.name} stepped on HAZARDOUS plasma at (${unit.x}, ${unit.y}), taking 1 damage!`, 'combat');
        } else if (tile.type === 'VOID') {
          unit.hp = 0;
          this.log(`${unit.name} stepped into the VOID abyss at (${unit.x}, ${unit.y}) and was destroyed!`, 'combat');
          break;
        }
      }

      if (!unit.isAlive()) break;
    }

    if (this.soundSynth) this.soundSynth.playMove();
    this.log(`${unit.name} moved to (${unit.x}, ${unit.y}). AP remaining: ${unit.ap}/${unit.maxAp}`, 'tactical');

    this.checkCombatStatus();

    // Re-calculate reachability or deselect if AP exhausted
    if (unit.isAlive() && unit.ap > 0 && this.phase === PHASE_PLAYER_TURN) {
      this.reachableTiles = getReachableTiles(
        { x: unit.x, y: unit.y },
        unit.moveRange,
        this.gridManager,
        unit
      );
    } else {
      this.deselectUnit();
    }

    // Re-evaluate enemy intents based on new player positioning
    evaluateAllEnemies(this.units, this.gridManager);
    if (this.telegraphRenderer) {
      this.telegraphRenderer.updateIntents(this.units);
    }

    if (this.onStateUpdate) this.onStateUpdate();
    return { success: true, unit, x: unit.x, y: unit.y };
  }

  /**
   * Consumes AP, executes tactical skill on grid, updates elevation/health, checks casualties.
   * @param {string} skillId
   * @param {number} targetX
   * @param {number} targetY
   * @returns {Object} Skill execution result
   */
  useSkill(skillId, targetX, targetY) {
    if (this.phase !== PHASE_PLAYER_TURN) {
      return { success: false, reason: 'Not player turn.' };
    }

    const caster = this.selectedUnit;
    if (!caster || !caster.isAlive() || caster.faction !== 'player' || caster.ap <= 0) {
      return { success: false, reason: 'No active player unit selected or insufficient AP.' };
    }

    const result = executeSkill(skillId, caster, targetX, targetY, this.gridManager, this.units, this.soundSynth);

    if (!result.success) {
      this.log(`Skill execution failed: ${result.reason}`, 'system');
      return result;
    }

    // Log skill outcome events
    if (Array.isArray(result.logs)) {
      for (const logMsg of result.logs) {
        this.log(logMsg, 'combat');
      }
    }

    // Spawn visual debris particles if renderer active
    if (this.renderer) {
      this.renderer.spawnDebris(targetX, targetY, '#00f3ff', 14);
    }

    this.syncGridUnits();
    this.checkCombatStatus();

    // Re-calculate reachability or deselect if AP exhausted
    if (caster.isAlive() && caster.ap > 0 && this.phase === PHASE_PLAYER_TURN) {
      this.reachableTiles = getReachableTiles(
        { x: caster.x, y: caster.y },
        caster.moveRange,
        this.gridManager,
        caster
      );
    } else {
      this.deselectUnit();
    }

    // Re-evaluate enemy intents
    evaluateAllEnemies(this.units, this.gridManager);
    if (this.telegraphRenderer) {
      this.telegraphRenderer.updateIntents(this.units);
    }

    if (this.onStateUpdate) this.onStateUpdate();
    return result;
  }

  /**
   * Transitions to PHASE_ENEMY_RESOLVE and initiates sequential enemy turn execution.
   */
  endPlayerTurn() {
    if (this.phase !== PHASE_PLAYER_TURN) return false;

    this.deselectUnit();
    this.phase = PHASE_ENEMY_RESOLVE;
    this.isResolvingEnemies = true;

    if (this.soundSynth) this.soundSynth.playTurnChange();
    this.log('--- ENEMY RESOLVE PHASE ---', 'system');

    if (this.onPhaseChange) this.onPhaseChange(PHASE_ENEMY_RESOLVE);
    if (this.onStateUpdate) this.onStateUpdate();

    // Initiate sequential async resolution of enemy intents
    this.resolveEnemyIntents();

    return true;
  }

  /**
   * Helper promise delay for visual pacing during enemy turn execution.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Executes telegraphed enemy actions sequentially with visual delays and sound SFX.
   */
  async resolveEnemyIntents() {
    const enemies = this.units.filter(u => u.faction === 'enemy' && u.isAlive());

    for (const enemy of enemies) {
      if (this.checkCombatStatus() !== PHASE_ENEMY_RESOLVE) break;
      if (!enemy.isAlive()) continue;

      if (enemy.hasStatus('HACKED')) {
        this.log(`${enemy.name} is HACKED! Action skipped and status removed.`, 'combat');
        enemy.removeStatus('HACKED');
        enemy.intent = null;
        await this.delay(350);
        continue;
      }

      let intent = enemy.intent;
      if (!intent) {
        intent = evaluateEnemyIntent(enemy, this.units, this.gridManager);
      }

      if (!intent) continue;

      await this.delay(350);

      // 1. Enemy Movement
      if (intent.moveX !== enemy.x || intent.moveY !== enemy.y) {
        const path = findPath({ x: enemy.x, y: enemy.y }, { x: intent.moveX, y: intent.moveY }, this.gridManager, enemy);
        if (path && path.length > 1) {
          enemy.x = intent.moveX;
          enemy.y = intent.moveY;
          this.syncGridUnits();

          if (this.soundSynth) this.soundSynth.playMove();

          const tile = this.gridManager.getTile(enemy.x, enemy.y);
          if (tile) {
            if (tile.type === 'HAZARDOUS') {
              enemy.takeDamage(1);
              this.log(`${enemy.name} moved onto HAZARDOUS plasma at (${enemy.x}, ${enemy.y}), taking 1 damage!`, 'combat');
            } else if (tile.type === 'VOID') {
              enemy.hp = 0;
              this.log(`${enemy.name} moved into the VOID abyss at (${enemy.x}, ${enemy.y}) and was destroyed!`, 'combat');
            }
          }

          this.log(`${enemy.name} repositioned to (${enemy.x}, ${enemy.y}).`, 'combat');
          await this.delay(350);
        }
      }

      // 2. Enemy Skill Execution
      if (enemy.isAlive() && intent.skillId) {
        const skillResult = executeSkill(intent.skillId, enemy, intent.targetX, intent.targetY, this.gridManager, this.units, this.soundSynth);

        if (Array.isArray(skillResult.logs)) {
          for (const msg of skillResult.logs) {
            this.log(msg, 'combat');
          }
        }

        if (this.renderer) {
          this.renderer.spawnDebris(intent.targetX, intent.targetY, '#f43f5e', 14);
        }

        this.syncGridUnits();
        await this.delay(450);
      }

      enemy.intent = null;
      if (this.telegraphRenderer) {
        this.telegraphRenderer.updateIntents(this.units);
      }

      this.checkCombatStatus();
    }

    this.isResolvingEnemies = false;

    // Check if phase is still ENEMY_RESOLVE (i.e. game not won or lost)
    if (this.phase === PHASE_ENEMY_RESOLVE) {
      this.turnNumber++;

      // Reset Action Points for living player units
      for (const u of this.units) {
        if (u.isAlive()) {
          u.resetAp();
        }
      }

      // Evaluate new enemy intents for upcoming turn
      evaluateAllEnemies(this.units, this.gridManager);
      if (this.telegraphRenderer) {
        this.telegraphRenderer.updateIntents(this.units);
      }

      this.phase = PHASE_PLAYER_TURN;
      if (this.soundSynth) this.soundSynth.playTurnChange();
      this.log(`--- PLAYER TURN ${this.turnNumber} START --- Operatives AP refreshed.`, 'system');

      if (this.onPhaseChange) this.onPhaseChange(PHASE_PLAYER_TURN);
      if (this.onStateUpdate) this.onStateUpdate();
    }
  }

  /**
   * Evaluates victory and defeat conditions after any action or hazard tick.
   * @returns {string} Current phase
   */
  checkCombatStatus() {
    this.syncGridUnits();

    const livingPlayers = this.units.filter(u => u.faction === 'player' && u.isAlive());
    const livingEnemies = this.units.filter(u => u.faction === 'enemy' && u.isAlive());

    if (livingEnemies.length === 0 && livingPlayers.length > 0) {
      if (this.phase !== PHASE_VICTORY) {
        this.phase = PHASE_VICTORY;
        this.score += 1000 + Math.max(0, 10 - this.turnNumber) * 100;
        if (this.soundSynth) this.soundSynth.playVictory();
        this.log(`MISSION ACCOMPLISHED! All hostiles neutralized. Final Score: ${this.score}`, 'system');
        if (this.telegraphRenderer) this.telegraphRenderer.clear();
        if (this.onPhaseChange) this.onPhaseChange(PHASE_VICTORY);
        if (this.onStateUpdate) this.onStateUpdate();
      }
      return PHASE_VICTORY;
    }

    if (livingPlayers.length === 0) {
      if (this.phase !== PHASE_DEFEAT) {
        this.phase = PHASE_DEFEAT;
        this.log('MISSION FAILED! All operatives destroyed.', 'system');
        if (this.telegraphRenderer) this.telegraphRenderer.clear();
        if (this.onPhaseChange) this.onPhaseChange(PHASE_DEFEAT);
        if (this.onStateUpdate) this.onStateUpdate();
      }
      return PHASE_DEFEAT;
    }

    return this.phase;
  }

  /**
   * Master render method: draws map grid, reachability overlay, units, and telegraph intents.
   * @param {number} [time=Date.now()/1000]
   */
  render(time = Date.now() / 1000) {
    if (!this.renderer) return;

    // 1. Render isometric grid, terrain blocks & particles
    this.renderer.render();

    // 2. Render reachability move highlights overlay
    this.renderReachableTilesOverlay();

    // 3. Render unit avatars & tactical stats UI on grid
    this.renderUnitsOverlay();

    // 4. Render enemy telegraph targeting rays, crimson pulsing & badges
    if (this.telegraphRenderer) {
      this.telegraphRenderer.render(time);
    }
  }

  /**
   * Renders isometric diamond overlays for reachable movement tiles.
   */
  renderReachableTilesOverlay() {
    if (!this.renderer || this.reachableTiles.length === 0 || !this.selectedUnit) return;

    const ctx = this.renderer.ctx;
    const wHalf = this.renderer.tileWidthHalf;
    const hHalf = this.renderer.tileHeightHalf;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 243, 255, 0.25)';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#00f3ff';

    for (const t of this.reachableTiles) {
      if (t.x === this.selectedUnit.x && t.y === this.selectedUnit.y) continue;
      const tile = this.gridManager.getTile(t.x, t.y);
      if (!tile || tile.type === 'VOID') continue;

      const { isoX, isoY } = this.renderer.gridToScreen(t.x, t.y, tile.elevation);

      ctx.beginPath();
      ctx.moveTo(isoX, isoY - hHalf);
      ctx.lineTo(isoX + wHalf, isoY);
      ctx.lineTo(isoX, isoY + hHalf);
      ctx.lineTo(isoX - wHalf, isoY);
      ctx.closePath();

      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Renders unit avatars, selection halos, HP bars, and AP dots on top of grid tiles.
   */
  renderUnitsOverlay() {
    if (!this.renderer) return;
    const ctx = this.renderer.ctx;

    for (const unit of this.units) {
      if (!unit.isAlive()) continue;

      const tile = this.gridManager.getTile(unit.x, unit.y);
      const elev = tile ? tile.elevation : 0;
      const { isoX, isoY } = this.renderer.gridToScreen(unit.x, unit.y, elev);

      ctx.save();

      const isPlayer = unit.faction === 'player';
      const isSelected = unit === this.selectedUnit;
      const primaryColor = isPlayer ? '#00f3ff' : '#f43f5e';

      // Base Selection Halo
      if (isSelected) {
        ctx.beginPath();
        ctx.ellipse(isoX, isoY, 20, 10, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 243, 255, 0.35)';
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#00f3ff';
        ctx.fill();
        ctx.stroke();
      }

      // Unit Body Sphere/Pill
      const unitCenterY = isoY - 14;
      ctx.shadowBlur = isSelected ? 12 : 6;
      ctx.shadowColor = primaryColor;

      ctx.fillStyle = primaryColor;
      ctx.beginPath();
      ctx.arc(isoX, unitCenterY, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Unit Initial / Class Icon
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(unit.name.charAt(0).toUpperCase(), isoX, unitCenterY);

      // Unit HP Bar Container
      const barW = 28;
      const barH = 4;
      const barX = isoX - barW / 2;
      const barY = unitCenterY - 18;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

      const hpRatio = Math.max(0, unit.hp / unit.maxHp);
      ctx.fillStyle = hpRatio > 0.5 ? '#10b981' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(barX, barY, barW * hpRatio, barH);

      // AP Dots for Player Operatives
      if (isPlayer) {
        for (let i = 0; i < unit.maxAp; i++) {
          const dotX = isoX - ((unit.maxAp - 1) * 5) / 2 + i * 5;
          const dotY = barY - 5;
          ctx.fillStyle = i < unit.ap ? '#00f3ff' : 'rgba(255, 255, 255, 0.25)';
          ctx.beginPath();
          ctx.arc(dotX, dotY, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }
  }
}
