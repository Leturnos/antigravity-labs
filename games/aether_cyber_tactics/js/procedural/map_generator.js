/**
 * MapGenerator - Procedural Map & Elevation Heightmap Generator for Aether Cyber Tactics.
 * Generates 2.5D isometric heightmaps (Z: 0..3) using layered noise,
 * distributes tactical tile types (NORMAL, COVER, HAZARDOUS, VOID),
 * places player/enemy spawns, and guarantees map connectivity using BFS flood-fill.
 */

export const TILE_TYPES = {
  NORMAL: 'NORMAL',
  COVER: 'COVER',
  HAZARDOUS: 'HAZARDOUS',
  VOID: 'VOID'
};

/**
 * Creates a deterministic 32-bit PRNG function based on Mulberry32.
 * @param {number|string} seed
 * @returns {() => number} Returns float in range [0, 1)
 */
export function createPRNG(seed) {
  let s = typeof seed === 'number' ? seed : hashString(String(seed));
  if (s === 0) s = 123456789;
  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Simple string hash for PRNG seed initialization.
 * @param {string} str
 * @returns {number}
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

/**
 * 2D Value Noise Generator with smoothstep interpolation.
 */
class ValueNoise2D {
  constructor(prng) {
    this.prng = prng;
    this.gridSize = 256;
    this.values = new Float32Array(this.gridSize * this.gridSize);
    for (let i = 0; i < this.values.length; i++) {
      this.values[i] = this.prng();
    }
  }

  getVal(gx, gy) {
    const x = Math.abs(Math.floor(gx)) % this.gridSize;
    const y = Math.abs(Math.floor(gy)) % this.gridSize;
    return this.values[y * this.gridSize + x];
  }

  sample(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const dx = x - x0;
    const dy = y - y0;

    const sx = dx * dx * (3 - 2 * dx);
    const sy = dy * dy * (3 - 2 * dy);

    const n00 = this.getVal(x0, y0);
    const n10 = this.getVal(x1, y0);
    const n01 = this.getVal(x0, y1);
    const n11 = this.getVal(x1, y1);

    const nx0 = n00 + sx * (n10 - n00);
    const nx1 = n01 + sx * (n11 - n01);

    return nx0 + sy * (nx1 - nx0);
  }

  sampleOctaves(x, y, octaves = 3, persistence = 0.5, scale = 0.25) {
    let total = 0;
    let maxVal = 0;
    let freq = scale;
    let amp = 1;

    for (let i = 0; i < octaves; i++) {
      total += this.sample(x * freq, y * freq) * amp;
      maxVal += amp;
      amp *= persistence;
      freq *= 2;
    }

    return total / maxVal;
  }
}

/**
 * Checks connectivity between player spawn cells and enemy spawn cells using BFS.
 * @param {Array<Array<Object>>} tiles - 2D grid matrix
 * @param {Array<{x: number, y: number}>} playerSpawns
 * @param {Array<{x: number, y: number}>} enemySpawns
 * @returns {boolean} True if all enemy spawns are reachable from at least one player spawn.
 */
export function checkConnectivity(tiles, playerSpawns, enemySpawns) {
  if (!tiles || !playerSpawns.length || !enemySpawns.length) return false;

  const height = tiles.length;
  const width = tiles[0].length;
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const queue = [];

  for (const spawn of playerSpawns) {
    const tile = tiles[spawn.y] && tiles[spawn.y][spawn.x];
    if (tile && tile.type !== TILE_TYPES.VOID) {
      queue.push(spawn);
      visited[spawn.y][spawn.x] = true;
    }
  }

  if (queue.length === 0) return false;

  const dirs = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ];

  while (queue.length > 0) {
    const curr = queue.shift();
    const currTile = tiles[curr.y][curr.x];

    for (const d of dirs) {
      const nx = curr.x + d.x;
      const ny = curr.y + d.y;

      if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[ny][nx]) {
        const nextTile = tiles[ny][nx];
        if (nextTile && nextTile.type !== TILE_TYPES.VOID) {
          const deltaZ = Math.abs(nextTile.elevation - currTile.elevation);
          if (deltaZ <= 1) {
            visited[ny][nx] = true;
            queue.push({ x: nx, y: ny });
          }
        }
      }
    }
  }

  for (const enemySpawn of enemySpawns) {
    if (!visited[enemySpawn.y][enemySpawn.x]) {
      return false;
    }
  }

  return true;
}

/**
 * Carves a passable path between spawn locations to repair connectivity.
 * @param {Array<Array<Object>>} tiles
 * @param {Array<{x: number, y: number}>} playerSpawns
 * @param {Array<{x: number, y: number}>} enemySpawns
 */
export function repairConnectivity(tiles, playerSpawns, enemySpawns) {
  if (!playerSpawns.length || !enemySpawns.length) return;
  const start = playerSpawns[0];
  const end = enemySpawns[0];

  let cx = start.x;
  let cy = start.y;

  while (cx !== end.x || cy !== end.y) {
    const tile = tiles[cy][cx];
    if (tile.type === TILE_TYPES.VOID) {
      tile.type = TILE_TYPES.NORMAL;
      tile.health = 2;
      tile.maxHealth = 2;
    }

    if (cx !== end.x && (cy === end.y || Math.abs(end.x - cx) >= Math.abs(end.y - cy))) {
      cx += cx < end.x ? 1 : -1;
    } else {
      cy += cy < end.y ? 1 : -1;
    }

    const nextTile = tiles[cy][cx];
    if (nextTile.type === TILE_TYPES.VOID) {
      nextTile.type = TILE_TYPES.NORMAL;
      nextTile.health = 2;
      nextTile.maxHealth = 2;
    }

    if (Math.abs(nextTile.elevation - tile.elevation) > 1) {
      nextTile.elevation = tile.elevation + (nextTile.elevation > tile.elevation ? 1 : -1);
    }
  }
}

