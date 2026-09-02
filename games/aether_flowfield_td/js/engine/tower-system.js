import { CONFIG } from '../config.js';
import { SwarmEngine } from './swarm.js';

/**
 * TowerSystem manages defensive towers, placement, upgrades, refunds,
 * structural breach damage, projectile pools, and weapon discharges (lasers,
 * ballistic mortar shells, and cryogenic stasis pulses).
 */
export class TowerSystem {
  /**
   * @param {import('./flowfield.js').FlowField|null} flowField FlowField navigation engine
   * @param {object} [options={}] Optional configuration overrides
   */
  constructor(flowField = null, options = {}) {
    this.flowField = flowField;
    this.cols = flowField ? flowField.cols : (CONFIG && CONFIG.GRID ? CONFIG.GRID.COLS : 64);
    this.rows = flowField ? flowField.rows : (CONFIG && CONFIG.GRID ? CONFIG.GRID.ROWS : 36);
    this.cellSize = flowField ? (flowField.cellSize || 20) : (CONFIG && CONFIG.GRID ? CONFIG.GRID.CELL_SIZE : 20);

    this.coreCol = options.coreCol !== undefined
      ? options.coreCol
      : (CONFIG && CONFIG.CORE && CONFIG.CORE.COL < this.cols ? CONFIG.CORE.COL : Math.floor(this.cols / 2));
    this.coreRow = options.coreRow !== undefined
      ? options.coreRow
      : (CONFIG && CONFIG.CORE && CONFIG.CORE.ROW < this.rows ? CONFIG.CORE.ROW : Math.floor(this.rows / 2));
    this.spawns = options.spawns !== undefined
      ? options.spawns
      : (CONFIG && CONFIG.SPAWNS ? CONFIG.SPAWNS.filter(s => s.col < this.cols && s.row < this.rows) : []);

    // Placed towers collection and spatial grid lookup table
    this.towers = [];
    this._grid = new Array(this.cols * this.rows).fill(null);
    this._nextTowerId = 0;

    // Projectile Object Pool for zero runtime allocations
    const poolSize = options.projectilePoolSize || 256;
    this._projectilePool = [];
    for (let i = 0; i < poolSize; i++) {
      this._projectilePool.push({
        id: i,
        active: false,
        fromX: 0,
        fromY: 0,
        targetX: 0,
        targetY: 0,
        x: 0,
        y: 0,
        z: 0,
        progress: 0,
        duration: 0.5,
        speed: 350,
        damage: 0,
        splashRadius: 0,
        pushForce: 2.5,
        arcHeight: 40
      });
    }

    // Active in-flight projectiles exposed to renderer
    this.projectiles = [];

    // Reusable scratch buffer for spatial queries
    this._queryBuffer = new Int32Array(512);
  }

  /**
   * Total projectile pool capacity (active + inactive).
   * @returns {number}
   */
  get projectilePoolCapacity() {
    return this._projectilePool.length + this.projectiles.length;
  }

  /**
   * Internal helper to recalculate flowfield paths with current core and spawn configuration.
   * @private
   */
  _recalculateFlow() {
    if (this.flowField && typeof this.flowField.recalculate === 'function') {
      this.flowField.recalculate(this.coreCol, this.coreRow, this.spawns);
    }
  }

  /**
   * Retrieve tower located at grid coordinate (col, row).
   *
   * @param {number} col Column index
   * @param {number} row Row index
   * @returns {object|null} Placed tower record or null if empty/out of bounds
   */
  getTowerAt(col, row) {
    const c = Math.floor(col);
    const r = Math.floor(row);
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return null;
    return this._grid[r * this.cols + c] || null;
  }

