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

  // Fase 3: Civilizações, Recursos, Reinos e Dungeons
  generatePhase3Elements(grid, size, params);
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

// ==========================================
// FASE 3: CIVILIZAÇÕES, RECURSOS E REINOS
// ==========================================

const CITY_PREFIXES = ['Oakhaven', 'Ironclad', 'Stonegard', 'Deepwater', 'Riverrun', 'Goldfield', 'Greenwall', 'Sanddrift', 'Winterhold', 'Fairbreeze', 'Shadowfen', 'Stormwatch'];
const CITY_SUFFIXES = ['crest', 'fort', 'bury', 'port', 'vale', 'shore', 'bridge', 'gate', 'wood', 'run', 'keep', 'spire'];

const KINGDOM_NAMES = ['Aethelgard', 'Valyria', 'Gondor', 'Rohan', 'Skellige', 'Novigrad', 'Temeria', 'Redania', 'Nilfgaard', 'Cintra'];

const DUNGEON_TEMPLE_NAMES = ['Templo de Solis', 'Santuário de Jade', 'Zigurato das Serpes', 'Monastério das Brumas'];
const DUNGEON_RUINS_NAMES = ['Ruínas de Osgiliath', 'Fortaleza do Crânio', 'Necrópole das Areias', 'Bastião do Inverno'];

function generateCityName(seed, index) {
  const hash = hash32(seed + index * 12345);
  const p = CITY_PREFIXES[hash % CITY_PREFIXES.length];
  const s = CITY_SUFFIXES[(hash >> 4) % CITY_SUFFIXES.length];
  return `${p}${s}`;
}

function generatePhase3Elements(grid, size, params) {
  // 1. Recursos Naturais
  generateNaturalResources(grid, size, params);
  
  // 2. Cidades e Assentamentos
  const cities = generateCities(grid, size, params);
  grid.cities = cities;
  
  // 3. Reinos e Fronteiras (a partir das capitais das cidades)
  const kingdoms = generateKingdoms(grid, size, cities);
  grid.kingdoms = kingdoms;
  
  // 4. Rotas comerciais (A*)
  const routes = generateRoutes(grid, size, cities);
  grid.routes = routes;
  
  // 5. Dungeons e POIs
  const dungeons = generateDungeons(grid, size, params);
  grid.dungeons = dungeons;
}

function generateNaturalResources(grid, size, params) {
  const resSeed = hash32(params.seed + 11111);
  const resNoise = new ImprovedNoise(resSeed);
  const scale = 0.06; // ruído de baixa frequência para depósitos

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      
      // Apenas células terrestres
      if (cell.elevation < 0.26) {
        cell.resource = null;
        cell.resourceDensity = 0;
        continue;
      }

      // Pegamos o ruído de baixa frequência normalizado [0, 1]
      const noiseVal = (resNoise.noise(x * scale, y * scale) + 1) / 2;
      
      let resource = null;
      let resourceDensity = 0;
      
      if (noiseVal > 0.55) { // threshold para depósitos concentrados
        const biome = cell.biome;
        if (biome === 'TEMP_FOREST' || biome === 'JUNGLE') {
          resource = 'wood';
        } else if (biome === 'SNOW_MOUNTAIN') {
          resource = 'ore';
        } else if (biome === 'DESERT' || biome === 'TUNDRA') {
          resource = 'stone';
        } else if (biome === 'SAVANNA' || biome === 'GRASSLAND') {
          resource = 'crops';
        } else if (biome === 'BEACH' || biome === 'SWAMP' || isNearWater(cell, grid, size)) {
          resource = 'fish';
        }
        
        if (resource) {
          resourceDensity = (noiseVal - 0.55) / 0.45; // normaliza densidade de 0 a 1
        }
      }
      
      cell.resource = resource;
      cell.resourceDensity = resourceDensity;
    }
  }
}

function isNearWater(cell, grid, size) {
  const dirs = [{dx:1, dy:0}, {dx:-1, dy:0}, {dx:0, dy:1}, {dx:0, dy:-1}];
  for (const d of dirs) {
    const nx = cell.x + d.dx;
    const ny = cell.y + d.dy;
    if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
      const neighbor = grid[ny][nx];
      if (neighbor.elevation < 0.26 || neighbor.isRiver || neighbor.isLake) {
        return true;
      }
    }
  }
  return false;
}

function isNearCoast(cell, grid, size) {
  const r = 3;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        const e = grid[ny][nx].elevation;
        if (e < 0.26) return true; // oceano/mar raso próximo
      }
    }
  }
  return false;
}

