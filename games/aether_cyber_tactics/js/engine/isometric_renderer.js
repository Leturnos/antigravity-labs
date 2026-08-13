/**
 * IsometricRenderer - HTML5 Canvas 2.5D Isometric Engine.
 * Handles depth-sorted rendering, projection math, block thickness, hover effects, and particle systems.
 */
export class IsometricRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./grid_manager.js').GridManager} gridManager
   */
  constructor(canvas, gridManager) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gridManager = gridManager;

    // Isometric Projection Geometry Config
    this.tileWidth = 64;
    this.tileHeight = 32;
    this.tileWidthHalf = this.tileWidth / 2;
    this.tileHeightHalf = this.tileHeight / 2;
    this.heightScale = 16;     // Vertical pixels per elevation step
    this.blockThickness = 12;  // Base slab thickness

    // Viewport origin offset (centered automatically)
    this.originX = canvas.width / 2;
    this.originY = 120;

    // Hover state
    this.hoveredTile = null;
    this.mouseScreenPos = { x: -1000, y: -1000 };

    // Particle system
    this.particles = [];
    this.initAmbientParticles();

    // Event listeners
    this.bindEvents();

    // Animation loop state
    this.animationFrameId = null;
    this.time = 0;
  }

  /**
   * Binds mouse interaction events to the canvas.
   */
  bindEvents() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;

      this.mouseScreenPos = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };

      this.hoveredTile = this.screenToGrid(this.mouseScreenPos.x, this.mouseScreenPos.y);
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredTile = null;
      this.mouseScreenPos = { x: -1000, y: -1000 };
    });
  }

  /**
   * Converts Grid (x, y, elevation) to Screen (isoX, isoY).
   * @param {number} gridX
   * @param {number} gridY
   * @param {number} elevation
   * @returns {{ isoX: number, isoY: number }}
   */
  gridToScreen(gridX, gridY, elevation = 0) {
    const isoX = (gridX - gridY) * this.tileWidthHalf + this.originX;
    const isoY = (gridX + gridY) * this.tileHeightHalf - (elevation * this.heightScale) + this.originY;
    return { isoX, isoY };
  }

  /**
   * Converts Screen (screenX, screenY) to Grid (x, y) accounting for elevations.
   * @param {number} screenX
   * @param {number} screenY
   * @returns {{ x: number, y: number } | null}
   */
  screenToGrid(screenX, screenY) {
    // 1. Check elevated top diamond faces from front-to-back
    for (let y = this.gridManager.height - 1; y >= 0; y--) {
      for (let x = this.gridManager.width - 1; x >= 0; x--) {
        const tile = this.gridManager.getTile(x, y);
        if (!tile || tile.type === 'VOID') continue;

        const { isoX, isoY } = this.gridToScreen(x, y, tile.elevation);
        // Diamond point-in-polygon test
        const dx = Math.abs(screenX - isoX) / this.tileWidthHalf;
        const dy = Math.abs(screenY - isoY) / this.tileHeightHalf;

        if (dx + dy <= 1.0) {
          return { x, y };
        }
      }
    }

    // 2. Fallback ground plane math (elevation 0)
    const dx = screenX - this.originX;
    const dy = screenY - this.originY;

    const gx = (dx / this.tileWidthHalf + dy / this.tileHeightHalf) / 2;
    const gy = (dy / this.tileHeightHalf - dx / this.tileWidthHalf) / 2;

    const x = Math.floor(gx);
    const y = Math.floor(gy);

    if (x >= 0 && x < this.gridManager.width && y >= 0 && y < this.gridManager.height) {
      const tile = this.gridManager.getTile(x, y);
      if (tile && tile.type !== 'VOID') {
        return { x, y };
      }
    }

    return null;
  }

  /**
   * Spawns debris particles when a tile is damaged or destroyed.
   * @param {number} gridX
   * @param {number} gridY
   * @param {string} color
   * @param {number} count
   */
  spawnDebris(gridX, gridY, color = '#00f3ff', count = 16) {
    const tile = this.gridManager.getTile(gridX, gridY);
    const elevation = tile ? tile.elevation : 0;
    const { isoX, isoY } = this.gridToScreen(gridX, gridY, elevation);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      this.particles.push({
        x: isoX,
        y: isoY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (1 + Math.random() * 2), // upward burst
        gravity: 0.12,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.03,
        size: 2 + Math.random() * 3,
        color,
        type: 'debris'
      });
    }
  }

  /**
   * Initializes ambient cyber energy particles floating in background.
   */
  initAmbientParticles() {
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.2 - Math.random() * 0.5,
        life: Math.random(),
        decay: 0.003 + Math.random() * 0.005,
        size: 1 + Math.random() * 2,
        color: Math.random() > 0.5 ? '#00f3ff' : '#a855f7',
        type: 'ambient'
      });
    }
  }

  /**
   * Updates particle system physics and life cycle.
   */
  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= p.decay;

      if (p.life <= 0) {
        if (p.type === 'ambient') {
          // Recycle ambient particle
          p.x = Math.random() * this.canvas.width;
          p.y = this.canvas.height + 10;
          p.life = 1.0;
        } else {
          // Remove debris particle
          this.particles.splice(i, 1);
        }
        continue;
      }

      p.x += p.vx;
      p.y += p.vy;

      if (p.gravity) {
        p.vy += p.gravity;
      }
    }
  }

  /**
   * Draws active particles onto canvas context.
   */
  renderParticles() {
    this.ctx.save();
    for (const p of this.particles) {
      this.ctx.globalAlpha = Math.max(0, p.life);
      this.ctx.fillStyle = p.color;
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  /**
   * Starts the automatic animation update loop.
   */
  start() {
    if (this.animationFrameId) return;
    const loop = () => {
      this.time += 0.03;
      this.render();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  /**
   * Stops the animation loop.
   */
  stop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Main render call - clears canvas, updates particles, draws grid depth-sorted, and hover highlights.
   */
  render() {
    // 1. Clear background
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Subtle background grid glow
    const bgGlow = this.ctx.createRadialGradient(
      this.originX, this.originY + 60, 20,
      this.originX, this.originY + 60, 320
    );
    bgGlow.addColorStop(0, 'rgba(15, 23, 42, 0.6)');
    bgGlow.addColorStop(1, 'rgba(9, 13, 22, 0)');
    this.ctx.fillStyle = bgGlow;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Render ambient particles (behind grid)
    this.updateParticles();
    this.renderParticles();

    // 3. Depth-Sorted Grid Rendering (for y: 0..N, for x: 0..N)
    for (let y = 0; y < this.gridManager.height; y++) {
      for (let x = 0; x < this.gridManager.width; x++) {
        const tile = this.gridManager.getTile(x, y);
        if (!tile) continue;

        if (tile.type === 'VOID') {
          this.renderVoidTile(x, y);
        } else {
          this.renderBlockTile(tile);
        }
      }
    }

    // 4. Render Hover Cell Highlight
    if (this.hoveredTile) {
      this.renderHoverHighlight(this.hoveredTile.x, this.hoveredTile.y);
    }
  }

  /**
   * Renders a 3D block tile (top face, left face, right face).
   * @param {Object} tile
   */
  renderBlockTile(tile) {
    const { x, y, elevation, type, health } = tile;
    const { isoX, isoY } = this.gridToScreen(x, y, elevation);

    const wHalf = this.tileWidthHalf;
    const hHalf = this.tileHeightHalf;
    const wallDepth = this.blockThickness + (elevation * this.heightScale);

    // Color definitions based on type & state
    let topColor = '#1e293b';
    let leftColor = '#0f172a';
    let rightColor = '#090d16';
    let strokeColor = 'rgba(0, 243, 255, 0.35)';

    if (type === 'COVER') {
      topColor = '#3b0764';
      leftColor = '#2e1065';
      rightColor = '#1e1b4b';
      strokeColor = '#a855f7';
    } else if (type === 'HAZARDOUS') {
      topColor = '#450a0a';
      leftColor = '#380707';
      rightColor = '#260404';
      strokeColor = '#f43f5e';
    }

    // Health damage tinting
    if (health < 2) {
      topColor = '#334155';
    }

    // Top Face Vertices
    const pTop = { x: isoX, y: isoY - hHalf };
    const pRight = { x: isoX + wHalf, y: isoY };
    const pBottom = { x: isoX, y: isoY + hHalf };
    const pLeft = { x: isoX - wHalf, y: isoY };

    // Side Face Bottom Vertices (extending down)
    const pLeftDown = { x: pLeft.x, y: pLeft.y + wallDepth };
    const pBottomDown = { x: pBottom.x, y: pBottom.y + wallDepth };
    const pRightDown = { x: pRight.x, y: pRight.y + wallDepth };

    this.ctx.save();

    // A. Left Side Face
    this.ctx.fillStyle = leftColor;
    this.ctx.beginPath();
    this.ctx.moveTo(pLeft.x, pLeft.y);
    this.ctx.lineTo(pBottom.x, pBottom.y);
    this.ctx.lineTo(pBottomDown.x, pBottomDown.y);
    this.ctx.lineTo(pLeftDown.x, pLeftDown.y);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.stroke();

    // B. Right Side Face
    this.ctx.fillStyle = rightColor;
    this.ctx.beginPath();
    this.ctx.moveTo(pBottom.x, pBottom.y);
    this.ctx.lineTo(pRight.x, pRight.y);
    this.ctx.lineTo(pRightDown.x, pRightDown.y);
    this.ctx.lineTo(pBottomDown.x, pBottomDown.y);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    this.ctx.stroke();

    // C. Top Face Polygon
    this.ctx.fillStyle = topColor;
    this.ctx.beginPath();
    this.ctx.moveTo(pTop.x, pTop.y);
    this.ctx.lineTo(pRight.x, pRight.y);
    this.ctx.lineTo(pBottom.x, pBottom.y);
    this.ctx.lineTo(pLeft.x, pLeft.y);
    this.ctx.closePath();
    this.ctx.fill();

    // Grid stroke lines
    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    // D. Specialized Overlays (Cover block pillars or Hazard pulse)
    if (type === 'COVER') {
      this.renderCoverPillar(isoX, isoY - 4);
    } else if (type === 'HAZARDOUS') {
      this.renderHazardGlow(isoX, isoY);
    }

    // E. Elevation level marker lines for 3D depth readability
    if (elevation > 0) {
      this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.25)';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(pBottom.x, pBottom.y);
      this.ctx.lineTo(pBottom.x, pBottom.y + wallDepth);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  /**
   * Renders a void tile as an abyss pit with wireframe borders.
   * @param {number} x
   * @param {number} y
   */
  renderVoidTile(x, y) {
    const { isoX, isoY } = this.gridToScreen(x, y, 0);
    const wHalf = this.tileWidthHalf;
    const hHalf = this.tileHeightHalf;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(244, 63, 94, 0.25)';
    this.ctx.setLineDash([3, 3]);
    this.ctx.beginPath();
    this.ctx.moveTo(isoX, isoY - hHalf);
    this.ctx.lineTo(isoX + wHalf, isoY);
    this.ctx.lineTo(isoX, isoY + hHalf);
    this.ctx.lineTo(isoX - wHalf, isoY);
    this.ctx.closePath();
    this.ctx.stroke();
    this.ctx.restore();
  }

  /**
   * Renders cover structure box on top of COVER tiles.
   */
  renderCoverPillar(isoX, isoY) {
    const w = 12;
    const h = 16;
    this.ctx.fillStyle = '#a855f7';
    this.ctx.shadowBlur = 8;
    this.ctx.shadowColor = '#a855f7';
    this.ctx.fillRect(isoX - w / 2, isoY - h, w, h);
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.strokeRect(isoX - w / 2, isoY - h, w, h);
    this.ctx.shadowBlur = 0;
  }

  /**
   * Renders pulsing hazard warning lights on HAZARDOUS tiles.
   */
  renderHazardGlow(isoX, isoY) {
    const pulse = (Math.sin(this.time * 4) + 1) / 2;
    this.ctx.fillStyle = `rgba(244, 63, 94, ${0.15 + pulse * 0.25})`;
    this.ctx.beginPath();
    this.ctx.arc(isoX, isoY, 10, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /**
   * Renders cyan glowing selection hover highlight on cell top face.
   * @param {number} x
   * @param {number} y
   */
  renderHoverHighlight(x, y) {
    const tile = this.gridManager.getTile(x, y);
    if (!tile || tile.type === 'VOID') return;

    const { isoX, isoY } = this.gridToScreen(x, y, tile.elevation);
    const wHalf = this.tileWidthHalf;
    const hHalf = this.tileHeightHalf;

    this.ctx.save();
    this.ctx.shadowBlur = 14;
    this.ctx.shadowColor = '#00f3ff';
    this.ctx.fillStyle = 'rgba(0, 243, 255, 0.3)';
    this.ctx.strokeStyle = '#00f3ff';
    this.ctx.lineWidth = 2;

    this.ctx.beginPath();
    this.ctx.moveTo(isoX, isoY - hHalf);
    this.ctx.lineTo(isoX + wHalf, isoY);
    this.ctx.lineTo(isoX, isoY + hHalf);
    this.ctx.lineTo(isoX - wHalf, isoY);
    this.ctx.closePath();

    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();
  }
}
