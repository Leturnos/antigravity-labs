import { CONFIG } from '../config.js';
import { SwarmEngine, FLAG_ACTIVE, FLAG_SLOWED, FLAG_BREACH } from '../engine/swarm.js';

/**
 * Cyberpunk Canvas 2D Renderer with high-performance particle batching.
 *
 * Designed to sustain 60+ FPS with 10,000+ active particles by grouping draw calls
 * by archetype, minimizing canvas state changes, and utilizing zero runtime allocations.
 */
export class GameRenderer {
  /**
   * @param {HTMLCanvasElement|object} canvas HTML5 Canvas or mock canvas instance
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas && typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;

    // Simulation animation time for pulsating visual effects
    this._time = 0;

    // Active visual effects pool (lasers, explosions, shockwaves, stasis pulses)
    this.effects = [];

    // Pre-allocated typed arrays for zero-allocation particle batching
    const maxParticles = (CONFIG && CONFIG.SWARM && CONFIG.SWARM.MAX_PARTICLES) ? CONFIG.SWARM.MAX_PARTICLES : 10000;
    this._batchSwarmer = new Int32Array(maxParticles);
    this._batchBrute = new Int32Array(maxParticles);
    this._batchDisruptor = new Int32Array(maxParticles);
    this._batchBreach = new Int32Array(maxParticles);
    this._batchSlowed = new Int32Array(maxParticles);
  }

  /**
   * Register a new visual effect in the renderer's pool.
   *
   * @param {object} effect
   */
  addEffect(effect) {
    if (!effect || !effect.type) return;

    let defaultLife = 0.35;
    if (effect.type === 'laser') defaultLife = 0.08;
    else if (effect.type === 'explosion') defaultLife = 0.35;
    else if (effect.type === 'stasis_pulse') defaultLife = 0.45;
    else if (effect.type === 'mortar_launch') defaultLife = 0.15;

    const life = effect.life !== undefined ? effect.life : defaultLife;
    this.effects.push({
      ...effect,
      life,
      maxLife: effect.maxLife !== undefined ? effect.maxLife : life,
      progress: 0
    });
  }

