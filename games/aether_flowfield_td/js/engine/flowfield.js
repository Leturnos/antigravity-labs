import { CONFIG } from '../config.js';

// Pre-defined neighbor offsets: 4 orthogonal, followed by 4 diagonal
const DIRS = [
  [0, -1],  // North
  [1, 0],   // East
  [0, 1],   // South
  [-1, 0],  // West
  [1, -1],  // North-East
  [1, 1],   // South-East
  [-1, 1],  // South-West
  [-1, -1]  // North-West
];

/**
 * FlowField pathfinding engine using Dijkstra/BFS over TypedArrays.
 * Supports zero-allocation propagation, diagonal corner-cutting prevention,
 * bilinear continuous interpolation, and automatic Breach Mode.
 */
export class FlowField {
  /**
   * @param {number} cols Number of columns
   * @param {number} rows Number of rows
   * @param {number} [cellSize=20] Pixel size of each cell
   */
  constructor(cols, rows, cellSize = 20) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    const totalCells = cols * rows;

    // Grid cost buffer: 1 for normal traversable, 255 for solid obstacles/towers
    this.costField = new Uint8Array(totalCells);
    this.costField.fill(1);

    // Dijkstra integration distance buffer: 0 at destination, 65535 for unreachable
    this.integrationField = new Uint16Array(totalCells);
    this.integrationField.fill(65535);

    // Normalized flow vectors pointing along the steepest distance gradient
    this.flowX = new Float32Array(totalCells);
    this.flowY = new Float32Array(totalCells);

    // Circular queue for zero-allocation Dijkstra/BFS (capacity rounded up to next power of 2)
    const queueCap = Math.max(65536, 1 << (32 - Math.clz32(Math.max(1, totalCells * 2 - 1))));
    this.queue = new Int32Array(queueCap);
    this.queueMask = queueCap - 1;
    this.inQueue = new Uint8Array(totalCells);

    // Scratch buffers for Breach Mode to guarantee zero GC allocation during runtime
    this.visited = new Uint8Array(totalCells);
    this.emergencyDist = new Uint16Array(totalCells);

