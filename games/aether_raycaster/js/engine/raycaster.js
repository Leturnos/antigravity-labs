export class RaycasterEngine {
  castRays(camera, map, width, height, doorStates = {}) {
    const zBuffer = new Float32Array(width);
    const wallSlices = new Array(width);
    const mapH = map.length;
    const mapW = map[0].length;

    for (let x = 0; x < width; x++) {
      const cameraX = (2 * x) / width - 1;
      const rayDirX = camera.dirX + camera.planeX * cameraX;
      const rayDirY = camera.dirY + camera.planeY * cameraX;

      let mapX = Math.floor(camera.posX);
      let mapY = Math.floor(camera.posY);

      const deltaDistX = Math.abs(1 / rayDirX);
      const deltaDistY = Math.abs(1 / rayDirY);

      let stepX;
      let sideDistX;
      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (camera.posX - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1.0 - camera.posX) * deltaDistX;
      }

      let stepY;
      let sideDistY;
      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (camera.posY - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1.0 - camera.posY) * deltaDistY;
      }

      let hit = 0;
      let side = 0; // 0 for X-wall, 1 for Y-wall
      let isDoor = false;
      let doorOffset = 0;
      let wallType = 1;

      while (hit === 0) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }

        if (mapX < 0 || mapX >= mapW || mapY < 0 || mapY >= mapH) {
          hit = 1;
          wallType = 1;
          break;
        }

        const cell = map[mapY][mapX];
        if (cell > 0) {
          if (cell === 4 || cell === 5) {
            // Door hit calculation
            const doorKey = `${mapX},${mapY}`;
            const doorOpenRatio = doorStates[doorKey] !== undefined ? doorStates[doorKey] : 0.0;
            
            // Check if ray hits the door plane (center of cell)
            let perpDoorDist;
            if (side === 0) {
              perpDoorDist = (mapX - camera.posX + (1 - stepX) / 2 + 0.5 * stepX) / rayDirX;
            } else {
              perpDoorDist = (mapY - camera.posY + (1 - stepY) / 2 + 0.5 * stepY) / rayDirY;
            }
            
            let doorHitX;
            if (side === 0) {
              doorHitX = camera.posY + perpDoorDist * rayDirY;
            } else {
              doorHitX = camera.posX + perpDoorDist * rayDirX;
            }
            doorHitX -= Math.floor(doorHitX);

            if (doorHitX >= doorOpenRatio && doorHitX <= 1.0) {
              hit = 1;
              isDoor = true;
              doorOffset = doorOpenRatio;
              wallType = cell;
            }
          } else {
            hit = 1;
            wallType = cell;
          }
        }
      }

      let perpWallDist;
      if (side === 0) {
        perpWallDist = (mapX - camera.posX + (1 - stepX) / 2) / rayDirX;
      } else {
        perpWallDist = (mapY - camera.posY + (1 - stepY) / 2) / rayDirY;
      }

      if (perpWallDist <= 0.0001) perpWallDist = 0.0001;
      zBuffer[x] = perpWallDist;

      const lineHeight = Math.floor(height / perpWallDist);
      const drawStart = Math.max(0, -lineHeight / 2 + height / 2);
      const drawEnd = Math.min(height - 1, lineHeight / 2 + height / 2);

      let wallX;
      if (side === 0) {
        wallX = camera.posY + perpWallDist * rayDirY;
      } else {
        wallX = camera.posX + perpWallDist * rayDirX;
      }
      wallX -= Math.floor(wallX);

      wallSlices[x] = {
        x,
        drawStart,
        drawEnd,
        lineHeight,
        side,
        wallX,
        perpWallDist,
        wallType,
        mapX,
        mapY,
        isDoor,
        doorOffset,
      };
    }

    return { zBuffer, wallSlices };
  }
}