/**
 * Generates a procedural map layout for Aether Cyber Tactics.
 *
 * @param {Object} [options={}]
 * @param {number} [options.gridWidth=8] - Grid width in cells (8 or 10)
 * @param {number} [options.gridHeight=8] - Grid height in cells (8 or 10)
 * @param {number|string} [options.seed] - Random seed
 * @param {number} [options.playerCount=3] - Number of player spawn points
 * @param {number} [options.enemyCount=3] - Number of enemy spawn points
 * @returns {{ gridWidth: number, gridHeight: number, tiles: Array<Array<Object>>, playerSpawns: Array<{x: number, y: number}>, enemySpawns: Array<{x: number, y: number}>, environmentData: Object }}
 */
export function generateProceduralMap(options = {}) {
  const gridWidth = options.gridWidth || options.width || 8;
  const gridHeight = options.gridHeight || options.height || 8;
  const seed = options.seed !== undefined ? options.seed : Date.now();
  const playerCount = options.playerCount || 3;
  const enemyCount = options.enemyCount || 3;

  const prng = createPRNG(seed);
  const noise = new ValueNoise2D(prng);

  const tiles = [];
  let voidCount = 0;
  let hazardCount = 0;
  let coverCount = 0;
  let normalCount = 0;

  // 1. Generate Heightmap & Initial Tile Types
  for (let y = 0; y < gridHeight; y++) {
    const row = [];
    for (let x = 0; x < gridWidth; x++) {
      const nVal = noise.sampleOctaves(x, y, 3, 0.5, 0.25);
      let elevation = Math.floor(nVal * 4);
      if (elevation < 0) elevation = 0;
      if (elevation > 3) elevation = 3;

      const roll = prng();
      let type = TILE_TYPES.NORMAL;
      let health = 2;
      let maxHealth = 2;

      // Target distribution: NORMAL (70%), COVER (15%), HAZARDOUS (10%), VOID (5%)
      if (roll < 0.05) {
        type = TILE_TYPES.VOID;
        elevation = 0;
        health = 0;
        voidCount++;
      } else if (roll < 0.15) {
        type = TILE_TYPES.HAZARDOUS;
        hazardCount++;
      } else if (roll < 0.30) {
        type = TILE_TYPES.COVER;
        coverCount++;
      } else {
        type = TILE_TYPES.NORMAL;
        normalCount++;
      }

      row.push({
        x,
        y,
        elevation,
        type,
        health,
        maxHealth,
        unit: null
      });
    }
    tiles.push(row);
  }

  // 2. Smooth elevation transitions (avoid cliff walls > 1 height step)
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (tiles[y][x].type === TILE_TYPES.VOID) continue;
      const neighbors = [
        { x: x + 1, y },
        { x, y: y + 1 }
      ];
      for (const n of neighbors) {
        if (n.x < gridWidth && n.y < gridHeight) {
          const nTile = tiles[n.y][n.x];
          if (nTile.type !== TILE_TYPES.VOID) {
            if (Math.abs(nTile.elevation - tiles[y][x].elevation) > 1) {
              nTile.elevation = tiles[y][x].elevation + (nTile.elevation > tiles[y][x].elevation ? 1 : -1);
            }
          }
        }
      }
    }
  }

  // 3. Determine Player & Enemy Spawn Points
  const playerSpawns = [];
  const enemySpawns = [];

  // Player Spawns on left side (x=0 or 1)
  for (let y = 0; y < gridHeight && playerSpawns.length < playerCount; y++) {
    for (let x = 0; x <= 1 && playerSpawns.length < playerCount; x++) {
      const tile = tiles[y][x];
      if (tile.type === TILE_TYPES.VOID) {
        tile.type = TILE_TYPES.NORMAL;
        tile.health = 2;
        tile.maxHealth = 2;
      }
      playerSpawns.push({ x, y });
    }
  }

  // Enemy Spawns on right side (x = gridWidth-2 or gridWidth-1)
  for (let y = gridHeight - 1; y >= 0 && enemySpawns.length < enemyCount; y--) {
    for (let x = gridWidth - 1; x >= gridWidth - 2 && enemySpawns.length < enemyCount; x--) {
      const tile = tiles[y][x];
      if (tile.type === TILE_TYPES.VOID) {
        tile.type = TILE_TYPES.NORMAL;
        tile.health = 2;
        tile.maxHealth = 2;
      }
      enemySpawns.push({ x, y });
    }
  }

  // 4. Perform Connectivity Check & Repair if needed
  let isConnected = checkConnectivity(tiles, playerSpawns, enemySpawns);
  if (!isConnected) {
    repairConnectivity(tiles, playerSpawns, enemySpawns);
    isConnected = checkConnectivity(tiles, playerSpawns, enemySpawns);
  }

  const environmentData = {
    theme: 'CYBER_NEON',
    seed,
    gridWidth,
    gridHeight,
    tileCounts: {
      normal: normalCount,
      cover: coverCount,
      hazardous: hazardCount,
      void: voidCount
    },
    isConnected
  };

  return {
    gridWidth,
    gridHeight,
    tiles,
    playerSpawns,
    enemySpawns,
    environmentData
  };
}
