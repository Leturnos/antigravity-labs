export class MapGenerator {
  generateSector(sectorNumber = 1) {
    const size = Math.min(40, 24 + (sectorNumber - 1) * 2);
    const map = Array.from({ length: size }, () => Array(size).fill(1));
    const rooms = [];
    const numRooms = Math.min(10, 6 + Math.floor(sectorNumber / 2));

    const minSize = 4;
    const maxSize = 7;

    for (let attempts = 0; attempts < 300 && rooms.length < numRooms; attempts++) {
      const w = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
      const h = Math.floor(Math.random() * (maxSize - minSize + 1)) + minSize;
      const x = Math.floor(Math.random() * (size - w - 2)) + 1;
      const y = Math.floor(Math.random() * (size - h - 2)) + 1;

      const newRoom = { x, y, w, h, cx: Math.floor(x + w / 2), cy: Math.floor(y + h / 2) };

      let overlaps = false;
      for (const r of rooms) {
        if (
          newRoom.x < r.x + r.w + 1 &&
          newRoom.x + newRoom.w + 1 > r.x &&
          newRoom.y < r.y + r.h + 1 &&
          newRoom.y + newRoom.h + 1 > r.y
        ) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        rooms.push(newRoom);
        // Carve room
        for (let ry = y; ry < y + h; ry++) {
          for (let rx = x; rx < x + w; rx++) {
            map[ry][rx] = 0;
          }
        }
      }
    }

    // Connect rooms with corridors
    const doors = [];
    for (let i = 0; i < rooms.length - 1; i++) {
      const r1 = rooms[i];
      const r2 = rooms[i + 1];

      let cx = r1.cx;
      let cy = r1.cy;

      while (cx !== r2.cx) {
        if (map[cy][cx] === 1) map[cy][cx] = 0;
        cx += cx < r2.cx ? 1 : -1;
      }
      while (cy !== r2.cy) {
        if (map[cy][cx] === 1) map[cy][cx] = 0;
        cy += cy < r2.cy ? 1 : -1;
      }
    }

    // Player spawn in Room 0
    const spawnPoint = { x: rooms[0].cx, y: rooms[0].cy };

    // Exit elevator in Last Room
    const lastRoom = rooms[rooms.length - 1];
    const exitPoint = { x: lastRoom.cx, y: lastRoom.cy };
    map[exitPoint.y][exitPoint.x] = 9;

    // Cyber Key in middle room
    const keyRoomIndex = Math.floor(rooms.length / 2);
    const keyRoom = rooms[keyRoomIndex];
    const keyPoint = { x: keyRoom.cx, y: keyRoom.cy };

    // Add automatic doors (4) and one locked door (5) near exit room
    for (let i = 1; i < rooms.length; i++) {
      const room = rooms[i];
      const isLocked = i === rooms.length - 1;
      doors.push({
        x: room.x,
        y: room.cy,
        type: isLocked ? 5 : 4,
        openRatio: 0,
      });
      map[room.cy][room.x] = isLocked ? 5 : 4;
    }

    // Decorate random walls with server panels (2) or hazard panels (3)
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (map[y][x] === 1 && Math.random() < 0.2) {
          map[y][x] = Math.random() < 0.5 ? 2 : 3;
        }
      }
    }

    // Spawn enemies and items
    const enemySpawns = [];
    const itemSpawns = [];
    const enemyCount = 4 + sectorNumber * 2;

    for (let i = 1; i < rooms.length; i++) {
      const r = rooms[i];
      // Enemies
      enemySpawns.push({
        x: r.cx + (Math.random() - 0.5),
        y: r.cy + (Math.random() - 0.5),
        type: i % 3 === 0 ? 'heavy' : 'drone',
      });
      // Pickups
      itemSpawns.push({
        x: r.x + 1,
        y: r.y + 1,
        type: Math.random() < 0.5 ? 'ammo' : 'health',
      });
    }

    // Overcharge core powerup in one random room
    itemSpawns.push({
      x: rooms[1] ? rooms[1].cx : spawnPoint.x,
      y: rooms[1] ? rooms[1].y + 1 : spawnPoint.y,
      type: 'overcharge',
    });

    return {
      map,
      spawnPoint,
      exitPoint,
      keyPoint,
      enemySpawns,
      itemSpawns,
      doors,
    };
  }
}
