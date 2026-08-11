/**
 * Aether Motion Lab — Main Entry Point
 * Orchestrates Canvas Viewport, Particle Loop & UI Controls
 */

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('motion-canvas');
  const ctx = canvas.getContext('2d');

  // Viewport & DPI Scaling
  let width = 0;
  let height = 0;
  let dpr = window.devicePixelRatio || 1;

  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Basic Tab Switching Logic
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabButtons.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const activeContent = document.getElementById(targetTab);
      if (activeContent) {
        activeContent.classList.add('active');
      }
    });
  });

  // UI Deck Toggle & Keyboard Shortcuts
  const btnToggleUi = document.getElementById('btn-toggle-ui');
  const uiLayer = document.getElementById('ui-layer');
  const controlDeck = document.getElementById('control-deck');
  const btnCollapseDeck = document.getElementById('btn-collapse-deck');

  function toggleZenMode() {
    uiLayer.classList.toggle('hidden');
  }

  function toggleDeck() {
    controlDeck.classList.toggle('collapsed');
  }

  if (btnToggleUi) btnToggleUi.addEventListener('click', toggleZenMode);
  if (btnCollapseDeck) btnCollapseDeck.addEventListener('click', toggleDeck);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    if (e.key === 'h' || e.key === 'H') {
      toggleZenMode();
    }
  });

  // Initial Placeholder Render Loop
  let fpsCount = 0;
  let lastTime = performance.now();
  const fpsElement = document.getElementById('fps-counter');

  function loop(currentTime) {
    const delta = currentTime - lastTime;
    if (delta >= 1000) {
      if (fpsElement) fpsElement.textContent = Math.round((fpsCount * 1000) / delta);
      fpsCount = 0;
      lastTime = currentTime;
    }
    fpsCount++;

    // Initial background clear
    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, width, height);

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
});
