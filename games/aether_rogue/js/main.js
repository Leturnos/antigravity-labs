/**
 * Aether Rogue - Main Game Loop, Canvas Renderer & Controls
 */

import { DungeonGenerator, TILE_WALL, TILE_FLOOR, TILE_CAVE, TILE_EXIT, TILE_LOCKED_GATE } from './dungeon.js';
import { computeFOV } from './fov.js';
import { Player, ScoutDrone, CyberBeast, SentryTurret, BossArchon, Item } from './entities.js';
import { CyberwareManager } from './cyberware.js';
import { SynthAudio } from './audio.js';
import { UIManager } from './ui.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.tileSize = 20; // Canvas cell size in pixels
    this.floorNumber = 1;
    
    this.dungeonGen = new DungeonGenerator(40, 30);
    this.dungeon = null;
    
    this.player = null;
    this.enemies = [];
    this.items = [];
    
    this.cyberware = new CyberwareManager();
    this.audio = new SynthAudio();
    this.ui = new UIManager();
    
    // Override native alert to route messages to UI log or custom modal
    window.alert = (msg) => {
      if (this.ui) this.ui.addLog(msg, 'warn');
    };
    
    this.isProcessingTurn = false;

    this.init();
  }

  init() {
    if (this.canvas) {
      this.canvas.width = 800;
      this.canvas.height = 600;
    }

    this.setupControls();

    // Check for saved run state
    const saved = localStorage.getItem('aether_rogue_save');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.floorNumber = data.floorNumber || 1;
      } catch (e) {}
    }

    this.startNewFloor(this.floorNumber);
  }

  startNewFloor(floor) {
    this.floorNumber = floor;
    this.dungeon = this.dungeonGen.generate(floor);

    // Initialize or preserve Player
    if (!this.player) {
      this.player = new Player(this.dungeon.startPos.x, this.dungeon.startPos.y);
    } else {
      this.player.x = this.dungeon.startPos.x;
      this.player.y = this.dungeon.startPos.y;
    }

    // Spawn Enemies
    this.enemies = [];
    this.dungeon.enemySpawns.forEach((spawn, idx) => {
      let enemy;
      if (floor % 5 === 0 && idx === 0) {
        enemy = new BossArchon(spawn.x, spawn.y);
      } else {
        const rand = Math.random();
        if (rand < 0.4) enemy = new ScoutDrone(spawn.x, spawn.y);
        else if (rand < 0.7) enemy = new CyberBeast(spawn.x, spawn.y);
        else enemy = new SentryTurret(spawn.x, spawn.y);
      }
      this.enemies.push(enemy);
    });

    // Spawn Items & Keycard
    this.items = [];
    if (this.dungeon.keyPos) {
      this.items.push(new Item(this.dungeon.keyPos.x, this.dungeon.keyPos.y, 'Keycard Acesso', '🔑', '#ffd700', 'KEYCARD'));
    }
    this.dungeon.chestPositions.forEach(c => {
      this.items.push(new Item(c.x, c.y, 'Baú de Suprimentos', '📦', '#00ff88', 'CHEST'));
    });

    // Save run progress
    this.saveGame();

    // Initial FOV computation
    computeFOV(this.dungeon, this.player.x, this.player.y, 8 + (this.player.talents.has('sensor') ? 2 : 0));
    
    this.ui.addLog(`Sistemas online. Você entrou no Andar ${this.floorNumber} da masmorra Aether!`, 'info');
    this.render();
  }

  saveGame() {
    try {
      const saveData = {
        floorNumber: this.floorNumber,
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        energy: this.player.energy,
        cyberChips: this.player.cyberChips,
        nanites: this.player.nanites,
        keycards: this.player.keycards,
        talents: Array.from(this.player.talents)
      };
      localStorage.setItem('aether_rogue_save', JSON.stringify(saveData));
    } catch (e) {}
  }

  setupControls() {
    window.addEventListener('keydown', (e) => {
      if (this.player.dead || this.isProcessingTurn) return;

      this.audio.init();

      let dx = 0;
      let dy = 0;

      switch (e.key.toLowerCase()) {
        case 'w': case 'arrowup': dy = -1; break;
        case 's': case 'arrowdown': dy = 1; break;
        case 'a': case 'arrowleft': dx = -1; break;
        case 'd': case 'arrowright': dx = 1; break;
        case ' ': case 'pass':
          this.executeTurn();
          return;
        case '1': this.useSkill('dash'); return;
        case '2': this.useSkill('plasma'); return;
        case '3': this.useSkill('emp'); return;
        case '4': this.useSkill('stealth'); return;
        case '5': this.useSkill('nano'); return;
        case 't': this.ui.toggleTalentsModal(); return;
      }

      if (dx !== 0 || dy !== 0) {
        this.handlePlayerMove(dx, dy);
      }
    });

    // Canvas click listener
    this.canvas.addEventListener('click', (e) => {
      if (this.player.dead || this.isProcessingTurn) return;
      this.audio.init();

      const rect = this.canvas.getBoundingClientRect();
      const clickX = Math.floor((e.clientX - rect.left) / this.tileSize);
      const clickY = Math.floor((e.clientY - rect.top) / this.tileSize);

      const dx = Math.sign(clickX - this.player.x);
      const dy = Math.sign(clickY - this.player.y);

      if (Math.abs(clickX - this.player.x) <= 1 && Math.abs(clickY - this.player.y) <= 1) {
        this.handlePlayerMove(dx, dy);
      }
    });

    const btnAudio = document.getElementById('btn-audio');
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        this.audio.init();
        const muted = this.audio.toggleMute();
        btnAudio.textContent = muted ? '🔇 Som OFF' : '🔊 Som ON';
      });
    }
  }

  handlePlayerMove(dx, dy) {
    const targetX = this.player.x + dx;
    const targetY = this.player.y + dy;

    // Check for enemy bump attack
    const enemyIndex = this.enemies.findIndex(e => !e.dead && e.x === targetX && e.y === targetY);
    if (enemyIndex !== -1) {
      const enemy = this.enemies[enemyIndex];
      const damage = 20;
      enemy.takeDamage(damage);
      this.audio.playLaser();
      this.ui.addLog(`Você atacou ${enemy.name} causando ${damage} de dano!`, 'combat');

      if (enemy.dead) {
        this.player.cyberChips += enemy.chipValue;
        this.ui.addLog(`${enemy.name} destruído! +${enemy.chipValue} Cyber Chips.`, 'item');
        if (this.player.talents.has('vampiric')) {
          this.player.heal(5);
        }
      }

      this.executeTurn();
      return;
    }

    // Check for tile movement
    const tile = this.dungeon.getTile(targetX, targetY);
    if (!tile) return;

    if (tile.type === TILE_LOCKED_GATE) {
      if (this.player.keycards.length > 0) {
        tile.type = TILE_FLOOR;
        this.player.keycards.pop();
        this.ui.addLog(`Você destrancou o Portão de Segurança com o Cartão de Acesso!`, 'item');
        this.audio.playPickup();
        this.executeTurn();
      } else {
        this.ui.addLog(`Portão Trancado! Encontre o Cartão de Acesso no andar.`, 'warn');
      }
      return;
    }

    if (tile.type === TILE_EXIT) {
      this.ui.addLog(`Elevador ativado! Descendo para o próximo andar...`, 'info');
      this.startNewFloor(this.floorNumber + 1);
      return;
    }

    if (tile.isWalkable()) {
      this.player.x = targetX;
      this.player.y = targetY;
      this.audio.playStep();

      // Check item pickups
      const itemIndex = this.items.findIndex(i => i.x === targetX && i.y === targetY);
      if (itemIndex !== -1) {
        const item = this.items[itemIndex];
        this.items.splice(itemIndex, 1);
        this.audio.playPickup();

        if (item.type === 'KEYCARD') {
          this.player.keycards.push('CARD');
          this.ui.addLog(`Cartão de Acesso coletado!`, 'item');
        } else if (item.type === 'CHEST') {
          this.player.cyberChips += 10;
          this.player.nanites += 1;
          this.ui.addLog(`Baú aberto! +10 Cyber Chips e +1 Carga Nanite.`, 'item');
        }
      }

      this.executeTurn();
    }
  }

  useSkill(skillId) {
    const success = this.cyberware.useSkill(
      skillId,
      this.player,
      this.dungeon,
      this.enemies,
      (msg, type) => this.ui.addLog(msg, type)
    );

    if (success) {
      this.audio.playEMP();
      this.executeTurn();
    }
  }

  executeTurn() {
    this.isProcessingTurn = true;

    // 1. Tick cooldowns & stealth
    this.cyberware.tickCooldowns();
    if (this.player.stealthTurns > 0) {
      this.player.stealthTurns--;
    }

    // 2. Restore minor energy per turn
    this.player.restoreEnergy(2);

    // 3. Enemy turns
    this.enemies.forEach((enemy) => {
      enemy.updateAI(this.dungeon, this.player, (msg, type) => this.ui.addLog(msg, type));
    });

    // 4. Update FOV
    computeFOV(this.dungeon, this.player.x, this.player.y, 8 + (this.player.talents.has('sensor') ? 2 : 0));

    // 5. Check Player Death
    if (this.player.dead) {
      this.ui.addLog(`FALHA NO SISTEMA: Você foi destruído! Fim de jogo.`, 'warn');
      localStorage.removeItem('aether_rogue_save');
      this.ui.showGameOverModal(this.floorNumber, this.player.cyberChips, () => {
        window.location.reload();
      });
      return;
    }

    this.render();
    this.isProcessingTurn = false;
  }

  render() {
    if (!this.canvas || !this.ctx || !this.dungeon) return;

    // 1. Clear Canvas
    this.ctx.fillStyle = '#040408';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 2. Render Dungeon Tiles
    for (let y = 0; y < this.dungeon.height; y++) {
      for (let x = 0; x < this.dungeon.width; x++) {
        const tile = this.dungeon.grid[y][x];
        const px = x * this.tileSize;
        const py = y * this.tileSize;

        if (!tile.explored) {
          // Render faint unexplored grid pattern
          this.ctx.fillStyle = '#06060e';
          this.ctx.fillRect(px, py, this.tileSize, this.tileSize);
          this.ctx.strokeStyle = 'rgba(0, 243, 255, 0.02)';
          this.ctx.strokeRect(px, py, this.tileSize, this.tileSize);
          continue;
        }

        if (tile.type === TILE_WALL) {
          this.ctx.fillStyle = tile.visible ? '#1a1a35' : '#0d0d1a';
          this.ctx.fillRect(px, py, this.tileSize, this.tileSize);
          this.ctx.strokeStyle = tile.visible ? 'rgba(0, 243, 255, 0.2)' : 'rgba(255, 255, 255, 0.03)';
          this.ctx.strokeRect(px, py, this.tileSize, this.tileSize);
        } else if (tile.type === TILE_EXIT) {
          this.ctx.fillStyle = '#00ff88';
          this.ctx.fillRect(px, py, this.tileSize, this.tileSize);
          this.ctx.fillStyle = '#000';
          this.ctx.font = 'bold 12px Orbitron';
          this.ctx.fillText('E', px + 5, py + 14);
        } else if (tile.type === TILE_LOCKED_GATE) {
          this.ctx.fillStyle = '#ff0055';
          this.ctx.fillRect(px, py, this.tileSize, this.tileSize);
          this.ctx.fillStyle = '#fff';
          this.ctx.font = '12px Orbitron';
          this.ctx.fillText('🔒', px + 2, py + 14);
        } else {
          this.ctx.fillStyle = tile.visible ? '#0b0b1e' : '#06060c';
          this.ctx.fillRect(px, py, this.tileSize, this.tileSize);
          this.ctx.strokeStyle = tile.visible ? 'rgba(0, 243, 255, 0.06)' : 'transparent';
          this.ctx.strokeRect(px, py, this.tileSize, this.tileSize);
        }
      }
    }

    // 3. Render Items
    this.items.forEach(item => {
      const tile = this.dungeon.getTile(item.x, item.y);
      if (tile && tile.visible) {
        this.ctx.fillStyle = item.color;
        this.ctx.font = '14px Orbitron';
        this.ctx.fillText(item.symbol, item.x * this.tileSize + 2, item.y * this.tileSize + 15);
      }
    });

    // 4. Render Enemies
    this.enemies.forEach(enemy => {
      if (enemy.dead) return;
      const tile = this.dungeon.getTile(enemy.x, enemy.y);
      if (tile && tile.visible) {
        this.ctx.fillStyle = enemy.color;
        this.ctx.font = 'bold 14px Fira Code';
        this.ctx.fillText(enemy.symbol, enemy.x * this.tileSize + 4, enemy.y * this.tileSize + 15);
      }
    });

    // 5. Render Player
    const playerTile = this.dungeon.getTile(this.player.x, this.player.y);
    if (playerTile) {
      this.ctx.fillStyle = this.player.stealthTurns > 0 ? '#9d4edd' : this.player.color;
      this.ctx.shadowColor = this.player.color;
      this.ctx.shadowBlur = 10;
      this.ctx.font = 'bold 16px Orbitron';
      this.ctx.fillText(this.player.symbol, this.player.x * this.tileSize + 3, this.player.y * this.tileSize + 15);
      this.ctx.shadowBlur = 0;
    }

    // 6. Update UI Components
    this.ui.updateHUD(this.player, this.floorNumber);
    this.ui.renderSkills(this.cyberware, this.player, (id) => this.useSkill(id));
    this.ui.renderInventory(this.player);
    this.ui.renderMinimap(this.dungeon, this.player);
    this.ui.renderTalentsModal(this.cyberware, this.player, (id, cost) => {
      if (this.player.cyberChips >= cost) {
        this.player.cyberChips -= cost;
        this.player.talents.add(id);
        if (id === 'matrixDodge') this.player.dodgeChance += 0.15;
        this.ui.addLog(`Talento desbloqueado!`, 'item');
        this.render();
      }
    });
  }
}

// Start game safely regardless of document ready state
function initGame() {
  if (typeof window !== 'undefined') {
    window.gameInstance = new Game();
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initGame);
  } else {
    initGame();
  }
}
