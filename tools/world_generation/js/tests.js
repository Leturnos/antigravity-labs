import { ImprovedNoise } from './noise.js';
import { classifyBiome, generateWorldData, simulateHistoryYear, serializeWorld } from './generator.js';

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

export function runPhase3Tests() {
  console.log("Initializing Phase 3 generator tests...");
  
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
    riverMoistStrength: 0.6,
    
    // Phase 3 params
    cityCount: 5
  };

  const grid = generateWorldData(params);

  // Test 1: Cidades geradas e contadas corretamente
  console.assert(grid.cities !== undefined, "Error: Cities must be generated.");
  console.assert(grid.cities.length === params.cityCount, `Error: Expected ${params.cityCount} cities, got ${grid.cities.length}`);

  // Test 2: Posicionamento ecológico e regras de cidades
  grid.cities.forEach(city => {
    const cell = grid[city.y][city.x];
    console.assert(cell.elevation >= 0.26, `Error: City ${city.name} placed on water at ${city.x},${city.y}`);
    console.assert(cell.biome !== 'SNOW_MOUNTAIN', `Error: City ${city.name} placed on snow peaks`);
    console.assert(cell.biome !== 'SWAMP', `Error: City ${city.name} placed on swamp`);
  });

  // Test 3: Distância mínima respeitada
  const minDist = Math.max(6, Math.floor(50 / (Math.sqrt(params.cityCount) * 1.6)));
  for (let i = 0; i < grid.cities.length; i++) {
    for (let j = i + 1; j < grid.cities.length; j++) {
      const c1 = grid.cities[i];
      const c2 = grid.cities[j];
      const dist = Math.sqrt((c1.x - c2.x) ** 2 + (c1.y - c2.y) ** 2);
      console.assert(dist >= minDist - 0.5, `Error: Cities too close! ${c1.name} and ${c2.name} at distance ${dist}`);
    }
  }

  // Test 4: Reinos e capitais definidos
  console.assert(grid.kingdoms !== undefined && grid.kingdoms.length > 0, "Error: Kingdoms must be generated.");
  const capitals = grid.cities.filter(c => c.type === 'capital');
  console.assert(capitals.length === grid.kingdoms.length, "Error: Number of kingdoms must match number of capitals.");

  // Test 5: A* Pathfinding de estradas comerciais
  console.assert(grid.routes !== undefined, "Error: Routes must be generated.");
  grid.routes.forEach(route => {
    route.path.forEach(pt => {
      const cell = grid[pt.y][pt.x];
      console.assert(cell.elevation >= 0.26, "Error: Road crossing ocean.");
      console.assert(!cell.isLake, "Error: Road crossing lake.");
    });
  });

  // Test 6: Recursos naturais coerentes com biomas
  let resourceCount = 0;
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      const cell = grid[y][x];
      if (cell.resource) {
        resourceCount++;
        if (cell.resource === 'wood') {
          console.assert(cell.biome === 'TEMP_FOREST' || cell.biome === 'JUNGLE', "Error: Wood resource outside forest/jungle.");
        } else if (cell.resource === 'ore') {
          console.assert(cell.biome === 'SNOW_MOUNTAIN', "Error: Ore resource outside mountain peaks.");
        } else if (cell.resource === 'stone') {
          console.assert(cell.biome === 'DESERT' || cell.biome === 'TUNDRA', "Error: Stone resource outside desert/tundra.");
        } else if (cell.resource === 'crops') {
          console.assert(cell.biome === 'SAVANNA' || cell.biome === 'GRASSLAND', "Error: Crops resource outside savanna/grassland.");
        }
      }
    }
  }
  console.assert(resourceCount > 0, "Error: No natural resources generated.");

  // Test 7: Dungeons geradas corretamente
  console.assert(grid.dungeons !== undefined && grid.dungeons.length >= 3, "Error: Expected at least 3 dungeons.");
  grid.dungeons.forEach(dung => {
    const cell = grid[dung.y][dung.x];
    if (dung.type === 'temple') {
      console.assert(cell.biome === 'JUNGLE' || cell.biome === 'TEMP_FOREST', "Error: Temple dungeon outside forest/jungle.");
    } else {
      console.assert(cell.biome === 'DESERT' || cell.biome === 'TUNDRA' || cell.biome === 'SWAMP', "Error: Ruins dungeon outside hostile biome.");
    }
  });

  console.log("✅ Phase 3 generator tests completed successfully!");
}

export function runHistoryTests() {
  console.log("Initializing history simulation tests...");
  
  const params = {
    seed: 45678901,
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
    riverCount: 3,
    riverMoistRadius: 3,
    riverMoistStrength: 0.5,
    cityCount: 4
  };

  const grid = generateWorldData(params);
  const initialPop = grid.cities[0].population;

  // Test 1: Simulating years changes population and generates chronicles
  let allChronicles = [];
  for (let i = 0; i < 35; i++) {
    const chronicles = simulateHistoryYear(grid, 50, params);
    allChronicles = allChronicles.concat(chronicles);
  }
  console.assert(grid.historyYear === 35, "Error: Year should be 35.");
  console.assert(grid.cities[0].population !== initialPop || allChronicles.length > 0, "Error: Simulation should process cities.");

  // Test 2: Determinism - simulating again with same seed produces identical results
  const gridA = generateWorldData(params);
  for (let i = 0; i < 35; i++) simulateHistoryYear(gridA, 50, params);

  const gridB = generateWorldData(params);
  for (let i = 0; i < 35; i++) simulateHistoryYear(gridB, 50, params);

  console.assert(gridA.historyYear === gridB.historyYear, "Error: historyYear mismatch.");
  console.assert(gridA.cities[0].population === gridB.cities[0].population, "Error: Deterministic history simulation failed (population).");
  console.assert(gridA.cities[1].foodStock === gridB.cities[1].foodStock, "Error: Deterministic history simulation failed (foodStock).");

  // Test 3: Rich chronicle structures containing coordinates x and y
  const hasCoordinates = allChronicles.some(c => c.x !== undefined && c.y !== undefined);
  console.assert(hasCoordinates, "Error: Expected at least some chronicles to have coordinate logging (x, y) over 35 years.");

  console.log("✅ History simulation tests completed successfully!");
}

