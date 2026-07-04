export const BIOME_COLORS = {
  DEEP_OCEAN: '#0d1b2a',
  SHALLOW_OCEAN: '#1b4965',
  BEACH: '#e9c46a',
  SNOW_MOUNTAIN: '#e0e1dd',
  TUNDRA: '#a8dadc',
  GRASSLAND: '#52b788',
  TEMP_FOREST: '#2d6a4f',
  SWAMP: '#1a3a2b',
  DESERT: '#f4a261',
  SAVANNA: '#ccd5ae',
  JUNGLE: '#081c15',
  RIVER: '#00b4d8',
  LAKE: '#0077b6'
};

export const BIOME_NAMES = {
  DEEP_OCEAN: 'Oceano Profundo',
  SHALLOW_OCEAN: 'Mar Raso',
  BEACH: 'Praia',
  SNOW_MOUNTAIN: 'Montanha de Neve',
  TUNDRA: 'Tundra',
  GRASSLAND: 'Planície',
  TEMP_FOREST: 'Floresta Temperada',
  SWAMP: 'Pântano',
  DESERT: 'Deserto',
  SAVANNA: 'Savana',
  JUNGLE: 'Floresta Tropical',
  RIVER: 'Rio',
  LAKE: 'Lago'
};

export function renderWorld(grid, mode) {
  const canvas = document.getElementById('world-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = grid.length;
  const cellSize = canvas.width / size;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      let color = '#000000';
      
      if (mode === 'biome') {
        color = BIOME_COLORS[cell.biome] || '#000000';
      } else if (mode === 'elevation') {
        const val = Math.floor(cell.elevation * 255);
        color = `rgb(${val}, ${val}, ${val})`;
      } else if (mode === 'moisture') {
        const r = Math.floor(244 + (33 - 244) * cell.moisture);
        const g = Math.floor(210 + (100 - 210) * cell.moisture);
        const b = Math.floor(150 + (243 - 150) * cell.moisture);
        color = `rgb(${r}, ${g}, ${b})`;
      } else if (mode === 'temperature') {
        const r = Math.floor(33 + (230 - 33) * cell.temperature);
        const g = Math.floor(150 + (57 - 150) * cell.temperature);
        const b = Math.floor(243 + (70 - 243) * cell.temperature);
        color = `rgb(${r}, ${g}, ${b})`;
      }
      
      ctx.fillStyle = color;
      ctx.fillRect(x * cellSize, y * cellSize, Math.ceil(cellSize), Math.ceil(cellSize));
    }
  }
}