function generateCities(grid, size, params) {
  const cityCount = params.cityCount || 6;
  const candidates = [];
  
  for (let y = 2; y < size - 2; y++) {
    for (let x = 2; x < size - 2; x++) {
      const cell = grid[y][x];
      
      // Critérios de exclusão
      if (cell.elevation < 0.26) continue;
      if (cell.biome === 'BEACH') continue;
      if (cell.biome === 'SNOW_MOUNTAIN') continue;
      if (cell.biome === 'SWAMP') continue;
      
      // Declividade local (terreno plano)
      const hCurrent = cell.elevation;
      const hR = grid[y][x + 1].elevation;
      const hL = grid[y][x - 1].elevation;
      const hD = grid[y + 1][x].elevation;
      const hU = grid[y - 1][x].elevation;
      const slope = (Math.abs(hR - hCurrent) + Math.abs(hL - hCurrent) + Math.abs(hD - hCurrent) + Math.abs(hU - hCurrent)) / 4;
      
      if (slope > 0.07) continue; // muito inclinado
      
      let score = 50; // atratividade base
      
      // Proximidade de água doce
      let hasRiverOrLake = false;
      const dirs4 = [{dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1}];
      for (const d of dirs4) {
        const nx = x + d.dx;
        const ny = y + d.dy;
        const n = grid[ny][nx];
        if (n.isRiver || n.isLake) {
          hasRiverOrLake = true;
          break;
        }
      }
      
      if (hasRiverOrLake) {
        score += 35;
      } else if (isNearCoast(cell, grid, size)) {
        score += 20;
      }
      
      // Biomas favoráveis
      if (cell.biome === 'GRASSLAND' || cell.biome === 'TEMP_FOREST') {
        score += 25;
      } else if (cell.biome === 'SAVANNA' || cell.biome === 'JUNGLE') {
        score += 15;
      } else if (cell.biome === 'TUNDRA' || cell.biome === 'DESERT') {
        score += 5;
      }
      
      // Extra plano
      if (slope < 0.03) {
        score += 15;
      }
      
      // Pequeno ruído determinístico para quebrar empates e variar
      const valHash = hash32(params.seed + x * 83 + y * 19);
      score += (valHash % 100) / 10;
      
      candidates.push({
        x, y,
        score,
        cell
      });
    }
  }
  
  // Ordenar candidatos por pontuação decrescente
  candidates.sort((a, b) => b.score - a.score);
  
  const selected = [];
  const minDist = Math.max(6, Math.floor(size / (Math.sqrt(cityCount) * 1.6)));
  
  for (const cand of candidates) {
    if (selected.length >= cityCount) break;
    
    let tooClose = false;
    for (const sel of selected) {
      const dist = Math.sqrt((cand.x - sel.x) ** 2 + (cand.y - sel.y) ** 2);
      if (dist < minDist) {
        tooClose = true;
        break;
      }
    }
    
    if (!tooClose) {
      selected.push(cand);
    }
  }
  
  // Classificar reinos e tamanhos
  let numCapitals = 1;
  if (cityCount >= 5 && cityCount < 9) numCapitals = 2;
  else if (cityCount >= 9) numCapitals = 3;
  
  const cities = selected.map((c, i) => {
    let type = 'village';
    if (i < numCapitals) {
      type = 'capital';
    } else {
      // Suporte ecológico local
      let support = 0;
      let count = 0;
      const r = 3;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
            const b = grid[ny][nx].biome;
            if (b === 'GRASSLAND' || b === 'TEMP_FOREST' || b === 'SAVANNA' || b === 'JUNGLE') {
              support += 1.0;
            } else if (b === 'DESERT' || b === 'TUNDRA' || b === 'SWAMP' || b === 'SNOW_MOUNTAIN') {
              support += 0.1;
            } else {
              support += 0.2;
            }
            count++;
          }
        }
      }
      const ecoRatio = support / count;
      if (ecoRatio > 0.5) {
        type = 'city';
      }
    }
    // Analisar recursos circundantes para exportação (raio 4)
    const counts = { wood: 0, ore: 0, fish: 0, stone: 0, crops: 0 };
    const radiusRes = 4;
    for (let dy = -radiusRes; dy <= radiusRes; dy++) {
      for (let dx = -radiusRes; dx <= radiusRes; dx++) {
        const nx = c.x + dx;
        const ny = c.y + dy;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
          const res = grid[ny][nx].resource;
          if (res) counts[res]++;
        }
      }
    }
    
    let produces = 'crops';
    let maxCount = 0;
    for (const [res, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        produces = res;
      }
    }
    
    // Complementaridade simples de importação
    let consumes = 'crops';
    if (produces === 'wood') consumes = 'ore';
    else if (produces === 'ore') consumes = 'wood';
    else if (produces === 'crops' || produces === 'fish') consumes = 'stone';
    else if (produces === 'stone') consumes = 'crops';

    const initialPops = { capital: 2000, city: 800, village: 150 };
    const population = initialPops[type] || 150;
    const name = generateCityName(params.seed, i);
    
    // Registrar dados na célula física
    c.cell.cityName = name;
    c.cell.cityType = type;
    c.cell.cityIndex = i;
    c.cell.cityPop = population;
    c.cell.isAbandoned = false;
    
    return {
      x: c.x,
      y: c.y,
      name,
      type,
      index: i,
      population,
      isAbandoned: false,
      military: Math.floor(population * 0.1),
      foodStock: 1000,
      materialStock: 500,
      produces,
      consumes,
      connections: []
    };
  });
  
  return cities;
}

