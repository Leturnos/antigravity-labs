import { CONFIG } from '../config.js';

/**
 * Bitmask flags for Swarm entities.
 */
export const FLAG_ACTIVE = 1 << 0; // bit 0: particle is alive and active
export const FLAG_SLOWED = 1 << 1; // bit 1: particle is affected by stasis slow
export const FLAG_BREACH = 1 << 2; // bit 2: particle is in breach / fury mode

/**
 * High-Performance Structure of Arrays (SoA) Swarm Engine.
 * Capable of updating 10,000+ particles at 60+ FPS with zero runtime heap allocation.
 */
export class SwarmEngine {
  static FLAG_ACTIVE = FLAG_ACTIVE;
  static FLAG_SLOWED = FLAG_SLOWED;
  static FLAG_BREACH = FLAG_BREACH;

  /**
   * @param {number} [maxParticles=CONFIG.SWARM.MAX_PARTICLES] Maximum capacity of the swarm pool
   */
  constructor(maxParticles = (CONFIG && CONFIG.SWARM ? CONFIG.SWARM.MAX_PARTICLES : 10000)) {
    this.maxParticles = maxParticles;

    // Structure of Arrays (SoA) TypedArray buffers
    this.posX = new Float32Array(maxParticles);
    this.posY = new Float32Array(maxParticles);
    this.velX = new Float32Array(maxParticles);
    this.velY = new Float32Array(maxParticles);
    this.hp = new Float32Array(maxParticles);
    this.maxHp = new Float32Array(maxParticles);
    this.speed = new Float32Array(maxParticles);
    this.type = new Uint8Array(maxParticles);
    this.flags = new Uint8Array(maxParticles);
    this.slowTimer = new Float32Array(maxParticles);
    this.slowFactor = new Float32Array(maxParticles);

    // Free stack for O(1) recycling of particle IDs without object churn
    this.freeStack = new Int32Array(maxParticles);
    for (let i = 0; i < maxParticles; i++) {
      this.freeStack[i] = maxParticles - 1 - i;
    }
    this.freeTop = maxParticles - 1;

    // Internal simulation frame counter for interleaved optimizations
    this._frame = 0;

    // Scratch buffers for zero-allocation sampling and querying
    this._tempFlow = { vx: 0, vy: 0 };
    this._neighborBuffer = new Int32Array(16);
    this._queryBuffer = new Int32Array(this.maxParticles);
  }

  /**
   * Number of currently active particles in the swarm.
   * @returns {number}
   */
  get activeCount() {
    return this.maxParticles - 1 - this.freeTop;
  }

  /**
   * Spawns a particle of the given type at (x, y).
   *
   * @param {number|string} typeId Creep archetype ID (0: Swarmer, 1: Brute, 2: Disruptor) or string key
   * @param {number} x World X coordinate
   * @param {number} y World Y coordinate
   * @returns {number} Spawned entity ID, or -1 if the pool is full
   */
  spawn(typeId, x, y) {
    if (this.freeTop < 0) {
      return -1;
    }

    let tId = 0;
    let creepConfig = null;

    if (typeof typeId === 'string') {
      const key = typeId.toUpperCase();
      creepConfig = CONFIG && CONFIG.CREEPS ? CONFIG.CREEPS[key] : null;
      tId = creepConfig ? creepConfig.id : 0;
    } else if (typeof typeId === 'number') {
      tId = typeId;
      if (CONFIG && CONFIG.CREEPS) {
        for (const k of Object.keys(CONFIG.CREEPS)) {
          if (CONFIG.CREEPS[k].id === tId) {
            creepConfig = CONFIG.CREEPS[k];
            break;
          }
        }
      }
    }

    const baseHp = creepConfig ? creepConfig.hp : (tId === 1 ? 180 : (tId === 2 ? 60 : 20));
    const baseSpeed = creepConfig ? creepConfig.speed : (tId === 1 ? 0.85 : (tId === 2 ? 1.4 : 1.7));

    const id = this.freeStack[this.freeTop--];

    this.posX[id] = x;
    this.posY[id] = y;
    this.velX[id] = 0;
    this.velY[id] = 0;
    this.hp[id] = baseHp;
    this.maxHp[id] = baseHp;
    this.speed[id] = baseSpeed;
    this.type[id] = tId;
    this.flags[id] = FLAG_ACTIVE;
    this.slowTimer[id] = 0;
    this.slowFactor[id] = 0;

    return id;
  }

  /**
   * Deactivates a particle and recycles its ID.
   *
   * @param {number} id Integer entity ID
   * @returns {boolean} True if successfully killed, false if invalid or already inactive
   */
  kill(id) {
    if (id < 0 || id >= this.maxParticles) return false;
    if (!(this.flags[id] & FLAG_ACTIVE)) return false;

    this.flags[id] = 0;
    this.hp[id] = 0;
    this.velX[id] = 0;
    this.velY[id] = 0;
    this.slowTimer[id] = 0;
    this.slowFactor[id] = 0;

    this.freeStack[++this.freeTop] = id;
    return true;
  }

