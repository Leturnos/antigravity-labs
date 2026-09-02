/**
 * High-performance 2D Spatial Hash Grid Partitioning.
 *
 * Designed for 100% zero-allocation in real-time gameplay loops (e.g. 10,000 creeps,
 * continuous tower targeting, AoE splash and stasis pulses).
 *
 * Uses contiguous TypedArrays with a bucket-head and entity-next linked list structure:
 * - head: Int32Array(cols * rows), pointing to the first entity in each spatial bucket (-1 for empty).
 * - next: Int32Array(maxEntities), pointing to the next entity in the bucket's linked list.
 * - posX, posY: Float32Array(maxEntities), caching entity positions for fast Euclidean filtering.
 */
export class SpatialHashGrid {
  /**
   * @param {number} [width=1280] Width of world in pixels
   * @param {number} [height=720] Height of world in pixels
   * @param {number} [cellSize=40] Size of each bucket cell in pixels
   * @param {number} [maxEntities=10000] Maximum number of simultaneous tracked entities
   */
  constructor(width = 1280, height = 720, cellSize = 40, maxEntities = 10000) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.maxEntities = maxEntities;

    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    const totalBuckets = this.cols * this.rows;

    // Bucket heads initialized to -1 (empty)
    this.head = new Int32Array(totalBuckets);
    this.head.fill(-1);

    // Singly-linked list pointers per entity ID
    this.next = new Int32Array(maxEntities);
    this.next.fill(-1);