  /**
   * Build a new tower at (col, row).
   * Validates placement, sets flowfield cost to 255, recalculates flow, and creates tower record.
   *
   * @param {string} typeKey Tower archetype key ('GATLING', 'MORTAR', 'STASIS')
   * @param {number} col Grid column
   * @param {number} row Grid row
   * @returns {object|null} Created tower or null if placement was invalid
   */
  build(typeKey, col, row) {
    if (typeof typeKey !== 'string') return null;
    const key = typeKey.trim().toUpperCase();
    const towerDef = (CONFIG && CONFIG.TOWERS) ? CONFIG.TOWERS[key] : null;
    if (!towerDef) return null;

    const c = Math.floor(col);
    const r = Math.floor(row);

    // Bounds check
    if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return null;

    // Check Core cell collision
    if (c === this.coreCol && r === this.coreRow) return null;

    // Check Spawn cells collision
    if (this.spawns && this.spawns.some(s => s.col === c && s.row === r)) return null;

    // Check if cell is already occupied by a tower
    if (this.getTowerAt(c, r) !== null) return null;

    // Check if cell is an existing obstacle/wall
    if (this.flowField && this.flowField.getCost(c, r) >= 255) return null;

    // Mark obstacle on flow field and recalculate pathing
    if (this.flowField) {
      this.flowField.setCost(c, r, 255);
      this._recalculateFlow();
    }

    const levelStats = { ...towerDef.levels[0] };
    const tower = {
      id: ++this._nextTowerId,
      type: key,
      typeKey: key,
      name: towerDef.name,
      col: c,
      row: r,
      x: (c + 0.5) * this.cellSize,
      y: (r + 0.5) * this.cellSize,
      level: 1,
      stats: levelStats,
      hp: levelStats.hp,
      maxHp: levelStats.hp,
      cooldown: 0,
      totalCost: towerDef.cost,
      investedCost: towerDef.cost,
      damage: levelStats.damage || 0,
      range: levelStats.range || 0,
      fireRate: levelStats.fireRate || levelStats.pulseRate || 0,
      splashRadius: levelStats.splashRadius || 0,
      slowPercent: levelStats.slowPercent || 0
    };

    this.towers.push(tower);
    this._grid[r * this.cols + c] = tower;
    return tower;
  }

  /**
   * Upgrade an existing tower up to maximum level 3.
   *
   * @param {number} col Grid column
   * @param {number} row Grid row
   * @returns {boolean} True if upgrade succeeded, false otherwise
   */
  upgrade(col, row) {
    const tower = this.getTowerAt(col, row);
    if (!tower) return false;

    const towerDef = CONFIG && CONFIG.TOWERS ? CONFIG.TOWERS[tower.typeKey] : null;
    if (!towerDef) return false;

    if (tower.level >= 3 || tower.level >= towerDef.levels.length) {
      return false;
    }

    const currentStats = towerDef.levels[tower.level - 1];
    const upgradeCost = currentStats.upgradeCost || 0;

    tower.level++;
    const nextStats = { ...towerDef.levels[tower.level - 1] };
    tower.stats = nextStats;
    tower.investedCost += upgradeCost;
    tower.totalCost += upgradeCost;

    // Update HP: increase max HP and maintain current missing health
    const hpDelta = nextStats.hp - tower.maxHp;
    tower.maxHp = nextStats.hp;
    tower.hp = Math.min(tower.maxHp, tower.hp + Math.max(0, hpDelta));

    // Update flattened access properties
    tower.damage = nextStats.damage || 0;
    tower.range = nextStats.range || 0;
    tower.fireRate = nextStats.fireRate || nextStats.pulseRate || 0;
    tower.splashRadius = nextStats.splashRadius || 0;
    tower.slowPercent = nextStats.slowPercent || 0;

    return true;
  }

  /**
   * Sell a tower, resetting its cell cost to 1 and returning refund credits.
   *
   * @param {number} col Grid column
   * @param {number} row Grid row
   * @returns {number} Refund amount in credits
   */
  sell(col, row) {
    const tower = this.getTowerAt(col, row);
    if (!tower) return 0;

    const refundRate = (CONFIG && CONFIG.ECONOMY && CONFIG.ECONOMY.REFUND_RATE) ? CONFIG.ECONOMY.REFUND_RATE : 0.75;
    const refund = Math.floor(tower.investedCost * refundRate);

    const c = tower.col;
    const r = tower.row;
    this._grid[r * this.cols + c] = null;
    const idx = this.towers.indexOf(tower);
    if (idx !== -1) {
      this.towers.splice(idx, 1);
    }

    if (this.flowField) {
      this.flowField.setCost(c, r, 1);
      this._recalculateFlow();
    }

    return refund;
  }

  /**
   * Inflicts breach damage to a tower. Destroys the tower if HP drops to 0 or below,
   * resetting cell traversal cost to 1 and recalculating flow paths.
   *
   * @param {number} col Grid column
   * @param {number} row Grid row
   * @param {number} amount Damage amount
   * @param {((tower: object) => void)|null} [onDestroyed=null] Callback fired upon destruction
   * @returns {boolean} True if the tower was destroyed by this damage
   */
  takeBreachDamage(col, row, amount, onDestroyed = null) {
    const tower = this.getTowerAt(col, row);
    if (!tower) return false;

    tower.hp -= amount;
    if (tower.hp <= 0) {
      tower.hp = 0;
      const c = tower.col;
      const r = tower.row;
      this._grid[r * this.cols + c] = null;
      const idx = this.towers.indexOf(tower);
      if (idx !== -1) {
        this.towers.splice(idx, 1);
      }

      if (this.flowField) {
        this.flowField.setCost(c, r, 1);
        this._recalculateFlow();
      }

      if (typeof onDestroyed === 'function') {
        onDestroyed(tower);
      }
      return true;
    }

    return false;
  }

