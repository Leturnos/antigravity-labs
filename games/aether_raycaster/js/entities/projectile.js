export class Projectile {
  constructor(x, y, vx, vy, isPlayer = true, damage = 25, color = '#00ffff') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.isPlayer = isPlayer;
    this.damage = damage;
    this.color = color;
    this.alive = true;
    this.lifetime = 3.0;
  }

  update(dt, map) {
    if (!this.alive) return;
    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.alive = false;
      return;
    }

    const nextX = this.x + this.vx * dt;
    const nextY = this.y + this.vy * dt;

    const mx = Math.floor(nextX);
    const my = Math.floor(nextY);

    if (my < 0 || my >= map.length || mx < 0 || mx >= map[0].length) {
      this.alive = false;
      return;
    }

    const cell = map[my][mx];
    if (cell === 1 || cell === 2 || cell === 3 || cell === 5) {
      this.alive = false;
      return;
    }

    this.x = nextX;
    this.y = nextY;
  }
}