    // Breach Mode status
    this.breachActive = false;
    this.breachTargetTower = null;
  }

  /**
   * Set traversal cost of a grid cell.
   * @param {number} col
   * @param {number} row
   * @param {number} cost 1 for passable, 255 for impassable tower/wall
   */
  setCost(col, row, cost) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    this.costField[row * this.cols + col] = cost;
  }

  /**
   * Get traversal cost of a grid cell.
   * @param {number} col
   * @param {number} row
   * @returns {number}
   */
  getCost(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return 255;
    return this.costField[row * this.cols + col];
  }

  /**
   * Get integration distance of a grid cell.
   * @param {number} col
   * @param {number} row
   * @returns {number} Distance in Dijkstra units (65535 if unreachable)
   */
  getDistance(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return 65535;
    return this.integrationField[row * this.cols + col];
  }

  /**
   * Check whether Breach Mode is currently active.
   * @returns {boolean}
   */
  isBreachActive() {
    return this.breachActive;
  }

  /**
   * Returns coordinates of the blocking tower designated for breach destruction.
   * @returns {{ col: number, row: number } | null}
   */
  getBreachTargetTower() {
    return this.breachTargetTower;
  }

  /**
   * Recalculates the Dijkstra integration field and flow vector field.
   * Automatically activates Breach Mode if any spawn point is blocked from reaching the core.
   *
   * @param {number} [coreCol=CONFIG.CORE.COL] Target destination column
   * @param {number} [coreRow=CONFIG.CORE.ROW] Target destination row
   * @param {Array<{col: number, row: number}>} [spawns=CONFIG.SPAWNS] Active spawn portals
   */
  recalculate(
    coreCol = (CONFIG && CONFIG.CORE ? CONFIG.CORE.COL : 0),
    coreRow = (CONFIG && CONFIG.CORE ? CONFIG.CORE.ROW : 0),
    spawns = (CONFIG && CONFIG.SPAWNS ? CONFIG.SPAWNS : [])
  ) {
    const cols = this.cols;
    const rows = this.rows;
    const mask = this.queueMask;

    // Reset integration distances and flow vectors
    this.integrationField.fill(65535);
    this.flowX.fill(0);
    this.flowY.fill(0);
    this.breachActive = false;
    this.breachTargetTower = null;

    if (coreCol < 0 || coreCol >= cols || coreRow < 0 || coreRow >= rows) {
      return;
    }

    const coreIdx = coreRow * cols + coreCol;
    let head = 0;
    let tail = 0;

    // Standard Dijkstra starts at the core cell if it's traversable
    if (this.costField[coreIdx] < 255) {
      this.integrationField[coreIdx] = 0;
      this.queue[tail] = coreIdx;
      tail = (tail + 1) & mask;
      this.inQueue[coreIdx] = 1;

      while (head !== tail) {
        const currIdx = this.queue[head];
        head = (head + 1) & mask;
        this.inQueue[currIdx] = 0;

        const currDist = this.integrationField[currIdx];
        const c = currIdx % cols;
        const r = (currIdx / cols) | 0;

        for (let i = 0; i < 8; i++) {
          const dc = DIRS[i][0];
          const dr = DIRS[i][1];
          const nc = c + dc;
          const nr = r + dr;

          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          const nIdx = nr * cols + nc;

          const nCost = this.costField[nIdx];
          if (nCost >= 255) continue;

          // Corner-cutting prevention for diagonal steps
          if (dc !== 0 && dr !== 0) {
            if (this.costField[r * cols + nc] >= 255 || this.costField[nr * cols + c] >= 255) {
              continue;
            }
          }

          const stepCost = (dc !== 0 && dr !== 0) ? 14 : 10;
          const newDist = currDist + stepCost;

          if (newDist < this.integrationField[nIdx]) {
            this.integrationField[nIdx] = newDist;
            if (!this.inQueue[nIdx]) {
              this.queue[tail] = nIdx;
              tail = (tail + 1) & mask;
              this.inQueue[nIdx] = 1;
            }
          }
        }
      }
    }

    // Check if any spawn point is unreachable (integrationField remains 65535)
    let hasUnreachableSpawn = false;
    if (spawns && spawns.length > 0) {
      for (let i = 0; i < spawns.length; i++) {
        const sp = spawns[i];
        if (sp.col < 0 || sp.col >= cols || sp.row < 0 || sp.row >= rows) continue;
        const sIdx = sp.row * cols + sp.col;
        if (this.integrationField[sIdx] === 65535) {
          hasUnreachableSpawn = true;
          break;
        }
      }
    }

    // --- Breach Mode Detection & Emergency Path Computation ---
    if (hasUnreachableSpawn) {
      this.breachActive = true;

      // Identify candidate blocking towers reachable from unreachable spawns
      this.visited.fill(0);
      let bHead = 0;
      let bTail = 0;

      for (let i = 0; i < spawns.length; i++) {
        const sp = spawns[i];
        if (sp.col < 0 || sp.col >= cols || sp.row < 0 || sp.row >= rows) continue;
        const sIdx = sp.row * cols + sp.col;
        if (this.integrationField[sIdx] === 65535 && !this.visited[sIdx]) {
          this.visited[sIdx] = 1;
          this.queue[bTail] = sIdx;
          bTail = (bTail + 1) & mask;
        }
      }

      let bestTowerCol = -1;
      let bestTowerRow = -1;
      let minCoreDistSq = Infinity;

      while (bHead !== bTail) {
        const currIdx = this.queue[bHead];
        bHead = (bHead + 1) & mask;
        const c = currIdx % cols;
        const r = (currIdx / cols) | 0;

        for (let i = 0; i < 8; i++) {
          const dc = DIRS[i][0];
          const dr = DIRS[i][1];
          const nc = c + dc;
          const nr = r + dr;

          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          const nIdx = nr * cols + nc;
          if (this.visited[nIdx]) continue;

          // Corner-cutting prevention
          if (dc !== 0 && dr !== 0) {
            if (this.costField[r * cols + nc] >= 255 || this.costField[nr * cols + c] >= 255) {
              continue;
            }
          }

          this.visited[nIdx] = 1;

          if (this.costField[nIdx] >= 255) {
            // Found a reachable perimeter obstacle/tower. Select the one closest to the Core.
            const distSq = (nc - coreCol) ** 2 + (nr - coreRow) ** 2;
            if (distSq < minCoreDistSq) {
              minCoreDistSq = distSq;
              bestTowerCol = nc;
              bestTowerRow = nr;
            }
          } else {
            this.queue[bTail] = nIdx;
            bTail = (bTail + 1) & mask;
          }
        }
      }

      if (bestTowerCol !== -1) {
        this.breachTargetTower = { col: bestTowerCol, row: bestTowerRow };

        // Propagate emergency Dijkstra from the target tower into the unreachable component
        this.emergencyDist.fill(65535);
        this.inQueue.fill(0);
        const tIdx = bestTowerRow * cols + bestTowerCol;
        this.emergencyDist[tIdx] = 0;

        let qHead = 0;
        let qTail = 0;
        this.queue[qTail] = tIdx;
        qTail = (qTail + 1) & mask;
        this.inQueue[tIdx] = 1;

        while (qHead !== qTail) {
          const currIdx = this.queue[qHead];
          qHead = (qHead + 1) & mask;
          this.inQueue[currIdx] = 0;

          const currDist = this.emergencyDist[currIdx];
          const c = currIdx % cols;
          const r = (currIdx / cols) | 0;

          for (let i = 0; i < 8; i++) {
            const dc = DIRS[i][0];
            const dr = DIRS[i][1];
            const nc = c + dc;
            const nr = r + dr;

            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            const nIdx = nr * cols + nc;

            // Only propagate through traversable cells in the unreachable component
            if (this.costField[nIdx] >= 255) continue;
            if (this.integrationField[nIdx] !== 65535) continue;

            if (dc !== 0 && dr !== 0) {
              if (this.costField[r * cols + nc] >= 255 || this.costField[nr * cols + c] >= 255) {
                continue;
              }
            }

            const stepCost = (dc !== 0 && dr !== 0) ? 14 : 10;
            const newDist = currDist + stepCost;

            if (newDist < this.emergencyDist[nIdx]) {
              this.emergencyDist[nIdx] = newDist;
              if (!this.inQueue[nIdx]) {
                this.queue[qTail] = nIdx;
                qTail = (qTail + 1) & mask;
                this.inQueue[nIdx] = 1;
              }
            }
          }
        }
      }
    }

    // --- Flow Vector Calculation ---
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const currIdx = r * cols + c;

        // Skip blocked cells
        if (this.costField[currIdx] >= 255) {
          this.flowX[currIdx] = 0;
          this.flowY[currIdx] = 0;
          continue;
        }

        const normDist = this.integrationField[currIdx];

        if (normDist < 65535) {
          // Standard pathing towards the core
          if (normDist === 0) {
            this.flowX[currIdx] = 0;
            this.flowY[currIdx] = 0;
            continue;
          }

          let minDist = normDist;
          let bestDx = 0;
          let bestDy = 0;

          for (let i = 0; i < 8; i++) {
            const dc = DIRS[i][0];
            const dr = DIRS[i][1];
            const nc = c + dc;
            const nr = r + dr;

            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            const nIdx = nr * cols + nc;
            if (this.costField[nIdx] >= 255) continue;

            if (dc !== 0 && dr !== 0) {
              if (this.costField[r * cols + nc] >= 255 || this.costField[nr * cols + c] >= 255) {
                continue;
              }
            }

            const nDist = this.integrationField[nIdx];
            if (nDist < minDist) {
              minDist = nDist;
              bestDx = dc;
              bestDy = dr;
            }
          }

          if (bestDx !== 0 || bestDy !== 0) {
            const len = Math.hypot(bestDx, bestDy);
            this.flowX[currIdx] = bestDx / len;
            this.flowY[currIdx] = bestDy / len;
          } else {
            this.flowX[currIdx] = 0;
            this.flowY[currIdx] = 0;
          }
        } else if (this.breachActive && this.breachTargetTower) {
          // Emergency pathing towards the designated breach target tower
          const eDist = this.emergencyDist[currIdx];
          if (eDist === 65535) {
            this.flowX[currIdx] = 0;
            this.flowY[currIdx] = 0;
            continue;
          }

          const tCol = this.breachTargetTower.col;
          const tRow = this.breachTargetTower.row;
          const tIdx = tRow * cols + tCol;

          let minDist = eDist;
          let bestDx = 0;
          let bestDy = 0;

          for (let i = 0; i < 8; i++) {
            const dc = DIRS[i][0];
            const dr = DIRS[i][1];
            const nc = c + dc;
            const nr = r + dr;

            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            const nIdx = nr * cols + nc;

            // Allow moving into the breach target tower itself, skip other obstacles
            if (nIdx !== tIdx && this.costField[nIdx] >= 255) continue;

            if (dc !== 0 && dr !== 0) {
              const orth1 = r * cols + nc;
              const orth2 = nr * cols + c;
              if ((orth1 !== tIdx && this.costField[orth1] >= 255) ||
                  (orth2 !== tIdx && this.costField[orth2] >= 255)) {
                continue;
              }
            }

            const nDist = this.emergencyDist[nIdx];
            if (nDist < minDist) {
              minDist = nDist;
              bestDx = dc;
              bestDy = dr;
            }
          }

          if (bestDx !== 0 || bestDy !== 0) {
            const len = Math.hypot(bestDx, bestDy);
            this.flowX[currIdx] = bestDx / len;
            this.flowY[currIdx] = bestDy / len;
          } else {
            this.flowX[currIdx] = 0;
            this.flowY[currIdx] = 0;
          }
        } else {
          this.flowX[currIdx] = 0;
          this.flowY[currIdx] = 0;
        }
      }
    }
  }

  /**
   * Sample the continuous flow vector at a sub-pixel floating point position (px, py)
   * using bilinear interpolation across the 4 surrounding cell centers.
   *
   * @param {number} px World X coordinate in pixels
   * @param {number} py World Y coordinate in pixels
   * @param {{ vx: number, vy: number } | null} [out=null] Optional reusable object to avoid allocations
   * @returns {{ vx: number, vy: number }} Normalized direction vector
   */
  sampleFlow(px, py, out = null) {
    const cellSize = this.cellSize;
    const gx = px / cellSize - 0.5;
    const gy = py / cellSize - 0.5;

    let c0 = Math.floor(gx);
    let r0 = Math.floor(gy);
    let c1 = c0 + 1;
    let r1 = r0 + 1;

    let tx = gx - c0;
    let ty = gy - r0;

    // Boundary clamping
    if (c0 < 0) {
      c0 = 0;
      c1 = 0;
      tx = 0;
    } else if (c1 >= this.cols) {
      c0 = this.cols - 1;
      c1 = this.cols - 1;
      tx = 0;
    }

    if (r0 < 0) {
      r0 = 0;
      r1 = 0;
      ty = 0;
    } else if (r1 >= this.rows) {
      r0 = this.rows - 1;
      r1 = this.rows - 1;
      ty = 0;
    }

    const idx00 = r0 * this.cols + c0;
    const idx10 = r0 * this.cols + c1;
    const idx01 = r1 * this.cols + c0;
    const idx11 = r1 * this.cols + c1;

    const vx00 = this.flowX[idx00], vy00 = this.flowY[idx00];
    const vx10 = this.flowX[idx10], vy10 = this.flowY[idx10];
    const vx01 = this.flowX[idx01], vy01 = this.flowY[idx01];
    const vx11 = this.flowX[idx11], vy11 = this.flowY[idx11];

    const w00 = (1 - tx) * (1 - ty);
    const w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty;
    const w11 = tx * ty;

    let vx = vx00 * w00 + vx10 * w10 + vx01 * w01 + vx11 * w11;
    let vy = vy00 * w00 + vy10 * w10 + vy01 * w01 + vy11 * w11;

    const len = Math.hypot(vx, vy);
    if (len > 1e-4) {
      vx /= len;
      vy /= len;
    } else {
      // Fallback to nearest cell vector if blended vector approaches zero
      const nearC = Math.max(0, Math.min(this.cols - 1, Math.round(gx)));
      const nearR = Math.max(0, Math.min(this.rows - 1, Math.round(gy)));
      const nearIdx = nearR * this.cols + nearC;
      vx = this.flowX[nearIdx];
      vy = this.flowY[nearIdx];
    }

    if (out) {
      out.vx = vx;
      out.vy = vy;
      return out;
    }

    return { vx, vy };
  }
}
