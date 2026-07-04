import { hash32, ImprovedNoise } from './noise.js';

export const RIVER_MIN_DIST_FACTOR = 0.08;

export const BIOME_THRESHOLDS = {
  DEEP_OCEAN: 0.15,
  SHALLOW_OCEAN: 0.22,
  BEACH: 0.26,
  PEAKS: 0.80,
  COLD: 0.35,
  HOT: 0.70,
  DRY_TEMP: 0.33,
  WET_TEMP: 0.66,
  DRY_HOT: 0.30,
  WET_HOT: 0.60,
  SWAMP_HEIGHT: 0.45
};

export function classifyBiome(e, m, t, isRiver = false, isLake = false) {
  if (e < BIOME_THRESHOLDS.DEEP_OCEAN) return 'DEEP_OCEAN';
  if (e < BIOME_THRESHOLDS.SHALLOW_OCEAN) return 'SHALLOW_OCEAN';
  
  if (isRiver) return 'RIVER';
  if (isLake) return 'LAKE';
  
  if (e < BIOME_THRESHOLDS.BEACH) return 'BEACH';
  if (e > BIOME_THRESHOLDS.PEAKS) return 'SNOW_MOUNTAIN';
  
  if (t < BIOME_THRESHOLDS.COLD) return 'TUNDRA';
  
  if (t < BIOME_THRESHOLDS.HOT) {
    if (m < BIOME_THRESHOLDS.DRY_TEMP) return 'GRASSLAND';
    if (m < BIOME_THRESHOLDS.WET_TEMP) return 'TEMP_FOREST';
    return e < BIOME_THRESHOLDS.SWAMP_HEIGHT ? 'SWAMP' : 'TEMP_FOREST';
  }
  
  if (m < BIOME_THRESHOLDS.DRY_HOT) return 'DESERT';
  if (m < BIOME_THRESHOLDS.WET_HOT) return 'SAVANNA';
  return 'JUNGLE';
}

export function generateWorldData(params) {
  const grid = [];
  const elevNoise = new ImprovedNoise(params.seed);
  
  // Derived seed using hash32 to guarantee a robust, independent offset
  const moistureSeed = hash32(params.seed + 99999);
  const moistNoise = new ImprovedNoise(moistureSeed);
  
  const warpSeed = hash32(params.seed + 77777);
  const warpNoise = new ImprovedNoise(warpSeed);
  
  const size = params.gridSize;
  const tempModel = params.tempModel || 'planet';
  
  let tempNoise = null;
  let angle = 0;
  let centerX = (size - 1) / 2;
  let centerY = (size - 1) / 2;
  const maxDist = Math.sqrt(2) * size;

  if (tempModel === 'noise') {
    const tempSeed = hash32(params.seed + 88888);
    tempNoise = new ImprovedNoise(tempSeed);
  } else if (tempModel === 'inclined') {
    // Generate deterministic angle from seed
    angle = (hash32(params.seed + 101) % 360) * Math.PI / 180;
    
    // Shift center by up to 20% of the grid size
    const offsetLimit = size * 0.2;
    const offsetX = ((hash32(params.seed + 202) % 1000) / 1000 - 0.5) * 2 * offsetLimit;
    const offsetY = ((hash32(params.seed + 303) % 1000) / 1000 - 0.5) * 2 * offsetLimit;
    centerX += offsetX;
    centerY += offsetY;
  }
  
  for (let y = 0; y < size; y++) {
    grid[y] = [];
    
    for (let x = 0; x < size; x++) {
      // Domain Warping
      const warpStr = params.warpStrength !== undefined ? params.warpStrength : 10;
      let warpedX = x;
      let warpedY = y;
      if (warpStr > 0) {
        const warpScale = 0.02;
        const dx = warpNoise.noise(x * warpScale, y * warpScale);
        const dy = warpNoise.noise(x * warpScale + 5.2, y * warpScale + 1.3);
        warpedX += dx * warpStr;
        warpedY += dy * warpStr;
      }

      // Elevation base FBM calculation on warped coordinates
      let baseElevation = 0;
      let ridgeElevation = 0;
      let amplitude = 1;
      let frequency = params.elevScale;
      let maxVal = 0;
      for (let o = 0; o < params.elevOctaves; o++) {
        const rawVal = elevNoise.noise(warpedX * frequency, warpedY * frequency);
        baseElevation += amplitude * rawVal;
        
        const ridgeVal = 1.0 - Math.abs(rawVal);
        ridgeElevation += amplitude * ridgeVal;
        
        maxVal += amplitude;
        amplitude *= params.elevPersistence;
        frequency *= 2;
      }
      baseElevation = (baseElevation / maxVal + 1) / 2;
      ridgeElevation = (ridgeElevation / maxVal);

      // Blend classic flat valley elevation with sharp ridge peaks
      const blendFactor = Math.max(0.0, Math.min(1.0, (baseElevation - 0.4) / (0.75 - 0.4)));
      const smoothedBlend = blendFactor * blendFactor * (3 - 2 * blendFactor);
      const elevation = (1.0 - smoothedBlend) * baseElevation + smoothedBlend * (ridgeElevation * ridgeElevation * 1.25);

      // Moisture generation using FBM
      let moisture = 0;
      amplitude = 1;
      frequency = params.moistScale;
      maxVal = 0;
      for (let o = 0; o < params.moistOctaves; o++) {
        moisture += amplitude * moistNoise.noise(x * frequency, y * frequency);
        maxVal += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }
      moisture = (moisture / maxVal + 1) / 2; // Normalize from [-1, 1] to [0, 1]
      
      grid[y][x] = {
        x, y,
        elevation,
        moisture
      };
    }
  }

  // Post-processing passes
  if (params.erosionStrength > 0) {
    applyHydraulicErosion(grid, size, params.erosionStrength);
  }

  finalizeWorldMetadata(grid, size, params);
  return grid;
}