  /**
   * Finds the nearest active creep within range.
   * Optimized with zero runtime heap allocations.
   *
   * @private
   * @param {number} x Origin X in pixels
   * @param {number} y Origin Y in pixels
   * @param {number} range Maximum range in pixels
   * @param {SwarmEngine} swarm
   * @param {import('./spatial-hash.js').SpatialHashGrid|null} spatialGrid
   * @returns {number} Creep entity ID or -1 if none found
   */
  _findNearestActiveTarget(x, y, range, swarm, spatialGrid) {
    if (!swarm || swarm.activeCount === 0 || range <= 0) return -1;
    const r2 = range * range;

    if (spatialGrid) {
      const nearestId = spatialGrid.queryNearest(x, y, range);
      if (nearestId !== -1 && (swarm.flags[nearestId] & SwarmEngine.FLAG_ACTIVE)) {
        return nearestId;
      }

      const count = spatialGrid.queryRadius(x, y, range, this._queryBuffer);
      let bestId = -1;
      let bestD2 = r2;
      for (let i = 0; i < count; i++) {
        const id = this._queryBuffer[i];
        if (id < 0 || !(swarm.flags[id] & SwarmEngine.FLAG_ACTIVE)) continue;
        const dx = swarm.posX[id] - x;
        const dy = swarm.posY[id] - y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= bestD2) {
          bestD2 = d2;
          bestId = id;
        }
      }
      return bestId;
    }