function generateKingdoms(grid, size, cities) {
  const capitals = cities.filter(c => c.type === 'capital');
  const kingdoms = [];
  
  if (capitals.length === 0) return kingdoms;
  
  const queue = [];
  const visited = Array.from({length: size}, () => new Int32Array(size).fill(-1));
  
  capitals.forEach((cap, i) => {
    visited[cap.y][cap.x] = i;
    const name = KINGDOM_NAMES[i % KINGDOM_NAMES.length] || `Reino de ${cap.name}`;
    kingdoms.push({
      id: i,
      name,
      capital: cap,
      colorId: i,
      cells: [{x: cap.x, y: cap.y}]
    });
    
    grid[cap.y][cap.x].kingdomId = i;
    grid[cap.y][cap.x].kingdomName = name;
    
    queue.push({x: cap.x, y: cap.y, kingdomId: i, name, dist: 0});
  });
  
  let head = 0;
  const dirs = [{dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1}];
  
  while (head < queue.length) {
    const curr = queue[head++];
    
    for (const d of dirs) {
      const nx = curr.x + d.dx;
      const ny = curr.y + d.dy;
      
      if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
        const neighbor = grid[ny][nx];
        
        if (neighbor.elevation < 0.26) continue;
        if (neighbor.biome === 'SNOW_MOUNTAIN') continue;
        
        if (visited[ny][nx] === -1) {
          visited[ny][nx] = curr.kingdomId;
          neighbor.kingdomId = curr.kingdomId;
          neighbor.kingdomName = curr.name;
          kingdoms[curr.kingdomId].cells.push({x: nx, y: ny});
          
          queue.push({
            x: nx,
            y: ny,
            kingdomId: curr.kingdomId,
            name: curr.name,
            dist: curr.dist + 1
          });
        }
      }
    }
  }
  
  // Marcar as divisas de reinos (Fronteiras)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      if (cell.elevation >= 0.26 && cell.kingdomId !== undefined) {
        let isFrontier = false;
        for (const d of dirs) {
          const nx = x + d.dx;
          const ny = y + d.dy;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
            const neighbor = grid[ny][nx];
            if (neighbor.elevation >= 0.26 && neighbor.kingdomId !== undefined && neighbor.kingdomId !== cell.kingdomId) {
              isFrontier = true;
              break;
            }
          }
        }
        cell.isFrontier = isFrontier;
      }
    }
  }
  
  // Associar vilas/cidades sem capital ao reino territorial onde caíram
  for (const city of cities) {
    if (city.type !== 'capital') {
      const cell = grid[city.y][city.x];
      if (cell.kingdomId !== undefined) {
        city.kingdomId = cell.kingdomId;
        city.kingdomName = cell.kingdomName;
      }
    }
  }
  
  return kingdoms;
}