function computeCoastalDistances(grid, size) {
  const distMap = Array.from({length: size}, () => new Float32Array(size).fill(Infinity));
  const queue = [];
  
  // Enqueue all water source cells (seas/oceans)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x].elevation < 0.26) {
        distMap[y][x] = 0;
        queue.push({x, y});
      }
    }
  }
  
  let head = 0;
  let maxDist = 1;
  const dirs = [
    {dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1},
    {dx: 1, dy: 1}, {dx: -1, dy: -1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}
  ];
  
  while (head < queue.length) {
    const curr = queue[head++];
    const currDist = distMap[curr.y][curr.x];
    
    for (let i = 0; i < 8; i++) {
      const nx = curr.x + dirs[i].dx;
      const ny = curr.y + dirs[i].dy;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        const stepWeight = (dirs[i].dx !== 0 && dirs[i].dy !== 0) ? 1.414 : 1.0;
        const nextDist = currDist + stepWeight;
        if (nextDist < distMap[ny][nx]) {
          distMap[ny][nx] = nextDist;
          if (nextDist > maxDist) maxDist = nextDist;
          queue.push({x: nx, y: ny});
        }
      }
    }
  }
  
  // Apply coastal attenuation to land moisture
  const coastalWeight = 0.5; // Dampens moisture up to 50% in deep inland regions
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      if (cell.elevation >= 0.26) {
        const distNorm = distMap[y][x] / maxDist;
        cell.moisture = cell.moisture * (1.0 - distNorm * coastalWeight);
      }
      
      // Recalculate biomes for all cells since elevation or moisture changed
      cell.biome = classifyBiome(cell.elevation, cell.moisture, cell.temperature, cell.isRiver, cell.isLake);
    }
  }
}

