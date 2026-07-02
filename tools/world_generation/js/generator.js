import { hash32, ImprovedNoise } from './noise.js';

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

export function classifyBiome(e, m, t) {
  if (e < BIOME_THRESHOLDS.DEEP_OCEAN) return 'DEEP_OCEAN';
  if (e < BIOME_THRESHOLDS.SHALLOW_OCEAN) return 'SHALLOW_OCEAN';
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
      // Elevation generation using FBM
      let elevation = 0;
      let amplitude = 1;
      let frequency = params.elevScale;
      let maxVal = 0;
      for (let o = 0; o < params.elevOctaves; o++) {
        elevation += amplitude * elevNoise.noise(x * frequency, y * frequency);
        maxVal += amplitude;
        amplitude *= params.elevPersistence;
        frequency *= 2;
      }
      elevation = (elevation / maxVal + 1) / 2; // Normalize from [-1, 1] to [0, 1]

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
      
      // Calculate latitudeFactor based on chosen model
      let latitudeFactor = 0.5;
      if (tempModel === 'planet') {
        latitudeFactor = 1.0 - Math.abs(2 * (y / (size - 1)) - 1);
      } else if (tempModel === 'inclined') {
        const d = -Math.sin(angle) * (x - centerX) + Math.cos(angle) * (y - centerY);
        latitudeFactor = 1.0 - Math.min(1.0, Math.abs(d) / (maxDist / 2));
      } else if (tempModel === 'noise') {
        // Low frequency noise with 2 octaves
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
      
      const temp = latitudeFactor * (1.0 - params.tempAltWeight * elevation);
      
      grid[y][x] = {
        x, y,
        elevation,
        moisture,
        temperature: temp,
        biome: classifyBiome(elevation, moisture, temp)
      };
    }
  }
  return grid;
}