function findPathAStar(grid, size, start, end) {
  const openSet = new Set();
  const closedSet = new Set();
  const startKey = `${start.x},${start.y}`;
  const endKey = `${end.x},${end.y}`;
  
  const cameFrom = new Map();
  const gScore = new Map();
  const fScore = new Map();
  
  gScore.set(startKey, 0);
  fScore.set(startKey, Math.abs(start.x - end.x) + Math.abs(start.y - end.y));
  
  openSet.add(startKey);
  
  const dirs = [
    {dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1},
    {dx: 1, dy: 1}, {dx: -1, dy: -1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}
  ];
  
  let steps = 0;
  const maxSteps = size * size * 2;
  
  while (openSet.size > 0 && steps < maxSteps) {
    steps++;
    let currentKey = null;
    let minF = Infinity;
    for (const key of openSet) {
      const f = fScore.get(key) ?? Infinity;
      if (f < minF) {
        minF = f;
        currentKey = key;
      }
    }
    
    if (currentKey === endKey) {
      const path = [];
      let temp = currentKey;
      while (cameFrom.has(temp)) {
        const [tx, ty] = temp.split(',').map(Number);
        path.push({x: tx, y: ty});
        temp = cameFrom.get(temp);
      }
      path.push({x: start.x, y: start.y});
      return path.reverse();
    }
    
    openSet.delete(currentKey);
    closedSet.add(currentKey);
    
    const [cx, cy] = currentKey.split(',').map(Number);
    const currentCell = grid[cy][cx];
    
    for (const d of dirs) {
      const nx = cx + d.dx;
      const ny = cy + d.dy;
      
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      const neighborKey = `${nx},${ny}`;
      
      if (closedSet.has(neighborKey)) continue;
      
      const neighbor = grid[ny][nx];
      
      // Não atravessar água
      if (neighbor.elevation < 0.26 || neighbor.isLake) continue;
      if (neighbor.biome === 'DEEP_OCEAN' || neighbor.biome === 'SHALLOW_OCEAN') continue;
      
      const isDiagonal = d.dx !== 0 && d.dy !== 0;
      let cost = isDiagonal ? 1.414 : 1.0;
      
      // Inclinação do terreno (diferença de altura)
      const diffElev = Math.abs(neighbor.elevation - currentCell.elevation);
      cost += diffElev * 15.0;
      
      // Penalidades de biomas difíceis
      if (neighbor.biome === 'SNOW_MOUNTAIN') cost += 20.0;
      if (neighbor.biome === 'SWAMP') cost += 6.0;
      if (neighbor.biome === 'JUNGLE') cost += 2.0;
      if (neighbor.biome === 'DESERT') cost += 1.5;
      
      // Cruzar rio
      if (neighbor.isRiver) cost += 4.0;
      
      // Incentivo de estrada compartilhada
      if (neighbor.isRoad) {
        cost = 0.15;
      }
      
      const tentativeGScore = (gScore.get(currentKey) ?? 0) + cost;
      
      if (!openSet.has(neighborKey)) {
        openSet.add(neighborKey);
      } else if (tentativeGScore >= (gScore.get(neighborKey) ?? Infinity)) {
        continue;
      }
      
      cameFrom.set(neighborKey, currentKey);
      gScore.set(neighborKey, tentativeGScore);
      
      const h = Math.abs(nx - end.x) + Math.abs(ny - end.y);
      fScore.set(neighborKey, tentativeGScore + h);
    }
  }
  
  return null;
}

function generateRoutes(grid, size, cities) {
  const routes = [];
  if (cities.length <= 1) return routes;
  
  for (let i = 0; i < cities.length; i++) {
    const c1 = cities[i];
    const distances = [];
    
    for (let j = 0; j < cities.length; j++) {
      if (i === j) continue;
      const c2 = cities[j];
      const dist = Math.sqrt((c1.x - c2.x) ** 2 + (c1.y - c2.y) ** 2);
      distances.push({index: j, city: c2, dist});
    }
    
    distances.sort((a, b) => a.dist - b.dist);
    const targets = distances.slice(0, Math.min(2, distances.length));
    
    for (const target of targets) {
      const pathId = i < target.index ? `${i}_to_${target.index}` : `${target.index}_to_${i}`;
      if (routes.some(r => r.id === pathId)) continue;
      
      const path = findPathAStar(grid, size, c1, target.city);
      if (path && path.length > 0) {
        routes.push({
          id: pathId,
          start: c1,
          end: target.city,
          path
        });
        
        for (const pt of path) {
          grid[pt.y][pt.x].isRoad = true;
        }
      }
    }
  }
  
  return routes;
}