export function runExportTests() {
  console.log("Initializing world export serialization tests...");
  
  const params = {
    seed: 12345678,
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
    riverCount: 3,
    riverMoistRadius: 2,
    riverMoistStrength: 0.5,
    cityCount: 4
  };

  const grid = generateWorldData(params);
  // Advance history by 45 years to generate chronicles and verify accumulation
  for (let i = 0; i < 45; i++) {
    simulateHistoryYear(grid, 50, params);
  }

  // Run serialization
  let serialized = null;
  try {
    serialized = serializeWorld(grid, params);
  } catch (e) {
    console.error("Serialization failed with exception: ", e);
    console.assert(false, "ERROR: serializeWorld threw an exception.");
  }

  console.assert(serialized !== null, "ERROR: serializeWorld returned null.");

  // Test 1: JSON Stringify validation (verifies no circular references exist)
  let jsonStr = "";
  try {
    jsonStr = JSON.stringify(serialized);
    console.assert(jsonStr.length > 0, "ERROR: JSON string must not be empty.");
  } catch (e) {
    console.error("JSON stringification failed: ", e);
    console.assert(false, "ERROR: JSON.stringify failed (likely due to circular references).");
  }

  // Test 2: Node presence check
  console.assert(serialized.metadata !== undefined, "ERROR: JSON missing metadata.");
  console.assert(serialized.stats !== undefined, "ERROR: JSON missing stats.");
  console.assert(serialized.cities !== undefined, "ERROR: JSON missing cities list.");
  console.assert(serialized.kingdoms !== undefined, "ERROR: JSON missing kingdoms list.");
  console.assert(serialized.rivers !== undefined, "ERROR: JSON missing rivers list.");
  console.assert(serialized.dungeons !== undefined, "ERROR: JSON missing dungeons list.");
  console.assert(serialized.chronicles !== undefined, "ERROR: JSON missing chronicles list.");
  console.assert(serialized.grid !== undefined, "ERROR: JSON missing grid.");

  // Test 3: Structural details
  console.assert(serialized.metadata.seed === params.seed, "ERROR: seed mismatch in metadata.");
  console.assert(serialized.metadata.gridSize === params.gridSize, "ERROR: gridSize mismatch in metadata.");
  console.assert(serialized.metadata.historyYear === 45, "ERROR: historyYear mismatch in metadata.");
  
  console.assert(serialized.stats.cities === serialized.cities.length, "ERROR: cities count stat mismatch.");
  console.assert(serialized.stats.rivers === serialized.rivers.length, "ERROR: rivers count stat mismatch.");
  console.assert(serialized.stats.chronicles === serialized.chronicles.length, "ERROR: chronicles count stat mismatch.");

  // Test 4: Rivers contain paths
  if (params.riverCount > 0) {
    console.assert(serialized.rivers.length > 0, "ERROR: expected rivers in serialization.");
    console.assert(serialized.rivers[0].path !== undefined && serialized.rivers[0].path.length > 0, "ERROR: river path must be populated.");
    console.assert(serialized.rivers[0].source !== undefined, "ERROR: river source must be populated.");
  }

  // Test 5: Chronicles contain historical year records
  console.assert(serialized.chronicles.length > 1, "ERROR: chronicles should contain init event and advanced years events.");
  console.assert(serialized.chronicles[0].year === 0, "ERROR: first chronicle year should be 0.");

  console.log("✅ World export serialization tests completed successfully!");
}

export async function runThreeJSLoadTests(loadThreeJSFunction) {
  console.log("Initializing Three.js script loader tests...");
  try {
    await loadThreeJSFunction();
    console.assert(window.THREE !== undefined, "ERROR: THREE global is not defined after script load.");
    console.assert(window.THREE.OrbitControls !== undefined, "ERROR: OrbitControls is not defined after script load.");
    console.log("✅ Three.js script loader tests completed successfully!");
  } catch (e) {
    console.error("ERROR: Three.js failed to load dynamically: ", e);
    console.assert(false, "ERROR: Dynamic script load rejected.");
  }
}

export function runRenderer3DLifecycleTests(initFn, destroyFn) {
  console.log("Initializing Renderer3D lifecycle tests...");
  const tempDiv = document.createElement('div');
  tempDiv.style.width = '200px';
  tempDiv.style.height = '200px';
  document.body.appendChild(tempDiv);
  
  try {
    initFn(tempDiv);
    console.assert(tempDiv.querySelector('canvas') !== null, "ERROR: WebGL canvas was not appended to container.");
    
    destroyFn();
    console.assert(tempDiv.querySelector('canvas') === null, "ERROR: WebGL canvas was not removed after destroy.");
    console.log("✅ Renderer3D lifecycle tests completed successfully!");
  } catch (e) {
    console.error("ERROR: Renderer3D lifecycle test failed: ", e);
    console.assert(false, "Renderer3D lifecycle failed.");
  } finally {
    if (tempDiv.parentNode) {
      document.body.removeChild(tempDiv);
    }
  }
}

export function runAllTests() {

  runNoiseTests();
  runBiomeTests();
  runTempModelTests();
  runRefinementTests();
  runRiverTests();
  runPhase3Tests();
  runHistoryTests();
  runExportTests();
}
