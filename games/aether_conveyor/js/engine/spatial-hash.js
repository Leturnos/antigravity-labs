/**
 * SpatialHashGrid — Zero-allocation 2D Spatial Hash Grid for Aether Conveyor
 *
 * Uses contiguous TypedArrays to track entities and items across the factory floor,
 * enabling O(1) proximity queries for Inserter grabbers, viewport culling, and mouse clicks.
 */

export class SpatialHashGrid {
  /**
   * @param {number} width World width in pixels
   * @param {number} height World height in pixels
   * @param {number} cellSize Bucket cell size in pixels
   * @param {number} maxEntities Maximum number of simultaneous entities
   */
  constructor(width = 2400, height = 2400, cellSize = 48, maxEntities = 8000) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.maxEntities = maxEntities;

    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    const totalBuckets = this.cols * this.rows;

    this.head = new Int32Array(totalBuckets);
    this.head.fill(-1);

    this.next = new Int32Array(maxEntities);
    this.next.fill(-1);

    this.posX = new Float32Array(maxEntities);
    this.posY = new Float32Array(maxEntities);
  }

  /**
   * Clears bucket heads. Zero allocation. Call before re-indexing entities.
   */
  clear() {
    this.head.fill(-1);
  }

  /**
   * Inserts an entity into the grid.
   * @param {number} id Integer entity ID
   * @param {number} x World X coordinate
   * @param {number} y World Y coordinate
   * @returns {boolean}
   */
  insert(id, x, y) {
    if (id < 0 || id >= this.maxEntities || Number.isNaN(x) || Number.isNaN(y)) {
      return false;
    }

    this.posX[id] = x;
    this.posY[id] = y;

    let col = Math.floor(x / this.cellSize);
    let row = Math.floor(y / this.cellSize);

    if (col < 0) col = 0;
    else if (col >= this.cols) col = this.cols - 1;

    if (row < 0) row = 0;
    else if (row >= this.rows) row = this.rows - 1;

    const bucketIdx = row * this.cols + col;
    this.next[id] = this.head[bucketIdx];
    this.head[bucketIdx] = id;
    return true;
  }

  /**
   * Queries entities within a circular radius.
   * @param {number} x Center X
   * @param {number} y Center Y
   * @param {number} radius Query radius
   * @param {Int32Array} [outIds=null] Reusable output array
   * @returns {number[]|number} Array of IDs if outIds is null, or count written to outIds
   */
  queryRadius(x, y, radius, outIds = null) {
    if (radius <= 0) return outIds ? 0 : [];

    const minX = x - radius;
    const maxX = x + radius;
    const minY = y - radius;
    const maxY = y + radius;

    let startCol = Math.max(0, Math.floor(minX / this.cellSize));
    let endCol = Math.min(this.cols - 1, Math.floor(maxX / this.cellSize));
    let startRow = Math.max(0, Math.floor(minY / this.cellSize));
    let endRow = Math.min(this.rows - 1, Math.floor(maxY / this.cellSize));

    const r2 = radius * radius;
    let count = 0;
    const resultList = outIds ? null : [];

    for (let r = startRow; r <= endRow; r++) {
      const rowOffset = r * this.cols;
      for (let c = startCol; c <= endCol; c++) {
        let curr = this.head[rowOffset + c];
        while (curr !== -1) {
          const dx = this.posX[curr] - x;
          const dy = this.posY[curr] - y;
          if (dx * dx + dy * dy <= r2) {
            if (outIds) {
              if (count < outIds.length) {
                outIds[count++] = curr;
              }
            } else {
              resultList.push(curr);
            }
          }
          curr = this.next[curr];
        }
      }
    }

    return outIds ? count : resultList;
  }

  /**
   * Queries entities within an axis-aligned bounding box (AABB).
   * Useful for viewport culling and area selections.
   */
  queryBox(minX, minY, maxX, maxY, outIds = null) {
    let startCol = Math.max(0, Math.floor(minX / this.cellSize));
    let endCol = Math.min(this.cols - 1, Math.floor(maxX / this.cellSize));
    let startRow = Math.max(0, Math.floor(minY / this.cellSize));
    let endRow = Math.min(this.rows - 1, Math.floor(maxY / this.cellSize));

    let count = 0;
    const resultList = outIds ? null : [];

    for (let r = startRow; r <= endRow; r++) {
      const rowOffset = r * this.cols;
      for (let c = startCol; c <= endCol; c++) {
        let curr = this.head[rowOffset + c];
        while (curr !== -1) {
          const px = this.posX[curr];
          const py = this.posY[curr];
          if (px >= minX && px <= maxX && py >= minY && py <= maxY) {
            if (outIds) {
              if (count < outIds.length) {
                outIds[count++] = curr;
              }
            } else {
              resultList.push(curr);
            }
          }
          curr = this.next[curr];
        }
      }
    }

    return outIds ? count : resultList;
  }
}
