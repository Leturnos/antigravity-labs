import { generateWorldData } from './generator.js';
import { runAllTests } from './tests.js';

// Run unit tests on load
runAllTests();

const BIOME_COLORS = {
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
  JUNGLE: '#081c15'
};

const BIOME_NAMES = {
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
  JUNGLE: 'Floresta Tropical'
};

let currentWorldData = null;
let currentViewMode = 'biome';
let updateTimeout = null;

// Main Canvas rendering routine
function renderWorld(grid, mode) {
  const canvas = document.getElementById('world-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = grid.length;
  const cellSize = canvas.width / size; // Dynamically calculated cell size
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = grid[y][x];
      let color = '#000000';
      
      if (mode === 'biome') {
        color = BIOME_COLORS[cell.biome] || '#000000';
      } else if (mode === 'elevation') {
        // Grayscale (0 to 255)
        const val = Math.floor(cell.elevation * 255);
        color = `rgb(${val}, ${val}, ${val})`;
      } else if (mode === 'moisture') {
        // Moisture gradient: Brown (Dry) -> Light Blue -> Dark Blue (Wet)
        const r = Math.floor(244 + (33 - 244) * cell.moisture);
        const g = Math.floor(210 + (100 - 210) * cell.moisture);
        const b = Math.floor(150 + (243 - 150) * cell.moisture);
        color = `rgb(${r}, ${g}, ${b})`;
      } else if (mode === 'temperature') {
        // Thermal gradient: Cold blue -> Purple -> Hot red
        const r = Math.floor(33 + (230 - 33) * cell.temperature);
        const g = Math.floor(150 + (57 - 150) * cell.temperature);
        const b = Math.floor(243 + (70 - 243) * cell.temperature);
        color = `rgb(${r}, ${g}, ${b})`;
      }
      
      ctx.fillStyle = color;
      // Use Math.ceil to prevent sub-pixel gaps between rendered cells
      ctx.fillRect(x * cellSize, y * cellSize, Math.ceil(cellSize), Math.ceil(cellSize));
    }
  }
}

// Read parameters, update text nodes, and re-render
function updateWorld() {
  const seed = parseInt(document.getElementById('seed-input').value) || 0;
  const gridSize = parseInt(document.getElementById('grid-size').value);
  const elevScale = parseFloat(document.getElementById('elev-scale').value);
  const elevOctaves = parseInt(document.getElementById('elev-octaves').value);
  const elevPersistence = parseFloat(document.getElementById('elev-persistence').value);
  const moistScale = parseFloat(document.getElementById('moist-scale').value);
  const moistOctaves = parseInt(document.getElementById('moist-octaves').value);
  const tempAltWeight = parseFloat(document.getElementById('temp-alt-weight').value);
  const tempModel = document.getElementById('temp-model').value;
  const warpStrength = parseFloat(document.getElementById('warp-strength').value);
  const erosionStrength = parseFloat(document.getElementById('erosion-strength').value);
  
  // Update slider value text indicators
  document.getElementById('grid-size-val').textContent = `${gridSize}x${gridSize}`;
  document.getElementById('elev-scale-val').textContent = elevScale.toFixed(3);
  document.getElementById('elev-octaves-val').textContent = elevOctaves;
  document.getElementById('elev-persistence-val').textContent = elevPersistence.toFixed(2);
  document.getElementById('moist-scale-val').textContent = moistScale.toFixed(3);
  document.getElementById('moist-octaves-val').textContent = moistOctaves;
  document.getElementById('temp-alt-weight-val').textContent = tempAltWeight.toFixed(2);
  document.getElementById('warp-strength-val').textContent = warpStrength;
  document.getElementById('erosion-strength-val').textContent = erosionStrength.toFixed(1);
  
  // Execute core generator
  currentWorldData = generateWorldData({
    seed,
    gridSize,
    elevScale,
    elevOctaves,
    elevPersistence,
    moistScale,
    moistOctaves,
    tempAltWeight,
    tempModel,
    warpStrength,
    erosionStrength
  });
  
  // Draw on active mode
  renderWorld(currentWorldData, currentViewMode);
}

// Debounce handler (100ms) to throttle generation on fast input drag
function queueUpdate() {
  if (updateTimeout) clearTimeout(updateTimeout);
  updateTimeout = setTimeout(updateWorld, 100);
}

// Initialize mouse move hover telemetry on Canvas
function initInteractivity() {
  const canvas = document.getElementById('world-canvas');
  if (!canvas) return;
  
  canvas.addEventListener('mousemove', (e) => {
    if (!currentWorldData) return;
    
    const rect = canvas.getBoundingClientRect();
    // Calculate client-to-element coordinate conversion
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Map coordinates to canvas internal pixel dimensions (512x512)
    const scaleX = (mouseX / rect.width) * canvas.width;
    const scaleY = (mouseY / rect.height) * canvas.height;
    
    const size = currentWorldData.length;
    const cellSize = canvas.width / size;
    
    const cellX = Math.floor(scaleX / cellSize);
    const cellY = Math.floor(scaleY / cellSize);
    
    // Update status panel parameters if within boundaries
    if (cellX >= 0 && cellX < size && cellY >= 0 && cellY < size) {
      const cell = currentWorldData[cellY][cellX];
      document.getElementById('val-coord').textContent = `${cell.x}, ${cell.y}`;
      document.getElementById('val-elevation').textContent = cell.elevation.toFixed(2);
      document.getElementById('val-moisture').textContent = cell.moisture.toFixed(2);
      document.getElementById('val-temp').textContent = cell.temperature.toFixed(2);
      document.getElementById('val-biome').textContent = BIOME_NAMES[cell.biome] || cell.biome;
    }
  });
  
  canvas.addEventListener('mouseleave', () => {
    document.getElementById('val-coord').textContent = '-';
    document.getElementById('val-elevation').textContent = '-';
    document.getElementById('val-moisture').textContent = '-';
    document.getElementById('val-temp').textContent = '-';
    document.getElementById('val-biome').textContent = '-';
  });
}

// Initialize visual layer switcher tabs
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentViewMode = tab.getAttribute('data-mode');
      if (currentWorldData) {
        renderWorld(currentWorldData, currentViewMode);
      }
    });
  });
}

// Bind input events to triggers
function bindEvents() {
  const inputs = [
    'grid-size', 'elev-scale', 'elev-octaves', 'elev-persistence',
    'moist-scale', 'moist-octaves', 'temp-alt-weight',
    'warp-strength', 'erosion-strength'
  ];
  
  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', queueUpdate);
  });
  
  const tempModelSelect = document.getElementById('temp-model');
  if (tempModelSelect) tempModelSelect.addEventListener('change', queueUpdate);
  
  const seedInput = document.getElementById('seed-input');
  if (seedInput) seedInput.addEventListener('input', queueUpdate);
  
  const btnRand = document.getElementById('btn-random-seed');
  if (btnRand) {
    btnRand.addEventListener('click', () => {
      // Generate random 8-digit seed
      const randSeed = Math.floor(10000000 + Math.random() * 90000000);
      document.getElementById('seed-input').value = randSeed;
      updateWorld();
    });
  }
}

// Page boot loader
window.addEventListener('DOMContentLoaded', () => {
  initTabs();
  bindEvents();
  initInteractivity();
  updateWorld(); // Initial world generation
});