function generateDungeons(grid, size, params) {
  const dungeons = [];
  const dungeonCount = 3 + (hash32(params.seed + 888) % 4); // de 3 a 6
  
  const candidates = [];
  for (let y = 3; y < size - 3; y++) {
    for (let x = 3; x < size - 3; x++) {
      const cell = grid[y][x];
      if (cell.elevation < 0.26) continue;
      if (cell.cityName) continue;
      if (cell.isRoad) continue;
      
      let type = null;
      if (cell.biome === 'JUNGLE' || cell.biome === 'TEMP_FOREST') {
        type = 'temple';
      } else if (cell.biome === 'DESERT' || cell.biome === 'TUNDRA' || cell.biome === 'SWAMP') {
        type = 'ruins';
      }
      
      if (type) {
        candidates.push({x, y, type, cell});
      }
    }
  }
  
  if (candidates.length === 0) return dungeons;
  
  // Embaralhamento determinístico por semente
  const seededRandom = (s) => {
    let x = Math.sin(s) * 10000;
    return x - Math.floor(x);
  };
  
  let s = params.seed + 999;
  for (let i = candidates.length - 1; i > 0; i--) {
    const r = Math.floor(seededRandom(s++) * (i + 1));
    const temp = candidates[i];
    candidates[i] = candidates[r];
    candidates[r] = temp;
  }
  
  let selectedCount = 0;
  for (const cand of candidates) {
    if (selectedCount >= dungeonCount) break;
    
    // Distância das cidades
    let farEnough = true;
    if (grid.cities) {
      for (const city of grid.cities) {
        const dist = Math.sqrt((cand.x - city.x) ** 2 + (cand.y - city.y) ** 2);
        if (dist < 10) {
          farEnough = false;
          break;
        }
      }
    }
    
    // Distância de outras dungeons
    if (farEnough) {
      for (const dung of dungeons) {
        const dist = Math.sqrt((cand.x - dung.x) ** 2 + (cand.y - dung.y) ** 2);
        if (dist < 10) {
          farEnough = false;
          break;
        }
      }
    }
    
    if (farEnough) {
      let name = '';
      const hash = hash32(params.seed + selectedCount * 456);
      if (cand.type === 'temple') {
        name = DUNGEON_TEMPLE_NAMES[hash % DUNGEON_TEMPLE_NAMES.length];
      } else {
        name = DUNGEON_RUINS_NAMES[hash % DUNGEON_RUINS_NAMES.length];
      }
      
      cand.cell.dungeonName = name;
      cand.cell.dungeonType = cand.type;
      
      dungeons.push({
        x: cand.x,
        y: cand.y,
        name,
        type: cand.type
      });
      selectedCount++;
    }
  }
  
  return dungeons;
}

