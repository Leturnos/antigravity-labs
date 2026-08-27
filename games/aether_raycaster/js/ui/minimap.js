export class Minimap {
  constructor() {
    this.explored = new Set();
  }

  reveal(playerX, playerY, radius = 5) {
    const px = Math.floor(playerX);
    const py = Math.floor(playerY);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          this.explored.add(`${px + dx},${py + dy}`);
        }
      }
    }
  }

  render(ctx, map, camera, enemies = [], x = 16, y = 130, size = 120) {
    if (!ctx || !map || !map.length || !camera) return;

    ctx.save();
    ctx.fillStyle = 'rgba(5, 10, 15, 0.9)';
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, size, size);
    ctx.strokeRect(x, y, size, size);

    const mapH = map.length;
    const mapW = map[0].length;
    const cellSize = size / mapW;

    for (let my = 0; my < mapH; my++) {
      for (let mx = 0; mx < mapW; mx++) {
        if (!this.explored.has(`${mx},${my}`)) continue;
        const cell = map[my][mx];
        if (cell === 1 || cell === 2 || cell === 3) {
          ctx.fillStyle = '#0088aa';
          ctx.fillRect(x + mx * cellSize, y + my * cellSize, cellSize, cellSize);
        } else if (cell === 4 || cell === 5) {
          ctx.fillStyle = cell === 5 ? '#ff1744' : '#00e5ff';
          ctx.fillRect(x + mx * cellSize, y + my * cellSize, cellSize, cellSize);
        } else if (cell === 9) {
          ctx.fillStyle = '#00e676';
          ctx.fillRect(x + mx * cellSize, y + my * cellSize, cellSize, cellSize);
        }
      }
    }

    // Draw enemies
    ctx.fillStyle = '#ff0055';
    for (const e of enemies) {
      if (e && e.alive && this.explored.has(`${Math.floor(e.x)},${Math.floor(e.y)}`)) {
        ctx.fillRect(x + e.x * cellSize - 1.5, y + e.y * cellSize - 1.5, 3, 3);
      }
    }

    // Draw player & view angle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + camera.posX * cellSize, y + camera.posY * cellSize, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#ffff00';
    ctx.beginPath();
    ctx.moveTo(x + camera.posX * cellSize, y + camera.posY * cellSize);
    ctx.lineTo(
      x + (camera.posX + camera.dirX * 2) * cellSize,
      y + (camera.posY + camera.dirY * 2) * cellSize
    );
    ctx.stroke();

    ctx.restore();
  }
}
