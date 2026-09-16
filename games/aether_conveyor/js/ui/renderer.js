/**
 * Renderer — High-Performance Canvas 2D Renderer for Aether Conveyor
 *
 * Implements smooth camera navigation, viewport culling, animated conveyor treads,
 * articulated inserter kinematics, glowing items, catenary power wires, and minimap.
 */

import {
  TILE_SIZE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  DIR,
  DIR_DELTA,
  ITEMS,
  BUILDINGS,
} from '../config.js';

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {WorldGrid} grid
   * @param {ConveyorSystem} conveyorSystem
   * @param {InserterSystem} inserterSystem
   * @param {MachineSystem} machineSystem
   * @param {PowerSystem} powerSystem
   */
  constructor(canvas, grid, conveyorSystem, inserterSystem, machineSystem, powerSystem) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.grid = grid;
    this.conveyorSystem = conveyorSystem;
    this.inserterSystem = inserterSystem;
    this.machineSystem = machineSystem;
    this.powerSystem = powerSystem;

    // Camera State
    this.camX = (grid.width * TILE_SIZE) / 2;
    this.camY = (grid.height * TILE_SIZE) / 2;
    this.zoom = 1.0;
    this.minZoom = 0.45;
    this.maxZoom = 2.2;

    // Animation time
    this.animTime = 0;

    // Holographic preview info
    this.preview = null; // { type, gx, gy, direction, valid, linePoints }

    // Floating text feedback (+1 Plate, +5s Shield, etc.)
    this.floatingTexts = [];

    // Hovered building and terrain tile for dynamic tooltip
    this.hoveredBuilding = null;
    this.hoveredTile = null;
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  worldToScreen(wx, wy) {
    const sx = (wx - this.camX) * this.zoom + this.canvas.width / 2;
    const sy = (wy - this.camY) * this.zoom + this.canvas.height / 2;
    return { sx, sy };
  }

  screenToWorld(sx, sy) {
    const wx = (sx - this.canvas.width / 2) / this.zoom + this.camX;
    const wy = (sy - this.canvas.height / 2) / this.zoom + this.camY;
    return { wx, wy };
  }

  screenToGrid(sx, sy) {
    const { wx, wy } = this.screenToWorld(sx, sy);
    return {
      gx: Math.floor(wx / TILE_SIZE),
      gy: Math.floor(wy / TILE_SIZE),
    };
  }

  /**
   * Main render call.
   * @param {number} alpha Interpolation fraction between ticks
   */
  render(alpha = 1.0) {
    const ctx = this.ctx;
    const cw = this.canvas.width;
    const ch = this.canvas.height;

    this.animTime += 0.016;

    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, cw, ch);

    // Visible world bounding box for culling
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(cw, ch);

    const minGx = Math.max(0, Math.floor(topLeft.wx / TILE_SIZE) - 1);
    const maxGx = Math.min(this.grid.width - 1, Math.ceil(bottomRight.wx / TILE_SIZE) + 1);
    const minGy = Math.max(0, Math.floor(topLeft.wy / TILE_SIZE) - 1);
    const maxGy = Math.min(this.grid.height - 1, Math.ceil(bottomRight.wy / TILE_SIZE) + 1);

    ctx.save();
    // Apply camera transform
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camX, -this.camY);

    // 1. Render Terrain Tiles & Grid
    this._renderTerrain(ctx, minGx, maxGx, minGy, maxGy);

    // 2. Render Conveyor Belts & Splitters
    this._renderConveyors(ctx, minGx, maxGx, minGy, maxGy);

    // 3. Render Multi-Tile Buildings (Miners, Smelters, Assemblers, Tech Hub, Power)
    this._renderBuildings(ctx);

    // 4. Render Items on Belts
    this._renderItems(ctx);

    // 5. Render Inserter Arms
    this._renderInserters(ctx, minGx, maxGx, minGy, maxGy);

    // 6. Render Power Wires
    this._renderPowerWires(ctx);

    // 7. Render Particles
    this._renderParticles(ctx);

    // 8. Render Floating Texts
    this._renderFloatingTexts(ctx);

    // 9. Render Hovered Machine Tooltip
    if (this.hoveredBuilding) {
      this._renderHoveredTooltip(ctx);
    }

    // 10. Render Holographic Placement Preview
    if (this.preview) {
      this._renderPlacementPreview(ctx);
    }

    ctx.restore();

    // 9. Render Minimap Overlay
    this._renderMinimap(ctx);
  }

  _renderTerrain(ctx, minGx, maxGx, minGy, maxGy) {
    // World boundary outline
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, this.grid.width * TILE_SIZE, this.grid.height * TILE_SIZE);

    for (let gy = minGy; gy <= maxGy; gy++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const tile = this.grid.getTile(gx, gy);
        if (!tile) continue;

        const x = gx * TILE_SIZE;
        const y = gy * TILE_SIZE;

        // Base tile
        ctx.fillStyle = (gx + gy) % 2 === 0 ? '#0f172a' : '#111c33';
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        // Tile grid borders
        ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, TILE_SIZE, TILE_SIZE);

        // Render Ore deposits with distinct mineral shapes & prominent chemical badges
        if (tile.ore) {
          const oreInfo = ITEMS[tile.ore];
          if (oreInfo) {
            ctx.save();
            const cx = x + TILE_SIZE / 2;
            const cy = y + TILE_SIZE / 2;

            // 1. Mineral base texture & distinct geometry
            if (tile.ore === 'IRON_ORE') {
              // Silvery-metallic angular chunks
              ctx.fillStyle = '#64748b';
              ctx.fillRect(x + 8, y + 8, 12, 12);
              ctx.fillRect(x + 28, y + 10, 13, 10);
              ctx.fillRect(x + 10, y + 26, 14, 14);
              ctx.fillRect(x + 26, y + 26, 12, 13);
              ctx.fillStyle = '#94a3b8';
              ctx.fillRect(x + 10, y + 10, 8, 8);
              ctx.fillRect(x + 30, y + 12, 8, 6);
              ctx.fillRect(x + 12, y + 28, 9, 9);
              // Silver specular glint
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(x + 11, y + 11, 3, 3);
              ctx.fillRect(x + 31, y + 13, 3, 2);
            } else if (tile.ore === 'COPPER_ORE') {
              // Orange-amber crystalline nuggets
              ctx.fillStyle = '#c2410c';
              ctx.beginPath();
              ctx.arc(x + 14, y + 14, 7, 0, Math.PI * 2);
              ctx.arc(x + 34, y + 15, 8, 0, Math.PI * 2);
              ctx.arc(x + 16, y + 33, 8, 0, Math.PI * 2);
              ctx.arc(x + 33, y + 32, 7, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#f97316';
              ctx.beginPath();
              ctx.arc(x + 14, y + 14, 4.5, 0, Math.PI * 2);
              ctx.arc(x + 34, y + 15, 5, 0, Math.PI * 2);
              ctx.arc(x + 16, y + 33, 5, 0, Math.PI * 2);
              ctx.arc(x + 33, y + 32, 4.5, 0, Math.PI * 2);
              ctx.fill();
              // Bright gold glint
              ctx.fillStyle = '#fed7aa';
              ctx.fillRect(x + 13, y + 12, 2, 2);
              ctx.fillRect(x + 33, y + 13, 2, 2);
            } else if (tile.ore === 'COAL') {
              // Dark charcoal carbon boulders with ember flecks
              ctx.fillStyle = '#1e293b';
              ctx.beginPath();
              ctx.arc(x + 13, y + 13, 8, 0, Math.PI * 2);
              ctx.arc(x + 33, y + 15, 9, 0, Math.PI * 2);
              ctx.arc(x + 17, y + 33, 8.5, 0, Math.PI * 2);
              ctx.arc(x + 34, y + 33, 7.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#334155';
              ctx.fillRect(x + 11, y + 11, 7, 7);
              ctx.fillRect(x + 29, y + 13, 8, 7);
              ctx.fillRect(x + 14, y + 30, 8, 8);
              // Ember warm sparks
              ctx.fillStyle = '#f59e0b';
              ctx.fillRect(x + 12, y + 12, 2, 2);
              ctx.fillRect(x + 34, y + 33, 2, 2);
            } else if (tile.ore === 'SILICON_ORE') {
              // Hexagonal neon cyan crystal shards with aura
              ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
              ctx.beginPath();
              ctx.arc(cx, cy, 20, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#0891b2';
              ctx.beginPath();
              ctx.moveTo(x + 14, y + 7); ctx.lineTo(x + 20, y + 18); ctx.lineTo(x + 8, y + 18); ctx.closePath();
              ctx.moveTo(x + 34, y + 8); ctx.lineTo(x + 40, y + 20); ctx.lineTo(x + 28, y + 20); ctx.closePath();
              ctx.moveTo(x + 12, y + 25); ctx.lineTo(x + 20, y + 40); ctx.lineTo(x + 8, y + 40); ctx.closePath();
              ctx.moveTo(x + 32, y + 24); ctx.lineTo(x + 40, y + 39); ctx.lineTo(x + 28, y + 39); ctx.closePath();
              ctx.fill();
              ctx.fillStyle = '#22d3ee';
              ctx.fillRect(x + 12, y + 13, 3, 3);
              ctx.fillRect(x + 32, y + 14, 3, 3);
              ctx.fillRect(x + 13, y + 31, 3, 3);
              ctx.fillRect(x + 32, y + 31, 3, 3);
            }

            // 2. High-Contrast Chemical Element Badge (Fe, Cu, C, Si)
            const badgeRadius = 11;
            ctx.fillStyle = 'rgba(10, 15, 26, 0.88)';
            ctx.beginPath();
            ctx.arc(cx, cy, badgeRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = oreInfo.color;
            ctx.lineWidth = 1.6;
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(oreInfo.symbol || '?', cx, cy + 0.5);

            ctx.restore();
          }
        }
      }
    }
  }

  _renderConveyors(ctx, minGx, maxGx, minGy, maxGy) {
    const treadPhase = (this.animTime * 3.5) % 1.0;

    for (let gy = minGy; gy <= maxGy; gy++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const belt = this.conveyorSystem.getAt(gx, gy);
        if (!belt) continue;

        const x = gx * TILE_SIZE;
        const y = gy * TILE_SIZE;
        const cx = x + TILE_SIZE / 2;
        const cy = y + TILE_SIZE / 2;

        if (belt.type === 'UNDERGROUND_BELT') {
          // Tunnel portal
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);
          ctx.strokeStyle = '#00f3ff';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 8);

          // Tunnel entrance mouth
          ctx.fillStyle = '#05070a';
          ctx.beginPath();
          ctx.arc(cx, cy, 12, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#00f3ff';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(belt.isExit ? 'OUT' : 'IN', cx, cy);
          continue;
        }

        // Belt chassis
        ctx.fillStyle = '#1e2538';
        ctx.fillRect(x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 6);

        // Side guide rails
        ctx.fillStyle = '#334155';
        if (belt.direction === DIR.UP || belt.direction === DIR.DOWN) {
          ctx.fillRect(x + 2, y, 4, TILE_SIZE);
          ctx.fillRect(x + TILE_SIZE - 6, y, 4, TILE_SIZE);
        } else {
          ctx.fillRect(x, y + 2, TILE_SIZE, 4);
          ctx.fillRect(x, y + TILE_SIZE - 6, TILE_SIZE, 4);
        }

        // Animated chevrons moving in direction
        ctx.save();
        ctx.translate(cx, cy);
        const rotAngles = [ -Math.PI / 2, 0, Math.PI / 2, Math.PI ];
        ctx.rotate(rotAngles[belt.direction]);

        ctx.strokeStyle = belt.type === 'SPLITTER' ? '#f59e0b' : '#38bdf8';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';

        // Draw 3 moving chevrons
        for (let c = -1; c <= 1; c++) {
          const offset = ((c + treadPhase + 2) % 3 - 1) * (TILE_SIZE / 3);
          ctx.beginPath();
          ctx.moveTo(offset - 4, -8);
          ctx.lineTo(offset + 4, 0);
          ctx.lineTo(offset - 4, 8);
          ctx.stroke();
        }

        if (belt.type === 'SPLITTER') {
          // Additional indicator for splitter alternation
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }
  }

  _renderBuildings(ctx) {
    for (const building of this.grid.buildings.values()) {
      const x = building.gx * TILE_SIZE;
      const y = building.gy * TILE_SIZE;
      const w = (building.width || 1) * TILE_SIZE;
      const h = (building.height || 1) * TILE_SIZE;
      const cx = x + w / 2;
      const cy = y + h / 2;

      switch (building.type) {
        case 'TECH_HUB': {
          // Central base reactor (4x4)
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
          ctx.strokeStyle = '#00f3ff';
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

          // Pulsing core circles
          const pulse = Math.sin(this.animTime * 3) * 4;
          const grad = ctx.createRadialGradient(cx, cy, 5, cx, cy, 38 + pulse);
          grad.addColorStop(0, '#a855f7');
          grad.addColorStop(0.6, 'rgba(0, 243, 255, 0.4)');
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, 42 + pulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 26, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('AETHER CORE', cx, cy - 2);
          ctx.font = '10px sans-serif';
          ctx.fillStyle = '#00f3ff';
          ctx.fillText('TECH HUB', cx, cy + 14);
          break;
        }

        case 'MINER': {
          // Mining drill
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
          ctx.strokeStyle = building.active ? '#10b981' : '#f59e0b';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

          // Rotating drill bit head
          ctx.save();
          ctx.translate(cx, cy);
          if (building.active) {
            ctx.rotate(this.animTime * 8);
          }
          ctx.fillStyle = '#64748b';
          ctx.fillRect(-10, -10, 20, 20);
          ctx.strokeStyle = '#94a3b8';
          ctx.strokeRect(-10, -10, 20, 20);
          ctx.restore();

          // Direction ejector arrow
          this._drawDirectionArrow(ctx, cx, cy, building.direction, 22);

          // Status LED
          ctx.fillStyle = building.active ? '#10b981' : '#ef4444';
          ctx.beginPath();
          ctx.arc(x + 12, y + 12, 3.5, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'SMELTER': {
          // Electric Smelter
          ctx.fillStyle = '#1c1917';
          ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
          ctx.strokeStyle = '#ea580c';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

          // Molten glowing viewport
          const heat = building.active ? (0.6 + Math.sin(this.animTime * 6) * 0.3) : 0.2;
          ctx.fillStyle = `rgba(249, 115, 22, ${heat})`;
          ctx.fillRect(cx - 16, cy - 12, 32, 24);

          ctx.fillStyle = '#fed7aa';
          ctx.font = 'bold 12px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('MELT', cx, cy);

          // Status LED
          ctx.fillStyle = building.active ? '#10b981' : '#f59e0b';
          ctx.beginPath();
          ctx.arc(x + 12, y + 12, 3.5, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'ASSEMBLER': {
          // Component Fabricator
          ctx.fillStyle = '#091e2b';
          ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

          // Gear cog animation
          ctx.save();
          ctx.translate(cx, cy);
          if (building.active) {
            ctx.rotate(this.animTime * 4);
          }
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.strokeRect(-12, -12, 24, 24);
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          // Recipe badge
          if (building.recipe) {
            ctx.fillStyle = '#00f3ff';
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(building.recipe.name.split(' ')[0], cx, cy + 24);
          }
          break;
        }

        case 'POWER_POLE': {
          // Electric Substation Pylon
          ctx.fillStyle = '#334155';
          ctx.fillRect(cx - 4, cy - 4, 8, 8);
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(cx, cy, 3, 0, Math.PI * 2);
          ctx.fill();
          break;
        }

        case 'SOLAR_PANEL': {
          // Photovoltaic array
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

          // Solar grid cells
          ctx.fillStyle = '#1e3a8a';
          for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 2; col++) {
              ctx.fillRect(x + 8 + col * 38, y + 8 + row * 38, 34, 34);
            }
          }
          break;
        }

        case 'DYNAMO_GENERATOR': {
          // Coal generator
          ctx.fillStyle = '#18181b';
          ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
          ctx.strokeStyle = building.isGenerating ? '#22c55e' : '#71717a';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);

          // Fire window
          if (building.isGenerating) {
            ctx.fillStyle = 'rgba(234, 179, 8, 0.8)';
            ctx.fillRect(cx - 12, cy - 8, 24, 16);
          }
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('GEN', cx, cy + 4);
          break;
        }
      }
    }
  }

  _renderItems(ctx) {
    for (const item of this.conveyorSystem.allItems.values()) {
      const info = ITEMS[item.type];
      if (!info) continue;

      const x = item.worldX;
      const y = item.worldY;

      // Item silhouette shadow & glow
      ctx.fillStyle = info.glowColor || 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fill();

      // Item body
      ctx.fillStyle = info.color;
      ctx.beginPath();
      ctx.arc(x, y, 7.5, 0, Math.PI * 2);
      ctx.fill();

      // Contrast border
      ctx.strokeStyle = '#05070a';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Inner subtle dark badge for crisp symbol readability
      ctx.fillStyle = 'rgba(10, 15, 26, 0.7)';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Item symbol
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.symbol || '•', x, y + 0.5);
    }
  }

  _renderInserters(ctx, minGx, maxGx, minGy, maxGy) {
    for (const inserter of this.inserterSystem.inserters.values()) {
      if (inserter.gx < minGx || inserter.gx > maxGx || inserter.gy < minGy || inserter.gy > maxGy) {
        continue;
      }

      const cx = inserter.gx * TILE_SIZE + TILE_SIZE / 2;
      const cy = inserter.gy * TILE_SIZE + TILE_SIZE / 2;

      // Base pedestal
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Compute swing angle:
      // Inserter direction is target. Opposite direction is source.
      // angle 0.0 = source direction, angle 1.0 = target direction.
      const angles = [ -Math.PI / 2, 0, Math.PI / 2, Math.PI ];
      const targetAngle = angles[inserter.direction];
      const sourceAngle = targetAngle + Math.PI;

      // Interpolated current angle
      const armAngle = sourceAngle + inserter.swingProgress * Math.PI;

      const armLength = 22;
      const tipX = cx + Math.cos(armAngle) * armLength;
      const tipY = cy + Math.sin(armAngle) * armLength;

      // Inserter articulated arm segment
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      // Mechanical claw
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
      ctx.fill();

      // If holding an item, render item at claw tip!
      if (inserter.heldItem) {
        const itemInfo = ITEMS[inserter.heldItem.type];
        if (itemInfo) {
          ctx.fillStyle = itemInfo.color;
          ctx.beginPath();
          ctx.arc(tipX, tipY, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  _renderPowerWires(ctx) {
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    for (const wire of this.powerSystem.wires) {
      // Gentle drooping curve
      const midX = (wire.fromX + wire.toX) / 2;
      const midY = (wire.fromY + wire.toY) / 2 + 6; // Droop

      ctx.beginPath();
      ctx.moveTo(wire.fromX, wire.fromY);
      ctx.quadraticCurveTo(midX, midY, wire.toX, wire.toY);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  _renderParticles(ctx) {
    for (const p of this.machineSystem.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;
  }

  _renderPlacementPreview(ctx) {
    const { type, gx, gy, direction, valid, linePoints } = this.preview;
    const buildingDef = BUILDINGS[type];
    if (!buildingDef && type !== 'DEMOLISH') return;

    if (linePoints && linePoints.length > 0) {
      // Multiple tiles in drag-line
      for (const pt of linePoints) {
        const px = pt.gx * TILE_SIZE;
        const py = pt.gy * TILE_SIZE;
        ctx.fillStyle = pt.valid ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = pt.valid ? '#10b981' : '#ef4444';
        ctx.strokeRect(px, py, TILE_SIZE, TILE_SIZE);
        this._drawDirectionArrow(ctx, px + TILE_SIZE / 2, py + TILE_SIZE / 2, pt.direction, 14);
      }
      return;
    }

    const w = (buildingDef ? buildingDef.width : 1) * TILE_SIZE;
    const h = (buildingDef ? buildingDef.height : 1) * TILE_SIZE;
    const px = gx * TILE_SIZE;
    const py = gy * TILE_SIZE;

    ctx.fillStyle = valid ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.4)';
    ctx.fillRect(px, py, w, h);
    ctx.strokeStyle = valid ? '#10b981' : '#ef4444';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, w, h);

    if (type === 'POWER_POLE') {
      // Draw power supply radius
      const r = (buildingDef.supplyRadius || 4.5) * TILE_SIZE;
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px + w / 2, py + h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (direction !== undefined) {
      this._drawDirectionArrow(ctx, px + w / 2, py + h / 2, direction, 18);
    }
  }

  _drawDirectionArrow(ctx, cx, cy, dir, len = 16) {
    const angles = [ -Math.PI / 2, 0, Math.PI / 2, Math.PI ];
    const angle = angles[dir];

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.lineTo(len / 2, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(len / 2, 0);
    ctx.lineTo(len / 2 - 6, -5);
    ctx.lineTo(len / 2 - 6, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  _renderMinimap(ctx) {
    const size = 150;
    const padding = 16;
    const x = this.canvas.width - size - padding;
    const y = padding + 54; // Below top stats

    ctx.fillStyle = 'rgba(10, 14, 23, 0.85)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);

    const scaleX = size / this.grid.width;
    const scaleY = size / this.grid.height;

    // Draw ore dots
    for (let gy = 0; gy < this.grid.height; gy += 2) {
      for (let gx = 0; gx < this.grid.width; gx += 2) {
        const tile = this.grid.getTile(gx, gy);
        if (tile && tile.ore) {
          ctx.fillStyle = ITEMS[tile.ore] ? ITEMS[tile.ore].color : '#94a3b8';
          ctx.fillRect(x + gx * scaleX, y + gy * scaleY, scaleX * 2, scaleY * 2);
        }
      }
    }

    // Draw buildings
    for (const b of this.grid.buildings.values()) {
      ctx.fillStyle = b.type === 'TECH_HUB' ? '#a855f7' : '#00f3ff';
      ctx.fillRect(
        x + b.gx * scaleX,
        y + b.gy * scaleY,
        Math.max(2, (b.width || 1) * scaleX),
        Math.max(2, (b.height || 1) * scaleY)
      );
    }

    // Draw camera viewport indicator
    const camLeft = (this.camX - (this.canvas.width / 2) / this.zoom) / TILE_SIZE;
    const camTop = (this.camY - (this.canvas.height / 2) / this.zoom) / TILE_SIZE;
    const camW = (this.canvas.width / this.zoom) / TILE_SIZE;
    const camH = (this.canvas.height / this.zoom) / TILE_SIZE;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x + camLeft * scaleX,
      y + camTop * scaleY,
      camW * scaleX,
      camH * scaleY
    );

    // Ore Legend Bar below Minimap
    const legY = y + size + 6;
    const legH = 38;
    ctx.fillStyle = 'rgba(10, 14, 23, 0.88)';
    ctx.fillRect(x, legY, size, legH);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, legY, size, legH);

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const oreLegend = [
      { sym: 'Fe', name: 'Ferro', col: '#94a3b8', colX: 0, rowY: 0 },
      { sym: 'Cu', name: 'Cobre', col: '#f97316', colX: 1, rowY: 0 },
      { sym: 'C',  name: 'Carvão', col: '#64748b', colX: 0, rowY: 1 },
      { sym: 'Si', name: 'Silício', col: '#06b6d4', colX: 1, rowY: 1 },
    ];

    oreLegend.forEach(item => {
      const ix = x + 6 + item.colX * 72;
      const iy = legY + 10 + item.rowY * 18;

      ctx.fillStyle = item.col;
      ctx.beginPath();
      ctx.arc(ix + 4, iy, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`${item.sym}:${item.name}`, ix + 12, iy + 0.5);
    });
  }

  /**
   * Adds rising floating text feedback.
   */
  addFloatingText(text, wx, wy, color = '#10b981') {
    if (this.floatingTexts.length > 50) return;
    this.floatingTexts.push({
      text,
      wx,
      wy,
      color,
      life: 1.4,
      maxLife: 1.4,
    });
  }

  _renderFloatingTexts(ctx) {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.wy -= 0.6; // rise up
      ft.life -= 0.016;

      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      const alpha = Math.max(0, Math.min(1, ft.life / ft.maxLife));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = ft.color;
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(ft.text, ft.wx, ft.wy);
      ctx.restore();
    }
  }

  _renderHoveredTooltip(ctx) {
    if (this.hoveredBuilding) {
      const b = this.hoveredBuilding;
      const bDef = BUILDINGS[b.type] || { name: b.name || b.type };
      const w = (b.width || 1) * TILE_SIZE;
      const wx = b.gx * TILE_SIZE + w / 2;
      const wy = b.gy * TILE_SIZE - 10;

      const lines = [];
      lines.push(`⚙️ ${bDef.name}`);

      if (b.type === 'MINER') {
        const tile = this.grid.getTile(b.gx, b.gy);
        if (tile && tile.ore) {
          const oreInfo = ITEMS[tile.ore];
          lines.push(`Minério Alvo: [${oreInfo?.symbol || '?'}] ${oreInfo?.displayName || oreInfo?.name || tile.ore}`);
        } else {
          lines.push(`⚠️ Aviso: Broca sem depósito sob a base!`);
        }
      }

      if (b.type !== 'POWER_POLE' && b.type !== 'TECH_HUB') {
        lines.push(b.active ? 'Status: 🟢 Operando' : 'Status: 🟡 Aguardando Insumos');
      }

      if (b.recipe) {
        lines.push(`Receita: ${b.recipe.name.split(' ')[0]}`);
      }

      if (b.inputBuffer) {
        const inItems = Object.entries(b.inputBuffer).filter(([_, c]) => c > 0);
        if (inItems.length > 0) {
          const inStr = inItems.map(([type, count]) => `${ITEMS[type]?.symbol || type}:${count}`).join(' ');
          lines.push(`In: [${inStr}]`);
        }
      }

      if (b.outputBuffer) {
        const outItems = Object.entries(b.outputBuffer).filter(([_, c]) => c > 0);
        if (outItems.length > 0) {
          const outStr = outItems.map(([type, count]) => `${ITEMS[type]?.symbol || type}:${count}`).join(' ');
          lines.push(`Out: [${outStr}]`);
        }
      }

      this._drawTooltipCard(ctx, lines, wx, wy, '#00f3ff');
    } else if (this.hoveredTile && this.hoveredTile.ore) {
      const tile = this.hoveredTile;
      const oreInfo = ITEMS[tile.ore];
      if (!oreInfo) return;

      const wx = (tile.x + 0.5) * TILE_SIZE;
      const wy = tile.y * TILE_SIZE - 10;

      const lines = [
        `⛏️ VEIO DE RECURSO NATURAL`,
        `Tipo: [${oreInfo.symbol}] ${oreInfo.displayName || oreInfo.name}`,
        `Reservas: ${(tile.oreAmount || 50000).toLocaleString()} un`,
        `Dica: Instale Mineradora [5] para extrair`,
      ];

      this._drawTooltipCard(ctx, lines, wx, wy, oreInfo.color);
    }
  }

  _drawTooltipCard(ctx, lines, wx, wy, accentColor = '#00f3ff') {
    ctx.save();
    ctx.font = '11px sans-serif';
    let maxW = 0;
    lines.forEach(l => {
      const metrics = ctx.measureText(l);
      if (metrics.width > maxW) maxW = metrics.width;
    });

    const boxW = maxW + 18;
    const boxH = lines.length * 17 + 10;
    const boxX = wx - boxW / 2;
    const boxY = wy - boxH;

    ctx.fillStyle = 'rgba(10, 14, 23, 0.94)';
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, idx) => {
      ctx.fillStyle = idx === 0 ? accentColor : '#cbd5e1';
      ctx.font = idx === 0 ? 'bold 11px sans-serif' : '11px sans-serif';
      ctx.fillText(line, boxX + 9, boxY + 6 + idx * 17);
    });
    ctx.restore();
  }

  clampCamera() {
    const margin = 200;
    const minX = -margin;
    const maxX = this.grid.width * TILE_SIZE + margin;
    const minY = -margin;
    const maxY = this.grid.height * TILE_SIZE + margin;
    this.camX = Math.max(minX, Math.min(maxX, this.camX));
    this.camY = Math.max(minY, Math.min(maxY, this.camY));
  }
}
