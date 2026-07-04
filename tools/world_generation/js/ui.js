import { BIOME_NAMES, renderWorld } from './renderer.js';
import { serializeWorld } from './generator.js';

let updateTimeout = null;

const RESOURCE_NAMES = {
  wood: 'Madeira',
  ore: 'Minério',
  fish: 'Pesca',
  stone: 'Pedra/Areia',
  crops: 'Agricultura'
};

export function addChronicleMessage(text, type = 'system-msg', x = undefined, y = undefined) {
  const container = document.getElementById('chronicles-log');
  if (!container) return;
  
  if (container.children.length > 100) {
    container.removeChild(container.firstChild);
  }
  
  const el = document.createElement('div');
  el.className = `chronicle-entry ${type}`;
  if (x !== undefined && y !== undefined) {
    el.className += ' clickable';
    el.setAttribute('data-x', x);
    el.setAttribute('data-y', y);
  }
  el.textContent = text;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

export function clearChroniclesLog() {
  const container = document.getElementById('chronicles-log');
  if (container) {
    container.innerHTML = `<div class="chronicle-entry system-msg">[Sistema] Geografia inicializada no Ano 0.</div>`;
  }
}

export function updateUIValues(params) {
  document.getElementById('grid-size-val').textContent = `${params.gridSize}x${params.gridSize}`;
  document.getElementById('elev-scale-val').textContent = params.elevScale.toFixed(3);
  document.getElementById('elev-octaves-val').textContent = params.elevOctaves;
  document.getElementById('elev-persistence-val').textContent = params.elevPersistence.toFixed(2);
  document.getElementById('moist-scale-val').textContent = params.moistScale.toFixed(3);
  document.getElementById('moist-octaves-val').textContent = params.moistOctaves;
  document.getElementById('temp-alt-weight-val').textContent = params.tempAltWeight.toFixed(2);
  document.getElementById('warp-strength-val').textContent = params.warpStrength;
  document.getElementById('erosion-strength-val').textContent = params.erosionStrength.toFixed(1);
  
  // River Phase 2 controls
  document.getElementById('river-count-val').textContent = params.riverCount;
  document.getElementById('river-moist-radius-val').textContent = `${params.riverMoistRadius} células`;
  document.getElementById('river-moist-strength-val').textContent = params.riverMoistStrength.toFixed(2);

  // Civilization Phase 3 controls
  document.getElementById('city-count-val').textContent = params.cityCount;
  
  // History Simulation controls
  document.getElementById('history-init-years-val').textContent = `${params.historyInitYears} anos`;
}

export function bindUIEvents(onUpdateCallback, currentWorldDataRef, simCallbacks = {}) {
  const queueUpdate = () => {
    if (updateTimeout) clearTimeout(updateTimeout);
    updateTimeout = setTimeout(onUpdateCallback, 100);
  };

  const inputs = [
    'grid-size', 'elev-scale', 'elev-octaves', 'elev-persistence',
    'moist-scale', 'moist-octaves', 'temp-alt-weight',
    'warp-strength', 'erosion-strength',
    'river-count', 'river-moist-radius', 'river-moist-strength',
    'city-count', 'history-init-years'
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
      const randSeed = Math.floor(10000000 + Math.random() * 90000000);
      document.getElementById('seed-input').value = randSeed;
      onUpdateCallback();
    });
  }

  // Simulation controls
  const btnPlay = document.getElementById('btn-play-sim');
  if (btnPlay && simCallbacks.onPlay) {
    btnPlay.addEventListener('click', () => {
      simCallbacks.onPlay(btnPlay);
    });
  }

  const btnStep = document.getElementById('btn-step-sim');
  if (btnStep && simCallbacks.onStep) {
    btnStep.addEventListener('click', simCallbacks.onStep);
  }

  const btnReset = document.getElementById('btn-reset-sim');
  if (btnReset && simCallbacks.onReset) {
    btnReset.addEventListener('click', simCallbacks.onReset);
  }

  // Click handler to highlight canvas cells when clicking on chronicles log
  const chroniclesContainer = document.getElementById('chronicles-log');
  if (chroniclesContainer) {
    chroniclesContainer.addEventListener('click', (e) => {
      const entry = e.target.closest('.chronicle-entry.clickable');
      if (entry) {
        const x = parseInt(entry.getAttribute('data-x'));
        const y = parseInt(entry.getAttribute('data-y'));
        if (!isNaN(x) && !isNaN(y)) {
          const evt = new CustomEvent('highlight-cell', { detail: { x, y } });
          window.dispatchEvent(evt);
        }
      }
    });
  }

  // Handle Layer Checkboxes Redraw (no regeneration)
  const checkboxes = ['show-cities-routes', 'show-resources', 'show-kingdoms', 'show-dungeons'];
  checkboxes.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        const grid = currentWorldDataRef();
        if (grid) {
          const activeTab = document.querySelector('.tab-btn.active');
          const currentViewMode = activeTab ? activeTab.getAttribute('data-mode') : 'biome';
          renderWorld(grid, currentViewMode);
        }
      });
    }
  });

  // Handle JSON World Export
  const btnExport = document.getElementById('btn-export-json');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      const grid = currentWorldDataRef();
      if (!grid) {
        alert("Nenhum mundo gerado para exportar!");
        return;
      }
      
      try {
        const params = getParams();
        const serialized = serializeWorld(grid, params);
        const jsonStr = JSON.stringify(serialized, null, 2);
        
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        const year = grid.historyYear || 0;
        a.href = url;
        a.download = `world_${params.gridSize}x${params.gridSize}_seed_${params.seed}_year_${year}.json`;
        a.style.position = 'fixed';
        a.style.left = '-9999px';
        document.body.appendChild(a);
        a.click();
        
        // Use a generous timeout to let the browser finish downloading large files
        // before revoking the blob URL. The grid JSON can be 15+ MB.
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 10000);
      } catch (e) {
        console.error('Export failed:', e);
        alert('Erro ao exportar mundo: ' + e.message);
      }
    });
  }

  // Interactivity Hover Tooltip
  const canvas = document.getElementById('world-canvas');
  if (canvas) {
    canvas.addEventListener('mousemove', (e) => {
      const grid = currentWorldDataRef();
      if (!grid) return;
      
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const scaleX = (mouseX / rect.width) * canvas.width;
      const scaleY = (mouseY / rect.height) * canvas.height;
      const size = grid.length;
      const cellSize = canvas.width / size;
      
      const cellX = Math.floor(scaleX / cellSize);
      const cellY = Math.floor(scaleY / cellSize);
      
      if (cellX >= 0 && cellX < size && cellY >= 0 && cellY < size) {
        const cell = grid[cellY][cellX];
        document.getElementById('val-coord').textContent = `${cell.x}, ${cell.y}`;
        document.getElementById('val-elevation').textContent = cell.elevation.toFixed(2);
        document.getElementById('val-moisture').textContent = cell.moisture.toFixed(2);
        document.getElementById('val-temp').textContent = cell.temperature.toFixed(2);
        
        let biomeText = BIOME_NAMES[cell.biome] || cell.biome;
        if (cell.cityName) {
          const popLabel = cell.cityPop !== undefined ? `, Pop: ${cell.cityPop}` : '';
          const statusLabel = cell.isAbandoned ? ' [ABANDONADA]' : '';
          biomeText += ` (${cell.cityType === 'capital' ? 'Capital' : cell.cityType === 'city' ? 'Cidade' : 'Vila'}: ${cell.cityName}${popLabel}${statusLabel})`;
        } else if (cell.dungeonName) {
          biomeText += ` (${cell.dungeonName})`;
        } else if (cell.isRoad) {
          biomeText += ` (Estrada Comercial)`;
        }
        document.getElementById('val-biome').textContent = biomeText;

        // Resource display
        if (cell.resource) {
          const density = cell.resourceDensity > 0.8 ? 'Rico' : cell.resourceDensity > 0.6 ? 'Médio' : 'Escasso';
          document.getElementById('val-resource').textContent = `${RESOURCE_NAMES[cell.resource]} (${density})`;
        } else {
          document.getElementById('val-resource').textContent = '-';
        }

        // Kingdom display
        if (cell.kingdomName) {
          document.getElementById('val-kingdom').textContent = cell.kingdomName + (cell.isFrontier ? ' (Fronteira)' : '');
        } else {
          document.getElementById('val-kingdom').textContent = '-';
        }
      }
    });
    
    canvas.addEventListener('mouseleave', () => {
      document.getElementById('val-coord').textContent = '-';
      document.getElementById('val-elevation').textContent = '-';
      document.getElementById('val-moisture').textContent = '-';
      document.getElementById('val-temp').textContent = '-';
      document.getElementById('val-biome').textContent = '-';
      document.getElementById('val-resource').textContent = '-';
      document.getElementById('val-kingdom').textContent = '-';
    });
  }
}

