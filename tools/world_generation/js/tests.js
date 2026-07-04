import { ImprovedNoise } from './noise.js';
import { classifyBiome, generateWorldData } from './generator.js';

export function runNoiseTests() {
  console.log("Initializing noise generator tests...");
  const n1 = new ImprovedNoise(12345);
  const val1 = n1.noise(0.5, 0.5);
  const val2 = n1.noise(0.5, 0.5);
  
  // Test 1: Determinism
  console.assert(val1 === val2, "ERROR: Noise must be deterministic for the same coordinate.");
  
  // Test 2: Seed independence
  const n2 = new ImprovedNoise(54321);
  const val3 = n2.noise(0.5, 0.5);
  console.assert(val1 !== val3, "ERROR: Different seeds must yield different values.");
  
  // Test 3: Boundary check
  const val4 = n1.noise(10.123, -4.567);
  console.assert(val4 >= -1.0 && val4 <= 1.0, "ERROR: Raw noise value must be between -1.0 and 1.0.");
  
  console.log("✅ Noise tests completed successfully!");
}

export function runBiomeTests() {
  console.log("Initializing biome classification tests...");
  
  // Test 1: Deep Ocean
  console.assert(classifyBiome(0.10, 0.5, 0.5) === 'DEEP_OCEAN', 'Error: 0.10 elevation must yield DEEP_OCEAN');
  
  // Test 2: Beach
  console.assert(classifyBiome(0.24, 0.5, 0.5) === 'BEACH', 'Error: 0.24 elevation must yield BEACH');
  
  // Test 3: Desert (Hot + Dry)
  console.assert(classifyBiome(0.5, 0.1, 0.8) === 'DESERT', 'Error: Elevation=0.5, Moisture=0.1, Temp=0.8 must yield DESERT');
  
  // Test 4: Jungle (Hot + Wet)
  console.assert(classifyBiome(0.5, 0.8, 0.8) === 'JUNGLE', 'Error: Elevation=0.5, Moisture=0.8, Temp=0.8 must yield JUNGLE');
  
  // Test 5: Swamp (Temperate + Very Wet + Low Elevation)
  console.assert(classifyBiome(0.40, 0.8, 0.5) === 'SWAMP', 'Error: Elevation=0.40, Moisture=0.8, Temp=0.5 must yield SWAMP');
  
  // Test 6: Temperate Forest (Temperate + Very Wet + High Elevation)
  console.assert(classifyBiome(0.60, 0.8, 0.5) === 'TEMP_FOREST', 'Error: Elevation=0.60, Moisture=0.8, Temp=0.5 must yield TEMP_FOREST');

  // Test 7: Snowy Peaks
  console.assert(classifyBiome(0.85, 0.5, 0.2) === 'SNOW_MOUNTAIN', 'Error: Elevation=0.85 must yield SNOW_MOUNTAIN');

  console.log("✅ Biome classification tests completed successfully!");
}

export function runTempModelTests() {
  console.log("Initializing temperature model tests...");
  const params = {
    seed: 12345,
    gridSize: 50,
    elevScale: 0.03,
    elevOctaves: 4,
    elevPersistence: 0.5,
    moistScale: 0.04,
    moistOctaves: 3,
    tempAltWeight: 0.7,
    tempModel: 'planet'
  };
  
  const grid1 = generateWorldData(params);
  console.assert(grid1[0][0].temperature !== undefined, "Error: Temperature must be calculated");
  
  params.tempModel = 'noise';
  const grid2 = generateWorldData(params);
  console.assert(grid1[25][25].temperature !== grid2[25][25].temperature, "Error: Temperatures should vary between Planet and Noise models");
  
  console.log("✅ Temperature model tests completed successfully!");
}

