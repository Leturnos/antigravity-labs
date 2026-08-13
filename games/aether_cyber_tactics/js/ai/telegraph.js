/**
 * Telegraph System for Aether Cyber Tactics.
 * Visual Intent Indicators Engine (crimson cell pulsing, targeting rays, badge UI overlay).
 */

export class TelegraphRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../engine/isometric_renderer.js').IsometricRenderer} isoRenderer
   * @param {import('../engine/grid_manager.js').GridManager} gridManager
   */
  constructor(canvas, isoRenderer, gridManager) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.isoRenderer = isoRenderer;
    this.gridManager = gridManager;
    this.activeIntents = [];
  }

  /**
   * Updates list of enemy intents to render.
   * @param {Array<import('../core/units.js').Unit | { enemy: import('../core/units.js').Unit, intent: Object }>} items
   */
  updateIntents(items) {
    this.activeIntents = [];
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (!item) continue;
      if (item.intent) {
        this.activeIntents.push(item);
      } else if (item.faction === 'enemy' && item.intent) {
        this.activeIntents.push({ enemy: item, intent: item.intent });
      }
    }
  }

  /**
   * Clears all active intent overlays.
   */
  clear() {
    this.activeIntents = [];
  }

  /**
   * Main render method for drawing telegraph indicators.
   * @param {number} [time=Date.now()/1000]
   */
  render(time = Date.now() / 1000) {
    if (!this.ctx || !this.isoRenderer) return;

    for (const entry of this.activeIntents) {
      const enemy = entry.enemy;
      const intent = entry.intent || (enemy ? enemy.intent : null);
      if (!intent) continue;

      this.renderSingleIntent(enemy, intent, time);
    }
  }

  /**
   * Renders intent visualization for a single enemy action.
   * @param {import('../core/units.js').Unit} enemy
   * @param {Object} intent
   * @param {number} time
   */
  renderSingleIntent(enemy, intent, time) {
    const { moveX, moveY, skillId, targetX, targetY, damage, pushDistance } = intent;

    const startX = enemy ? enemy.x : moveX;
    const startY = enemy ? enemy.y : moveY;

    const startTile = this.gridManager.getTile(startX, startY);
    const moveTile = this.gridManager.getTile(moveX, moveY);

    const startElev = startTile ? startTile.elevation : 0;
    const moveElev = moveTile ? moveTile.elevation : 0;

    const startScreen = this.isoRenderer.gridToScreen(startX, startY, startElev);
    const moveScreen = this.isoRenderer.gridToScreen(moveX, moveY, moveElev);

    // Render movement trajectory line if moving
    if (startX !== moveX || startY !== moveY) {
      this.renderMoveLine(startScreen, moveScreen, time);
    }

    // Render skill target indicators
    if (skillId && targetX !== undefined && targetY !== undefined) {
      const targetTile = this.gridManager.getTile(targetX, targetY);
      const targetElev = targetTile ? targetTile.elevation : 0;
      const targetScreen = this.isoRenderer.gridToScreen(targetX, targetY, targetElev);

      const isAoE = skillId === 'MORTAR_STRIKE' || skillId === 'SEISMIC_SLAM';
      this.renderTargetCellHighlight(targetX, targetY, isAoE, time);
      this.renderTargetingRay(moveScreen, targetScreen, time);
      this.renderIntentBadge(targetScreen, skillId, damage, pushDistance, intent.description, time);
    }
  }

  /**
   * Renders movement path dashed line.
   */
  renderMoveLine(startScreen, moveScreen, time) {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([4, 4]);

    this.ctx.beginPath();
    this.ctx.moveTo(startScreen.isoX, startScreen.isoY);
    this.ctx.lineTo(moveScreen.isoX, moveScreen.isoY);
    this.ctx.stroke();

    const progress = (time * 2) % 1.0;
    const px = startScreen.isoX + (moveScreen.isoX - startScreen.isoX) * progress;
    const py = startScreen.isoY + (moveScreen.isoY - startScreen.isoY) * progress;

    this.ctx.fillStyle = '#a855f7';
    this.ctx.beginPath();
    this.ctx.arc(px, py, 3, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  /**
   * Renders translucent crimson pulsing cell highlights over targeted cells.
   */
  renderTargetCellHighlight(targetX, targetY, isAoE, time) {
    const pulse = (Math.sin(time * 6) + 1) / 2;
    const alpha = 0.25 + pulse * 0.25;

    const tilesToHighlight = [{ x: targetX, y: targetY }];
    if (isAoE) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          tilesToHighlight.push({ x: targetX + dx, y: targetY + dy });
        }
      }
    }

    this.ctx.save();
    const wHalf = this.isoRenderer.tileWidthHalf;
    const hHalf = this.isoRenderer.tileHeightHalf;

    for (const t of tilesToHighlight) {
      const tile = this.gridManager.getTile(t.x, t.y);
      if (!tile || tile.type === 'VOID') continue;

      const { isoX, isoY } = this.isoRenderer.gridToScreen(t.x, t.y, tile.elevation);

      this.ctx.fillStyle = `rgba(244, 63, 94, ${t.x === targetX && t.y === targetY ? alpha : alpha * 0.6})`;
      this.ctx.strokeStyle = `rgba(244, 63, 94, ${0.7 + pulse * 0.3})`;
      this.ctx.lineWidth = t.x === targetX && t.y === targetY ? 2 : 1;

      this.ctx.beginPath();
      this.ctx.moveTo(isoX, isoY - hHalf);
      this.ctx.lineTo(isoX + wHalf, isoY);
      this.ctx.lineTo(isoX, isoY + hHalf);
      this.ctx.lineTo(isoX - wHalf, isoY);
      this.ctx.closePath();

      this.ctx.fill();
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Renders intent targeting ray with directional arrowhead.
   */
  renderTargetingRay(fromScreen, toScreen, time) {
    this.ctx.save();
    this.ctx.strokeStyle = '#f43f5e';
    this.ctx.lineWidth = 2.5;
    this.ctx.shadowBlur = 8;
    this.ctx.shadowColor = '#f43f5e';
    this.ctx.setLineDash([6, 4]);

    this.ctx.beginPath();
    this.ctx.moveTo(fromScreen.isoX, fromScreen.isoY);
    this.ctx.lineTo(toScreen.isoX, toScreen.isoY);
    this.ctx.stroke();

    const angle = Math.atan2(toScreen.isoY - fromScreen.isoY, toScreen.isoX - fromScreen.isoX);
    const arrowLength = 10;

    this.ctx.setLineDash([]);
    this.ctx.fillStyle = '#f43f5e';
    this.ctx.beginPath();
    this.ctx.moveTo(toScreen.isoX, toScreen.isoY);
    this.ctx.lineTo(
      toScreen.isoX - arrowLength * Math.cos(angle - Math.PI / 6),
      toScreen.isoY - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    this.ctx.lineTo(
      toScreen.isoX - arrowLength * Math.cos(angle + Math.PI / 6),
      toScreen.isoY - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    this.ctx.closePath();
    this.ctx.fill();

    this.ctx.restore();
  }

  /**
   * Renders intent badge UI container over target position.
   */
  renderIntentBadge(targetScreen, skillId, damage, pushDistance, description, time) {
    let badgeText = '[ATTACK]';
    if (skillId === 'KINETIC_STRIKE') {
      badgeText = `[ATTACK ${damage} DMG]`;
    } else if (skillId === 'MORTAR_STRIKE') {
      badgeText = `[MORTAR ${damage} AoE]`;
    } else if (skillId === 'SEISMIC_SLAM') {
      badgeText = `[SLAM ${damage} AoE]`;
    } else if (skillId === 'CYBER_OVERRIDE') {
      badgeText = '[HACK INTENT]';
    } else if (skillId === 'POSITION_SWAP') {
      badgeText = '[SWAP TACTIC]';
    } else if (damage > 0) {
      badgeText = `[ATTACK ${damage} DMG]`;
    }

    this.ctx.save();
    this.ctx.font = 'bold 11px sans-serif';

    const textWidth = this.ctx.measureText(badgeText).width;
    const paddingX = 8;
    const paddingY = 4;
    const badgeW = textWidth + paddingX * 2;
    const badgeH = 18;

    const badgeX = targetScreen.isoX - badgeW / 2;
    const badgeY = targetScreen.isoY - 26;

    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    this.ctx.strokeStyle = '#f43f5e';
    this.ctx.lineWidth = 1.5;
    this.ctx.shadowBlur = 6;
    this.ctx.shadowColor = '#f43f5e';

    this.ctx.beginPath();
    if (typeof this.ctx.roundRect === 'function') {
      this.ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
    } else {
      this.ctx.rect(badgeX, badgeY, badgeW, badgeH);
    }
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = '#ffffff';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(badgeText, targetScreen.isoX, badgeY + badgeH / 2);

    this.ctx.restore();
  }
}
