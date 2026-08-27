export class Camera {
  constructor(posX = 2.5, posY = 2.5, dirX = 1, dirY = 0, planeX = 0, planeY = 0.66) {
    this.posX = posX;
    this.posY = posY;
    this.dirX = dirX;
    this.dirY = dirY;
    this.planeX = planeX;
    this.planeY = planeY;
    this.radius = 0.25;
  }

  rotate(angle) {
    const oldDirX = this.dirX;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.dirX = this.dirX * cos - this.dirY * sin;
    this.dirY = oldDirX * sin + this.dirY * cos;

    const oldPlaneX = this.planeX;
    this.planeX = this.planeX * cos - this.planeY * sin;
    this.planeY = oldPlaneX * sin + this.planeY * cos;
  }

  tryMove(dx, dy, map) {
    const newX = this.posX + dx;
    const newY = this.posY + dy;
    const r = this.radius;

    // Check corners for smooth wall sliding
    const isSolid = (x, y) => {
      const mx = Math.floor(x);
      const my = Math.floor(y);
      if (my < 0 || my >= map.length || mx < 0 || mx >= map[0].length) return true;
      const cell = map[my][mx];
      return cell === 1 || cell === 2 || cell === 3 || cell === 5;
    };

    if (!isSolid(newX + Math.sign(dx) * r, this.posY) && !isSolid(newX, this.posY - r) && !isSolid(newX, this.posY + r)) {
      this.posX = newX;
    }
    if (!isSolid(this.posX, newY + Math.sign(dy) * r) && !isSolid(this.posX - r, newY) && !isSolid(this.posX + r, newY)) {
      this.posY = newY;
    }
  }

  moveForward(speed, map) {
    this.tryMove(this.dirX * speed, this.dirY * speed, map);
  }

  moveBackward(speed, map) {
    this.tryMove(-this.dirX * speed, -this.dirY * speed, map);
  }

  strafeLeft(speed, map) {
    this.tryMove(-this.planeX * speed, -this.planeY * speed, map);
  }

  strafeRight(speed, map) {
    this.tryMove(this.planeX * speed, this.planeY * speed, map);
  }
}
