/**
 * Aether Rogue - Field of View (FOV) & Raycasting Line of Sight Engine
 */

/**
 * Generic integer-based Bresenham Line of Sight checker.
 * Can be reused by Player FOV, Enemy Turrets, Drones, and Ranged Attacks.
 * 
 * @param {number} x0 - Start X
 * @param {number} y0 - Start Y
 * @param {number} x1 - Target X
 * @param {number} y1 - Target Y
 * @param {function(x, y): boolean} isBlockingFn - Returns true if tile blocks vision
 * @returns {boolean} true if clear line of sight exists
 */
export function checkLineOfSight(x0, y0, x1, y1, isBlockingFn) {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let currX = x0;
  let currY = y0;

  while (true) {
    if (currX === x1 && currY === y1) return true;
    if ((currX !== x0 || currY !== y0) && isBlockingFn(currX, currY)) {
      return false;
    }
    let e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      currX += sx;
    }
    if (e2 < dx) {
      err += dx;
      currY += sy;
    }
  }
}

/**
 * Computes Field of View (FOV) around player position and updates dungeon tile visibility.
 * 
 * @param {Dungeon} dungeon - Dungeon instance
 * @param {number} px - Player grid X
 * @param {number} py - Player grid Y
 * @param {number} radius - Vision radius (default 8)
 */
export function computeFOV(dungeon, px, py, radius = 8) {
  // 1. Reset visible state for all tiles
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      const tile = dungeon.grid[y][x];
      tile.visible = false;
    }
  }

  // Player position is always visible and explored
  const centerTile = dungeon.getTile(px, py);
  if (centerTile) {
    centerTile.visible = true;
    centerTile.explored = true;
  }

  // 2. Cast rays in 360 degrees around radius
  const rayCount = 120;
  const isBlocking = (x, y) => {
    const t = dungeon.getTile(x, y);
    return !t || t.isOpaque();
  };

  for (let i = 0; i < rayCount; i++) {
    const angle = (i * 2 * Math.PI) / rayCount;
    const targetX = Math.round(px + radius * Math.cos(angle));
    const targetY = Math.round(py + radius * Math.sin(angle));

    _castRayFOV(dungeon, px, py, targetX, targetY, isBlocking, radius);
  }
}

function _castRayFOV(dungeon, x0, y0, x1, y1, isBlockingFn, radius) {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let currX = x0;
  let currY = y0;

  while (true) {
    const dist = Math.hypot(currX - x0, currY - y0);
    if (dist > radius) break;

    const tile = dungeon.getTile(currX, currY);
    if (tile) {
      tile.visible = true;
      tile.explored = true;
    }

    if (currX === x1 && currY === y1) break;
    if ((currX !== x0 || currY !== y0) && isBlockingFn(currX, currY)) {
      break; // Blocked ray
    }

    let e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      currX += sx;
    }
    if (e2 < dx) {
      err += dx;
      currY += sy;
    }
  }
}
