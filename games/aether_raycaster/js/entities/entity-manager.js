import { Projectile } from './projectile.js';

export class EntityManager {
  constructor() {
    this.enemies = [];
    this.projectiles = [];
    this.items = []; // { x, y, type: 'ammo'|'health'|'key'|'overcharge', collected: false }
    this.particles = [];
  }

  addParticle(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.0 + Math.random() * 3.0;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        life: 0.5,
        maxLife: 0.5,
      });
    }
  }

  update(dt, player, map, onSound) {
    // Projectiles
    for (const p of this.projectiles) {
      if (typeof p.update === 'function') {
        p.update(dt, map);
      }
      if (!p.alive) continue;

      if (p.isPlayer) {
        for (const e of this.enemies) {
          if (e.alive && Math.hypot(e.x - p.x, e.y - p.y) < 0.45) {
            e.takeDamage(p.damage);
            p.alive = false;
            this.addParticle(e.x, e.y, e.color, 12);
            if (!e.alive) {
              player.addScore(e.type === 'heavy' ? 250 : 100);
              if (onSound) onSound('explosion');
            } else if (onSound) {
              onSound('hit');
            }
            break;
          }
        }
      } else {
        // Enemy projectile hits player
        if (Math.hypot(player.x - p.x, player.y - p.y) < 0.4) {
          p.alive = false;
          player.takeDamage(p.damage);
          this.addParticle(player.x, player.y, '#ff1744', 10);
          if (onSound) onSound('hurt');
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);

    // Enemies
    const castRayLOS = (x1, y1, x2, y2, m) => {
      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.ceil(dist * 4);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const cx = Math.floor(x1 + (x2 - x1) * t);
        const cy = Math.floor(y1 + (y2 - y1) * t);
        if (m[cy] && (m[cy][cx] === 1 || m[cy][cx] === 2 || m[cy][cx] === 3 || m[cy][cx] === 5)) {
          return false;
        }
      }
      return true;
    };

    for (const e of this.enemies) {
      const proj = e.update(dt, player, map, castRayLOS);
      if (proj) {
        const projectile = (typeof proj.update === 'function')
          ? proj
          : new Projectile(proj.x, proj.y, proj.vx, proj.vy, proj.isPlayer, proj.damage, proj.color);
        this.projectiles.push(projectile);
        if (onSound) onSound('laser');
      }
    }

    // Items
    for (const it of this.items) {
      if (!it.collected && Math.hypot(it.x - player.x, it.y - player.y) < 0.6) {
        if (it.type === 'ammo' && player.ammo < player.maxAmmo) {
          it.collected = true;
          player.addAmmo(25);
          if (onSound) onSound('pickup');
        } else if (it.type === 'health' && player.hp < player.maxHp) {
          it.collected = true;
          player.heal(30);
          if (onSound) onSound('pickup');
        } else if (it.type === 'key' && !player.hasKey) {
          it.collected = true;
          player.hasKey = true;
          player.addScore(500);
          if (onSound) onSound('pickup');
        } else if (it.type === 'overcharge') {
          it.collected = true;
          player.overchargeTimer = 10.0;
          if (onSound) onSound('pickup');
        }
      }
    }

    // Particles
    for (const pt of this.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
  }

  renderSprites(ctx, camera, zBuffer, screenW, screenH, spriteTextures = {}) {
    if (!ctx) return;
    const sprites = [];

    for (const e of this.enemies) {
      if (e.alive) {
        sprites.push({
          x: e.x,
          y: e.y,
          color: e.color,
          size: e.type === 'heavy' ? 0.95 : 0.7,
          isEnemy: true,
          type: e.type,
          hpRatio: e.hp / e.maxHp,
        });
      }
    }

    for (const p of this.projectiles) {
      sprites.push({
        x: p.x,
        y: p.y,
        color: p.color,
        size: 0.22,
        isProjectile: true,
        type: 'projectile',
      });
    }

    for (const it of this.items) {
      if (!it.collected) {
        sprites.push({
          x: it.x,
          y: it.y,
          color:
            it.type === 'key'
              ? '#00e5ff'
              : it.type === 'health'
              ? '#00e676'
              : it.type === 'overcharge'
              ? '#ffd600'
              : '#ffee55',
          size: 0.5,
          isItem: true,
          type: it.type,
        });
      }
    }

    // Sort by distance (furthest first)
    sprites.sort((a, b) => {
      const distA = (a.x - camera.posX) ** 2 + (a.y - camera.posY) ** 2;
      const distB = (b.x - camera.posX) ** 2 + (b.y - camera.posY) ** 2;
      return distB - distA;
    });

    const invDet = 1.0 / (camera.planeX * camera.dirY - camera.dirX * camera.planeY);

    for (const spr of sprites) {
      const spriteX = spr.x - camera.posX;
      const spriteY = spr.y - camera.posY;

      const transformX = invDet * (camera.dirY * spriteX - camera.dirX * spriteY);
      const transformY = invDet * (-camera.planeY * spriteX + camera.planeX * spriteY);

      if (transformY <= 0.15) continue; // Behind player

      const spriteScreenX = Math.floor((screenW / 2) * (1 + transformX / transformY));
      const spriteHeight = Math.abs(Math.floor(screenH / transformY)) * spr.size;
      const drawStartY = Math.max(0, Math.floor(-spriteHeight / 2 + screenH / 2));
      const drawEndY = Math.min(screenH - 1, Math.floor(spriteHeight / 2 + screenH / 2));

      const spriteWidth = spriteHeight;
      const drawStartX = Math.max(0, Math.floor(-spriteWidth / 2 + spriteScreenX));
      const drawEndX = Math.min(screenW - 1, Math.floor(spriteWidth / 2 + spriteScreenX));

      const sprTex = spriteTextures ? spriteTextures[spr.type] : null;

      // Draw sprite columns
      ctx.fillStyle = spr.color;
      let centerVisible = false;

      for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
        if (transformY < zBuffer[stripe]) {
          if (stripe === spriteScreenX) centerVisible = true;
          if (sprTex) {
            const texX = Math.min(
              63,
              Math.max(
                0,
                Math.floor(((stripe - (-spriteWidth / 2 + spriteScreenX)) * 64) / spriteWidth)
              )
            );
            ctx.drawImage(sprTex, texX, 0, 1, 64, stripe, drawStartY, 1, drawEndY - drawStartY);
          } else {
            ctx.fillRect(stripe, drawStartY, 1, drawEndY - drawStartY);
          }
        }
      }

      // Overhead indicators when entity is in line-of-sight
      if (centerVisible && transformY < 12.0) {
        if (spr.isEnemy) {
          // Overhead mini health bar
          const barW = Math.max(20, Math.min(60, spriteWidth * 0.8));
          const barH = 4;
          const barX = spriteScreenX - barW / 2;
          const barY = drawStartY - 8;
          if (barY > 10) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
            ctx.fillStyle = spr.hpRatio > 0.5 ? '#00e676' : spr.hpRatio > 0.25 ? '#ffd600' : '#ff1744';
            ctx.fillRect(barX, barY, barW * spr.hpRatio, barH);
          }
        } else if (spr.isItem && transformY < 7.0) {
          // Floating item label in Portuguese
          const labels = {
            ammo: '⚡ MUNIÇÃO',
            health: '✚ KIT MÉDICO',
            key: '🔑 CHAVE CYBER',
            overcharge: '⚡ SOBRECARGA',
          };
          const text = labels[spr.type] || spr.type.toUpperCase();
          const labelY = drawStartY - 8;
          if (labelY > 15) {
            if (ctx.save) ctx.save();
            ctx.font = 'bold 10px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(5, 10, 20, 0.85)';
            ctx.strokeStyle = spr.color;
            ctx.lineWidth = 1;
            const tw = ctx.measureText ? ctx.measureText(text).width : 50;
            if (ctx.fillRect) ctx.fillRect(spriteScreenX - tw / 2 - 4, labelY - 10, tw + 8, 14);
            if (ctx.strokeRect) ctx.strokeRect(spriteScreenX - tw / 2 - 4, labelY - 10, tw + 8, 14);
            ctx.fillStyle = spr.color;
            if (ctx.fillText) ctx.fillText(text, spriteScreenX, labelY);
            if (ctx.restore) ctx.restore();
          }
        }
      }
    }
  }
}