export function runRefinementTests() {
  console.log("Initializing procedural refinements tests...");
  const params = {
    seed: 54321,
    gridSize: 50,
    elevScale: 0.03,
    elevOctaves: 4,
    elevPersistence: 0.5,
    moistScale: 0.04,
    moistOctaves: 3,
    tempAltWeight: 0.7,
    tempModel: 'planet',
    warpStrength: 0,
    erosionStrength: 0
  };
  
  // Baseline (without warp or erosion)
  const gridBase = generateWorldData(params);
  
  // Test 1: Domain Warping changes elevation values
  params.warpStrength = 10;
  const gridWarp = generateWorldData(params);
  console.assert(gridBase[25][25].elevation !== gridWarp[25][25].elevation, "Error: Warp must alter the elevation grid");
  
  // Test 2: Erosion changes elevation and produces only valid numbers
  params.warpStrength = 0;
  params.erosionStrength = 1.5;
  const gridErosion = generateWorldData(params);
  let changed = false;
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const e = gridErosion[y][x].elevation;
      console.assert(!isNaN(e) && isFinite(e), `Error: Elevation is invalid (${e}) after erosion`);
      if (gridBase[y][x].elevation !== e) {
        changed = true;
      }
    }
  }
  console.assert(changed, "Error: Erosion must modify at least some cells in the elevation grid");
  
  console.log("✅ Procedural refinements tests completed successfully!");
}

export function runRiverTests() {
  console.log("Initializing river generator tests...");
  
  const params = {
    seed: 98765432,
    gridSize: 50,
    elevScale: 0.03,
    elevOctaves: 4,
    elevPersistence: 0.5,
    moistScale: 0.04,
    moistOctaves: 3,
    tempAltWeight: 0.7,
    tempModel: 'planet',
    warpStrength: 5,
    erosionStrength: 0.0,
    riverCount: 5,
    riverMoistRadius: 3,
    riverMoistStrength: 0.6
  };

  // Test 1: Determinism
  const grid1 = generateWorldData(params);
  const grid2 = generateWorldData(params);
  
  let riverCount1 = 0;
  let lakeCount1 = 0;
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const c1 = grid1[y][x];
      const c2 = grid2[y][x];
      
      console.assert(c1.isRiver === c2.isRiver, `Error: River flag mismatch at ${x},${y}`);
      console.assert(c1.isLake === c2.isLake, `Error: Lake flag mismatch at ${x},${y}`);
      console.assert(c1.biome === c2.biome, `Error: Biome mismatch at ${x},${y}`);
      
      if (c1.isRiver) riverCount1++;
      if (c1.isLake) lakeCount1++;
    }
  }
  console.assert(riverCount1 > 0 || lakeCount1 > 0, "Error: Rivers should be generated");

  // Test 2: Downhill Flow
  // For each river cell, verify its downhill flow to water
  const dirs = [
    {dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1},
    {dx: 1, dy: 1}, {dx: -1, dy: -1}, {dx: 1, dy: -1}, {dx: -1, dy: 1}
  ];
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const cell = grid1[y][x];
      if (cell.isRiver) {
        // A river cell must flow to a neighbor that is lower, or is ocean, or is river/lake.
        let hasValidFlow = false;
        for (const d of dirs) {
          const nx = x + d.dx;
          const ny = y + d.dy;
          if (nx >= 0 && nx < 50 && ny >= 0 && ny < 50) {
            const n = grid1[ny][nx];
            if (n.elevation < 0.26 || n.elevation <= cell.elevation || n.isRiver || n.isLake) {
              hasValidFlow = true;
              break;
            }
          }
        }
        console.assert(hasValidFlow, `Error: River at ${x},${y} has no downhill flow or water connection.`);
      }
    }
  }

  // Test 3: Moisture boost isolation
  const paramsNoRivers = { ...params, riverCount: 0 };
  const gridNoRivers = generateWorldData(paramsNoRivers);
  
  // Find all river/lake cells in grid1
  const waterSources = [];
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const cell = grid1[y][x];
      if ((cell.isRiver || cell.isLake) && cell.elevation >= 0.26) {
        waterSources.push({x, y});
      }
    }
  }

  // Assert that moisture outside the radius remains completely unaltered
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const cellWithRiver = grid1[y][x];
      const cellNoRiver = gridNoRivers[y][x];
      
      let minDist = Infinity;
      for (const src of waterSources) {
        // BFS queue distance (8-way grid steps)
        const dist = Math.max(Math.abs(x - src.x), Math.abs(y - src.y));
        if (dist < minDist) minDist = dist;
      }
      
      if (minDist > params.riverMoistRadius) {
        const diff = Math.abs(cellWithRiver.moisture - cellNoRiver.moisture);
        console.assert(diff < 1e-7, `Error: Moisture leaked outside radius at ${x},${y}. Diff: ${diff}`);
      }
    }
  }

  console.log("✅ River generator tests completed successfully!");
}

export function runAllTests() {
  runNoiseTests();
  runBiomeTests();
  runTempModelTests();
  runRefinementTests();
  runRiverTests();
}
