import { generateWorldData } from './generator.js';
import { runAllTests } from './tests.js';
import { renderWorld } from './renderer.js';
import { bindUIEvents, updateUIValues, getParams } from './ui.js';

// Run unit tests on load
runAllTests();

let currentWorldData = null;
let currentViewMode = 'biome';

// Read parameters, update text nodes, and re-render
function updateWorld() {
  const params = getParams();
  updateUIValues(params);
  
  // Execute core generator
  currentWorldData = generateWorldData(params);
  
  // Draw on active mode
  renderWorld(currentWorldData, currentViewMode);
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
  bindUIEvents(updateWorld, () => currentWorldData);
  updateWorld(); // Initial world generation
});
