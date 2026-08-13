/**
 * Pathfinding System for Aether Cyber Tactics.
 * Tailored A* pathfinding & movement reachability engine for 2.5D isometric grids.
 */

/**
 * Calculates step traversal cost between adjacent tiles.
 *
 * Cost Metrics:
 * - flat tile = 1
 * - elevation step up (+1 Z) = 2
 * - elevation step down (-1 Z) = 1.5
 * - height difference > 1 = blocked (Infinity)
 * - plasma hazard (HAZARDOUS) = 5
 * - void tile (VOID) = blocked (Infinity)
 *
 * @param {Object} fromTile
 * @param {Object} toTile
 * @param {Object|null} [endTile=null]
 * @param {Object|null} [unit=null]
 * @param {Object} [options={}]
 * @returns {number} Cost value or Infinity if unpassable
 */
export function getStepCost(fromTile, toTile, endTile = null, unit = null, options = {}) {
  if (!toTile || toTile.type === 'VOID') {
    return Infinity;
  }

  const deltaZ = toTile.elevation - fromTile.elevation;

  // Height difference > 1 is unpassable
  if (Math.abs(deltaZ) > 1) {
    return Infinity;
  }

  const isEndTile = endTile && toTile.x === endTile.x && toTile.y === endTile.y;

  // Check unit occupancy
  if (toTile.unit !== null && toTile.unit !== unit && !options.ignoreOccupied) {
    if (isEndTile) {
      if (!options.allowOccupiedEnd && !options.allowEnemyEndTile) {
        return Infinity;
      }
    } else {
      // Traversal through tile containing another unit
      const isFriendly = unit && toTile.unit.faction === unit.faction;
      if (!isFriendly || options.allowFriendlyPass === false) {
        return Infinity;
      }
    }
  }

  // Base terrain step cost
  if (toTile.type === 'HAZARDOUS') {
    return 5;
  }
  if (deltaZ === 1) {
    return 2;
  }
  if (deltaZ === -1) {
    return 1.5;
  }
  return 1; // Flat tile
}

/**
 * Heuristic function (Manhattan distance) for A* pathfinding.
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @returns {number}
 */
function heuristic(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Finds optimal path between start and end coordinates using A*.
 *
 * @param {{x: number, y: number}} start
 * @param {{x: number, y: number}} end
 * @param {import('../engine/grid_manager.js').GridManager} gridManager
 * @param {import('../core/units.js').Unit|null} [unit=null]
 * @param {Object} [options={}]
 * @returns {Array<{x: number, y: number, elevation: number}>} Array of path coordinates, or [] if no path found.
 */
export function findPath(start, end, gridManager, unit = null, options = {}) {
  const startTile = gridManager.getTile(start.x, start.y);
  const endTile = gridManager.getTile(end.x, end.y);

  if (!startTile || !endTile || endTile.type === 'VOID') {
    return [];
  }

  if (startTile.x === endTile.x && startTile.y === endTile.y) {
    return [{ x: startTile.x, y: startTile.y, elevation: startTile.elevation }];
  }

  const getKey = (x, y) => `${x},${y}`;

  const openSet = [startTile];
  const cameFrom = new Map();

  const gScore = new Map();
  gScore.set(getKey(startTile.x, startTile.y), 0);

  const fScore = new Map();
  fScore.set(getKey(startTile.x, startTile.y), heuristic(startTile, endTile));

  const openSetKeys = new Set([getKey(startTile.x, startTile.y)]);

  while (openSet.length > 0) {
    let currentIndex = 0;
    let lowestF = fScore.get(getKey(openSet[0].x, openSet[0].y)) ?? Infinity;

    for (let i = 1; i < openSet.length; i++) {
      const f = fScore.get(getKey(openSet[i].x, openSet[i].y)) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        currentIndex = i;
      }
    }

    const current = openSet.splice(currentIndex, 1)[0];
    const currentKey = getKey(current.x, current.y);
    openSetKeys.delete(currentKey);

    if (current.x === endTile.x && current.y === endTile.y) {
      const path = [{ x: current.x, y: current.y, elevation: current.elevation }];
      let currKey = currentKey;
      while (cameFrom.has(currKey)) {
        const prevTile = cameFrom.get(currKey);
        path.unshift({ x: prevTile.x, y: prevTile.y, elevation: prevTile.elevation });
        currKey = getKey(prevTile.x, prevTile.y);
      }
      return path;
    }

    const neighbors = gridManager.getAdjacentTiles(current.x, current.y);
    for (const neighbor of neighbors) {
      const stepCost = getStepCost(current, neighbor, endTile, unit, options);
      if (stepCost === Infinity) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + stepCost;
      const neighborKey = getKey(neighbor.x, neighbor.y);

      if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
        cameFrom.set(neighborKey, current);
        gScore.set(neighborKey, tentativeG);
        fScore.set(neighborKey, tentativeG + heuristic(neighbor, endTile));

        if (!openSetKeys.has(neighborKey)) {
          openSet.push(neighbor);
          openSetKeys.add(neighborKey);
        }
      }
    }
  }

  return [];
}

/**
 * Calculates all tiles reachable within a maximum movement cost (Dijkstra).
 *
 * @param {{x: number, y: number}} start
 * @param {number} moveRange
 * @param {import('../engine/grid_manager.js').GridManager} gridManager
 * @param {import('../core/units.js').Unit|null} [unit=null]
 * @param {Object} [options={}]
 * @returns {Array<{x: number, y: number, elevation: number, cost: number, path: Array<{x: number, y: number}>}>}
 */
export function getReachableTiles(start, moveRange, gridManager, unit = null, options = {}) {
  const startTile = gridManager.getTile(start.x, start.y);
  if (!startTile || startTile.type === 'VOID') {
    return [];
  }

  const getKey = (x, y) => `${x},${y}`;

  const distMap = new Map();
  const queue = [{ tile: startTile, cost: 0, path: [{ x: startTile.x, y: startTile.y, elevation: startTile.elevation }] }];

  distMap.set(getKey(startTile.x, startTile.y), {
    tile: startTile,
    cost: 0,
    path: [{ x: startTile.x, y: startTile.y, elevation: startTile.elevation }]
  });

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const { tile: current, cost: currentCost, path: currentPath } = queue.shift();

    const neighbors = gridManager.getAdjacentTiles(current.x, current.y);
    for (const neighbor of neighbors) {
      const stepCost = getStepCost(current, neighbor, null, unit, options);
      if (stepCost === Infinity) continue;

      const newCost = currentCost + stepCost;
      if (newCost <= moveRange) {
        const neighborKey = getKey(neighbor.x, neighbor.y);
        const existing = distMap.get(neighborKey);

        if (!existing || newCost < existing.cost) {
          const nextPath = [...currentPath, { x: neighbor.x, y: neighbor.y, elevation: neighbor.elevation }];
          const entry = { tile: neighbor, cost: newCost, path: nextPath };

          distMap.set(neighborKey, entry);
          queue.push(entry);
        }
      }
    }
  }

  const results = [];
  for (const entry of distMap.values()) {
    const tile = entry.tile;
    if (!options.includeOccupied && tile.unit !== null && tile.unit !== unit) {
      continue;
    }
    results.push({
      x: tile.x,
      y: tile.y,
      elevation: tile.elevation,
      cost: entry.cost,
      path: entry.path,
      tile
    });
  }

  return results;
}