    // Linear fallback when spatialGrid is omitted
    let bestId = -1;
    let bestD2 = r2;
    for (let i = 0; i < swarm.maxParticles; i++) {
      if (!(swarm.flags[i] & SwarmEngine.FLAG_ACTIVE)) continue;
      const dx = swarm.posX[i] - x;
      const dy = swarm.posY[i] - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) {
        bestD2 = d2;
        bestId = i;
      }
    }
    return bestId;
  }

  /**
   * Spawns an in-flight ballistic mortar projectile from the pre-allocated pool.
   * @private
   */
  _spawnProjectile(fromX, fromY, targetX, targetY, stats) {
    let p = this._projectilePool.pop();
    if (!p) {
      p = {
        id: this.projectilePoolCapacity + 1,
        active: false,
        fromX: 0,
        fromY: 0,
        targetX: 0,
        targetY: 0,
        x: 0,
        y: 0,
        z: 0,
        progress: 0,
        duration: 0.5,
        speed: 350,
        damage: 0,
        splashRadius: 0,
        pushForce: 2.5,
        arcHeight: 40
      };
    }

    const dist = Math.hypot(targetX - fromX, targetY - fromY);
    const speed = stats.projectileSpeed || 350;
    const duration = Math.max(0.2, dist / speed);

    p.active = true;
    p.fromX = fromX;
    p.fromY = fromY;
    p.targetX = targetX;
    p.targetY = targetY;
    p.x = fromX;
    p.y = fromY;
    p.z = 0;
    p.progress = 0;
    p.duration = duration;
    p.speed = speed;
    p.damage = stats.damage;
    p.splashRadius = stats.splashRadius || 65;
    p.pushForce = stats.pushForce !== undefined ? stats.pushForce : 2.5;
    p.arcHeight = Math.min(60, Math.max(20, dist * 0.25));

    this.projectiles.push(p);
    return p;
  }

  /**
   * Updates all active in-flight projectiles. Applies splash damage upon impact.
   * @private
   */
  _updateProjectiles(dt, swarm, spatialGrid, onFireEffect) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.progress += dt / p.duration;

      if (p.progress >= 1.0) {
        p.progress = 1.0;
        p.x = p.targetX;
        p.y = p.targetY;
        p.z = 0;

        // Apply kinetic area damage and shockwave impulse
        let killed = [];
        if (swarm) {
          killed = swarm.applyAreaDamage(
            p.targetX,
            p.targetY,
            p.splashRadius,
            p.damage,
            p.pushForce,
            spatialGrid
          );
        }

        if (onFireEffect) {
          onFireEffect({
            type: 'explosion',
            x: p.targetX,
            y: p.targetY,
            radius: p.splashRadius,
            damage: p.damage,
            killed
          });
        }

        // Recycle projectile back into the pool
        p.active = false;
        this.projectiles.splice(i, 1);
        this._projectilePool.push(p);
      } else {
        p.x = p.fromX + (p.targetX - p.fromX) * p.progress;
        p.y = p.fromY + (p.targetY - p.fromY) * p.progress;
        p.z = Math.sin(p.progress * Math.PI) * p.arcHeight;
      }
    }
  }

  /**
   * Main simulation tick for TowerSystem.
   * Updates projectile flight, ticks tower cooldowns, performs creep targeting,
   * deals damage, and emits visual effect events.
   *
   * @param {number} dt Delta time in seconds
   * @param {SwarmEngine} swarm Active swarm engine
   * @param {import('./spatial-hash.js').SpatialHashGrid|null} [spatialGrid=null]
   * @param {((effect: object) => void)|null} [onFireEffect=null]
   */
  update(dt, swarm, spatialGrid = null, onFireEffect = null) {
    // Step 1: Update in-flight projectiles
    this._updateProjectiles(dt, swarm, spatialGrid, onFireEffect);

    // Step 2: Update tower targeting and weapon cooldowns
    for (let i = 0; i < this.towers.length; i++) {
      const tower = this.towers[i];
      tower.cooldown = Math.max(0, tower.cooldown - dt);

      if (tower.cooldown > 0) continue;

      switch (tower.typeKey) {
        case 'GATLING': {
          const targetId = this._findNearestActiveTarget(tower.x, tower.y, tower.stats.range, swarm, spatialGrid);
          if (targetId !== -1) {
            const tx = swarm.posX[targetId];
            const ty = swarm.posY[targetId];
            const killed = swarm.applyDamage(targetId, tower.stats.damage);
            tower.cooldown = 1 / (tower.stats.fireRate || 8);

            if (onFireEffect) {
              onFireEffect({
                type: 'laser',
                tower,
                towerId: tower.id,
                towerType: 'GATLING',
                fromX: tower.x,
                fromY: tower.y,
                toX: tx,
                toY: ty,
                targetId,
                damage: tower.stats.damage,
                killed
              });
            }
          }
          break;
        }

        case 'MORTAR': {
          const targetId = this._findNearestActiveTarget(tower.x, tower.y, tower.stats.range, swarm, spatialGrid);
          if (targetId !== -1) {
            const tx = swarm.posX[targetId];
            const ty = swarm.posY[targetId];
            const proj = this._spawnProjectile(tower.x, tower.y, tx, ty, tower.stats);
            tower.cooldown = 1 / (tower.stats.fireRate || 1.2);

            if (onFireEffect) {
              onFireEffect({
                type: 'mortar_launch',
                tower,
                towerId: tower.id,
                towerType: 'MORTAR',
                fromX: tower.x,
                fromY: tower.y,
                toX: tx,
                toY: ty,
                targetId,
                projectileId: proj.id
              });
            }
          }
          break;
        }

        case 'STASIS': {
          const targetId = this._findNearestActiveTarget(tower.x, tower.y, tower.stats.range, swarm, spatialGrid);
          if (targetId !== -1) {
            const slowDuration = 1.5;
            const affected = swarm.applyAreaSlow(
              tower.x,
              tower.y,
              tower.stats.range,
              tower.stats.slowPercent,
              slowDuration,
              spatialGrid
            );
            tower.cooldown = 1 / (tower.stats.pulseRate || 2.0);

            if (onFireEffect) {
              onFireEffect({
                type: 'stasis_pulse',
                tower,
                towerId: tower.id,
                towerType: 'STASIS',
                x: tower.x,
                y: tower.y,
                range: tower.stats.range,
                slowPercent: tower.stats.slowPercent,
                affected
              });
            }
          }
          break;
        }
      }
    }
  }

  /**
   * Resets all placed towers and active projectiles.
   */
  reset() {
    for (let i = 0; i < this.towers.length; i++) {
      const t = this.towers[i];
      if (this.flowField) {
        this.flowField.setCost(t.col, t.row, 1);
      }
    }
    this.towers.length = 0;
    this._grid.fill(null);

    while (this.projectiles.length > 0) {
      const p = this.projectiles.pop();
      p.active = false;
      this._projectilePool.push(p);
    }

    this._recalculateFlow();
  }
}
