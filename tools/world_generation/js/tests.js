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

export function runAllTests() {
  runNoiseTests();
  runBiomeTests();
  runTempModelTests();
}