    // Entity position buffers for distance calculation
    this.posX = new Float32Array(maxEntities);
    this.posY = new Float32Array(maxEntities);
  }

  /**
   * Resets the grid buckets. O(cols * rows) zero-allocation operation.
   * Call once per frame before re-inserting active entities.
   */
  clear() {
    this.head.fill(-1);
  }

  /**
   * Inserts an entity into its corresponding spatial bucket.
   *
   * @param {number} id Integer entity ID (0 <= id < maxEntities)
   * @param {number} x World X coordinate
   * @param {number} y World Y coordinate
   * @returns {boolean} True if successfully inserted, false if invalid ID or NaN
   */
  insert(id, x, y) {
    if (id < 0 || id >= this.maxEntities || Number.isNaN(x) || Number.isNaN(y)) {
      return false;
    }

    this.posX[id] = x;
    this.posY[id] = y;

    let col = Math.floor(x / this.cellSize);
    let row = Math.floor(y / this.cellSize);

    // Clamp coordinates to grid boundary cells
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
   * Queries all entities within a circular radius of (x, y).
   * Filters by checking buckets covering the bounding box of the circle,
   * followed by an exact squared distance check.
   *
   * @param {number} x Center X coordinate
   * @param {number} y Center Y coordinate
   * @param {number} radius Search radius
   * @param {Int32Array|null} [outIds=null] Reusable output buffer to write matching entity IDs
   * @returns {number} Number of matching entities found (up to outIds.length if provided)
   */
  queryRadius(x, y, radius, outIds = null) {
    if (radius <= 0) return 0;

    const minX = x - radius;
    const maxX = x + radius;
    const minY = y - radius;
    const maxY = y + radius;

    let minCol = Math.floor(minX / this.cellSize);
    let maxCol = Math.floor(maxX / this.cellSize);
    let minRow = Math.floor(minY / this.cellSize);
    let maxRow = Math.floor(maxY / this.cellSize);

    if (minCol < 0) minCol = 0;
    if (maxCol >= this.cols) maxCol = this.cols - 1;
    if (minRow < 0) minRow = 0;
    if (maxRow >= this.rows) maxRow = this.rows - 1;

    if (minCol > maxCol || minRow > maxRow) return 0;

    let count = 0;
    const r2 = radius * radius;
    const maxResults = outIds ? outIds.length : Infinity;

    for (let r = minRow; r <= maxRow; r++) {
      const rowOffset = r * this.cols;
      for (let c = minCol; c <= maxCol; c++) {
        let curr = this.head[rowOffset + c];
        while (curr !== -1) {
          const dx = this.posX[curr] - x;
          const dy = this.posY[curr] - y;
          if (dx * dx + dy * dy <= r2) {
            if (outIds) {
              outIds[count] = curr;
            }
            count++;
            if (count >= maxResults) {
              return count;
            }
          }
          curr = this.next[curr];
        }
      }
    }

    return count;
  }

  /**
   * Queries all entities within an axis-aligned bounding box.
   *
   * @param {number} minX Left world coordinate
   * @param {number} minY Top world coordinate
   * @param {number} maxX Right world coordinate
   * @param {number} maxY Bottom world coordinate
   * @param {Int32Array|null} [outIds=null] Reusable output buffer
   * @returns {number} Number of matching entities found
   */
  queryBox(minX, minY, maxX, maxY, outIds = null) {
    let x0 = minX;
    let x1 = maxX;
    if (x0 > x1) {
      x0 = maxX;
      x1 = minX;
    }

    let y0 = minY;
    let y1 = maxY;
    if (y0 > y1) {
      y0 = maxY;
      y1 = minY;
    }

    let minCol = Math.floor(x0 / this.cellSize);
    let maxCol = Math.floor(x1 / this.cellSize);
    let minRow = Math.floor(y0 / this.cellSize);
    let maxRow = Math.floor(y1 / this.cellSize);

    if (minCol < 0) minCol = 0;
    if (maxCol >= this.cols) maxCol = this.cols - 1;
    if (minRow < 0) minRow = 0;
    if (maxRow >= this.rows) maxRow = this.rows - 1;

    if (minCol > maxCol || minRow > maxRow) return 0;

    let count = 0;
    const maxResults = outIds ? outIds.length : Infinity;

    for (let r = minRow; r <= maxRow; r++) {
      const rowOffset = r * this.cols;
      for (let c = minCol; c <= maxCol; c++) {
        let curr = this.head[rowOffset + c];
        while (curr !== -1) {
          const px = this.posX[curr];
          const py = this.posY[curr];
          if (px >= x0 && px <= x1 && py >= y0 && py <= y1) {
            if (outIds) {
              outIds[count] = curr;
            }
            count++;
            if (count >= maxResults) {
              return count;
            }
          }
          curr = this.next[curr];
        }
      }
    }

    return count;
  }

  /**
   * Fast zero-allocation nearest neighbor query within maxRadius.
   * Useful for single-target towers (e.g. Pulse Gatling).
   *
   * @param {number} x Center X coordinate
   * @param {number} y Center Y coordinate
   * @param {number} maxRadius Maximum search range
   * @returns {number} ID of nearest entity, or -1 if none found
   */
  queryNearest(x, y, maxRadius) {
    if (maxRadius <= 0) return -1;

    let minCol = Math.floor((x - maxRadius) / this.cellSize);
    let maxCol = Math.floor((x + maxRadius) / this.cellSize);
    let minRow = Math.floor((y - maxRadius) / this.cellSize);
    let maxRow = Math.floor((y + maxRadius) / this.cellSize);

    if (minCol < 0) minCol = 0;
    if (maxCol >= this.cols) maxCol = this.cols - 1;
    if (minRow < 0) minRow = 0;
    if (maxRow >= this.rows) maxRow = this.rows - 1;

    if (minCol > maxCol || minRow > maxRow) return -1;

    let bestId = -1;
    let bestDistSq = maxRadius * maxRadius;

    for (let r = minRow; r <= maxRow; r++) {
      const rowOffset = r * this.cols;
      for (let c = minCol; c <= maxCol; c++) {
        let curr = this.head[rowOffset + c];
        while (curr !== -1) {
          const dx = this.posX[curr] - x;
          const dy = this.posY[curr] - y;
          const d2 = dx * dx + dy * dy;
          if (d2 <= bestDistSq) {
            bestDistSq = d2;
            bestId = curr;
          }
          curr = this.next[curr];
        }
      }
    }

    return bestId;
  }

  /**
   * Retrieves position of an entity.
   *
   * @param {number} id
   * @param {{ x: number, y: number } | null} [out=null] Reusable object for zero allocation
   * @returns {{ x: number, y: number } | null}
   */
  getPosition(id, out = null) {
    if (id < 0 || id >= this.maxEntities) return null;
    if (out) {
      out.x = this.posX[id];
      out.y = this.posY[id];
      return out;
    }
    return { x: this.posX[id], y: this.posY[id] };
  }
}
