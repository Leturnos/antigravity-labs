/**
 * Aether Conveyor — Main Application Orchestrator
 */

import {
  TILE_SIZE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  DIR,
  DIR_DELTA,
  ITEMS,
  BUILDINGS,
  RECIPES,
  CAMPAIGN_SECTORS,
  RESEARCH_TECHS,
} from './config.js';

import { SpatialHashGrid } from './engine/spatial-hash.js?v=3';
import { WorldGrid } from './engine/grid.js?v=3';
import { ConveyorSystem } from './engine/conveyor-system.js?v=3';
import { InserterSystem } from './engine/inserter-system.js?v=3';
import { MachineSystem } from './engine/machine-system.js?v=3';
import { PowerSystem } from './engine/power-system.js?v=3';
import { GameLoop } from './engine/game-loop.js?v=3';
import { SoundSynth } from './audio/sound-synth.js?v=3';
import { Renderer } from './ui/renderer.js?v=3';
import { HUD } from './ui/hud.js?v=3';

let nextBuildingId = 100;

export class App {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.grid = new WorldGrid(WORLD_WIDTH, WORLD_HEIGHT);
    this.spatialHash = new SpatialHashGrid(WORLD_WIDTH * TILE_SIZE, WORLD_HEIGHT * TILE_SIZE, TILE_SIZE, 10000);
    this.conveyorSystem = new ConveyorSystem(this.grid, this.spatialHash);
    this.inserterSystem = new InserterSystem(this.grid, this.conveyorSystem);
    this.machineSystem = new MachineSystem(this.grid, this.conveyorSystem);
    this.powerSystem = new PowerSystem(this.grid);
    this.audio = new SoundSynth();

    this.renderer = new Renderer(
      this.canvas,
      this.grid,
      this.conveyorSystem,
      this.inserterSystem,
      this.machineSystem,
      this.powerSystem
    );
    this.hud = new HUD(this);
    this.loop = new GameLoop(this.tick.bind(this), this.render.bind(this));

    // Active build state
    this.selectedTool = 'CONVEYOR'; // 'CONVEYOR', 'INSERTER', 'MINER', etc., or 'DEMOLISH'
    this.currentDirection = DIR.RIGHT;

    // Line Drag state
    this.isDraggingLine = false;
    this.dragStartGx = 0;
    this.dragStartGy = 0;

    // Pan state
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;
    this.isSpaceDown = false;
    this.keysDown = new Set();
    this.isDraggingDemolish = false;

    // Research & Stockpile state
    this.unlockedTechs = new Set();
    this.techHubInventory = {};

    // Game state
    this.currentSector = 1;
    this.baseEnergy = 180;
    this.maxBaseEnergy = 180;
    this.sectorDeliveries = {};
    this.totalScore = 0;
    this.isGameOver = false;

    // Metrics
    this.recentDeliveries = []; // timestamps for items/min calculation
    this.itemsPerMinute = 0;

