import { Camera } from './engine/camera.js';
import { RaycasterEngine } from './engine/raycaster.js';
import { TextureGenerator } from './engine/texture.js';
import { MapGenerator } from './world/map-generator.js';
import { DoorManager } from './world/door.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { Projectile } from './entities/projectile.js';
import { EntityManager } from './entities/entity-manager.js';
import { SynthAudio } from './audio/synth-audio.js';
import { HUD } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';

export class Game {
  constructor() {
    this.canvas = typeof document !== 'undefined' ? document.getElementById('gameCanvas') : null;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.width = 640;
    this.height = 400;

    if (this.canvas) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }

    this.textures = TextureGenerator.generateAll();
    this.spriteTextures = TextureGenerator.generateSprites();
    this.raycaster = new RaycasterEngine();
    this.mapGen = new MapGenerator();
    this.audio = new SynthAudio();
    this.hud = new HUD();
    this.minimap = new Minimap();

    this.keys = {};
    this.mouseLocked = false;
    this.sector = 1;
    this.isGameOver = false;
    this.isPaused = false;

    this.initSector(1);
    this.bindEvents();
  }

  initSector(sectorNum) {
    this.sector = sectorNum;
    const data = this.mapGen.generateSector(sectorNum);
    this.map = data.map;
    this.doorManager = new DoorManager(data.doors);

    if (!this.player) {
      this.player = new Player(data.spawnPoint.x + 0.5, data.spawnPoint.y + 0.5);
    } else {
      this.player.x = data.spawnPoint.x + 0.5;
      this.player.y = data.spawnPoint.y + 0.5;
      this.player.hasKey = false;
    }

    this.camera = new Camera(this.player.x, this.player.y, 1, 0, 0, 0.66);
    this.entityManager = new EntityManager();

    // Spawn Enemies
    for (const e of data.enemySpawns) {
      this.entityManager.enemies.push(new Enemy(e.x, e.y, e.type));
    }

    // Spawn Items
    for (const it of data.itemSpawns) {
      this.entityManager.items.push({ x: it.x, y: it.y, type: it.type, collected: false });
    }

    // Add Cyber Key item
    this.entityManager.items.push({
      x: data.keyPoint.x + 0.5,
      y: data.keyPoint.y + 0.5,
      type: 'key',
      collected: false,
    });

    this.hud.showNotification(`SETOR 0${sectorNum} INICIALIZADO // ALCANCE O ELEVADOR`, 3.0);
  }

  bindEvents() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      // Pause toggle (ESC or P)
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        this.togglePause();
        return;
      }

      // Fullscreen (F)
      if (e.code === 'KeyF') {
        e.preventDefault();
        this.toggleFullscreen();
        return;
      }

      // Quick restart (R)
      if (e.code === 'KeyR') {
        e.preventDefault();
        this.restartSector();
        return;
      }

      // Quick Help (H)
      if (e.code === 'KeyH') {
        e.preventDefault();
        this.toggleHelp();
        return;
      }

      // Quick Mute (M)
      if (e.code === 'KeyM') {
        e.preventDefault();
        this.toggleMute();
        return;
      }

      if (this.isPaused || this.isGameOver) return;

      if (e.code === 'Space') {
        this.playerShoot();
      }
      if (e.code === 'KeyE') {
        this.interact();
      }

      this.audio.ensureContext();
      if (!this.audio.isPlayingMusic && !this.audio.isMuted) {
        this.audio.startSynthwaveMusic();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    if (this.canvas) {
      this.canvas.addEventListener('click', () => {
        if (this.isPaused || this.isGameOver) return;
        if (!this.mouseLocked) {
          if (this.canvas.requestPointerLock) {
            this.canvas.requestPointerLock();
          }
        } else {
          this.playerShoot();
        }
        this.audio.ensureContext();
        if (!this.audio.isPlayingMusic && !this.audio.isMuted) {
          this.audio.startSynthwaveMusic();
        }
      });
    }

    document.addEventListener('pointerlockchange', () => {
      this.mouseLocked = document.pointerLockElement === this.canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (this.mouseLocked && this.camera && !this.isPaused && !this.isGameOver) {
        this.camera.rotate(e.movementX * 0.003);
      }
    });

    // Control bar buttons
    const btnPause = document.getElementById('btnPause');
    if (btnPause) btnPause.addEventListener('click', () => this.togglePause());

    const btnRestart = document.getElementById('btnRestart');
    if (btnRestart) btnRestart.addEventListener('click', () => this.restartGame());

    const btnFullscreen = document.getElementById('btnFullscreen');
    if (btnFullscreen) btnFullscreen.addEventListener('click', () => this.toggleFullscreen());

    const muteBtn = document.getElementById('muteBtn');
    if (muteBtn) muteBtn.addEventListener('click', () => this.toggleMute());

    const btnHelp = document.getElementById('btnHelp');
    if (btnHelp) btnHelp.addEventListener('click', () => this.toggleHelp());

    // Pause Modal Buttons
    const btnResumeGame = document.getElementById('btnResumeGame');
    if (btnResumeGame) btnResumeGame.addEventListener('click', () => this.togglePause());

    const btnRestartFromPause = document.getElementById('btnRestartFromPause');
    if (btnRestartFromPause) btnRestartFromPause.addEventListener('click', () => {
      this.togglePause();
      this.restartSector();
    });

    const btnToggleSoundPause = document.getElementById('btnToggleSoundPause');
    if (btnToggleSoundPause) btnToggleSoundPause.addEventListener('click', () => this.toggleMute());

    const btnOpenHelpFromPause = document.getElementById('btnOpenHelpFromPause');
    if (btnOpenHelpFromPause) btnOpenHelpFromPause.addEventListener('click', () => {
      this.hideModal('pauseModal');
      this.showModal('helpModal');
    });

    // Help Modal Close
    const btnCloseHelp = document.getElementById('btnCloseHelp');
    if (btnCloseHelp) btnCloseHelp.addEventListener('click', () => {
      this.hideModal('helpModal');
      if (this.isPaused) {
        this.showModal('pauseModal');
      }
    });

    // Game Over Buttons
    const btnRestartFromOver = document.getElementById('btnRestartFromOver');
    if (btnRestartFromOver) btnRestartFromOver.addEventListener('click', () => this.restartGame());

    // Score Submission
    const submitBtn = document.getElementById('submitScoreBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        const nameInput = document.getElementById('playerName');
        const rawName = nameInput ? nameInput.value.trim().toUpperCase() : '';
        const playerName = rawName.length >= 3 ? rawName : 'CYBER_AGENTE';
        const feedbackBox = document.getElementById('scoreFeedbackBox');

        submitBtn.disabled = true;
        submitBtn.textContent = 'TRANSMITINDO DADOS...';

        try {
          const res = await fetch('/api/scores/aether_raycaster', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              game: 'aether_raycaster',
              name: playerName,
              score: this.player.score,
              sector: this.sector,
            }),
          });
          if (res.ok) {
            submitBtn.textContent = '✅ PONTUAÇÃO REGISTRADA COM SUCESSO';
            if (feedbackBox) {
              feedbackBox.className = 'modal-feedback-msg modal-feedback-success';
              feedbackBox.style.display = 'block';
              feedbackBox.textContent = `Pontuação de ${this.player.score} salva no Placar Global para ${playerName}!`;
            }
          } else {
            submitBtn.textContent = '✅ REGISTRO CONCLUÍDO';
            if (feedbackBox) {
              feedbackBox.className = 'modal-feedback-msg modal-feedback-success';
              feedbackBox.style.display = 'block';
              feedbackBox.textContent = 'Pontuação processada localmente.';
            }
          }
        } catch {
          submitBtn.textContent = '✅ SALVO LOCALMENTE';
          if (feedbackBox) {
            feedbackBox.className = 'modal-feedback-msg modal-feedback-success';
            feedbackBox.style.display = 'block';
            feedbackBox.textContent = 'Gravado no banco de dados local.';
          }
        }
      });
    }
  }

  togglePause() {
    if (this.isGameOver) return;
    this.isPaused = !this.isPaused;
    const pauseModal = document.getElementById('pauseModal');
    const btnPause = document.getElementById('btnPause');

    if (this.isPaused) {
      if (document.exitPointerLock) document.exitPointerLock();
      // Update pause stats
      const pauseSector = document.getElementById('pauseSector');
      const pauseScore = document.getElementById('pauseScore');
      const pauseHealth = document.getElementById('pauseHealth');
      const pauseAmmo = document.getElementById('pauseAmmo');
      if (pauseSector) pauseSector.textContent = `Setor 0${this.sector}`;
      if (pauseScore) pauseScore.textContent = `${this.player.score}`;
      if (pauseHealth) pauseHealth.textContent = `${Math.ceil(this.player.hp)} / ${Math.ceil(this.player.shield)}`;
      if (pauseAmmo) pauseAmmo.textContent = `${this.player.ammo}`;

      if (pauseModal) pauseModal.style.display = 'flex';
      if (btnPause) btnPause.textContent = '▶️ CONTINUAR (ESC)';
    } else {
      if (pauseModal) pauseModal.style.display = 'none';
      if (btnPause) btnPause.textContent = '⏸️ PAUSAR (ESC/P)';
    }
  }

  toggleFullscreen() {
    const container = document.getElementById('gameContainer') || document.documentElement;
    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen().catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.isMuted);
    const muteBtn = document.getElementById('muteBtn');
    const btnToggleSoundPause = document.getElementById('btnToggleSoundPause');
    const text = this.audio.isMuted ? '🔇 SOM MUDO (M)' : '🔊 SOM ATIVO (M)';
    if (muteBtn) muteBtn.textContent = text;
    if (btnToggleSoundPause) btnToggleSoundPause.textContent = text;
  }

  toggleHelp() {
    const helpModal = document.getElementById('helpModal');
    if (!helpModal) return;
    if (helpModal.style.display === 'flex') {
      helpModal.style.display = 'none';
    } else {
      if (!this.isPaused && !this.isGameOver) {
        this.togglePause();
      }
      helpModal.style.display = 'flex';
    }
  }

  showModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  }

  hideModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  restartSector() {
    this.hideModal('pauseModal');
    this.hideModal('gameOverModal');
    this.isGameOver = false;
    this.isPaused = false;
    this.player.hp = this.player.maxHp;
    this.player.shield = this.player.maxShield;
    this.player.ammo = Math.max(50, this.player.ammo);
    this.initSector(this.sector);
    const btnPause = document.getElementById('btnPause');
    if (btnPause) btnPause.textContent = '⏸️ PAUSAR (ESC/P)';
  }

  restartGame() {
    this.hideModal('pauseModal');
    this.hideModal('gameOverModal');
    this.isGameOver = false;
    this.isPaused = false;
    this.sector = 1;
    this.player = new Player(2.5, 2.5);
    this.initSector(1);
    const btnPause = document.getElementById('btnPause');
    if (btnPause) btnPause.textContent = '⏸️ PAUSAR (ESC/P)';
  }

  playerShoot() {
    if (this.isGameOver || this.isPaused || !this.player.canShoot()) return;
    this.player.consumeAmmo();
    this.audio.playLaser();

    const speed = 14.0;
    const damage = this.player.overchargeTimer > 0 ? 50 : 25;
    const color = this.player.overchargeTimer > 0 ? '#ffd600' : '#00ffff';

    this.entityManager.projectiles.push(
      new Projectile(
        this.camera.posX,
        this.camera.posY,
        this.camera.dirX * speed,
        this.camera.dirY * speed,
        true,
        damage,
        color
      )
    );
  }

  interact() {
    if (this.isPaused || this.isGameOver) return;
    // Check if near locked door in front of player
    for (const dist of [0.8, 1.2, 1.6]) {
      const frontX = Math.floor(this.camera.posX + this.camera.dirX * dist);
      const frontY = Math.floor(this.camera.posY + this.camera.dirY * dist);
      if (this.map[frontY] && this.map[frontY][frontX] === 5) {
        const res = this.doorManager.tryUnlock(frontX, frontY, this.player.hasKey);
        if (res.success && this.player.hasKey) {
          this.map[frontY][frontX] = 4;
          this.hud.showNotification('ACESSO AUTORIZADO // PORTA DESBLOQUEADA', 3.0);
        } else {
          this.hud.showNotification('ACESSO NEGADO // REQUER CHAVE CYBER DESTE SETOR', 3.0);
        }
        break;
      }
    }
  }

  update(dt) {
    if (this.isGameOver || this.isPaused) return;

    const moveSpeed = 3.5 * dt;
    const rotSpeed = 2.5 * dt;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) this.camera.moveForward(moveSpeed, this.map);
    if (this.keys['KeyS'] || this.keys['ArrowDown']) this.camera.moveBackward(moveSpeed, this.map);
    if (this.keys['KeyA']) this.camera.strafeLeft(moveSpeed, this.map);
    if (this.keys['KeyD']) this.camera.strafeRight(moveSpeed, this.map);
    if (this.keys['ArrowLeft']) this.camera.rotate(-rotSpeed);
    if (this.keys['ArrowRight']) this.camera.rotate(rotSpeed);

    this.player.x = this.camera.posX;
    this.player.y = this.camera.posY;

    this.player.update(dt);
    this.doorManager.update(dt, this.player.x, this.player.y, this.entityManager.enemies);
    this.entityManager.update(dt, this.player, this.map, (sfx) => {
      if (sfx === 'laser') this.audio.playLaser();
      if (sfx === 'explosion') this.audio.playExplosion();
      if (sfx === 'pickup') this.audio.playPickup();
      if (sfx === 'hurt') this.audio.playHurt();
    });

    this.hud.update(dt);
    this.minimap.reveal(this.player.x, this.player.y, 6);

    // Check elevator exit tile
    const currentCell = this.map[Math.floor(this.player.y)][Math.floor(this.player.x)];
    if (currentCell === 9) {
      this.player.addScore(1000);
      this.player.heal(40);
      this.audio.playPickup();
      this.initSector(this.sector + 1);
    }

    if (this.player.hp <= 0 && !this.isGameOver) {
      this.isGameOver = true;
      this.showGameOverModal();
    }
  }

  render() {
    if (!this.ctx) return;

    // Clear Floor and Ceiling with cyber gradient
    const gradCeil = this.ctx.createLinearGradient(0, 0, 0, this.height / 2);
    gradCeil.addColorStop(0, '#020408');
    gradCeil.addColorStop(1, '#08121f');
    this.ctx.fillStyle = gradCeil;
    this.ctx.fillRect(0, 0, this.width, this.height / 2);

    const gradFloor = this.ctx.createLinearGradient(0, this.height / 2, 0, this.height);
    gradFloor.addColorStop(0, '#0a0d14');
    gradFloor.addColorStop(1, '#020508');
    this.ctx.fillStyle = gradFloor;
    this.ctx.fillRect(0, this.height / 2, this.width, this.height / 2);

    // Raycast Walls
    const doorStates = this.doorManager.getDoorStates();
    const { zBuffer, wallSlices } = this.raycaster.castRays(
      this.camera,
      this.map,
      this.width,
      this.height,
      doorStates
    );

    for (let x = 0; x < this.width; x++) {
      const slice = wallSlices[x];
      if (!slice) continue;
      const tex = this.textures[slice.wallType] || this.textures[1];
      if (tex) {
        let sampleX = slice.wallX;
        if (slice.isDoor && slice.doorOffset) {
          sampleX = slice.wallX - slice.doorOffset;
          if (sampleX < 0) sampleX += 1.0;
        }
        const texX = Math.abs(Math.floor(sampleX * 64)) % 64;
        const sliceH = Math.max(1, slice.drawEnd - slice.drawStart);
        this.ctx.drawImage(tex, texX, 0, 1, 64, x, slice.drawStart, 1, sliceH);

        // Depth Fog Dimming
        const darkness = Math.min(0.85, slice.perpWallDist * 0.08);
        this.ctx.fillStyle = `rgba(2, 5, 10, ${darkness})`;
        this.ctx.fillRect(x, slice.drawStart, 1, sliceH);
      }
    }

    // Render Sprites & Entities
    this.entityManager.renderSprites(
      this.ctx,
      this.camera,
      zBuffer,
      this.width,
      this.height,
      this.spriteTextures
    );

    // Render HUD & Minimap
    this.hud.render(this.ctx, this.player, this.sector, this.width, this.height);
    this.minimap.render(this.ctx, this.map, this.camera, this.entityManager.enemies);

    // If Paused, overlay a subtle dimming filter
    if (this.isPaused) {
      this.ctx.fillStyle = 'rgba(2, 5, 12, 0.6)';
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.font = 'bold 20px "Courier New", monospace';
      this.ctx.fillStyle = '#00ffff';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('⚡ JOGO PAUSADO ⚡', this.width / 2, this.height / 2 - 20);
      this.ctx.font = '12px "Courier New", monospace';
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText('Pressione ESC ou P para continuar', this.width / 2, this.height / 2 + 10);
      this.ctx.textAlign = 'left';
    }
  }

  showGameOverModal() {
    const modal = document.getElementById('gameOverModal');
    const finalScore = document.getElementById('finalScore');
    const finalSector = document.getElementById('finalSector');
    if (finalScore) finalScore.textContent = `${this.player.score}`;
    if (finalSector) finalSector.textContent = `Setor 0${this.sector}`;
    if (modal) modal.style.display = 'flex';
    if (typeof document !== 'undefined' && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  start() {
    let lastTime = typeof performance !== 'undefined' ? performance.now() : 0;
    const loop = (currentTime) => {
      const dt = Math.min(0.1, (currentTime - lastTime) / 1000);
      lastTime = currentTime;
      this.update(dt);
      this.render();
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(loop);
      }
    };
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(loop);
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.start();
  });
}