function applyHydraulicErosion(grid, size, strength) {
  if (strength <= 0) return;
  
  // Capped iterations: min(strength * size * 20, 20000)
  const iterations = Math.min(Math.floor(strength * size * 20), 20000);
  
  const maxSteps = 30;
  const inertia = 0.05;
  const sedimentCapacityFactor = 4;
  const minSedimentCapacity = 0.01;
  const erodeSpeed = 0.3;
  const depositSpeed = 0.3;
  const evaporateSpeed = 0.05;
  const gravity = 4.0;
  
  for (let iter = 0; iter < iterations; iter++) {
    // Choose random starting land cell
    let rx = Math.floor(Math.random() * size);
    let ry = Math.floor(Math.random() * size);
    if (grid[ry][rx].elevation < 0.26) continue;
    
    let posX = rx;
    let posY = ry;
    let dirX = 0;
    let dirY = 0;
    let speed = 1.0;
    let water = 1.0;
    let sediment = 0;
    
    for (let step = 0; step < maxSteps; step++) {
      const ix = Math.floor(posX);
      const iy = Math.floor(posY);
      
      let gradX = 0;
      let gradY = 0;
      
      const hCurrent = grid[iy][ix].elevation;
      const hR = ix < size - 1 ? grid[iy][ix + 1].elevation : hCurrent;
      const hL = ix > 0 ? grid[iy][ix - 1].elevation : hCurrent;
      const hD = iy < size - 1 ? grid[iy + 1][ix].elevation : hCurrent;
      const hU = iy > 0 ? grid[iy - 1][ix].elevation : hCurrent;
      
      gradX = hR - hL;
      gradY = hD - hU;
      
      dirX = dirX * inertia - gradX * (1 - inertia);
      dirY = dirY * inertia - gradY * (1 - inertia);
      
      const len = Math.sqrt(dirX * dirX + dirY * dirY);
      if (len > 0) {
        dirX /= len;
        dirY /= len;
      } else {
        break;
      }
      
      const nextX = posX + dirX;
      const nextY = posY + dirY;
      const nix = Math.floor(nextX);
      const niy = Math.floor(nextY);
      
      if (nix < 0 || nix >= size || niy < 0 || niy >= size) break;
      if (grid[niy][nix].elevation < 0.26) break;
      
      const hNext = grid[niy][nix].elevation;
      const deltaH = hNext - hCurrent;
      
      if (deltaH > 0) {
        const depositAmount = Math.min(deltaH, sediment);
        grid[iy][ix].elevation += depositAmount;
        sediment -= depositAmount;
        break;
      }
      
      const slope = -deltaH;
      const sedimentCapacity = Math.max(slope * speed * water * sedimentCapacityFactor, minSedimentCapacity);
      
      if (sediment > sedimentCapacity) {
        const depositAmount = (sediment - sedimentCapacity) * depositSpeed;
        grid[iy][ix].elevation += depositAmount;
        sediment -= depositAmount;
      } else {
        const erodeAmount = Math.min((sedimentCapacity - sediment) * erodeSpeed, slope);
        grid[iy][ix].elevation -= erodeAmount;
        sediment += erodeAmount;
      }
      
      speed = Math.sqrt(speed * speed + slope * gravity);
      water *= (1 - evaporateSpeed);
      
      posX = nextX;
      posY = nextY;
    }
  }
}

function finalizeWorldMetadata(grid, size, params) {
  const tempModel = params.tempModel || 'planet';
  let tempNoise = null;
  let angle = 0;
  let centerX = (size - 1) / 2;
  let centerY = (size - 1) / 2;
  const maxDist = Math.sqrt(2) * size;

  if (tempModel === 'noise') {
    const tempSeed = hash32(params.seed + 88888);
    tempNoise = new ImprovedNoise(tempSeed);
  } else if (tempModel === 'inclined') {
    angle = (hash32(params.seed + 101) % 360) * Math.PI / 180;
    const offsetLimit = size * 0.2;
    const offsetX = ((hash32(params.seed + 202) % 1000) / 1000 - 0.5) * 2 * offsetLimit;
    const offsetY = ((hash32(params.seed + 303) % 1000) / 1000 - 0.5) * 2 * offsetLimit;
    centerX += offsetX;
    centerY += offsetY;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      
      let latitudeFactor = 0.5;
      if (tempModel === 'planet') {
        latitudeFactor = 1.0 - Math.abs(2 * (y / (size - 1)) - 1);
      } else if (tempModel === 'inclined') {
        const d = -Math.sin(angle) * (x - centerX) + Math.cos(angle) * (y - centerY);
        latitudeFactor = 1.0 - Math.min(1.0, Math.abs(d) / (maxDist / 2));
      } else if (tempModel === 'noise') {
        const tempFreq = params.elevScale * 0.35;
        let tNoise = 0;
        let amp = 1;
        let freq = tempFreq;
        let maxTVal = 0;
        for (let o = 0; o < 2; o++) {
          tNoise += amp * tempNoise.noise(x * freq, y * freq);
          maxTVal += amp;
          amp *= 0.5;
          freq *= 2;
        }
        latitudeFactor = (tNoise / maxTVal + 1) / 2;
      }
      
      cell.temperature = latitudeFactor * (1.0 - params.tempAltWeight * cell.elevation);
    }
  }

  // River generation
  generateRivers(grid, size, params);

  // Moisture propagation from rivers
  propagateMoisture(grid, size, params);

  // Cost distance BFS computes coastal moisture modifications and classifies biomes
  computeCoastalDistances(grid, size);
}

