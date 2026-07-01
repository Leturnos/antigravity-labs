/**
 * Aether Snake — Core Application & AI Pathfinder
 * Written in English with Portuguese UI text support.
 */

(function () {
  // --- Game State Constants & Variables ---
  const GRID_SIZE = 20; // 20x20 grid cells
  let canvas, ctx;
  let gameInterval = null;
  let frameCount = 0;
  let fps = 60;
  let lastFpsUpdate = 0;
  
  // Game metrics
  let score = 0;
  let snakeLength = 3;
  let snake = []; // Array of {x, y} coordinates, snake[0] is head
  let direction = { x: 1, y: 0 }; // Current movement direction
  let nextDirection = { x: 1, y: 0 }; // Buffered input direction for manual mode
  let food = { x: 10, y: 10 };
  let isPaused = false;
  let isGameOver = false;
  let isVictory = false;
  let isAILunning = true; // AI mode active by default
  let speedLevel = 'normal'; // 'slow', 'normal', 'fast', 'hyper'
  let speedMs = 70; // Tick rate
  
  // Visualization toggles
  let showPath = true;
  let showNodes = true;
  let activeTheme = 'modern-glow';
  
  // Pathfinding data for rendering
  let calculatedPath = null;
  let searchedNodes = [];
  let aiStatusText = "SEGUINDO COMIDA";
  
  // Sound system link
  const sounds = window.SnakeSounds;
  
  // Particle system for food explosions
  let particles = [];
  
  // Scores record
  let recordScore = 0;
  let recordLength = 0;

  // DOM Elements
  let btnSoundToggle, btnInfo, btnInfoClose, btnInfoCloseOk;
  let btnModeAI, btnModeManual, speedSlow, speedNormal, speedFast, speedHyper;
  let themeSelector, chkShowPath, chkShowNodes, btnResume, btnStart, btnRetry;
  let btnResetScores, btnConfirmYes, btnConfirmNo;
  let modalInfo, modalGameOver, modalConfirm, pauseOverlay, startOverlay;
  
  let lblScore, lblLength, lblNodesSearched, lblRouteLength, lblAIStatus, lblFPS;
  let lblRecordScore, lblRecordLength, container;
  let sumScore, sumLength, sumMode, recordNotice, gameoverStatusIcon;

  // --- Initial Setup ---
  window.addEventListener('DOMContentLoaded', () => {
    initDOMElements();
    setupEventListeners();
    initCanvas();
    fetchRecords();
    
    // Initial draw to show empty grid in start overlay
    resetGameState();
    draw();
  });

  function initCanvas() {
    canvas = document.getElementById('canvas-board');
    ctx = canvas.getContext('2d');
  }

  function initDOMElements() {
    container = document.getElementById('aether-container');
    btnSoundToggle = document.getElementById('btn-sound-toggle');
    btnInfo = document.getElementById('btn-info');
    btnInfoClose = document.getElementById('modal-info-close');
    btnInfoCloseOk = document.getElementById('btn-info-close-ok');
    
    btnModeAI = document.getElementById('btn-mode-ai');
    btnModeManual = document.getElementById('btn-mode-manual');
    
    speedSlow = document.getElementById('speed-slow');
    speedNormal = document.getElementById('speed-normal');
    speedFast = document.getElementById('speed-fast');
    speedHyper = document.getElementById('speed-hyper');
    
    themeSelector = document.getElementById('theme-selector');
    chkShowPath = document.getElementById('chk-show-path');
    chkShowNodes = document.getElementById('chk-show-nodes');
    
    btnResume = document.getElementById('btn-resume');
    btnStart = document.getElementById('btn-start');
    btnRetry = document.getElementById('btn-retry');
    
    btnResetScores = document.getElementById('btn-reset-scores');
    btnConfirmYes = document.getElementById('btn-confirm-yes');
    btnConfirmNo = document.getElementById('btn-confirm-no');
    
    modalInfo = document.getElementById('modal-info');
    modalGameOver = document.getElementById('modal-gameover');
    modalConfirm = document.getElementById('modal-confirm');
    pauseOverlay = document.getElementById('pause-overlay');
    startOverlay = document.getElementById('start-overlay');
    
    lblScore = document.getElementById('lbl-score');
    lblLength = document.getElementById('lbl-length');
    lblNodesSearched = document.getElementById('lbl-nodes-searched');
    lblRouteLength = document.getElementById('lbl-route-length');
    lblAIStatus = document.getElementById('lbl-ai-status-txt');
    lblFPS = document.getElementById('lbl-fps');
    
    lblRecordScore = document.getElementById('val-record-score');
    lblRecordLength = document.getElementById('val-record-length');
    
    sumScore = document.getElementById('sum-score');
    sumLength = document.getElementById('sum-length');
    sumMode = document.getElementById('sum-mode');
    recordNotice = document.getElementById('record-notice');
    gameoverStatusIcon = document.getElementById('gameover-status-icon');
  }

  function setupEventListeners() {
    // Info modal triggers
    btnInfo.addEventListener('click', () => {
      sounds.playClick();
      modalInfo.classList.remove('hidden');
    });
    btnInfoClose.addEventListener('click', () => {
      sounds.playClick();
      modalInfo.classList.add('hidden');
    });
    btnInfoCloseOk.addEventListener('click', () => {
      sounds.playClick();
      modalInfo.classList.add('hidden');
    });
    
    // Sound Toggle
    btnSoundToggle.addEventListener('click', () => {
      const active = sounds.toggleSound();
      btnSoundToggle.innerHTML = active ? '<span class="icon">🔊</span> <span class="label">Som: LIGADO</span>' : '<span class="icon">🔇</span> <span class="label">Som: DESLIGADO</span>';
      sounds.playClick();
    });
    
    // Mode toggles
    btnModeAI.addEventListener('click', () => {
      sounds.playClick();
      setGameMode(true);
    });
    btnModeManual.addEventListener('click', () => {
      sounds.playClick();
      setGameMode(false);
    });
    
    // Speed buttons
    const speedButtons = [
      { el: speedSlow, lvl: 'slow', ms: 120 },
      { el: speedNormal, lvl: 'normal', ms: 75 },
      { el: speedFast, lvl: 'fast', ms: 40 },
      { el: speedHyper, lvl: 'hyper', ms: 8 }
    ];
    speedButtons.forEach(cfg => {
      cfg.el.addEventListener('click', () => {
        sounds.playClick();
        speedButtons.forEach(b => b.el.classList.remove('active'));
        cfg.el.classList.add('active');
        speedLevel = cfg.lvl;
        speedMs = cfg.ms;
        if (gameInterval) {
          stopLoop();
          startLoop();
        }
      });
    });
    
    // Theme selector
    themeSelector.addEventListener('change', (e) => {
      sounds.playClick();
      activeTheme = e.target.value;
    });
    
    // Show path/nodes checkboxes
    chkShowPath.addEventListener('change', (e) => {
      showPath = e.target.checked;
    });
    chkShowNodes.addEventListener('change', (e) => {
      showNodes = e.target.checked;
    });
    
    // Overlays actions
    btnStart.addEventListener('click', () => {
      sounds.init();
      sounds.playClick();
      startOverlay.classList.add('hidden');
      container.classList.remove('game-idle');
      startGame();
    });
    btnResume.addEventListener('click', () => {
      sounds.playResume();
      togglePause();
    });
    btnRetry.addEventListener('click', () => {
      sounds.playClick();
      modalGameOver.classList.add('hidden');
      resetGameState();
      startGame();
    });
    
    // Reset scores buttons
    btnResetScores.addEventListener('click', () => {
      sounds.playClick();
      modalConfirm.classList.remove('hidden');
    });
    btnConfirmYes.addEventListener('click', () => {
      sounds.playClick();
      modalConfirm.classList.add('hidden');
      resetScores();
    });
    btnConfirmNo.addEventListener('click', () => {
      sounds.playClick();
      modalConfirm.classList.add('hidden');
    });
    
    // Close gameover modal ok button
    document.getElementById('btn-gameover-close-ok').addEventListener('click', () => {
      sounds.playClick();
      modalGameOver.classList.add('hidden');
    });
    document.getElementById('modal-gameover-close').addEventListener('click', () => {
      sounds.playClick();
      modalGameOver.classList.add('hidden');
    });

    // Keyboard inputs
    window.addEventListener('keydown', handleKeyDown);
  }

  function handleKeyDown(e) {
    console.log("Aether Snake KeyDown:", e.key, e.code, "isGameOver:", isGameOver, "isVictory:", isVictory, "startOverlayHidden:", startOverlay.classList.contains('hidden'));

    // Prevent default scroll behaviors for arrow keys, Spacebar, and WASD keys when inside the game board
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", " ", "KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)) {
      if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
        e.preventDefault();
      }
    }

    // Allow restarting via 'R' key regardless of Game Over or Victory screen
    if ((e.code === 'KeyR' || e.key === 'r' || e.key === 'R') && startOverlay.classList.contains('hidden')) {
      console.log("Aether Snake Restarting game via keyboard shortcut R");
      sounds.playClick();
      modalGameOver.classList.add('hidden');
      resetGameState();
      startGame();
      return;
    }

    if (isGameOver || isVictory || startOverlay.classList.contains('hidden') === false) {
      return;
    }

    switch (e.code) {
      case 'Space':
        togglePause();
        break;
      case 'KeyI':
        sounds.playClick();
        setGameMode(!isAILunning);
        break;
      
      // Manual controls (Arrow keys and WASD)
      case 'ArrowUp':
      case 'KeyW':
        if (direction.y !== 1) nextDirection = { x: 0, y: -1 };
        if (isPaused) togglePause();
        break;
      case 'ArrowDown':
      case 'KeyS':
        if (direction.y !== -1) nextDirection = { x: 0, y: 1 };
        if (isPaused) togglePause();
        break;
      case 'ArrowLeft':
      case 'KeyA':
        if (direction.x !== 1) nextDirection = { x: -1, y: 0 };
        if (isPaused) togglePause();
        break;
      case 'ArrowRight':
      case 'KeyD':
        if (direction.x !== -1) nextDirection = { x: 1, y: 0 };
        if (isPaused) togglePause();
        break;
    }
  }

  // --- Game Loop Management ---
  function startGame() {
    isGameOver = false;
    isVictory = false;
    
    // Start paused in manual mode so the player has time to prepare
    if (!isAILunning) {
      isPaused = true;
      pauseOverlay.classList.remove('hidden');
      const textEl = document.querySelector('#pause-overlay p');
      if (textEl) textEl.textContent = "Pressione ESPAÇO ou qualquer direção para iniciar";
      stopLoop();
    } else {
      isPaused = false;
      pauseOverlay.classList.add('hidden');
      const textEl = document.querySelector('#pause-overlay p');
      if (textEl) textEl.textContent = "Pressione Espaço ou clique abaixo para continuar";
      startLoop();
    }
  }

  function startLoop() {
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameTick, speedMs);
  }

  function stopLoop() {
    if (gameInterval) {
      clearInterval(gameInterval);
      gameInterval = null;
    }
  }

  function togglePause() {
    if (isGameOver || isVictory) return;
    
    isPaused = !isPaused;
    if (isPaused) {
      sounds.playPause();
      pauseOverlay.classList.remove('hidden');
      stopLoop();
    } else {
      sounds.playResume();
      pauseOverlay.classList.add('hidden');
      startLoop();
    }
  }

  function setGameMode(useAI) {
    isAILunning = useAI;
    if (isAILunning) {
      btnModeAI.classList.add('active');
      btnModeManual.classList.remove('active');
      lblAIStatus.parentNode.style.display = 'flex'; // show status
      document.getElementById('lbl-active-mode-name').textContent = "INTELIGÊNCIA ARTIFICIAL";
    } else {
      btnModeAI.classList.remove('active');
      btnModeManual.classList.add('active');
      lblAIStatus.parentNode.style.display = 'none'; // hide status
      document.getElementById('lbl-active-mode-name').textContent = "MANUAL";
      // Flush buffered direction to match current manual dir
      nextDirection = { ...direction };
    }
  }

  // --- Core Game Logic ---
  function resetGameState() {
    score = 0;
    snakeLength = 3;
    snake = [
      { x: 5, y: 10 }, // Head
      { x: 4, y: 10 },
      { x: 3, y: 10 }  // Tail
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    
    // Generate food at random position not occupied by snake
    generateFood();
    
    calculatedPath = null;
    searchedNodes = [];
    particles = [];
    isGameOver = false;
    isVictory = false;
    
    updateUIMetrics();
  }

  function generateFood() {
    let attempts = 0;
    while (attempts < 1000) {
      const x = Math.floor(Math.random() * GRID_SIZE);
      const y = Math.floor(Math.random() * GRID_SIZE);
      
      // Check if food is on snake body
      let onSnake = false;
      for (const segment of snake) {
        if (segment.x === x && segment.y === y) {
          onSnake = true;
          break;
        }
      }
      
      if (!onSnake) {
        food = { x, y };
        return;
      }
      attempts++;
    }
    
    // If no space, victory! (Snake filled the grid)
    gameVictory();
  }

  function gameTick() {
    // Track FPS
    frameCount++;
    const now = performance.now();
    if (now - lastFpsUpdate >= 1000) {
      fps = Math.round((frameCount * 1000) / (now - lastFpsUpdate));
      lblFPS.textContent = fps;
      frameCount = 0;
      lastFpsUpdate = now;
    }

    if (isPaused || isGameOver || isVictory) return;

    if (isAILunning) {
      // AI computes the next move
      const aiDecision = getAIMove();
      if (aiDecision.move) {
        const move = aiDecision.move;
        // Calculate new direction
        direction = {
          x: move.x - snake[0].x,
          y: move.y - snake[0].y
        };
      }
      calculatedPath = aiDecision.path;
      searchedNodes = aiDecision.visitedNodes;
      aiStatusText = aiDecision.status;
    } else {
      // Manual mode uses keyboard buffered direction
      direction = { ...nextDirection };
      calculatedPath = null;
      searchedNodes = [];
      aiStatusText = "MANUAL";
    }

    // Calculate next head position
    const head = snake[0];
    const newHead = {
      x: head.x + direction.x,
      y: head.y + direction.y
    };

    // Check collisions
    if (checkCollision(newHead)) {
      gameOver();
      return;
    }

    // Move snake head
    snake.unshift(newHead);

    // Check if eaten food
    if (newHead.x === food.x && newHead.y === food.y) {
      sounds.playEat();
      score += 10;
      snakeLength++;
      
      // Spawn explosion particles
      spawnParticles(food.x * 20 + 10, food.y * 20 + 10);
      
      // Generate new food
      generateFood();
    } else {
      // Remove tail
      snake.pop();
    }

    // Check victory condition (all grid squares filled by snake)
    if (snake.length >= GRID_SIZE * GRID_SIZE) {
      gameVictory();
    }

    // Update UI metrics
    updateUIMetrics();

    // Draw frame
    draw();
  }

  function checkCollision(pos) {
    // Wall collision
    if (pos.x < 0 || pos.x >= GRID_SIZE || pos.y < 0 || pos.y >= GRID_SIZE) {
      return true;
    }
    
    // Body collision (ignore tail if the snake doesn't grow, but since we check collision *before* tail pop in this frame,
    // the tail cell is safe to move into as it will be popped. So we check against body except the last segment)
    for (let i = 0; i < snake.length - 1; i++) {
      if (snake[i].x === pos.x && snake[i].y === pos.y) {
        return true;
      }
    }
    
    return false;
  }

  function gameOver() {
    stopLoop();
    isGameOver = true;
    sounds.playCrash();
    
    // Animate board frame shake
    const boardFrame = document.getElementById('board-frame');
    boardFrame.classList.add('shake');
    setTimeout(() => boardFrame.classList.remove('shake'), 400);

    // Save score & update records
    saveScore();

    // Show modal
    sumMode.textContent = isAILunning ? "IA" : "MANUAL";
    sumScore.textContent = score;
    sumLength.textContent = snake.length;
    gameoverStatusIcon.textContent = "💀";
    document.getElementById('gameover-heading').textContent = "Fim da Simulação!";
    document.getElementById('gameover-message').textContent = isAILunning 
      ? "A inteligência artificial colidiu ou ficou sem espaço."
      : "Você colidiu contra a parede ou consigo mesmo.";

    // Show record notification
    if (score > recordScore && score > 0) {
      recordNotice.classList.remove('hidden');
    } else {
      recordNotice.classList.add('hidden');
    }

    modalGameOver.classList.remove('hidden');
    draw();
  }

  function gameVictory() {
    stopLoop();
    isVictory = true;
    sounds.playVictory();
    
    saveScore();

    sumMode.textContent = isAILunning ? "IA" : "MANUAL";
    sumScore.textContent = score;
    sumLength.textContent = snake.length;
    gameoverStatusIcon.textContent = "🏆";
    gameoverStatusIcon.classList.add('winner');
    document.getElementById('gameover-heading').textContent = "Vitória Máxima!";
    document.getElementById('gameover-message').textContent = "A cobra completou o tabuleiro de forma perfeita! Comprimento total de 400 blocos.";

    recordNotice.classList.add('hidden');
    modalGameOver.classList.remove('hidden');
    draw();
  }

  // --- Pathfinding & Artificial Intelligence Algorithms ---
  
  /**
   * Breadth-First Search (BFS) to find the shortest path from start to goal.
   * @param {Object} start - {x, y}
   * @param {Object} goal - {x, y}
   * @param {Set} obstacles - Set of "x,y" strings representing invalid positions
   */
  function bfs(start, goal, obstacles) {
    const queue = [[start]];
    const visited = new Set();
    visited.add(`${start.x},${start.y}`);
    
    const visitedList = [];

    while (queue.length > 0) {
      const path = queue.shift();
      const curr = path[path.length - 1];

      if (curr.x === goal.x && curr.y === goal.y) {
        return { path, visitedNodes: visitedList };
      }

      const neighbors = [
        { x: curr.x, y: curr.y - 1 },
        { x: curr.x, y: curr.y + 1 },
        { x: curr.x - 1, y: curr.y },
        { x: curr.x + 1, y: curr.y }
      ];

      for (const n of neighbors) {
        if (n.x >= 0 && n.x < GRID_SIZE && n.y >= 0 && n.y < GRID_SIZE) {
          const key = `${n.x},${n.y}`;
          if (!visited.has(key) && !obstacles.has(key)) {
            visited.add(key);
            visitedList.push(n);
            queue.push([...path, n]);
          }
        }
      }
    }

    return { path: null, visitedNodes: visitedList };
  }

  /**
   * Flood fill to count connected empty spaces.
   */
  function floodFillCount(start, obstacles) {
    const queue = [start];
    const visited = new Set();
    visited.add(`${start.x},${start.y}`);
    let count = 0;

    while (queue.length > 0) {
      const curr = queue.shift();
      count++;

      const neighbors = [
        { x: curr.x, y: curr.y - 1 },
        { x: curr.x, y: curr.y + 1 },
        { x: curr.x - 1, y: curr.y },
        { x: curr.x + 1, y: curr.y }
      ];

      for (const n of neighbors) {
        if (n.x >= 0 && n.x < GRID_SIZE && n.y >= 0 && n.y < GRID_SIZE) {
          const key = `${n.x},${n.y}`;
          if (!visited.has(key) && !obstacles.has(key)) {
            visited.add(key);
            queue.push(n);
          }
        }
      }
    }
    return count;
  }

  /**
   * Simulates taking a path to the food and checks if the snake tail remains reachable.
   */
  function simulateMove(path) {
    const virtualSnake = [...snake];
    
    // Simulate steps along the path
    for (let i = 1; i < path.length; i++) {
      const node = path[i];
      virtualSnake.unshift(node);
      if (node.x === food.x && node.y === food.y) {
        // Snake eats food -> grows, tail does not move
      } else {
        virtualSnake.pop();
      }
    }

    // Check if virtual head can reach virtual tail
    const vHead = virtualSnake[0];
    const vTail = virtualSnake[virtualSnake.length - 1];
    
    // Obstacles are virtual snake segments (except tail since we want to reach it)
    const virtualObstacles = new Set();
    for (let i = 0; i < virtualSnake.length - 1; i++) {
      virtualObstacles.add(`${virtualSnake[i].x},${virtualSnake[i].y}`);
    }

    const { path: path2 } = bfs(vHead, vTail, virtualObstacles);
    return path2 !== null;
  }

  /**
   * Calculates the best next coordinate for the AI snake.
   */
  function getAIMove() {
    const head = snake[0];

    // Create obstacle list (full snake body including tail)
    const bodyObstacles = new Set();
    for (const segment of snake) {
      bodyObstacles.add(`${segment.x},${segment.y}`);
    }

    // 1. Search shortest path to food
    const { path: pathToFood, visitedNodes } = bfs(head, food, bodyObstacles);

    if (pathToFood && pathToFood.length > 1) {
      // 2. Simulate the path to food, verify if it is safe (tail reachable after eating)
      const safe = simulateMove(pathToFood);
      if (safe) {
        return {
          move: pathToFood[1],
          path: pathToFood,
          visitedNodes,
          status: "SEGUINDO COMIDA"
        };
      }
    }

    // 3. If food is unreachable or unsafe, follow tail (wander)
    const tail = snake[snake.length - 1];
    
    // Neighbors of actual head
    const neighbors = [
      { x: head.x, y: head.y - 1 },
      { x: head.x, y: head.y + 1 },
      { x: head.x - 1, y: head.y },
      { x: head.x + 1, y: head.y }
    ];

    // Obstacles for tail follow (exclude tail itself since it is the target)
    const obstaclesWithoutTail = new Set();
    for (let i = 0; i < snake.length - 1; i++) {
      obstaclesWithoutTail.add(`${snake[i].x},${snake[i].y}`);
    }

    let bestMove = null;
    let bestScore = -1;

    for (const neighbor of neighbors) {
      // Verify boundary and obstacle clearance
      if (neighbor.x >= 0 && neighbor.x < GRID_SIZE && neighbor.y >= 0 && neighbor.y < GRID_SIZE) {
        const key = `${neighbor.x},${neighbor.y}`;
        if (!obstaclesWithoutTail.has(key)) {
          
          // Simulate virtual step to neighbor
          const virtualSnake = [neighbor, ...snake.slice(0, snake.length - 1)]; // shift, tail popped
          const vHead = virtualSnake[0];
          const vTail = virtualSnake[virtualSnake.length - 1];

          const vObstacles = new Set();
          for (let i = 0; i < virtualSnake.length - 1; i++) {
            vObstacles.add(`${virtualSnake[i].x},${virtualSnake[i].y}`);
          }

           // Verify if tail is still reachable after taking this step
          const { path: pathToTail } = bfs(vHead, vTail, vObstacles);
          if (pathToTail !== null) {
            // Heuristic score: maximize the available free space (flood fill),
            // prioritize paths that bring the snake closer to the food (secondary),
            // and use Manhattan distance to tail as a tiebreaker.
            // This prevents the snake from circling in place or running away from food.
            const space = floodFillCount(neighbor, vObstacles);
            const distToFood = Math.abs(neighbor.x - food.x) + Math.abs(neighbor.y - food.y);
            const distToTail = Math.abs(neighbor.x - vTail.x) + Math.abs(neighbor.y - vTail.y);
            const score = space * 10000 - distToFood * 100 + distToTail;

            if (score > bestScore) {
              bestScore = score;
              bestMove = neighbor;
            }
          }
        }
      }
    }

    if (bestMove) {
      // Find current path to tail for overlay drawing
      const { path: tailPath } = bfs(head, tail, obstaclesWithoutTail);
      return {
        move: bestMove,
        path: tailPath,
        visitedNodes,
        status: "SEGUINDO CAUDA"
      };
    }

    // 4. Emergency: No safe move to tail or food. Move to neighbor with the most connect free space
    let emergencyMove = null;
    let maxConnectedArea = -1;

    // Use full body obstacles for survival check
    const fullBodySet = new Set();
    for (const segment of snake) {
      fullBodySet.add(`${segment.x},${segment.y}`);
    }

    for (const neighbor of neighbors) {
      if (neighbor.x >= 0 && neighbor.x < GRID_SIZE && neighbor.y >= 0 && neighbor.y < GRID_SIZE) {
        const key = `${neighbor.x},${neighbor.y}`;
        if (!fullBodySet.has(key)) {
          const area = floodFillCount(neighbor, fullBodySet);
          if (area > maxConnectedArea) {
            maxConnectedArea = area;
            emergencyMove = neighbor;
          }
        }
      }
    }

    return {
      move: emergencyMove,
      path: null,
      visitedNodes,
      status: "EMERGÊNCIA (SOBREVIVÊNCIA)"
    };
  }

  // --- Particle FX System ---
  function spawnParticles(x, y) {
    let particleColor = '#59d499'; // default green
    if (activeTheme === 'cyberpunk') particleColor = '#ffc533';
    
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 3,
        color: particleColor,
        alpha: 1,
        decay: 0.03 + Math.random() * 0.03
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  // --- Rendering Functions ---
  function draw() {
    clearCanvas();
    drawGrid();
    
    if (showNodes && searchedNodes.length > 0 && isAILunning && !isGameOver) {
      drawVisitedNodes();
    }
    
    if (showPath && calculatedPath && calculatedPath.length > 1 && isAILunning && !isGameOver) {
      drawPathRoute();
    }
    
    drawFood();
    drawSnake();
    
    updateParticles();
    drawParticles();
  }

  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function drawGrid() {
    // Canvas background
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (activeTheme === 'classic') return;

    // Draw grid lines
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = activeTheme === 'cyberpunk' ? '#120f18' : '#0e1115';
    
    const cellSize = canvas.width / GRID_SIZE;
    
    for (let i = 0; i <= GRID_SIZE; i++) {
      // Vertical
      ctx.beginPath();
      ctx.moveTo(i * cellSize, 0);
      ctx.lineTo(i * cellSize, canvas.height);
      ctx.stroke();
      
      // Horizontal
      ctx.beginPath();
      ctx.moveTo(0, i * cellSize);
      ctx.lineTo(canvas.width, i * cellSize);
      ctx.stroke();
    }
  }

  function drawVisitedNodes() {
    const cellSize = canvas.width / GRID_SIZE;
    ctx.fillStyle = activeTheme === 'cyberpunk' ? 'rgba(255, 97, 97, 0.08)' : 'rgba(87, 193, 255, 0.08)';
    
    for (const node of searchedNodes) {
      ctx.fillRect(node.x * cellSize + 1, node.y * cellSize + 1, cellSize - 2, cellSize - 2);
    }
  }

  function drawPathRoute() {
    const cellSize = canvas.width / GRID_SIZE;
    
    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = activeTheme === 'cyberpunk' ? 'rgba(255, 97, 97, 0.7)' : 'rgba(87, 193, 255, 0.7)';
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -performance.now() / 150; // scrolling dashed line FX

    // Path connects heads to tail/food
    const startNode = calculatedPath[0];
    ctx.moveTo(startNode.x * cellSize + cellSize / 2, startNode.y * cellSize + cellSize / 2);
    
    for (let i = 1; i < calculatedPath.length; i++) {
      const node = calculatedPath[i];
      ctx.lineTo(node.x * cellSize + cellSize / 2, node.y * cellSize + cellSize / 2);
    }
    
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash
  }

  function drawFood() {
    const cellSize = canvas.width / GRID_SIZE;
    const centerX = food.x * cellSize + cellSize / 2;
    const centerY = food.y * cellSize + cellSize / 2;
    
    // Pulse animation based on time
    const pulse = 1 + 0.15 * Math.sin(performance.now() / 120);
    const radius = (cellSize / 2 - 3) * pulse;

    ctx.save();
    
    if (activeTheme === 'modern-glow') {
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#59d499';
      ctx.fillStyle = '#ffffff';
    } else if (activeTheme === 'retro-green') {
      ctx.fillStyle = '#59d499';
    } else if (activeTheme === 'cyberpunk') {
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ffc533';
      ctx.fillStyle = '#ffc533';
    } else {
      ctx.fillStyle = '#e11d48'; // simple red
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
  }

  function drawSnake() {
    const cellSize = canvas.width / GRID_SIZE;
    
    for (let i = 0; i < snake.length; i++) {
      const segment = snake[i];
      const centerX = segment.x * cellSize + cellSize / 2;
      const centerY = segment.y * cellSize + cellSize / 2;
      
      // Scale down segments from head to tail for organic look
      const segmentRatio = 1 - (i / snake.length) * 0.45; // decays down to 55% size
      const radius = (cellSize / 2 - 1.5) * segmentRatio;

      ctx.save();

      // Theme coloring
      if (activeTheme === 'modern-glow') {
        if (i === 0) {
          ctx.fillStyle = '#ffffff'; // Head is solid white
          ctx.shadowBlur = 15;
          ctx.shadowColor = '#59d499';
        } else {
          // Color gradient from green to deep forest green
          const alpha = 1 - (i / snake.length) * 0.5;
          ctx.fillStyle = `rgba(89, 212, 153, ${alpha})`;
          ctx.shadowBlur = 8;
          ctx.shadowColor = `rgba(89, 212, 153, ${alpha * 0.5})`;
        }
      } else if (activeTheme === 'retro-green') {
        ctx.fillStyle = '#59d499';
        ctx.strokeStyle = '#050608';
        ctx.lineWidth = 1;
      } else if (activeTheme === 'cyberpunk') {
        if (i === 0) {
          ctx.fillStyle = '#ff6161'; // head is ciano/magenta accent
          ctx.shadowBlur = 12;
          ctx.shadowColor = '#ff6161';
        } else {
          // Magenta trailing to violet
          const hue = 320 - (i / snake.length) * 60;
          ctx.fillStyle = `hsla(${hue}, 100%, 65%, 0.8)`;
          ctx.shadowBlur = 6;
          ctx.shadowColor = `hsla(${hue}, 100%, 65%, 0.35)`;
        }
      } else {
        // Classic flat styling
        ctx.fillStyle = i === 0 ? '#ffffff' : '#3f3f46';
      }

      // Draw segment circle/rounded block
      if (activeTheme === 'retro-green' || activeTheme === 'classic') {
        // Flat squares
        ctx.fillRect(
          segment.x * cellSize + (cellSize - radius * 2) / 2,
          segment.y * cellSize + (cellSize - radius * 2) / 2,
          radius * 2,
          radius * 2
        );
        if (activeTheme === 'retro-green') {
          ctx.strokeRect(
            segment.x * cellSize + (cellSize - radius * 2) / 2,
            segment.y * cellSize + (cellSize - radius * 2) / 2,
            radius * 2,
            radius * 2
          );
        }
      } else {
        // Rounded circles
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw eyes on the snake head
      if (i === 0) {
        drawEyes(centerX, centerY, cellSize / 2);
      }

      ctx.restore();
    }
  }

  function drawEyes(cx, cy, headRad) {
    // Eye parameters
    const eyeOffset = headRad * 0.45;
    const eyeSize = 2.5;
    ctx.fillStyle = '#000000';
    
    let eyeX1, eyeY1, eyeX2, eyeY2;

    // Place eyes depending on direction of movement
    if (direction.x === 1) { // Right
      eyeX1 = cx + eyeOffset; eyeY1 = cy - eyeOffset;
      eyeX2 = cx + eyeOffset; eyeY2 = cy + eyeOffset;
    } else if (direction.x === -1) { // Left
      eyeX1 = cx - eyeOffset; eyeY1 = cy - eyeOffset;
      eyeX2 = cx - eyeOffset; eyeY2 = cy + eyeOffset;
    } else if (direction.y === 1) { // Down
      eyeX1 = cx - eyeOffset; eyeY1 = cy + eyeOffset;
      eyeX2 = cx + eyeOffset; eyeY2 = cy + eyeOffset;
    } else { // Up
      eyeX1 = cx - eyeOffset; eyeY1 = cy - eyeOffset;
      eyeX2 = cx + eyeOffset; eyeY2 = cy - eyeOffset;
    }

    ctx.beginPath();
    ctx.arc(eyeX1, eyeY1, eyeSize, 0, Math.PI * 2);
    ctx.arc(eyeX2, eyeY2, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Spark highlight inside eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(eyeX1 + 0.5, eyeY1 - 0.5, 0.8, 0, Math.PI * 2);
    ctx.arc(eyeX2 + 0.5, eyeY2 - 0.5, 0.8, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      
      if (activeTheme === 'modern-glow' || activeTheme === 'cyberpunk') {
        ctx.shadowBlur = 6;
        ctx.shadowColor = p.color;
      }
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // --- UI Metrics Update ---
  function updateUIMetrics() {
    lblScore.textContent = score.toString().padStart(3, '0');
    lblLength.textContent = snake.length;
    
    if (isAILunning) {
      lblAIStatus.textContent = aiStatusText;
      lblNodesSearched.textContent = searchedNodes.length;
      lblRouteLength.textContent = calculatedPath ? calculatedPath.length - 1 : '--';
      
      // Adjust color according to AI state
      lblAIStatus.className = "stat-number font-mono";
      if (aiStatusText === "SEGUINDO COMIDA") {
        lblAIStatus.classList.add("status-good");
      } else if (aiStatusText === "SEGUINDO CAUDA") {
        lblAIStatus.classList.add("status-warning");
      } else {
        lblAIStatus.classList.add("status-danger");
      }
    } else {
      lblNodesSearched.textContent = "--";
      lblRouteLength.textContent = "--";
    }
  }

  // --- Score Synchronizer (API & Database) ---
  async function fetchRecords() {
    try {
      const response = await fetch('/api/score?game=snake');
      if (response.ok) {
        const data = await response.json();
        recordScore = data.pontuacao_maxima || 0;
        recordLength = data.comprimento_maximo || 0;
        
        lblRecordScore.textContent = `${recordScore.toLocaleString('pt-BR')} pts`;
        lblRecordLength.textContent = `${recordLength} blocos`;
      }
    } catch (err) {
      console.warn('Could not connect to scoreboard server. Playing locally.', err);
    }
  }

  async function saveScore() {
    const resultPayload = {
      score: score,
      length: snake.length,
      result: isVictory ? 'win' : 'loss'
    };

    try {
      const response = await fetch('/api/score?game=snake', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(resultPayload)
      });
      
      if (response.ok) {
        const data = await response.json();
        // Update local cache records
        recordScore = data.scores.pontuacao_maxima;
        recordLength = data.scores.comprimento_maximo;
        
        lblRecordScore.textContent = `${recordScore.toLocaleString('pt-BR')} pts`;
        lblRecordLength.textContent = `${recordLength} blocos`;
      }
    } catch (err) {
      console.warn('Failed to submit score to server.', err);
      // Fallback local highscore cache
      if (score > recordScore) {
        recordScore = score;
        recordLength = Math.max(recordLength, snake.length);
        lblRecordScore.textContent = `${recordScore} pts`;
        lblRecordLength.textContent = `${recordLength} blocos`;
      }
    }
  }

  async function resetScores() {
    try {
      const response = await fetch('/api/score?game=snake', {
        method: 'DELETE'
      });
      if (response.ok) {
        recordScore = 0;
        recordLength = 0;
        lblRecordScore.textContent = "0 pts";
        lblRecordLength.textContent = "0 blocos";
      }
    } catch (err) {
      console.error('Failed to reset score values.', err);
    }
  }

  // Expose interface globally for navigation control and pause syncing
  window.AetherSnake = {
    isPlaying: () => startOverlay && startOverlay.classList.contains('hidden') && !isGameOver && !isVictory,
    isPaused: () => isPaused,
    togglePause: () => togglePause()
  };
})();
