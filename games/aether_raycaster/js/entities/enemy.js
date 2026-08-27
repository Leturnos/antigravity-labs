import { Projectile } from './projectile.js';

export class Enemy {
  constructor(x, y, type = 'drone') {
    this.x = x;
    this.y = y;
    this.type = type;
    this.hp = type === 'heavy' ? 80 : 30;
    this.maxHp = this.hp;
    this.alive = true;
    this.state = 'patrol'; // 'patrol', 'chase', 'attack'
    this.attackCooldown = 0;
    this.moveSpeed = type === 'heavy' ? 1.2 : 2.0;
    this.color = type === 'heavy' ? '#ff0055' : '#00e5ff';
    this.patrolAngle = Math.random() * Math.PI * 2;
    this.patrolTimer = 2.0;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.alive = false;
    }
  }

  update(dt, player, map, castRayLOS) {
    if (!this.alive) return null;

    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);
    const hasLOS = distToPlayer < 12.0 && castRayLOS(this.x, this.y, player.x, player.y, map);

    if (hasLOS) {
      this.state = distToPlayer < (this.type === 'heavy' ? 5.0 : 2.5) ? 'attack' : 'chase';
    } else if (this.state === 'chase' && distToPlayer > 14.0) {
      this.state = 'patrol';
    }

    let firedProjectile = null;

    if (this.state === 'chase') {
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      const nx = this.x + Math.cos(angle) * this.moveSpeed * dt;
      const ny = this.y + Math.sin(angle) * this.moveSpeed * dt;
      const mx = Math.floor(nx);
      const my = Math.floor(ny);
      if (map[my] && map[my][mx] === 0) {
        this.x = nx;
        this.y = ny;
      }
    } else if (this.state === 'attack') {
      if (this.attackCooldown <= 0) {
        this.attackCooldown = this.type === 'heavy' ? 1.8 : 1.4;
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        const speed = 6.0;
        firedProjectile = new Projectile(
          this.x,
          this.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          false,
          this.type === 'heavy' ? 20 : 10,
          this.type === 'heavy' ? '#ff0055' : '#ffea00'
        );
      }
    } else {
      // Patrol
      this.patrolTimer -= dt;
      if (this.patrolTimer <= 0) {
        this.patrolAngle = Math.random() * Math.PI * 2;
        this.patrolTimer = 2.0 + Math.random() * 2.0;
      }
      const nx = this.x + Math.cos(this.patrolAngle) * (this.moveSpeed * 0.5) * dt;
      const ny = this.y + Math.sin(this.patrolAngle) * (this.moveSpeed * 0.5) * dt;
      const mx = Math.floor(nx);
      const my = Math.floor(ny);
      if (map[my] && map[my][mx] === 0) {
        this.x = nx;
        this.y = ny;
      } else {
        this.patrolTimer = 0;
      }
    }

    return firedProjectile;
  }
}