  /**
   * Resets all entities in the swarm pool.
   */
  reset() {
    this.flags.fill(0);
    this.hp.fill(0);
    this.maxHp.fill(0);
    this.posX.fill(0);
    this.posY.fill(0);
    this.velX.fill(0);
    this.velY.fill(0);
    this.speed.fill(0);
    this.type.fill(0);
    this.slowTimer.fill(0);
    this.slowFactor.fill(0);

    for (let i = 0; i < this.maxParticles; i++) {
      this.freeStack[i] = this.maxParticles - 1 - i;
    }
    this.freeTop = this.maxParticles - 1;
    this._frame = 0;
  }

  /**
   * Applies damage to a single entity.
   *
   * @param {number} id Entity ID
   * @param {number} amount Damage amount
   * @returns {boolean} True if the entity was killed by this damage
   */
  applyDamage(id, amount) {
    if (id < 0 || id >= this.maxParticles) return false;
    if (!(this.flags[id] & FLAG_ACTIVE)) return false;

    this.hp[id] -= amount;
    if (this.hp[id] <= 0) {
      this.hp[id] = 0;
      this.kill(id);
      return true;
    }
    return false;
  }

  /**
   * Applies area-of-effect damage and optional radial kinetic push force.
   *
   * @param {number} x Epicenter X coordinate
   * @param {number} y Epicenter Y coordinate
   * @param {number} radius Explosion radius
   * @param {number} damage Base damage
   * @param {number} [pushForce=0] Radial impulse added to velocity
   * @param {import('./spatial-hash.js').SpatialHashGrid|null} [spatialGrid=null]
   * @returns {number[]} Array of entity IDs killed by the area damage
   */
  applyAreaDamage(x, y, radius, damage, pushForce = 0, spatialGrid = null) {
    const killed = [];
    if (radius <= 0) return killed;

    if (spatialGrid) {
      const count = spatialGrid.queryRadius(x, y, radius, this._queryBuffer);
      for (let i = 0; i < count; i++) {
        const id = this._queryBuffer[i];
        if (id < 0 || !(this.flags[id] & FLAG_ACTIVE)) continue;

        if (pushForce > 0) {
          const dx = this.posX[id] - x;
          const dy = this.posY[id] - y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0.0001) {
            const falloff = 1 - (dist / radius);
            const force = pushForce * Math.max(0.2, falloff);
            this.velX[id] += (dx / dist) * force;
            this.velY[id] += (dy / dist) * force;
          } else {
            this.velX[id] += (Math.random() - 0.5) * pushForce;
            this.velY[id] += (Math.random() - 0.5) * pushForce;
          }
        }

        if (this.applyDamage(id, damage)) {
          killed.push(id);
        }
      }
    } else {
      const r2 = radius * radius;
      for (let id = 0; id < this.maxParticles; id++) {
        if (!(this.flags[id] & FLAG_ACTIVE)) continue;
        const dx = this.posX[id] - x;
        const dy = this.posY[id] - y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) {
          if (pushForce > 0) {
            const dist = Math.sqrt(d2);
            if (dist > 0.0001) {
              const falloff = 1 - (dist / radius);
              const force = pushForce * Math.max(0.2, falloff);
              this.velX[id] += (dx / dist) * force;
              this.velY[id] += (dy / dist) * force;
            } else {
              this.velX[id] += (Math.random() - 0.5) * pushForce;
              this.velY[id] += (Math.random() - 0.5) * pushForce;
            }
          }

          if (this.applyDamage(id, damage)) {
            killed.push(id);
          }
        }
      }
    }

    return killed;
  }

  /**
   * Applies cryogenic slow status to all entities within a radius.
   *
   * @param {number} x Center X coordinate
   * @param {number} y Center Y coordinate
   * @param {number} radius Area radius
   * @param {number} slowFactor Slow percentage (e.g. 0.40 for 40% slow)
   * @param {number} duration Duration in seconds
   * @param {import('./spatial-hash.js').SpatialHashGrid|null} [spatialGrid=null]
   * @returns {number} Number of entities affected
   */
  applyAreaSlow(x, y, radius, slowFactor, duration, spatialGrid = null) {
    if (radius <= 0 || duration <= 0) return 0;

    let affected = 0;

    if (spatialGrid) {
      const count = spatialGrid.queryRadius(x, y, radius, this._queryBuffer);
      for (let i = 0; i < count; i++) {
        const id = this._queryBuffer[i];
        if (id < 0 || !(this.flags[id] & FLAG_ACTIVE)) continue;

        this.flags[id] |= FLAG_SLOWED;
        if (duration > this.slowTimer[id]) {
          this.slowTimer[id] = duration;
        }
        if (slowFactor > this.slowFactor[id]) {
          this.slowFactor[id] = slowFactor;
        }
        affected++;
      }
    } else {
      const r2 = radius * radius;
      for (let id = 0; id < this.maxParticles; id++) {
        if (!(this.flags[id] & FLAG_ACTIVE)) continue;
        const dx = this.posX[id] - x;
        const dy = this.posY[id] - y;
        if (dx * dx + dy * dy <= r2) {
          this.flags[id] |= FLAG_SLOWED;
          if (duration > this.slowTimer[id]) {
            this.slowTimer[id] = duration;
          }
          if (slowFactor > this.slowFactor[id]) {
            this.slowFactor[id] = slowFactor;
          }
          affected++;
        }
      }
    }

    return affected;
  }

  /**
   * Updates all active particles in the swarm simulation for delta time dt.
   *
   * @param {number} [dt=0.016] Delta time in seconds
   * @param {import('./flowfield.js').FlowField|null} [flowField=null] FlowField pathfinding engine
   * @param {import('./spatial-hash.js').SpatialHashGrid|null} [spatialGrid=null] Spatial hash grid
   * @param {number} [coreCol=CONFIG.CORE.COL] Column of target core
   * @param {number} [coreRow=CONFIG.CORE.ROW] Row of target core
   * @param {number} [cellSize=CONFIG.GRID.CELL_SIZE] Grid cell size in pixels
   * @param {((id: number, damage: number) => void)|null} [onReachCore=null] Core contact callback
   * @param {((col: number, row: number, damage: number) => void)|null} [onBreachDamage=null] Breach contact callback
   */
  update(
    dt = 0.016,
    flowField = null,
    spatialGrid = null,
    coreCol = (CONFIG && CONFIG.CORE ? CONFIG.CORE.COL : 32),
    coreRow = (CONFIG && CONFIG.CORE ? CONFIG.CORE.ROW : 18),
    cellSize = (CONFIG && CONFIG.GRID ? CONFIG.GRID.CELL_SIZE : 20),
    onReachCore = null,
    onBreachDamage = null
  ) {
    if (this.activeCount === 0) return;
    this._frame++;

    // Step 1: Re-index active particles into spatialGrid for boids separation and targeting
    if (spatialGrid) {
      spatialGrid.clear();
      for (let i = 0; i < this.maxParticles; i++) {
        if (this.flags[i] & FLAG_ACTIVE) {
          spatialGrid.insert(i, this.posX[i], this.posY[i]);
        }
      }
    }

    // Step 2: Extract Breach Mode status from flowField
    let isBreach = Boolean(flowField && flowField.isBreachActive && flowField.isBreachActive());
    let breachTower = isBreach && flowField.getBreachTargetTower ? flowField.getBreachTargetTower() : null;
    let breachTowerCenterX = 0;
    let breachTowerCenterY = 0;
    if (breachTower) {
      breachTowerCenterX = (breachTower.col + 0.5) * cellSize;
      breachTowerCenterY = (breachTower.row + 0.5) * cellSize;
    }

    // Step 3: Target Core bounds
    const coreX = (coreCol + 0.5) * cellSize;
    const coreY = (coreRow + 0.5) * cellSize;
    const coreRadius = (CONFIG && CONFIG.CORE && CONFIG.CORE.RADIUS) ? CONFIG.CORE.RADIUS : 24;
    const coreRadiusSq = coreRadius * coreRadius;

    // Step 4: Swarm separation constants
    const sepDist = (CONFIG && CONFIG.SWARM && CONFIG.SWARM.SEPARATION_DISTANCE) ? CONFIG.SWARM.SEPARATION_DISTANCE : 12;
    const sepDistSq = sepDist * sepDist;
    const sepForce = (CONFIG && CONFIG.SWARM && CONFIG.SWARM.SEPARATION_FORCE) ? CONFIG.SWARM.SEPARATION_FORCE : 0.8;

    // Step 5: World boundaries
    const worldWidth = flowField && flowField.cols ? flowField.cols * cellSize : (CONFIG && CONFIG.GRID ? CONFIG.GRID.WIDTH : 1280);
    const worldHeight = flowField && flowField.rows ? flowField.rows * cellSize : (CONFIG && CONFIG.GRID ? CONFIG.GRID.HEIGHT : 720);

    const steerRate = Math.min(1.0, 12 * dt);

    // Adaptive separation interleaving based on swarm active entity scale
    const count = this.activeCount;
    const interleaveMask = count <= 200 ? 0 : (count <= 1000 ? 1 : (count <= 3000 ? 3 : 7));
    const framePhase = this._frame & interleaveMask;

    for (let i = 0; i < this.maxParticles; i++) {
      if (!(this.flags[i] & FLAG_ACTIVE)) continue;

      // Update Breach Mode / Fury flag
      if (isBreach) {
        this.flags[i] |= FLAG_BREACH;
      } else {
        this.flags[i] &= ~FLAG_BREACH;
      }

      // Slow timer tick
      if (this.flags[i] & FLAG_SLOWED) {
        this.slowTimer[i] -= dt;
        if (this.slowTimer[i] <= 0) {
          this.slowTimer[i] = 0;
          this.slowFactor[i] = 0;
          this.flags[i] &= ~FLAG_SLOWED;
        }
      }

      const px = this.posX[i];
      const py = this.posY[i];

      // Collision Check: Touching Breach Target Tower (Prioritized during Breach Mode)
      if (isBreach && breachTower) {
        const dTowerX = px - breachTowerCenterX;
        const dTowerY = py - breachTowerCenterY;
        const breachThreshold = cellSize * 0.8;
        if (dTowerX * dTowerX + dTowerY * dTowerY <= breachThreshold * breachThreshold) {
          const cType = this.type[i];
          const breachDmg = (cType === 1 ? 40 : (cType === 2 ? 25 : 10));
          if (onBreachDamage) {
            onBreachDamage(breachTower.col, breachTower.row, breachDmg);
          }
          this.kill(i);
          // Re-evaluate breach status dynamically in case the tower was destroyed
          isBreach = Boolean(flowField && flowField.isBreachActive && flowField.isBreachActive());
          continue;
        }
      }

      // Collision Check: Touching Core
      const dCoreX = px - coreX;
      const dCoreY = py - coreY;
      if (dCoreX * dCoreX + dCoreY * dCoreY <= coreRadiusSq) {
        const cType = this.type[i];
        const coreDmg = (cType === 1 ? 5 : (cType === 2 ? 2 : 1));
        if (onReachCore) {
          onReachCore(i, coreDmg);
        }
        this.kill(i);
        continue;
      }

      // Sample continuous flow vector with zero allocation
      let fvx = 0;
      let fvy = 0;
      if (flowField) {
        flowField.sampleFlow(px, py, this._tempFlow);
        fvx = this._tempFlow.vx;
        fvy = this._tempFlow.vy;
      }

      // Soft boids separation using SpatialHashGrid
      let sepX = 0;
      let sepY = 0;
      if (spatialGrid && ((i & interleaveMask) === framePhase)) {
        const nNeighbors = spatialGrid.queryRadius(px, py, sepDist, this._neighborBuffer);
        for (let n = 0; n < nNeighbors; n++) {
          const otherId = this._neighborBuffer[n];
          if (otherId === i || !(this.flags[otherId] & FLAG_ACTIVE)) continue;
          const ox = this.posX[otherId];
          const oy = this.posY[otherId];
          const dx = px - ox;
          const dy = py - oy;
          const d2 = dx * dx + dy * dy;
          if (d2 < sepDistSq && d2 > 0.0001) {
            const dist = Math.sqrt(d2);
            const force = (1 - dist / sepDist) * sepForce;
            sepX += (dx / dist) * force;
            sepY += (dy / dist) * force;
          }
        }
      }

      // Combine flow direction and soft boids separation
      let dirX = fvx + sepX;
      let dirY = fvy + sepY;
      const dirLenSq = dirX * dirX + dirY * dirY;
      if (dirLenSq > 0.0001) {
        const invLen = 1 / Math.sqrt(dirLenSq);
        dirX *= invLen;
        dirY *= invLen;
      }

      // Desired speed and velocity
      const slowMul = (this.flags[i] & FLAG_SLOWED) ? (1 - this.slowFactor[i]) : 1;
      const targetSpeed = this.speed[i] * slowMul * 60; // Pixels per second
      const targetVx = dirX * targetSpeed;
      const targetVy = dirY * targetSpeed;

      // Smooth steering / inertia
      if (this.velX[i] === 0 && this.velY[i] === 0) {
        this.velX[i] = targetVx;
        this.velY[i] = targetVy;
      } else {
        this.velX[i] += (targetVx - this.velX[i]) * steerRate;
        this.velY[i] += (targetVy - this.velY[i]) * steerRate;
      }

      // Position integration
      let newX = px + this.velX[i] * dt;
      let newY = py + this.velY[i] * dt;

      // World boundary clamping
      if (newX < 0) newX = 0;
      else if (newX > worldWidth) newX = worldWidth;
      if (newY < 0) newY = 0;
      else if (newY > worldHeight) newY = worldHeight;

      this.posX[i] = newX;
      this.posY[i] = newY;
    }
  }
}
