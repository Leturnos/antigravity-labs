/**
 * Aether Rogue - A* Pathfinding Engine for Enemy AI Navigation
 */

class Node {
  constructor(x, y, g = 0, h = 0, parent = null) {
    this.x = x;
    this.y = y;
    this.g = g; // Cost from start
    this.h = h; // Heuristic to target
    this.f = g + h; // Total score
    this.parent = parent;
  }
}

/**
 * Finds shortest grid path from start position to target using A* algorithm.
 * 
 * @param {Dungeon} dungeon - Dungeon instance
 * @param {{x: number, y: number}} start - Starting tile coordinates
 * @param {{x: number, y: number}} target - Target tile coordinates
 * @param {function(tile): boolean} [isWalkableFn] - Optional custom walkability checker
 * @returns {Array<{x: number, y: number}>} Path array from start to target (excluding start)
 */
export function findPathAStar(dungeon, start, target, isWalkableFn) {
  if (!start || !target) return [];
  if (start.x === target.x && start.y === target.y) return [];

  const defaultIsWalkable = (tile) => tile && tile.isWalkable();
  const checkWalkable = isWalkableFn || defaultIsWalkable;

  const openList = [];
  const closedSet = new Set();

  const heuristic = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

  const startNode = new Node(start.x, start.y, 0, heuristic(start.x, start.y, target.x, target.y));
  openList.push(startNode);

  const maxSteps = 400; // Limit iterations for performance safety
  let steps = 0;

  while (openList.length > 0 && steps < maxSteps) {
    steps++;

    // Get node with lowest F score
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift();

    const currentKey = `${current.x},${current.y}`;
    if (closedSet.has(currentKey)) continue;
    closedSet.add(currentKey);

    // Check if target reached
    if (current.x === target.x && current.y === target.y) {
      const path = [];
      let temp = current;
      while (temp.parent) {
        path.push({ x: temp.x, y: temp.y });
        temp = temp.parent;
      }
      return path.reverse();
    }

    // Neighbors (4-directional)
    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 }
    ];

    for (const n of neighbors) {
      const nKey = `${n.x},${n.y}`;
      if (closedSet.has(nKey)) continue;

      const tile = dungeon.getTile(n.x, n.y);
      // Target tile is allowed even if occupied by target entity
      const isTargetTile = n.x === target.x && n.y === target.y;

      if (tile && (checkWalkable(tile) || isTargetTile)) {
        const gScore = current.g + 1;
        const hScore = heuristic(n.x, n.y, target.x, target.y);
        
        let existingNode = openList.find(item => item.x === n.x && item.y === n.y);
        if (!existingNode) {
          openList.push(new Node(n.x, n.y, gScore, hScore, current));
        } else if (gScore < existingNode.g) {
          existingNode.g = gScore;
          existingNode.f = gScore + existingNode.h;
          existingNode.parent = current;
        }
      }
    }
  }

  return []; // Return empty if no path found
}
