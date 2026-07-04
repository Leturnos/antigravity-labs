import { generateWorldData, simulateHistoryYear } from './generator.js';
import { runAllTests } from './tests.js';
import { renderWorld } from './renderer.js';
import { bindUIEvents, updateUIValues, getParams, addChronicleMessage, clearChroniclesLog } from './ui.js';

// Run unit tests on load
runAllTests();

let currentWorldData = null;
let currentViewMode = 'biome';

let isSimPlaying = false;
let simIntervalId = null;

let recentEvents = [];
let animIntervalId = null;

function startAnimationLoop() {
  if (animIntervalId) return;
  animIntervalId = setInterval(() => {
    let changed = false;
    for (let i = recentEvents.length - 1; i >= 0; i--) {
      recentEvents[i].age -= 0.5; // Decrement age on each 100ms tick
      if (recentEvents[i].age <= 0) {
        recentEvents.splice(i, 1);
      }
      changed = true;
    }
    if (changed && currentWorldData) {
      renderWorld(currentWorldData, currentViewMode, recentEvents);
    }
    if (recentEvents.length === 0) {
      clearInterval(animIntervalId);
      animIntervalId = null;
    }
  }, 100);
}

window.addEventListener('highlight-cell', (e) => {
  const { x, y } = e.detail;
  // Clear older highlights to avoid accumulation
  recentEvents = recentEvents.filter(evt => evt.type !== 'highlight');
  recentEvents.push({
    x,
    y,
    type: 'highlight',
    age: 15.0 // Lifespan of 1.5 seconds
  });
  if (currentWorldData) {
    renderWorld(currentWorldData, currentViewMode, recentEvents);
  }
  startAnimationLoop();
});

// Read parameters, update text nodes, and re-render
function updateWorld() {
  // Stop simulation if it is running
  stopSimulation();
  
  // Clear pending event animations
  recentEvents = [];
  if (animIntervalId) {
    clearInterval(animIntervalId);
    animIntervalId = null;
  }

  const params = getParams();
  updateUIValues(params);
  
  // Clear chronicle messages when generating new geography
  clearChroniclesLog();
  
  // Execute core generator (Year 0)
  currentWorldData = generateWorldData(params);
  
  // Offline simulation of initial years if requested
  if (params.historyInitYears > 0) {
    addChronicleMessage(`[Sistema] Simulando ${params.historyInitYears} anos de história offline...`, 'system-msg');
    
    // Execute offline simulation ticks
    for (let i = 0; i < params.historyInitYears; i++) {
      const size = currentWorldData.length;
      const chronicles = simulateHistoryYear(currentWorldData, size, params);
      
      // Display events in chronicles log (passing coordinates)
      chronicles.forEach(c => {
        addChronicleMessage(c.text, c.type, c.x, c.y);
      });
    }
    
    addChronicleMessage(`[Sistema] História offline concluída. Mundo inicializado no Ano ${params.historyInitYears}.`, 'system-msg');
  }
  
  const currentYear = currentWorldData.historyYear || 0;
  document.getElementById('current-year-val').textContent = currentYear;
  
  // Sync timeline progress bar
  const progressEl = document.getElementById('timeline-progress');
  if (progressEl) {
    progressEl.max = Math.max(100, currentYear);
    progressEl.value = currentYear;
  }

  // Draw on active mode
  renderWorld(currentWorldData, currentViewMode, recentEvents);
}

// Avança um ano da simulação ativa
function advanceYear() {
  if (!currentWorldData) return;
  
  const params = getParams();
  const size = currentWorldData.length;
  
  // Advance generator physics
  const chronicles = simulateHistoryYear(currentWorldData, size, params);
  
  // Print chronicle messages and register visual events
  chronicles.forEach(c => {
    addChronicleMessage(c.text, c.type, c.x, c.y);
    if (c.x !== undefined && c.y !== undefined) {
      recentEvents.push({
        x: c.x,
        y: c.y,
        type: c.type,
        age: 10.0 // Animation ticks (1 second total fade out)
      });
    }
  });
  
  // Update year count
  const currentYear = currentWorldData.historyYear || 0;
  document.getElementById('current-year-val').textContent = currentYear;
  
  // Sync timeline progress bar
  const progressEl = document.getElementById('timeline-progress');
  if (progressEl) {
    progressEl.max = Math.max(100, currentYear);
    progressEl.value = currentYear;
  }
  
  // Force redraw on biome view mode including recent events
  renderWorld(currentWorldData, currentViewMode, recentEvents);
  startAnimationLoop();
}

function stopSimulation() {
  if (isSimPlaying) {
    clearInterval(simIntervalId);
    isSimPlaying = false;
    const btnPlay = document.getElementById('btn-play-sim');
    if (btnPlay) btnPlay.textContent = "▶️ Iniciar";
  }
}

// Simulation Callbacks
function onPlaySim(btnPlay) {
  if (isSimPlaying) {
    // Pause
    clearInterval(simIntervalId);
    isSimPlaying = false;
    btnPlay.textContent = "▶️ Iniciar";
    addChronicleMessage("[Sistema] Simulação pausada.", 'system-msg');
  } else {
    // Start
    isSimPlaying = true;
    btnPlay.textContent = "⏸️ Pausar";
    addChronicleMessage("[Sistema] Simulação iniciada.", 'system-msg');
    
    simIntervalId = setInterval(() => {
      advanceYear();
    }, 450); // Pleasant and performant tick rate
  }
}

function onStepSim() {
  stopSimulation();
  advanceYear();
}

function onResetSim() {
  stopSimulation();
  updateWorld(); // Re-generates Year 0 (pure geography)
  addChronicleMessage("[Sistema] Mundo reiniciado para o Ano 0.", 'system-msg');
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

// Page boot loader
window.addEventListener('DOMContentLoaded', () => {
  initTabs();
  
  bindUIEvents(updateWorld, () => currentWorldData, {
    onPlay: onPlaySim,
    onStep: onStepSim,
    onReset: onResetSim
  });
  
  updateWorld(); // Initial world generation
});