export function getParams() {
  return {
    seed: parseInt(document.getElementById('seed-input').value) || 0,
    gridSize: parseInt(document.getElementById('grid-size').value),
    elevScale: parseFloat(document.getElementById('elev-scale').value),
    elevOctaves: parseInt(document.getElementById('elev-octaves').value),
    elevPersistence: parseFloat(document.getElementById('elev-persistence').value),
    moistScale: parseFloat(document.getElementById('moist-scale').value),
    moistOctaves: parseInt(document.getElementById('moist-octaves').value),
    tempAltWeight: parseFloat(document.getElementById('temp-alt-weight').value),
    tempModel: document.getElementById('temp-model').value,
    warpStrength: parseFloat(document.getElementById('warp-strength').value),
    erosionStrength: parseFloat(document.getElementById('erosion-strength').value),
    riverCount: parseInt(document.getElementById('river-count').value),
    riverMoistRadius: parseInt(document.getElementById('river-moist-radius').value),
    riverMoistStrength: parseFloat(document.getElementById('river-moist-strength').value),
    
    // Civilizations Phase 3
    cityCount: parseInt(document.getElementById('city-count').value),
    showCities: document.getElementById('show-cities-routes').checked,
    showResources: document.getElementById('show-resources').checked,
    showKingdoms: document.getElementById('show-kingdoms').checked,
    showDungeons: document.getElementById('show-dungeons').checked,
    
    // History Phase 3
    historyInitYears: parseInt(document.getElementById('history-init-years').value)
  };
}