  /**
   * Advance all visual effects over delta time and recycle expired ones.
   *
   * @param {number} dt Delta time in seconds
   */
  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      if (e.maxLife > 0) {
        e.progress = Math.min(1.0, Math.max(0.0, 1.0 - (e.life / e.maxLife)));
      }
      if (e.life <= 0) {
        this.effects.splice(i, 1);
      }
    }
  }

  /**
   * Clear all active visual effects.
   */
  clearEffects() {
    this.effects.length = 0;
  }

  /**
   * Primary render routine executing the layered cyberpunk drawing pipeline:
   * 1. Background & cybernetic grid lines
   * 2. Debug overlay (Dijkstra distance heatmap and flow vectors)
   * 3. Spawn portals & Central Core
   * 4. Towers (bases, barrels, level pips, health bars, range overlays)
   * 5. Swarm particles (batched rendering with velocity tails)
   * 6. Projectiles & visual effects
   * 7. Mouse placement preview
   *
   * @param {import('../engine/flowfield.js').FlowField|null} flowField
   * @param {import('../engine/swarm.js').SwarmEngine|null} swarm
   * @param {import('../engine/tower-system.js').TowerSystem|Array|null} towers
   * @param {object|null} core
   * @param {boolean} [debugFlow=false]
   * @param {{col: number, row: number}|null} [selectedTowerCoords=null]
   * @param {object|null} [mousePreview=null]
   * @param {number} [dt=0.016]
   */
  render(
    flowField = null,
    swarm = null,
    towers = null,
    core = null,
    debugFlow = false,
    selectedTowerCoords = null,
    mousePreview = null,
    dt = 0.016
  ) {
    const ctx = this.ctx;
    if (!ctx) return;

    this._time += dt;
    this.updateEffects(dt);

    const width = this.canvas.width || (CONFIG && CONFIG.GRID ? CONFIG.GRID.WIDTH : 1280);
    const height = this.canvas.height || (CONFIG && CONFIG.GRID ? CONFIG.GRID.HEIGHT : 720);
    const cellSize = (flowField && flowField.cellSize) || (CONFIG && CONFIG.GRID ? CONFIG.GRID.CELL_SIZE : 20);
    const cols = (flowField && flowField.cols) || Math.floor(width / cellSize);
    const rows = (flowField && flowField.rows) || Math.floor(height / cellSize);

    // Layer 1: Background & Cybernetic Grid
    this._renderBackgroundAndGrid(ctx, width, height, cellSize, cols, rows);

    // Layer 2: Debug Overlay (Heatmap and Flow Vectors)
    if (debugFlow && flowField) {
      this._renderDebugOverlay(ctx, flowField, cellSize, cols, rows);
    }

    // Layer 3: Spawn Portals & Central Core
    this._renderSpawnsAndCore(ctx, core, cellSize, flowField, towers);

    // Layer 4: Defensive Towers
    this._renderTowers(ctx, towers, cellSize, selectedTowerCoords);

    // Layer 5: Swarm Particles (Batched Rendering)
    if (swarm && swarm.activeCount > 0) {
      this._renderSwarmBatched(ctx, swarm);
    }

    // Layer 6: Projectiles & Visual Effects Pool
    this._renderProjectilesAndEffects(ctx, towers);

    // Layer 7: Mouse Placement Preview
    if (mousePreview) {
      this._renderMousePreview(ctx, mousePreview, cellSize, cols, rows);
    }
  }

  /**
   * Layer 1: Fill deep cybernetic background and subtle grid lines in a single path.
   * @private
   */
  _renderBackgroundAndGrid(ctx, width, height, cellSize, cols, rows) {
    // Cyberpunk void background
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, width, height);

    // Grid lines batched into a single path
    ctx.strokeStyle = 'rgba(15, 29, 56, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let c = 0; c <= cols; c++) {
      const x = c * cellSize;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }

    for (let r = 0; r <= rows; r++) {
      const y = r * cellSize;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }

    ctx.stroke();
  }

  /**
   * Layer 2: Dijkstra distance heatmap and flow direction vector arrows.
   * @private
   */
  _renderDebugOverlay(ctx, flowField, cellSize, cols, rows) {
    const totalCells = cols * rows;
    const intField = flowField.integrationField;
    const costField = flowField.costField;
    const flowX = flowField.flowX;
    const flowY = flowField.flowY;

    // Sub-pass 2A: Distance heatmap fill
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const cost = costField ? costField[idx] : 1;

        if (cost >= 255) {
          ctx.fillStyle = 'rgba(255, 0, 55, 0.25)';
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        } else if (intField) {
          const dist = intField[idx];
          if (dist < 65535) {
            const alpha = Math.max(0.04, Math.min(0.35, 0.35 - (dist / 1200)));
            const hue = (195 + (dist * 0.15)) % 360;
            ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${alpha})`;
            ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          }
        }
      }
    }

    // Sub-pass 2B: Batched flow vector direction arrows
    if (flowX && flowY) {
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();

      const halfCell = cellSize * 0.5;
      const arrowLen = cellSize * 0.35;
      const headLen = arrowLen * 0.45;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const vx = flowX[idx];
          const vy = flowY[idx];

          if (vx === 0 && vy === 0) continue;

          const cx = c * cellSize + halfCell;
          const cy = r * cellSize + halfCell;
          const tipX = cx + vx * arrowLen * 0.5;
          const tipY = cy + vy * arrowLen * 0.5;
          const tailX = cx - vx * arrowLen * 0.5;
          const tailY = cy - vy * arrowLen * 0.5;

          // Main vector shaft
          ctx.moveTo(tailX, tailY);
          ctx.lineTo(tipX, tipY);

          // Arrowhead wings
          const angle = Math.atan2(vy, vx);
          ctx.lineTo(tipX - headLen * Math.cos(angle - 0.5), tipY - headLen * Math.sin(angle - 0.5));
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - headLen * Math.cos(angle + 0.5), tipY - headLen * Math.sin(angle + 0.5));
        }
      }

      ctx.stroke();
    }
  }

  /**
   * Layer 3: Spawn portals with pulsing vortexes and central Core with concentric energy rings.
   * @private
   */
  _renderSpawnsAndCore(ctx, core, cellSize, flowField, towers) {
    const time = this._time;

    // Spawns
    const spawns = (towers && towers.spawns) || (CONFIG && CONFIG.SPAWNS) || [];
    for (let i = 0; i < spawns.length; i++) {
      const sp = spawns[i];
      const px = (sp.col + 0.5) * cellSize;
      const py = (sp.row + 0.5) * cellSize;

      const pulse = Math.sin(time * 3 + i) * 3;
      const rOuter = cellSize * 0.75 + pulse;
      const rInner = cellSize * 0.4;

      // Outer violet vortex ring
      ctx.strokeStyle = 'rgba(189, 0, 255, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, rOuter, 0, Math.PI * 2);
      ctx.stroke();

      // Inner cyan rotating vortex arc
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, rInner, time * 2.5 + i, time * 2.5 + i + Math.PI * 1.5);
      ctx.stroke();

      // Deep vortex eye
      ctx.fillStyle = '#05030d';
      ctx.beginPath();
      ctx.arc(px, py, cellSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Central Core
    const coreCol = core?.col !== undefined ? core.col : (towers?.coreCol !== undefined ? towers.coreCol : (CONFIG?.CORE?.COL ?? 32));
    const coreRow = core?.row !== undefined ? core.row : (towers?.coreRow !== undefined ? towers.coreRow : (CONFIG?.CORE?.ROW ?? 18));
    const cx = (coreCol + 0.5) * cellSize;
    const cy = (coreRow + 0.5) * cellSize;
    const coreRadius = core?.radius || (CONFIG && CONFIG.CORE && CONFIG.CORE.RADIUS) || 24;

    const hp = core?.hp !== undefined ? core.hp : (CONFIG && CONFIG.CORE ? CONFIG.CORE.MAX_HP : 100);
    const maxHp = core?.maxHp !== undefined ? core.maxHp : (CONFIG && CONFIG.CORE ? CONFIG.CORE.MAX_HP : 100);
    const healthRatio = Math.max(0, Math.min(1, hp / maxHp));

    // Outer concentric pulsing rings
    const ring1 = coreRadius + 6 + Math.sin(time * 2.8) * 3;
    const ring2 = coreRadius + 13 + Math.sin(time * 1.7 + 1.2) * 4;

    ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, ring1, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(189, 0, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, ring2, 0, Math.PI * 2);
    ctx.stroke();

    // Core body base
    ctx.fillStyle = '#091326';
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // Health arc border
    const healthColor = healthRatio > 0.6 ? '#00f3ff' : (healthRatio > 0.3 ? '#ffd600' : '#ff0055');
    ctx.strokeStyle = healthColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * healthRatio);
    ctx.stroke();

    // Core glowing nexus center
    const innerPulse = Math.sin(time * 4) * 2;
    ctx.fillStyle = healthColor;
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius * 0.35 + innerPulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, coreRadius * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Layer 4: Placed defensive towers, barrels, upgrade level pips, and breach health bars.
   * @private
   */
  _renderTowers(ctx, towers, cellSize, selectedTowerCoords) {
    const towerList = (towers && towers.towers) ? towers.towers : (Array.isArray(towers) ? towers : []);
    if (!towerList || towerList.length === 0) return;

    const half = cellSize * 0.42;

    for (let i = 0; i < towerList.length; i++) {
      const t = towerList[i];
      const tx = t.x !== undefined ? t.x : (t.col + 0.5) * cellSize;
      const ty = t.y !== undefined ? t.y : (t.row + 0.5) * cellSize;

      const typeKey = (t.typeKey || t.type || 'GATLING').toUpperCase();
      let accentColor = '#00f3ff';
      if (typeKey === 'MORTAR') accentColor = '#ff6600';
      else if (typeKey === 'STASIS') accentColor = '#38bdf8';

      // Tower Chassis Base
      ctx.fillStyle = '#0b1424';
      ctx.fillRect(tx - half, ty - half, half * 2, half * 2);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tx - half, ty - half, half * 2, half * 2);

      // Cybernetic corner notch accents
      ctx.fillStyle = accentColor;
      ctx.fillRect(tx - half, ty - half, 2.5, 2.5);
      ctx.fillRect(tx + half - 2.5, ty - half, 2.5, 2.5);
      ctx.fillRect(tx - half, ty + half - 2.5, 2.5, 2.5);
      ctx.fillRect(tx + half - 2.5, ty + half - 2.5, 2.5, 2.5);

      // Stylized Weapon Barrels / Emitters
      if (typeKey === 'GATLING') {
        // Dual laser rail barrels
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx - 3, ty + 2);
        ctx.lineTo(tx - 3, ty - half - 2);
        ctx.moveTo(tx + 3, ty + 2);
        ctx.lineTo(tx + 3, ty - half - 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tx, ty, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (typeKey === 'MORTAR') {
        // Heavy kinetic siege cannon
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.arc(tx, ty, half * 0.65, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1f0d05';
        ctx.beginPath();
        ctx.arc(tx, ty, half * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (typeKey === 'STASIS') {
        // Cryogenic tri-focus emitter
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let a = 0; a < 3; a++) {
          const angle = (a * (Math.PI * 2) / 3) - Math.PI * 0.5 + this._time * 1.5;
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx + Math.cos(angle) * half * 0.85, ty + Math.sin(angle) * half * 0.85);
        }
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Level Indicator Pips (1, 2, 3 neon pips)
      const level = t.level || 1;
      ctx.fillStyle = accentColor;
      if (level === 1) {
        ctx.fillRect(tx - 1.5, ty + half - 4, 3, 2);
      } else if (level === 2) {
        ctx.fillRect(tx - 4, ty + half - 4, 3, 2);
        ctx.fillRect(tx + 1, ty + half - 4, 3, 2);
      } else if (level >= 3) {
        ctx.fillRect(tx - 6, ty + half - 4, 3, 2);
        ctx.fillRect(tx - 1.5, ty + half - 4, 3, 2);
        ctx.fillRect(tx + 3, ty + half - 4, 3, 2);
      }

      // Health bar for towers taking breach damage (hp < maxHp)
      if (t.hp !== undefined && t.maxHp !== undefined && t.hp < t.maxHp) {
        const barW = cellSize * 0.9;
        const barH = 3;
        const barX = tx - barW * 0.5;
        const barY = ty - half - 5;
        const hpPercent = Math.max(0, Math.min(1, t.hp / t.maxHp));

        ctx.fillStyle = 'rgba(20, 0, 8, 0.85)';
        ctx.fillRect(barX, barY, barW, barH);

        ctx.fillStyle = '#ff0055';
        ctx.fillRect(barX, barY, barW * hpPercent, barH);
      }

      // Tactical Range Circle for selected tower
      if (selectedTowerCoords && selectedTowerCoords.col === t.col && selectedTowerCoords.row === t.row) {
        const range = t.range || (t.stats && t.stats.range) || 120;

        ctx.fillStyle = 'rgba(0, 243, 255, 0.05)';
        ctx.beginPath();
        ctx.arc(tx, ty, range, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 243, 255, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  /**
   * Layer 5: Swarm Particles with batched rendering for 60+ FPS at 10,000 entities.
   * Partitions particles by archetype and status (breach / fury, slowed) to perform
   * a single beginPath() + fill() and beginPath() + stroke() per batch.
   *
   * @private
   */
  _renderSwarmBatched(ctx, swarm) {
    const maxParticles = swarm.maxParticles;
    const posX = swarm.posX;
    const posY = swarm.posY;
    const velX = swarm.velX;
    const velY = swarm.velY;
    const type = swarm.type;
    const flags = swarm.flags;

    let countSwarmer = 0;
    let countBrute = 0;
    let countDisruptor = 0;
    let countBreach = 0;
    let countSlowed = 0;

    // Single zero-allocation pass: categorize active particles into pre-allocated typed arrays
    for (let i = 0; i < maxParticles; i++) {
      const f = flags[i];
      if (!(f & FLAG_ACTIVE)) continue;

      if (f & FLAG_BREACH) {
        this._batchBreach[countBreach++] = i;
      } else if (f & FLAG_SLOWED) {
        this._batchSlowed[countSlowed++] = i;
      } else {
        const t = type[i];
        if (t === 1) {
          this._batchBrute[countBrute++] = i;
        } else if (t === 2) {
          this._batchDisruptor[countDisruptor++] = i;
        } else {
          this._batchSwarmer[countSwarmer++] = i;
        }
      }
    }

    const tailScale = 0.08;

    // Helper to render batch trails and bodies
    const drawBatch = (batchIndices, count, radius, bodyColor, tailColor, tailLenFactor = 1.0) => {
      if (count === 0) return;

      // Sub-step: Velocity tails
      ctx.strokeStyle = tailColor;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let j = 0; j < count; j++) {
        const id = batchIndices[j];
        const x = posX[id];
        const y = posY[id];
        const vx = velX[id] * tailScale * tailLenFactor;
        const vy = velY[id] * tailScale * tailLenFactor;
        ctx.moveTo(x - vx, y - vy);
        ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Sub-step: Particle bodies
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      const isDynamicRadius = typeof radius === 'function';
      for (let j = 0; j < count; j++) {
        const id = batchIndices[j];
        const x = posX[id];
        const y = posY[id];
        const r = isDynamicRadius ? radius(type[id]) : radius;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    };

    // Archetype radius helper: Swarmer: 2.5, Brute: 5.5, Disruptor: 3.5
    const getCreepRadius = (t) => (t === 1 ? 5.5 : (t === 2 ? 3.5 : 2.5));

    // 1. Swarmers (Cyan speed creeps)
    drawBatch(this._batchSwarmer, countSwarmer, 2.5, '#00f3ff', 'rgba(0, 243, 255, 0.45)');

    // 2. Brutes (Crimson heavy creeps)
    drawBatch(this._batchBrute, countBrute, 5.5, '#ff0055', 'rgba(255, 0, 85, 0.45)', 1.4);

    // 3. Disruptors (Flux yellow creeps)
    drawBatch(this._batchDisruptor, countDisruptor, 3.5, '#ffd600', 'rgba(255, 214, 0, 0.45)', 1.2);

    // 4. Breach / Fury Mode (Intense burning crimson alert - retains distinct entity radius)
    drawBatch(this._batchBreach, countBreach, getCreepRadius, '#ff1744', 'rgba(255, 23, 68, 0.7)', 1.6);

    // 5. Stasis Slowed (Frost sky-blue - retains distinct entity radius)
    drawBatch(this._batchSlowed, countSlowed, getCreepRadius, '#7dd3fc', 'rgba(125, 211, 252, 0.5)', 0.5);
  }

  /**
   * Layer 6: In-flight ballistic projectiles and visual effects pool.
   * @private
   */
  _renderProjectilesAndEffects(ctx, towers) {
    // Mortar Projectiles from TowerSystem
    const projectiles = towers && towers.projectiles ? towers.projectiles : [];
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (!p.active) continue;

      const groundX = p.x;
      const groundY = p.y;
      const airY = p.y - (p.z || 0);

      // Ground shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(groundX, groundY, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ballistic shell
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.arc(groundX, airY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // White-hot plasma core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(groundX, airY, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Visual Effects Pool
    for (let i = 0; i < this.effects.length; i++) {
      const e = this.effects[i];
      const progress = e.progress || 0;
      const alpha = Math.max(0, 1.0 - progress);

      if (e.type === 'laser') {
        // High-intensity laser beam
        ctx.strokeStyle = `rgba(0, 243, 255, ${alpha * 0.8})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(e.fromX, e.fromY);
        ctx.lineTo(e.toX, e.toY);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(e.fromX, e.fromY);
        ctx.lineTo(e.toX, e.toY);
        ctx.stroke();
      } else if (e.type === 'explosion') {
        // Expanding kinetic shockwave ring
        const maxR = e.radius || 65;
        const curR = maxR * Math.sqrt(progress);

        ctx.fillStyle = `rgba(255, 102, 0, ${alpha * 0.12})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, curR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(255, 102, 0, ${alpha * 0.85})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (e.type === 'stasis_pulse') {
        // Cryogenic stasis pulse wave
        const maxR = e.range || 120;
        const curR = maxR * progress;

        ctx.fillStyle = `rgba(56, 189, 248, ${alpha * 0.08})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, curR, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(56, 189, 248, ${alpha * 0.75})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  /**
   * Layer 7: Mouse hover placement preview, range overlay, and affordability tint.
   * @private
   */
  _renderMousePreview(ctx, preview, cellSize, cols, rows) {
    const col = preview.col;
    const row = preview.row;
    if (col < 0 || col >= cols || row < 0 || row >= rows) return;

    const isValid = Boolean(preview.isValid);
    const canAfford = preview.canAfford !== undefined ? Boolean(preview.canAfford) : true;
    const isAllowed = isValid && canAfford;

    const px = (col + 0.5) * cellSize;
    const py = (row + 0.5) * cellSize;
    const typeKey = (preview.typeKey || 'GATLING').toUpperCase();

    const towerDef = CONFIG && CONFIG.TOWERS ? CONFIG.TOWERS[typeKey] : null;
    const range = (towerDef && towerDef.levels && towerDef.levels[0].range) ? towerDef.levels[0].range : 120;

    const color = isAllowed ? '#00ff88' : '#ff0055';
    const fillColor = isAllowed ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 0, 85, 0.25)';
    const rangeFill = isAllowed ? 'rgba(0, 255, 136, 0.05)' : 'rgba(255, 0, 85, 0.05)';

    // Tactical preview range circle
    ctx.fillStyle = rangeFill;
    ctx.beginPath();
    ctx.arc(px, py, range, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Grid cell highlight
    ctx.fillStyle = fillColor;
    ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(col * cellSize, row * cellSize, cellSize, cellSize);

    // Ghost tower silhouette
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, cellSize * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}