export function simulateHistoryYear(grid, size, params) {
  grid.historyYear = (grid.historyYear || 0) + 1;
  const year = grid.historyYear;
  const chronicles = [];

  const cities = grid.cities || [];
  const kingdoms = grid.kingdoms || [];
  grid.activeWars = grid.activeWars || [];

  if (cities.length === 0) return chronicles;

  // 1. HARVEST, CONSUMPTION, AND GROWTH/DECLINE PHASE
  cities.forEach(city => {
    if (city.isAbandoned) return;

    // Gather local resources within radius 3
    const r = 3;
    let foodCollected = 0;
    let materialCollected = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = city.x + dx;
        const ny = city.y + dy;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
          const cell = grid[ny][nx];
          if (cell.resource === 'crops' || cell.resource === 'fish') {
            foodCollected += 12;
          } else if (cell.resource === 'wood' || cell.resource === 'stone') {
            materialCollected += 8;
          }
        }
      }
    }

    // Typical city production (bonus from export resource)
    if (city.produces === 'crops' || city.produces === 'fish') foodCollected += 40;
    else materialCollected += 30;

    // Accumulate stock
    city.foodStock += foodCollected;
    city.materialStock += materialCollected;

    // Consumption based on population
    const foodConsumed = Math.ceil(city.population * 0.12);
    const materialConsumed = Math.ceil(city.population * 0.04);

    if (city.foodStock >= foodConsumed) {
      city.foodStock -= foodConsumed;
      
      // Population growth
      let growRate = 1.02 + (hash32(params.seed + city.index * 17 + year) % 40) / 1000; // 2% to 6% per year
      if (city.connections.length > 0) {
        growRate += 0.015; // Commercial trade bonus
      }
      const prevPop = city.population;
      city.population = Math.floor(city.population * growRate);
      
      // Evoluções de categoria
      if (city.type === 'village' && city.population > 600) {
        city.type = 'city';
        const cell = grid[city.y][city.x];
        cell.cityType = 'city';
        chronicles.push({
          type: 'growth-msg',
          text: `Ano ${year}: A vila de ${city.name} prosperou e tornou-se uma Cidade! (Pop: ${city.population})`,
          x: city.x,
          y: city.y
        });
      } else if (city.type === 'city' && city.population > 2500) {
        city.type = 'capital';
        const cell = grid[city.y][city.x];
        cell.cityType = 'capital';
        chronicles.push({
          type: 'growth-msg',
          text: `Ano ${year}: A cidade de ${city.name} tornou-se uma metrópole e nova Capital! (Pop: ${city.population})`,
          x: city.x,
          y: city.y
        });
      }
    } else {
      // Famine / Decline
      const prevPop = city.population;
      city.population = Math.max(10, Math.floor(city.population * 0.92)); // loses 8% of the population
      city.foodStock = 0; // depleted food stock
      
      // Demotions
      if (city.type === 'capital' && city.population < 1500) {
        // Only demotes if not the sole capital of the kingdom
        const kId = city.kingdomId;
        const otherCapitals = cities.filter(c => c.kingdomId === kId && c.type === 'capital' && c.index !== city.index);
        if (otherCapitals.length > 0) {
          city.type = 'city';
          grid[city.y][city.x].cityType = 'city';
          chronicles.push({
            type: 'decay-msg',
            text: `Ano ${year}: A capital ${city.name} encolheu devido à fome e perdeu o status de capital.`,
            x: city.x,
            y: city.y
          });
        }
      } else if (city.type === 'city' && city.population < 400) {
        city.type = 'village';
        grid[city.y][city.x].cityType = 'village';
        chronicles.push({
          type: 'decay-msg',
          text: `Ano ${year}: A cidade de ${city.name} decaiu para o status de Vila devido ao declínio populacional.`,
          x: city.x,
          y: city.y
        });
      } else if (city.population < 30) {
        city.isAbandoned = true;
        const cell = grid[city.y][city.x];
        cell.isAbandoned = true;
        cell.cityName = `${cell.cityName} (Ruínas)`;
        cell.cityType = 'village';
        
        // Remove kingdom allegiance
        cell.kingdomId = undefined;
        cell.kingdomName = undefined;
        
        chronicles.push({
          type: 'decay-msg',
          text: `Ano ${year}: 💀 A cidade de ${city.name} foi completamente abandonada devido à fome extrema!`,
          x: city.x,
          y: city.y
        });
      }
    }
    
    // Update military power
    city.military = Math.floor(city.population * 0.12);
    if (city.produces === 'ore') {
      city.military = Math.floor(city.military * 1.3);
    }
    
    // Update physical grid cell attributes
    grid[city.y][city.x].cityPop = city.population;
  });

  // 2. COMPLEMENTARY TRADE PHASE
  cities.forEach(cityA => {
    if (cityA.isAbandoned) return;
    
    const needsTrade = cityA.materialStock < 200 || cityA.foodStock < 300;
    
    if (needsTrade && cityA.connections.length < 3) {
      for (const cityB of cities) {
        if (cityB.index === cityA.index || cityB.isAbandoned) continue;
        
        const isComplementary = cityB.produces === cityA.consumes && cityB.consumes === cityA.produces;
        const alreadyConnected = cityA.connections.includes(cityB.index);
        
        if (isComplementary && !alreadyConnected) {
          const routePath = findPathAStar(grid, size, cityA, cityB);
          if (routePath && routePath.length > 0) {
            cityA.connections.push(cityB.index);
            cityB.connections.push(cityA.index);
            
            routePath.forEach(pt => {
              grid[pt.y][pt.x].isRoad = true;
              grid[pt.y][pt.x].isTradeRoute = true;
            });
            
            grid.routes = grid.routes || [];
            const pathId = cityA.index < cityB.index ? `${cityA.index}_to_${cityB.index}` : `${cityB.index}_to_${cityA.index}`;
            if (!grid.routes.some(r => r.id === pathId)) {
              grid.routes.push({
                id: pathId,
                start: cityA,
                end: cityB,
                path: routePath
              });
            }
            
            chronicles.push({
              type: 'trade-msg',
              text: `Ano ${year}: 🌾 Rota comercial aberta entre ${cityA.name} e ${cityB.name} (Troca de ${cityA.produces} por ${cityB.consumes}).`,
              x: Math.floor((cityA.x + cityB.x) / 2),
              y: Math.floor((cityA.y + cityB.y) / 2)
            });
            
            cityA.foodStock += 200;
            cityA.materialStock += 200;
            cityB.foodStock += 200;
            cityB.materialStock += 200;
            break;
          }
        }
      }
    }
  });

  // 3. FASE DE GUERRA E GEOPOLÍTICA (Voronoi Geográfico Dinâmico)
  if (grid.activeWars.length === 0 && kingdoms.length > 1) {
    const chance = hash32(params.seed + year) % 100;
    if (chance < 8) {
      const borderPairs = [];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const cell = grid[y][x];
          if (cell.isFrontier && cell.kingdomId !== undefined) {
            const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
            for (const d of dirs) {
              const nx = x + d.dx;
              const ny = y + d.dy;
              if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                const neighbor = grid[ny][nx];
                if (neighbor.kingdomId !== undefined && neighbor.kingdomId !== cell.kingdomId) {
                  const pairId = cell.kingdomId < neighbor.kingdomId ? `${cell.kingdomId}_vs_${neighbor.kingdomId}` : `${neighbor.kingdomId}_vs_${cell.kingdomId}`;
                  if (!borderPairs.includes(pairId)) {
                    borderPairs.push(pairId);
                  }
                }
              }
            }
          }
        }
      }
      
      if (borderPairs.length > 0) {
        const chosenPair = borderPairs[hash32(params.seed + year * 3) % borderPairs.length];
        const [k1, k2] = chosenPair.split('_vs_').map(Number);
        
        const reino1 = kingdoms.find(k => k.id === k1);
        const reino2 = kingdoms.find(k => k.id === k2);
        
        if (reino1 && reino2 && !reino1.isDestroyed && !reino2.isDestroyed) {
          grid.activeWars.push({
            attackerId: k1,
            defenderId: k2,
            duration: 0
          });
          chronicles.push({
            type: 'war-msg',
            text: `Ano ${year}: ⚔️ O Reino de ${reino1.name} declarou guerra contra o Reino de ${reino2.name} por disputas territoriais!`,
            x: Math.floor((reino1.capitalX || reino1.x || 0 + reino2.capitalX || reino2.x || 0) / 2),
            y: Math.floor((reino1.capitalY || reino1.y || 0 + reino2.capitalY || reino2.y || 0) / 2)
          });
        }
      }
    }
  }

  for (let wIdx = grid.activeWars.length - 1; wIdx >= 0; wIdx--) {
    const war = grid.activeWars[wIdx];
    war.duration++;

    const attacker = kingdoms.find(k => k.id === war.attackerId);
    const defender = kingdoms.find(k => k.id === war.defenderId);

    if (!attacker || !defender || attacker.isDestroyed || defender.isDestroyed) {
      grid.activeWars.splice(wIdx, 1);
      continue;
    }

    const attPower = cities.filter(c => c.kingdomId === attacker.id && !c.isAbandoned).reduce((sum, c) => sum + c.military, 0);
    const defPower = cities.filter(c => c.kingdomId === defender.id && !c.isAbandoned).reduce((sum, c) => sum + c.military, 0);

    if (attPower === 0 || defPower === 0) {
      grid.activeWars.splice(wIdx, 1);
      continue;
    }

    const winnerId = attPower > defPower ? attacker.id : defender.id;
    const winnerName = attPower > defPower ? attacker.name : defender.name;
    const loserId = winnerId === attacker.id ? defender.id : attacker.id;

    const frontierCells = [];
    const dirs = [{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const cell = grid[y][x];
        if (cell.kingdomId === loserId) {
          let bordersWinner = false;
          for (const d of dirs) {
            const nx = x + d.dx;
            const ny = y + d.dy;
            if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
              if (grid[ny][nx].kingdomId === winnerId) {
                bordersWinner = true;
                break;
              }
            }
          }
          if (bordersWinner) {
            frontierCells.push(cell);
          }
        }
      }
    }

    const cellsToConvert = Math.min(frontierCells.length, 4);
    for (let i = 0; i < cellsToConvert; i++) {
      const idx = hash32(params.seed + year * 7 + i) % frontierCells.length;
      const cell = frontierCells[idx];
      cell.kingdomId = winnerId;
      cell.kingdomName = winnerName;
      
      if (cell.cityName && !cell.isAbandoned) {
        const city = cities.find(c => c.x === cell.x && c.y === cell.y);
        if (city && city.kingdomId === loserId) {
          city.kingdomId = winnerId;
          city.kingdomName = winnerName;
          
          if (city.type === 'capital') {
            defender.isDestroyed = true;
            
            cities.forEach(c => {
              if (c.kingdomId === loserId) {
                c.kingdomId = winnerId;
                c.kingdomName = winnerName;
                grid[c.y][c.x].kingdomId = winnerId;
                grid[c.y][c.x].kingdomName = winnerName;
              }
            });
            for (let cy = 0; cy < size; cy++) {
              for (let cx = 0; cx < size; cx++) {
                if (grid[cy][cx].kingdomId === loserId) {
                  grid[cy][cx].kingdomId = winnerId;
                  grid[cy][cx].kingdomName = winnerName;
                }
              }
            }
            
            chronicles.push({
              type: 'war-msg',
              text: `Ano ${year}: 👑 A capital ${city.name} caiu! O Reino de ${defender.name} foi totalmente conquistado e anexado por ${attacker.name}!`,
              x: city.x,
              y: city.y
            });
            
            grid.activeWars.splice(wIdx, 1);
            break;
          } else {
            chronicles.push({
              type: 'war-msg',
              text: `Ano ${year}: ⚔️ A cidade de ${city.name} foi capturada pelas forças de ${winnerName}!`,
              x: city.x,
              y: city.y
            });
            
            if ((hash32(params.seed + year) % 10) < 4) {
              grid.activeWars.splice(wIdx, 1);
              chronicles.push({
                type: 'system-msg',
                text: `Ano ${year}: 🏳️ Um tratado de paz foi assinado. O Reino de ${winnerName} manteve o controle de ${city.name}.`,
                x: city.x,
                y: city.y
              });
              break;
            }
          }
        }
      }
    }

    if (grid.activeWars[wIdx] && war.duration > 8) {
      grid.activeWars.splice(wIdx, 1);
      chronicles.push({
        type: 'system-msg',
        text: `Ano ${year}: 🏳️ Os reinos de ${attacker.name} e ${defender.name} assinaram um armistício devido à exaustão de combate.`,
        x: Math.floor((attacker.capitalX || attacker.x || 0 + defender.capitalX || defender.x || 0) / 2),
        y: Math.floor((attacker.capitalY || attacker.y || 0 + defender.capitalY || defender.y || 0) / 2)
      });
    }
  }

  // 5. ENVIRONMENTAL EVENTS (Natural Disasters - 2% annual chance)
  const disasterChance = hash32(params.seed + year * 11) % 100;
  if (disasterChance < 2 && cities.length > 0) {
    const activeCities = cities.filter(c => !c.isAbandoned);
    if (activeCities.length > 0) {
      const chosenCity = activeCities[hash32(params.seed + year * 13) % activeCities.length];
      chosenCity.foodStock = Math.max(0, chosenCity.foodStock - 400);
      chosenCity.population = Math.max(10, Math.floor(chosenCity.population * 0.90)); // Loses 10% of population
      chronicles.push({
        type: 'decay-msg',
        text: `Ano ${year}: 🌪️ Um desastre climático atingiu ${chosenCity.name}, destruindo plantações e dizimando recursos!`,
        x: chosenCity.x,
        y: chosenCity.y
      });
    }
  }

  // 6. EXPLORATION EVENTS (Dungeon Expeditions - 4% annual chance)
  const expeditionChance = hash32(params.seed + year * 17) % 100;
  if (expeditionChance < 4 && grid.dungeons && grid.dungeons.length > 0 && kingdoms.length > 0) {
    const activeKingdoms = kingdoms.filter(k => !k.isDestroyed);
    if (activeKingdoms.length > 0) {
      const chosenKingdom = activeKingdoms[hash32(params.seed + year * 19) % activeKingdoms.length];
      const kingdomCities = cities.filter(c => c.kingdomId === chosenKingdom.id && !c.isAbandoned);
      
      if (kingdomCities.length > 0) {
        // Find closest dungeon to the kingdom's capital
        const capital = kingdomCities.find(c => c.type === 'capital') || kingdomCities[0];
        let closestDungeon = grid.dungeons[0];
        let minDist = Infinity;
        
        for (const dung of grid.dungeons) {
          const dist = Math.sqrt((dung.x - capital.x)**2 + (dung.y - capital.y)**2);
          if (dist < minDist) {
            minDist = dist;
            closestDungeon = dung;
          }
        }
        
        const milPower = kingdomCities.reduce((sum, c) => sum + c.military, 0);
        const successLimit = closestDungeon.type === 'temple' ? 250 : 150;
        
        if (milPower >= successLimit) {
          // Success
          kingdomCities.forEach(c => {
            c.foodStock += 150;
            c.materialStock += 150;
          });
          chronicles.push({
            type: 'growth-msg',
            text: `Ano ${year}: ⛩️ Expedição do Reino de ${chosenKingdom.name} conquistou ${closestDungeon.name} e trouxe tesouros!`,
            x: closestDungeon.x,
            y: closestDungeon.y
          });
        } else {
          // Failure
          kingdomCities.forEach(c => {
            c.population = Math.max(10, Math.floor(c.population * 0.95)); // Loses 5% of military force
          });
          chronicles.push({
            type: 'decay-msg',
            text: `Ano ${year}: 🏛️ Expedição do Reino de ${chosenKingdom.name} falhou em explorar ${closestDungeon.name} com pesadas baixas.`,
            x: closestDungeon.x,
            y: closestDungeon.y
          });
        }
      }
    }
  }

  // 4. RECOMPUTE GEOPOLITICAL BORDERS
  const dirs4 = [{dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1}];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      cell.isFrontier = false;
      if (cell.elevation >= 0.26 && cell.kingdomId !== undefined) {
        let isFrontier = false;
        for (const d of dirs4) {
          const nx = x + d.dx;
          const ny = y + d.dy;
          if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
            const neighbor = grid[ny][nx];
            if (neighbor.elevation >= 0.26 && neighbor.kingdomId !== undefined && neighbor.kingdomId !== cell.kingdomId) {
              isFrontier = true;
              break;
            }
          }
        }
        cell.isFrontier = isFrontier;
      }
    }
  }

  return chronicles;
}

