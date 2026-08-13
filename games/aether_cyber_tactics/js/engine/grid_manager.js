/**
 * GridManager - Manages the 2.5D tactical grid matrix, tile properties, and spatial queries.
 */
export class GridManager {
  /**
   * @param {number} width - Grid width in cells (default: 8)
   * @param {number} height - Grid height in cells (default: 8)
   */
  constructor(width = 8, height = 8) {
    this.width = width;
    this.height = height;
    this.grid = [];
    this.initGrid();
  }

  /**
   * Initializes or resets the tile matrix.
   */
  initGrid() {
    this.grid = [];
    for (let y = 0; y < this.height; y++) {
      const row = [];
      for (let x = 0; x < this.width; x++) {
        row.push({
          x,
          y,
          elevation: 0,
          type: 'NORMAL', // 'NORMAL' | 'COVER' | 'HAZARDOUS' | 'VOID'
          health: 2,
          maxHealth: 2,
          unit: null
        });
      }
      this.grid.push(row);
    }
  }

  /**
   * Returns the tile object at coordinates (x, y), or null if out of bounds.
   * @param {number} x
   * @param {number} y
   * @returns {Object|null}
   */
  getTile(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    return this.grid[y][x];
  }

  /**
   * Sets elevation level for a tile (clamped between 0 and 3).
   * @param {number} x
   * @param {number} y
   * @param {number} level
   */
  setElevation(x, y, level) {
    const tile = this.getTile(x, y);
    if (tile) {
      tile.elevation = Math.max(0, Math.min(3, Math.floor(level)));
    }
  }

  /**
   * Applies damage to tile health. If health falls to 0 or below, tile becomes VOID.
   * @param {number} x
   * @param {number} y
   * @param {number} amount
   * @returns {boolean} True if tile was destroyed, false otherwise.
   */
  damageTile(x, y, amount = 1) {
    const tile = this.getTile(x, y);
    if (!tile || tile.type === 'VOID') return false;

    tile.health = Math.max(0, tile.health - amount);
    if (tile.health <= 0) {
      tile.type = 'VOID';
      tile.elevation = 0;
      tile.unit = null;
      return true;
    }
    return false;
  }

  /**
   * Checks if tile is walkable by units.
   * @param {number} x
   * @param {number} y
   * @returns {boolean}
   */
  isWalkable(x, y) {
    const tile = this.getTile(x, y);
    if (!tile) return false;
    if (tile.type === 'VOID') return false;
    if (tile.unit !== null) return false;
    return true;
  }

  /**
   * Returns valid orthogonally adjacent neighbor tiles.
   * @param {number} x
   * @param {number} y
   * @returns {Array<Object>}
   */
  getAdjacentTiles(x, y) {
    const directions = [
      { x: 0, y: -1 }, // North
      { x: 1, y: 0 },  // East
      { x: 0, y: 1 },  // South
      { x: -1, y: 0 }  // West
    ];
    const neighbors = [];
    for (const dir of directions) {
      const tile = this.getTile(x + dir.x, y + dir.y);
      if (tile) {
        neighbors.push(tile);
      }
    }
    return neighbors;
  }

  /**
   * Pre-populates sample terrain features (elevations, cover, hazards) for initial testing.
   */
  populateSampleMap() {
    // Elevated cyber platforms
    this.setElevation(2, 2, 1);
    this.setElevation(2, 3, 2);
    this.setElevation(3, 2, 2);
    this.setElevation(3, 3, 3);
    this.setElevation(5, 5, 1);
    this.setElevation(5, 6, 2);
    this.setElevation(6, 5, 1);

    // Tactical cover obstacles
    const coverCoords = [
      [1, 2], [4, 1], [6, 2], [2, 5], [5, 3]
    ];
    coverCoords.forEach(([cx, cy]) => {
      const t = this.getTile(cx, cy);
      if (t) t.type = 'COVER';
    });

    // Hazardous energy pools
    const hazardCoords = [
      [0, 7], [1, 7], [7, 0], [7, 1]
    ];
    hazardCoords.forEach(([hx, hy]) => {
      const t = this.getTile(hx, hy);
      if (t) t.type = 'HAZARDOUS';
    });

    // Void chasm
    const voidTile = this.getTile(4, 4);
    if (voidTile) {
      voidTile.type = 'VOID';
      voidTile.health = 0;
      voidTile.elevation = 0;
    }
  }
}