function generateRivers(grid, size, params) {
  if (!params.riverCount || params.riverCount <= 0) return;

  const landCells = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      if (cell.elevation >= 0.26) {
        landCells.push({
          x, y,
          elevation: cell.elevation,
          moisture: cell.moisture,
          score: cell.elevation * cell.moisture
        });
      }
    }
  }

  // Sort by high score (highest and wettest first)
  landCells.sort((a, b) => b.score - a.score);

  // Greedy source selection with minimum distance constraint
  const sources = [];
  const minDist = Math.max(10, Math.floor(size * RIVER_MIN_DIST_FACTOR));

  for (let i = 0; i < landCells.length && sources.length < params.riverCount; i++) {
    const candidate = landCells[i];
    let farEnough = true;
    for (const src of sources) {
      const dist = Math.abs(candidate.x - src.x) + Math.abs(candidate.y - src.y);
      if (dist < minDist) {
        farEnough = false;
        break;
      }
    }
    if (farEnough) {
      sources.push({ x: candidate.x, y: candidate.y });
    }
  }

  const dirs = [
    {dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1},
    {dx: 1, dy: 1}, {dx: -1, dy: -1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}
  ];

  // Flow downhill for each source
  for (const src of sources) {
    let currX = src.x;
    let currY = src.y;
    const pathSet = new Set();
    const maxPathLength = size * 2;
    
    for (let step = 0; step < maxPathLength; step++) {
      const key = `${currX},${currY}`;
      if (pathSet.has(key)) break; // avoid loops
      pathSet.add(key);
      
      const cell = grid[currY][currX];
      
      // Find valid downhill neighbors
      let bestNeighbor = null;
      let minElev = Infinity;
      
      for (const dir of dirs) {
        const nx = currX + dir.dx;
        const ny = currY + dir.dy;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
          const nKey = `${nx},${ny}`;
          if (!pathSet.has(nKey)) {
            const nCell = grid[ny][nx];
            if (nCell.elevation < minElev) {
              minElev = nCell.elevation;
              bestNeighbor = nCell;
            }
          }
        }
      }
      
      if (!bestNeighbor) {
        // Local depression: make it a lake
        cell.isLake = true;
        break;
      }
      
      if (bestNeighbor.elevation < 0.26) {
        // Desemboca no mar
        cell.isRiver = true;
        break;
      }
      
      if (bestNeighbor.elevation >= cell.elevation) {
        // Local depression (valley): end flow, make it a lake
        cell.isLake = true;
        break;
      }
      
      // Flow downhill
      cell.isRiver = true;
      currX = bestNeighbor.x;
      currY = bestNeighbor.y;
    }
  }
}

function propagateMoisture(grid, size, params) {
  if (!params.riverCount || params.riverCount <= 0) return;
  const radius = params.riverMoistRadius;
  const strength = params.riverMoistStrength;
  if (radius <= 0 || strength <= 0) return;

  const queue = [];
  const distMap = Array.from({length: size}, () => new Int32Array(size).fill(-1));

  // Enqueue all initial River and Lake cells
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      if ((cell.isRiver || cell.isLake) && cell.elevation >= 0.26) {
        distMap[y][x] = 0;
        queue.push({x, y});
      }
    }
  }

  let head = 0;
  const dirs = [
    {dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1},
    {dx: 1, dy: 1}, {dx: -1, dy: -1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}
  ];

  while (head < queue.length) {
    const curr = queue[head++];
    const d = distMap[curr.y][curr.x];
    if (d >= radius) continue;

    for (const dir of dirs) {
      const nx = curr.x + dir.dx;
      const ny = curr.y + dir.dy;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        const neighbor = grid[ny][nx];
        if (neighbor.elevation >= 0.26 && distMap[ny][nx] === -1) {
          distMap[ny][nx] = d + 1;
          queue.push({x: nx, y: ny});
        }
      }
    }
  }

  // Apply linear moisture decay boost to inland land cells
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      const d = distMap[y][x];
      if (d > 0 && d <= radius && cell.elevation >= 0.26) {
        const boost = strength * (1.0 - d / (radius + 1));
        cell.moisture = Math.min(1.0, cell.moisture + boost);
      }
    }
  }
}