    // Mouse coordinates
    this.mouseScreenX = 0;
    this.mouseScreenY = 0;
    this.mouseGridX = 0;
    this.mouseGridY = 0;
  }

  init() {
    this.renderer.resize();
    window.addEventListener('resize', () => this.renderer.resize());

    // Generate terrain & ores
    this.grid.generateMap(42);

    // Setup campaign sector 1
    this.initSector(1);

    // Setup input listeners
    this._bindInputs();

    // Start game simulation loop
    this.loop.start();

    // Give starter setup: place a starter drill, conveyor line, smelter and power pole for instant action!
    this._spawnStarterFactory();
  }

  initSector(sectorIndex) {
    this.currentSector = sectorIndex;
    const sectorDef = CAMPAIGN_SECTORS[sectorIndex - 1];
    if (sectorDef) {
      this.baseEnergy = sectorDef.energyDuration;
      this.maxBaseEnergy = sectorDef.energyDuration;
      this.sectorDeliveries = {};
    } else {
      // Endless mode
      this.baseEnergy = 9999;
      this.maxBaseEnergy = 9999;
    }
  }

  _spawnStarterFactory() {
    // Find Iron Vein near center
    const midX = Math.floor(WORLD_WIDTH / 2);
    const midY = Math.floor(WORLD_HEIGHT / 2);

    // Place a starter solar panel
    this.placeBuildingAt('SOLAR_PANEL', midX - 6, midY - 6, DIR.DOWN);
    this.placeBuildingAt('POWER_POLE', midX - 6, midY - 4, DIR.DOWN);
    this.placeBuildingAt('POWER_POLE', midX - 10, midY - 4, DIR.DOWN);

    // Center camera on starter area
    this.renderer.camX = (midX - 4) * TILE_SIZE;
    this.renderer.camY = (midY - 2) * TILE_SIZE;
  }

  /**
   * Deterministic simulation tick (60 Hz).
   */
  tick(dt) {
    if (this.isGameOver) return;

    // Keyboard Camera Panning (WASD / Arrows)
    const camSpeed = (650 * dt) / this.renderer.zoom;
    if (this.keysDown.has('W') || this.keysDown.has('ARROWUP')) this.renderer.camY -= camSpeed;
    if (this.keysDown.has('S') || this.keysDown.has('ARROWDOWN')) this.renderer.camY += camSpeed;
    if (this.keysDown.has('A') || this.keysDown.has('ARROWLEFT')) this.renderer.camX -= camSpeed;
    if (this.keysDown.has('D') || this.keysDown.has('ARROWRIGHT')) this.renderer.camX += camSpeed;
    this.renderer.clampCamera();

    // 1. Drain base energy in campaign mode
    if (this.currentSector <= CAMPAIGN_SECTORS.length) {
      this.baseEnergy -= dt;
      if (this.baseEnergy <= 0) {
        this.baseEnergy = 0;
        this.triggerGameOver();
        return;
      }
    }

    // 2. Update power grid
    this.powerSystem.update(this.machineSystem.machines, this.inserterSystem.inserters);
    const powerRatio = this.powerSystem.satisfactionRatio;

    // 3. Update conveyor movements
    this.conveyorSystem.update(dt, this.handleItemDelivery.bind(this));

    // 4. Update robotic inserters
    this.inserterSystem.update(dt, powerRatio, this.handleItemDelivery.bind(this));

    // 5. Update machines (miners, smelters, assemblers)
    this.machineSystem.update(dt, powerRatio);

    // 6. Calculate throughput (items / minute)
    const now = performance.now();
    const oneMinAgo = now - 60000;
    while (this.recentDeliveries.length > 0 && this.recentDeliveries[0] < oneMinAgo) {
      this.recentDeliveries.shift();
    }
    this.itemsPerMinute = this.recentDeliveries.length;

    // 7. Update HUD & Stockpile
    this.hud.updateStatusBar({
      baseEnergy: this.baseEnergy,
      maxBaseEnergy: this.maxBaseEnergy,
      currentSector: this.currentSector,
      sectorDeliveries: this.sectorDeliveries,
      itemsPerMinute: this.itemsPerMinute,
      powerGen: this.powerSystem.totalGeneration,
      powerDemand: this.powerSystem.totalDemand,
      powerRatio: this.powerSystem.satisfactionRatio,
    });
    this.hud.updateStockpile(this.techHubInventory);
  }

  /**
   * Render frame.
   */
  render(alpha) {
    // Update holographic preview state
    this._updatePlacementPreview();
    this.renderer.render(alpha);
  }

  /**
   * Item delivered into Tech Hub or building.
   */
  handleItemDelivery(itemType, targetBuilding) {
    if (targetBuilding.type !== 'TECH_HUB') return false;

    this.audio.playItemDelivered();
    this.recentDeliveries.push(performance.now());

    // Add to Tech Hub Inventory stockpile
    this.techHubInventory[itemType] = (this.techHubInventory[itemType] || 0) + 1;

    // Add delivery to current sector progress
    this.sectorDeliveries[itemType] = (this.sectorDeliveries[itemType] || 0) + 1;

    // Energy recharge bonus
    let recharge = 2;
    if (itemType === 'CIRCUIT_BOARD') recharge = 5;
    else if (itemType === 'MICROCHIP') recharge = 10;
    else if (itemType === 'BATTERY_PACK') recharge = 20;
    else if (itemType === 'AETHER_CORE') recharge = 40;

    // Shield Tech Boost multiplier if researched
    if (this.unlockedTechs.has('TECH_AETHER_SHIELD')) {
      recharge *= 2;
    }

    this.baseEnergy = Math.min(this.maxBaseEnergy * 1.5, this.baseEnergy + recharge);
    this.totalScore += recharge * 10;

    // Rising floating visual feedback text over Tech Hub!
    const hubCenterX = (targetBuilding.gx + targetBuilding.width / 2) * 48;
    const hubCenterY = (targetBuilding.gy + 1) * 48;
    const itemInfo = ITEMS[itemType];
    this.renderer.addFloatingText(
      `+1 ${itemInfo?.name || itemType} (+${recharge}s ⚡)`,
      hubCenterX + (Math.random() * 40 - 20),
      hubCenterY,
      itemInfo?.color || '#00f3ff'
    );

    // Check Sector Completion
    const sector = CAMPAIGN_SECTORS[this.currentSector - 1];
    if (sector) {
      let complete = true;
      for (const [reqItem, reqQty] of Object.entries(sector.targetDeliverables)) {
        if ((this.sectorDeliveries[reqItem] || 0) < reqQty) {
          complete = false;
          break;
        }
      }

      if (complete) {
        this.totalScore += sector.rewardScore;
        this.audio.playVictory();
        this.saveScore(true);

        if (this.currentSector < CAMPAIGN_SECTORS.length) {
          const nextSec = this.currentSector + 1;
          this.showStatusModal(
            `SETOR ${this.currentSector} CONCLUÍDO!`,
            '🎉',
            `Excelente trabalho! A matriz de suprimentos alcançou a quota exigida. O Setor ${nextSec} foi desbloqueado com novos insumos.`,
            `Iniciar Setor ${nextSec}`,
            () => this.initSector(nextSec)
          );
        } else {
          this.showStatusModal(
            'VITÓRIA TOTAL!',
            '🏆',
            'Você desenvolveu a infraestrutura completa, produziu os Núcleos Warp e sustentou o reator da Aether! Entrando no Modo Sandbox livre.',
            'Entrar no Modo Sandbox',
            () => this.initSector(CAMPAIGN_SECTORS.length + 1)
          );
        }
      }
    }

    return true;
  }

  showStatusModal(title, icon, message, actionText, onAction) {
    const modal = document.getElementById('status-modal');
    const elTitle = document.getElementById('status-modal-title');
    const elIcon = document.getElementById('status-modal-icon');
    const elMessage = document.getElementById('status-modal-message');
    const btnAction = document.getElementById('btn-status-action');

    if (modal && elTitle && elIcon && elMessage && btnAction) {
      elTitle.textContent = title;
      elIcon.textContent = icon;
      elMessage.textContent = message;
      btnAction.textContent = actionText;

      const newBtn = btnAction.cloneNode(true);
      btnAction.parentNode.replaceChild(newBtn, btnAction);

      newBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        this.audio.playClick();
        if (onAction) onAction();
      });

      modal.classList.add('active');
    }
  }

  triggerGameOver() {
    this.isGameOver = true;
    this.audio.playAlarm();
    this.saveScore(false);

    this.showStatusModal(
      'ESCUDO DE ENERGIA COLAPSADO',
      '⚠️',
      'A energia da base chegou a zero antes que os insumos fossem entregues. O reator central desligou os subsistemas.',
      'Reiniciar Setor',
      () => {
        this.isGameOver = false;
        this.initSector(this.currentSector);
      }
    );
  }

  async saveScore(isWin) {
    try {
      await fetch('/api/score?game=aether_conveyor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game: 'aether_conveyor',
          result: isWin ? 'win' : 'loss',
          score: this.totalScore,
          sector: this.currentSector,
        }),
      });
    } catch {}
  }

  /**
   * Purchases and applies an engineering technology upgrade.
   */
  unlockResearch(techId) {
    if (this.unlockedTechs.has(techId)) return false;

    const tech = RESEARCH_TECHS.find(t => t.id === techId);
    if (!tech) return false;

    // Check affordability from Tech Hub stockpile
    for (const [itemType, reqQty] of Object.entries(tech.cost)) {
      if ((this.techHubInventory[itemType] || 0) < reqQty) {
        return false;
      }
    }

    // Deduct cost
    for (const [itemType, reqQty] of Object.entries(tech.cost)) {
      this.techHubInventory[itemType] -= reqQty;
    }

    this.unlockedTechs.add(techId);
    this.audio.playResearch();
    this.totalScore += 2000;

    // Apply immediate factory enhancements!
    if (tech.effect === 'conveyorSpeedBoost') {
      this.conveyorSystem.speedMultiplier = 1.5;
    } else if (tech.effect === 'inserterSpeedBoost') {
      for (const ins of this.inserterSystem.inserters.values()) {
        ins.swingDuration = 0.4;
      }
      BUILDINGS.INSERTER.swingDuration = 0.4;
    } else if (tech.effect === 'solarBoost') {
      BUILDINGS.SOLAR_PANEL.powerGeneration = 100;
    } else if (tech.effect === 'smelterBoost') {
      RECIPES.SMELT_IRON.craftTime = 1.0;
      RECIPES.SMELT_COPPER.craftTime = 1.0;
      RECIPES.SMELT_SILICON.craftTime = 1.5;
    } else if (tech.effect === 'shieldBoost') {
      this.maxBaseEnergy *= 2.0;
      this.baseEnergy = this.maxBaseEnergy;
    }

    if (this.grid.techHub) {
      this.renderer.addFloatingText(
        `🔬 ${tech.name.toUpperCase()} DESBLOQUEADA!`,
        (this.grid.techHub.gx + 2) * 48,
        (this.grid.techHub.gy + 1) * 48,
        '#a855f7'
      );
    }

    this.saveScore(false);
    return true;
  }

  /**
   * Places a building at grid position.
   */
  placeBuildingAt(type, gx, gy, direction = this.currentDirection) {
    const bDef = BUILDINGS[type];
    if (!bDef) return false;

    const w = bDef.width || 1;
    const h = bDef.height || 1;

    if (!this.grid.isBuildable(gx, gy, w, h)) {
      return false;
    }

    const building = {
      id: `b_${nextBuildingId++}`,
      type,
      name: bDef.name,
      gx,
      gy,
      width: w,
      height: h,
      direction,
      category: bDef.category,
    };

    // Register with grid
    this.grid.placeBuilding(building);

    // Register with specialized subsystems
    if (type === 'CONVEYOR' || type === 'SPLITTER' || type === 'UNDERGROUND_BELT') {
      this.conveyorSystem.register(building);
    } else if (type === 'INSERTER') {
      this.inserterSystem.register(building);
    } else if (type === 'POWER_POLE' || type === 'SOLAR_PANEL' || type === 'DYNAMO_GENERATOR') {
      this.powerSystem.register(building);
      if (type === 'DYNAMO_GENERATOR') {
        this.machineSystem.register(building);
      }
    } else {
      this.machineSystem.register(building);
    }

    this.audio.playPlace();
    return true;
  }

  /**
   * Demolishes building at grid position.
   */
  demolishAt(gx, gy) {
    const building = this.grid.removeBuilding(gx, gy);
    if (!building) return false;

    if (building.type === 'CONVEYOR' || building.type === 'SPLITTER' || building.type === 'UNDERGROUND_BELT') {
      this.conveyorSystem.unregister(building.gx, building.gy);
    } else if (building.type === 'INSERTER') {
      this.inserterSystem.unregister(building.gx, building.gy);
    } else if (building.type === 'POWER_POLE' || building.type === 'SOLAR_PANEL' || building.type === 'DYNAMO_GENERATOR') {
      this.powerSystem.unregister(building.id);
      if (building.type === 'DYNAMO_GENERATOR') {
        this.machineSystem.unregister(building.id);
      }
    } else {
      this.machineSystem.unregister(building.id);
    }

    this.audio.playDemolish();
    return true;
  }

  _updatePlacementPreview() {
    if (this.isSpaceDown || this.isPanning) {
      this.renderer.preview = null;
      return;
    }

    const { gx, gy } = this.renderer.screenToGrid(this.mouseScreenX, this.mouseScreenY);
    this.mouseGridX = gx;
    this.mouseGridY = gy;

    if (this.selectedTool === 'DEMOLISH') {
      const b = this.grid.getBuildingAt(gx, gy);
      this.renderer.preview = {
        type: 'DEMOLISH',
        gx,
        gy,
        valid: Boolean(b && b.type !== 'TECH_HUB'),
      };
      return;
    }

    if (this.isDraggingLine && this.selectedTool === 'CONVEYOR') {
      // Calculate straight line tiles from dragStart to current
      const dx = gx - this.dragStartGx;
      const dy = gy - this.dragStartGy;
      const isHorizontal = Math.abs(dx) >= Math.abs(dy);

      const linePoints = [];
      if (isHorizontal) {
        const step = dx >= 0 ? 1 : -1;
        const dir = dx >= 0 ? DIR.RIGHT : DIR.LEFT;
        for (let x = this.dragStartGx; x !== gx + step; x += step) {
          linePoints.push({
            gx: x,
            gy: this.dragStartGy,
            direction: dir,
            valid: this.grid.isBuildable(x, this.dragStartGy, 1, 1),
          });
        }
      } else {
        const step = dy >= 0 ? 1 : -1;
        const dir = dy >= 0 ? DIR.DOWN : DIR.UP;
        for (let y = this.dragStartGy; y !== gy + step; y += step) {
          linePoints.push({
            gx: this.dragStartGx,
            gy: y,
            direction: dir,
            valid: this.grid.isBuildable(this.dragStartGx, y, 1, 1),
          });
        }
      }

      this.renderer.preview = {
        type: 'CONVEYOR',
        linePoints,
      };
      return;
    }

    const bDef = BUILDINGS[this.selectedTool];
    if (bDef) {
      const valid = this.grid.isBuildable(gx, gy, bDef.width || 1, bDef.height || 1);
      this.renderer.preview = {
        type: this.selectedTool,
        gx,
        gy,
        direction: this.currentDirection,
        valid,
      };
    } else {
      this.renderer.preview = null;
    }
  }

  _bindInputs() {
    // Prevent browser context menu on right click
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Mouse Down
    this.canvas.addEventListener('mousedown', (e) => {
      this.audio.initContext();
      this.audio.startAmbientMusic();

      // Pan with Space + Click, or Middle Click (1), or Right Click (2)
      if (this.isSpaceDown || e.button === 1 || e.button === 2) {
        this.isPanning = true;
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        this.canvas.style.cursor = 'grabbing';
        return;
      }

      if (e.button === 0) {
        const { gx, gy } = this.renderer.screenToGrid(e.clientX, e.clientY);

        if (this.selectedTool === 'DEMOLISH') {
          this.isDraggingDemolish = true;
          this.demolishAt(gx, gy);
          return;
        }

        if (this.selectedTool === 'CONVEYOR') {
          this.isDraggingLine = true;
          this.dragStartGx = gx;
          this.dragStartGy = gy;
          return;
        }

        // Single placement
        const placed = this.placeBuildingAt(this.selectedTool, gx, gy, this.currentDirection);
        if (!placed) {
          // If clicked existing machine, open inspector!
          const existing = this.grid.getBuildingAt(gx, gy);
          if (existing) {
            this.hud.openInspector(existing);
          }
        }
      }
    });

    // Mouse Move
    window.addEventListener('mousemove', (e) => {
      this.mouseScreenX = e.clientX;
      this.mouseScreenY = e.clientY;

      if (this.isPanning) {
        const dx = e.clientX - this.panStartX;
        const dy = e.clientY - this.panStartY;
        this.renderer.camX -= dx / this.renderer.zoom;
        this.renderer.camY -= dy / this.renderer.zoom;
        this.renderer.clampCamera();
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        return;
      }

      const { gx, gy } = this.renderer.screenToGrid(e.clientX, e.clientY);
      const building = this.grid.getBuildingAt(gx, gy);
      const tile = this.grid.getTile(gx, gy);
      this.renderer.hoveredBuilding = (!this.isDraggingLine && !this.isPanning) ? building : null;
      this.renderer.hoveredTile = (!this.isDraggingLine && !this.isPanning && !building && tile && tile.ore) ? tile : null;

      if (this.isDraggingDemolish && this.selectedTool === 'DEMOLISH') {
        this.demolishAt(gx, gy);
      }
    });

    // Mouse Up
    window.addEventListener('mouseup', (e) => {
      if (this.isPanning) {
        this.isPanning = false;
        this.canvas.style.cursor = this.isSpaceDown ? 'grab' : 'crosshair';
      }

      this.isDraggingDemolish = false;

      if (e.button === 0 && this.isDraggingLine && this.selectedTool === 'CONVEYOR') {
        this.isDraggingLine = false;
        // Commit drag-line conveyors
        if (this.renderer.preview && this.renderer.preview.linePoints) {
          for (const pt of this.renderer.preview.linePoints) {
            if (pt.valid) {
              this.placeBuildingAt('CONVEYOR', pt.gx, pt.gy, pt.direction);
            }
          }
        }
      }
    });

    // Mouse Wheel Zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      const newZoom = Math.max(this.renderer.minZoom, Math.min(this.renderer.maxZoom, this.renderer.zoom * zoomFactor));

      // Zoom towards mouse cursor position
      const mouseWorldBefore = this.renderer.screenToWorld(e.clientX, e.clientY);
      this.renderer.zoom = newZoom;
      const mouseWorldAfter = this.renderer.screenToWorld(e.clientX, e.clientY);

      this.renderer.camX += (mouseWorldBefore.wx - mouseWorldAfter.wx);
      this.renderer.camY += (mouseWorldBefore.wy - mouseWorldAfter.wy);
      this.renderer.clampCamera();
    }, { passive: false });

    // Keyboard Hotkeys Down
    window.addEventListener('keydown', (e) => {
      const key = e.key.toUpperCase();
      this.keysDown.add(key);

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this.isSpaceDown = true;
        if (!this.isPanning) {
          this.canvas.style.cursor = 'grab';
        }
      } else if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        this.handleEscapeKey();
      } else if (key === 'P') {
        // Pause toggle
        e.preventDefault();
        const paused = this.loop.togglePause();
        const btnPause = document.getElementById('btn-pause');
        if (btnPause) btnPause.textContent = paused ? '▶ Retomar' : '⏸ Pausa';
        this.audio.playClick();
      } else if (key === 'R') {
        // Rotate direction
        this.currentDirection = (this.currentDirection + 1) % 4;
        this.audio.playClick();
        this._updateHotbarUI();
      } else if (key === 'Q') {
        // Pipette: pick building under cursor
        const b = this.grid.getBuildingAt(this.mouseGridX, this.mouseGridY);
        if (b && BUILDINGS[b.type]) {
          this.selectTool(b.type);
          this.currentDirection = b.direction || DIR.RIGHT;
          this.audio.playClick();
        }
      } else if (key === 'X') {
        // Toggle demolish mode
        this.selectTool(this.selectedTool === 'DEMOLISH' ? 'CONVEYOR' : 'DEMOLISH');
        this.audio.playClick();
      } else if (['1','2','3','4','5','6','7','8','9','0'].includes(key)) {
        const mapping = {
          '1': 'CONVEYOR',
          '2': 'UNDERGROUND_BELT',
          '3': 'SPLITTER',
          '4': 'INSERTER',
          '5': 'MINER',
          '6': 'SMELTER',
          '7': 'ASSEMBLER',
          '8': 'POWER_POLE',
          '9': 'DYNAMO_GENERATOR',
          '0': 'SOLAR_PANEL',
        };
        if (mapping[key]) {
          this.selectTool(mapping[key]);
          this.audio.playClick();
        }
      }
    });

    // Keyboard Hotkeys Up
    window.addEventListener('keyup', (e) => {
      const key = e.key.toUpperCase();
      this.keysDown.delete(key);

      if (e.key === ' ' || e.code === 'Space') {
        this.isSpaceDown = false;
        if (!this.isPanning) {
          this.canvas.style.cursor = 'crosshair';
        }
      }
    });

    // Setup HUD Buttons
    this._bindHUDControls();
  }

  selectTool(toolName) {
    this.selectedTool = toolName;
    this._updateHotbarUI();
  }

  _bindHUDControls() {
    // Hotbar item clicks
    const hotbarSlots = document.querySelectorAll('.hotbar-slot');
    hotbarSlots.forEach(slot => {
      slot.addEventListener('click', () => {
        const tool = slot.dataset.tool;
        if (tool) {
          this.selectTool(tool);
          this.audio.playClick();
        }
      });
    });

    // Speed buttons
    const btn1x = document.getElementById('btn-speed-1x');
    const btn2x = document.getElementById('btn-speed-2x');
    const btn5x = document.getElementById('btn-speed-5x');
    const btnPause = document.getElementById('btn-pause');

    if (btn1x) btn1x.addEventListener('click', () => { this.loop.setSpeed(1.0); this.audio.playClick(); });
    if (btn2x) btn2x.addEventListener('click', () => { this.loop.setSpeed(2.0); this.audio.playClick(); });
    if (btn5x) btn5x.addEventListener('click', () => { this.loop.setSpeed(5.0); this.audio.playClick(); });
    if (btnPause) btnPause.addEventListener('click', () => {
      const paused = this.loop.togglePause();
      btnPause.textContent = paused ? '▶ Retomar' : '⏸ Pausa';
      this.audio.playClick();
    });

    // Sound toggle
    const btnSound = document.getElementById('btn-sound');
    if (btnSound) {
      btnSound.addEventListener('click', () => {
        const muted = this.audio.toggleMute();
        btnSound.textContent = muted ? '🔇 Mudo' : '🔊 Som';
        if (muted) {
          this.audio.stopAmbientMusic();
        } else {
          this.audio.startAmbientMusic();
        }
      });
    }

    // Research Modal
    const btnResearch = document.getElementById('btn-research');
    const modalResearch = document.getElementById('research-modal');
    const btnCloseResearch = document.getElementById('btn-close-research');
    if (btnResearch) {
      btnResearch.addEventListener('click', () => {
        this.hud.openResearchModal();
        this.audio.playClick();
      });
    }
    if (btnCloseResearch && modalResearch) {
      btnCloseResearch.addEventListener('click', () => {
        this.hud.closeResearchModal();
        this.audio.playClick();
      });
    }

    // Guide Modal
    const btnGuide = document.getElementById('btn-guide');
    const modalGuide = document.getElementById('guide-modal');
    const btnCloseGuide = document.getElementById('btn-close-guide');
    if (btnGuide && modalGuide) {
      btnGuide.addEventListener('click', () => {
        modalGuide.classList.add('active');
        this.audio.playClick();
      });
    }
    if (btnCloseGuide && modalGuide) {
      btnCloseGuide.addEventListener('click', () => {
        modalGuide.classList.remove('active');
        this.audio.playClick();
      });
    }

    // Close inspector button
    const btnCloseInspector = document.getElementById('btn-close-inspector');
    if (btnCloseInspector) {
      btnCloseInspector.addEventListener('click', () => this.hud.closeInspector());
    }

    // ── Restart Confirmation Modal ─────────────────────────
    const btnRestart = document.getElementById('btn-restart');
    const modalRestart = document.getElementById('restart-confirm-modal');
    const btnCancelRestart = document.getElementById('btn-cancel-restart');
    const btnConfirmRestart = document.getElementById('btn-confirm-restart');

    if (btnRestart && modalRestart) {
      btnRestart.addEventListener('click', () => {
        modalRestart.classList.add('active');
        if (!this.loop.isPaused) this.loop.pause();
        this.audio.playClick();
      });
    }

    if (btnCancelRestart && modalRestart) {
      btnCancelRestart.addEventListener('click', () => {
        modalRestart.classList.remove('active');
        if (this.loop.isPaused && !this.isGameOver) this.loop.resume();
        this.audio.playClick();
      });
    }

    if (btnConfirmRestart && modalRestart) {
      btnConfirmRestart.addEventListener('click', () => {
        modalRestart.classList.remove('active');
        this.restartSector();
        if (this.loop.isPaused) this.loop.resume();
        this.audio.playClick();
      });
    }

    // ── Game Menu / Pause Modal ────────────────────────────
    const btnMenu = document.getElementById('btn-menu');
    const modalGameMenu = document.getElementById('game-menu-modal');
    const btnCloseGameMenu = document.getElementById('btn-close-game-menu');
    const btnMenuResume = document.getElementById('btn-menu-resume');
    const btnMenuRestart = document.getElementById('btn-menu-restart');
    const btnMenuNewGame = document.getElementById('btn-menu-new-game');
    const btnMenuSound = document.getElementById('btn-menu-sound');
    const btnMenuExit = document.getElementById('btn-menu-exit');

    const openGameMenu = () => {
      if (!modalGameMenu) return;
      modalGameMenu.classList.add('active');
      const elMenuSector = document.getElementById('menu-sector-name');
      if (elMenuSector) {
        const sDef = CAMPAIGN_SECTORS[this.currentSector - 1];
        elMenuSector.textContent = sDef ? sDef.title : `Setor ${this.currentSector}`;
      }
      if (!this.loop.isPaused) this.loop.pause();
      this.audio.playClick();
    };

    const closeGameMenu = () => {
      if (!modalGameMenu) return;
      modalGameMenu.classList.remove('active');
      if (this.loop.isPaused && !this.isGameOver) this.loop.resume();
      this.audio.playClick();
    };

    if (btnMenu) btnMenu.addEventListener('click', openGameMenu);
    if (btnCloseGameMenu) btnCloseGameMenu.addEventListener('click', closeGameMenu);
    if (btnMenuResume) btnMenuResume.addEventListener('click', closeGameMenu);

    if (btnMenuRestart && modalRestart) {
      btnMenuRestart.addEventListener('click', () => {
        closeGameMenu();
        modalRestart.classList.add('active');
        if (!this.loop.isPaused) this.loop.pause();
      });
    }

    if (btnMenuNewGame) {
      btnMenuNewGame.addEventListener('click', () => {
        closeGameMenu();
        this.newGame();
      });
    }

    if (btnMenuSound) {
      btnMenuSound.addEventListener('click', () => {
        const muted = this.audio.toggleMute();
        btnMenuSound.textContent = muted ? '🔇 Ativar Áudio' : '🔊 Silenciar Áudio';
        const topSound = document.getElementById('btn-sound');
        if (topSound) topSound.textContent = muted ? '🔇 Mudo' : '🔊 Som';
        if (muted) this.audio.stopAmbientMusic();
        else this.audio.startAmbientMusic();
      });
    }

    // ── Exit to Hub Modal ──────────────────────────────────
    const btnHubExit = document.getElementById('btn-hub-exit');
    const modalExit = document.getElementById('exit-confirm-modal');
    const btnCancelExit = document.getElementById('btn-cancel-exit');
    const btnConfirmExit = document.getElementById('btn-confirm-exit');

    const openExitModal = () => {
      if (modalGameMenu) modalGameMenu.classList.remove('active');
      if (modalExit) modalExit.classList.add('active');
      if (!this.loop.isPaused) this.loop.pause();
      this.audio.playAlarm();
    };

    if (btnHubExit) btnHubExit.addEventListener('click', openExitModal);
    if (btnMenuExit) btnMenuExit.addEventListener('click', openExitModal);

    if (btnCancelExit && modalExit) {
      btnCancelExit.addEventListener('click', () => {
        modalExit.classList.remove('active');
        if (this.loop.isPaused && !this.isGameOver) this.loop.resume();
        this.audio.playClick();
      });
    }

    if (btnConfirmExit) {
      btnConfirmExit.addEventListener('click', () => {
        window.location.href = '../../index.html?view=view-games';
      });
    }
  }

  handleEscapeKey() {
    const modals = [
      document.getElementById('exit-confirm-modal'),
      document.getElementById('restart-confirm-modal'),
      document.getElementById('research-modal'),
      document.getElementById('guide-modal'),
      document.getElementById('status-modal'),
    ];

    for (const m of modals) {
      if (m && m.classList.contains('active')) {
        m.classList.remove('active');
        if (this.loop.isPaused && !this.isGameOver) {
          this.loop.resume();
          const btnPause = document.getElementById('btn-pause');
          if (btnPause) btnPause.textContent = '⏸ Pausa';
        }
        this.audio.playClick();
        return;
      }
    }

    if (this.hud.selectedBuildingForInspect) {
      this.hud.closeInspector();
      this.audio.playClick();
      return;
    }

    const menuModal = document.getElementById('game-menu-modal');
    if (menuModal) {
      const isActive = menuModal.classList.contains('active');
      if (isActive) {
        menuModal.classList.remove('active');
        if (this.loop.isPaused && !this.isGameOver) {
          this.loop.resume();
          const btnPause = document.getElementById('btn-pause');
          if (btnPause) btnPause.textContent = '⏸ Pausa';
        }
      } else {
        menuModal.classList.add('active');
        const elMenuSector = document.getElementById('menu-sector-name');
        if (elMenuSector) {
          const sDef = CAMPAIGN_SECTORS[this.currentSector - 1];
          elMenuSector.textContent = sDef ? sDef.title : `Setor ${this.currentSector}`;
        }
        if (!this.loop.isPaused) {
          this.loop.pause();
          const btnPause = document.getElementById('btn-pause');
          if (btnPause) btnPause.textContent = '▶ Retomar';
        }
      }
      this.audio.playClick();
    }
  }

  restartSector() {
    this.conveyorSystem.clear();
    this.inserterSystem.clear();
    this.machineSystem.clear();
    this.powerSystem.clear();
    this.grid.generateMap(42 + this.currentSector);
    this.initSector(this.currentSector);
    this.isGameOver = false;
    this._spawnStarterFactory();
    this.renderer.floatingTexts = [];
    this.hud.updateStockpile(this.techHubInventory);
    this.renderer.addFloatingText('Setor Reiniciado!', this.renderer.camX, this.renderer.camY, '#38bdf8');
  }

  newGame() {
    this.unlockedTechs.clear();
    this.techHubInventory = {};
    this.currentSector = 1;
    this.totalScore = 0;
    this.conveyorSystem.speedMultiplier = 1.0;
    this.inserterSystem.speedMultiplier = 1.0;
    this.powerSystem.solarMultiplier = 1.0;
    this.powerSystem.dynamoMultiplier = 1.0;
    this.machineSystem.smelterSpeedMultiplier = 1.0;
    this.restartSector();
    this.renderer.addFloatingText('Nova Campanha!', this.renderer.camX, this.renderer.camY, '#38bdf8');
  }

  _updateHotbarUI() {
    const hotbarSlots = document.querySelectorAll('.hotbar-slot');
    hotbarSlots.forEach(slot => {
      if (slot.dataset.tool === this.selectedTool) {
        slot.classList.add('active');
      } else {
        slot.classList.remove('active');
      }
    });

    // Update direction badge in hotbar
    const dirSymbols = ['↑', '→', '↓', '←'];
    const elDir = document.getElementById('current-dir-txt');
    if (elDir) {
      elDir.textContent = dirSymbols[this.currentDirection];
    }
  }
}

// Auto-bootstrap on DOMContentLoaded
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
  window.__AETHER_CONVEYOR__ = app;
});
