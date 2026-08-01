/**
 * Aether Rogue - Procedural Dungeon Generator
 * Hybrid BSP (Binary Space Partitioning) + Cellular Automata Caverns + Flood Fill Validation
 */

export const TILE_WALL = 0;
export const TILE_FLOOR = 1;
export const TILE_CAVE = 2;
export const TILE_DOOR = 3;
export const TILE_LOCKED_GATE = 4;
export const TILE_EXIT = 5;

export class Tile {
  constructor(x, y, type = TILE_WALL) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.explored = false;
    this.visible = false;
  }

  isWalkable() {
    return this.type !== TILE_WALL && this.type !== TILE_LOCKED_GATE;
  }

  isOpaque() {
    return this.type === TILE_WALL || this.type === TILE_DOOR || this.type === TILE_LOCKED_GATE;
  }
}

export class Room {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.centerX = Math.floor(x + w / 2);
    this.centerY = Math.floor(y + h / 2);
  }

  intersects(other) {
    return (
      this.x <= other.x + other.w &&
      this.x + this.w >= other.x &&
      this.y <= other.y + other.h &&
      this.y + this.h >= other.y
    );
  }
}

export class Dungeon {
  constructor(width = 50, height = 50) {
    this.width = width;
    this.height = height;
    this.grid = [];
    this.rooms = [];
    this.startPos = { x: 0, y: 0 };
    this.exitPos = { x: 0, y: 0 };
    this.keyPos = { x: 0, y: 0 };
    this.gatePos = { x: 0, y: 0 };
    this.chestPositions = [];
    this.enemySpawns = [];
  }

  getTile(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null;
    }
    return this.grid[y][x];
  }
}

export class DungeonGenerator {
  constructor(width = 50, height = 50) {
    this.width = width;
    this.height = height;
  }

  generate(floorNumber = 1) {
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
      attempts++;
      const dungeon = new Dungeon(this.width, this.height);
      
      // 1. Initialize empty grid with walls
      dungeon.grid = Array.from({ length: this.height }, (_, y) =>
        Array.from({ length: this.width }, (_, x) => new Tile(x, y, TILE_WALL))
      );

      // 2. Generate BSP Rooms
      this._generateBSPRooms(dungeon);

      // 3. Generate Cellular Automata Caverns in outer/unoccupied areas
      this._generateCaverns(dungeon);

      // 4. Carve Corridors connecting room centers
      this._connectRooms(dungeon);

      // 5. Place Keycard, Gate, Exit, Chests, and Enemies
      this._placeElements(dungeon, floorNumber);

      // 6. Validate 100% pathability via Flood-Fill
      if (this._validatePathability(dungeon)) {
        return dungeon;
      }
    }

    // Fallback simple layout if maximum attempts reached
    return this._createFallbackDungeon(floorNumber);
  }

  _generateBSPRooms(dungeon) {
    const minSize = 6;
    const rooms = [];
    
    // Subdivide grid leaves
    const leaves = [{ x: 2, y: 2, w: this.width - 4, h: this.height - 4 }];
    
    for (let i = 0; i < 4; i++) {
      for (let j = leaves.length - 1; j >= 0; j--) {
        const leaf = leaves[j];
        if (leaf.w > minSize * 2 || leaf.h > minSize * 2) {
          const splitH = Math.random() > 0.5;
          if (splitH && leaf.h > minSize * 2) {
            const split = Math.floor(minSize + Math.random() * (leaf.h - minSize * 2));
            leaves.push({ x: leaf.x, y: leaf.y, w: leaf.w, h: split });
            leaves.push({ x: leaf.x, y: leaf.y + split, w: leaf.w, h: leaf.h - split });
            leaves.splice(j, 1);
          } else if (!splitH && leaf.w > minSize * 2) {
            const split = Math.floor(minSize + Math.random() * (leaf.w - minSize * 2));
            leaves.push({ x: leaf.x, y: leaf.y, w: split, h: leaf.h });
            leaves.push({ x: leaf.x + split, y: leaf.y, w: leaf.w - split, h: leaf.h });
            leaves.splice(j, 1);
          }
        }
      }
    }

    // Create room inside each leaf
    leaves.forEach((leaf) => {
      const w = Math.floor(minSize + Math.random() * (leaf.w - minSize - 1));
      const h = Math.floor(minSize + Math.random() * (leaf.h - minSize - 1));
      const x = Math.floor(leaf.x + Math.random() * (leaf.w - w));
      const y = Math.floor(leaf.y + Math.random() * (leaf.h - h));

      if (x > 1 && y > 1 && x + w < this.width - 1 && y + h < this.height - 1) {
        const room = new Room(x, y, w, h);
        rooms.push(room);

        // Carve room tiles
        for (let ry = y; ry < y + h; ry++) {
          for (let rx = x; rx < x + w; rx++) {
            dungeon.grid[ry][rx].type = TILE_FLOOR;
          }
        }
      }
    });

    dungeon.rooms = rooms;
  }

  _generateCaverns(dungeon) {
    // 4-8 Cellular Automata smoothing in wall regions
    const caveGrid = Array.from({ length: this.height }, () => Array(this.width).fill(false));
    
    // Seed noise in empty areas
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (dungeon.grid[y][x].type === TILE_WALL) {
          caveGrid[y][x] = Math.random() < 0.45;
        }
      }
    }

    // 4 iterations of smoothing
    for (let step = 0; step < 4; step++) {
      const nextGrid = Array.from({ length: this.height }, () => Array(this.width).fill(false));
      for (let y = 1; y < this.height - 1; y++) {
        for (let x = 1; x < this.width - 1; x++) {
          if (dungeon.grid[y][x].type === TILE_FLOOR) continue; // Keep rooms intact

          let count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (caveGrid[y + dy][x + dx]) count++;
            }
          }
          nextGrid[y][x] = count >= 5;
        }
      }
      for (let y = 1; y < this.height - 1; y++) {
        for (let x = 1; x < this.width - 1; x++) {
          if (dungeon.grid[y][x].type !== TILE_FLOOR && !nextGrid[y][x]) {
            dungeon.grid[y][x].type = TILE_CAVE;
          }
        }
      }
    }
  }

  _connectRooms(dungeon) {
    for (let i = 0; i < dungeon.rooms.length - 1; i++) {
      const roomA = dungeon.rooms[i];
      const roomB = dungeon.rooms[i + 1];

      let x = roomA.centerX;
      let y = roomA.centerY;

      while (x !== roomB.centerX) {
        if (dungeon.grid[y][x].type === TILE_WALL) {
          dungeon.grid[y][x].type = TILE_FLOOR;
        }
        x += x < roomB.centerX ? 1 : -1;
      }
      while (y !== roomB.centerY) {
        if (dungeon.grid[y][x].type === TILE_WALL) {
          dungeon.grid[y][x].type = TILE_FLOOR;
        }
        y += y < roomB.centerY ? 1 : -1;
      }
    }
  }

  _placeElements(dungeon, floorNumber) {
    if (dungeon.rooms.length < 2) return;

    // Start in room 0
    dungeon.startPos = { x: dungeon.rooms[0].centerX, y: dungeon.rooms[0].centerY };

    // Exit in last room
    const lastRoom = dungeon.rooms[dungeon.rooms.length - 1];
    dungeon.exitPos = { x: lastRoom.centerX, y: lastRoom.centerY };
    const exitTile = dungeon.getTile(dungeon.exitPos.x, dungeon.exitPos.y);
    if (exitTile) exitTile.type = TILE_EXIT;

    // Place Keycard in middle room
    const midRoomIndex = Math.floor(dungeon.rooms.length / 2);
    const midRoom = dungeon.rooms[midRoomIndex];
    dungeon.keyPos = { x: midRoom.centerX, y: midRoom.centerY };

    // Place Locked Gate in exit room entrance
    dungeon.gatePos = { x: lastRoom.x, y: lastRoom.centerY };
    const gateTile = dungeon.getTile(dungeon.gatePos.x, dungeon.gatePos.y);
    if (gateTile) gateTile.type = TILE_LOCKED_GATE;

    // Chests & Enemies in remaining rooms
    dungeon.rooms.forEach((room, idx) => {
      if (idx !== 0 && idx !== midRoomIndex && idx !== dungeon.rooms.length - 1) {
        dungeon.chestPositions.push({ x: room.x + 1, y: room.y + 1 });
        dungeon.enemySpawns.push({ x: room.centerX, y: room.centerY });
      }
    });
  }

  _validatePathability(dungeon) {
    // BFS from startPos to keyPos, then to exitPos
    const canReachKey = this._bfsReach(dungeon, dungeon.startPos, dungeon.keyPos, false);
    const canReachExit = this._bfsReach(dungeon, dungeon.startPos, dungeon.exitPos, true);
    return canReachKey && canReachExit;
  }

  _bfsReach(dungeon, start, target, allowGate) {
    if (!start || !target) return false;
    const queue = [start];
    const visited = new Set([`${start.x},${start.y}`]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current.x === target.x && current.y === target.y) return true;

      const neighbors = [
        { x: current.x + 1, y: current.y },
        { x: current.x - 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x, y: current.y - 1 },
      ];

      for (const n of neighbors) {
        const key = `${n.x},${n.y}`;
        const tile = dungeon.getTile(n.x, n.y);

        if (tile && !visited.has(key)) {
          visited.add(key);
          const isWalkable = tile.type !== TILE_WALL && (allowGate || tile.type !== TILE_LOCKED_GATE);
          if (isWalkable) {
            if (n.x === target.x && n.y === target.y) return true;
            queue.push(n);
          }
        }
      }
    }
    return false;
  }

  _createFallbackDungeon(floorNumber) {
    const dungeon = new Dungeon(this.width, this.height);
    dungeon.grid = Array.from({ length: this.height }, (_, y) =>
      Array.from({ length: this.width }, (_, x) => new Tile(x, y, TILE_FLOOR))
    );
    // Boundary walls
    for (let x = 0; x < this.width; x++) {
      dungeon.grid[0][x].type = TILE_WALL;
      dungeon.grid[this.height - 1][x].type = TILE_WALL;
    }
    for (let y = 0; y < this.height; y++) {
      dungeon.grid[y][0].type = TILE_WALL;
      dungeon.grid[y][this.width - 1].type = TILE_WALL;
    }

    dungeon.startPos = { x: 5, y: 5 };
    dungeon.keyPos = { x: Math.floor(this.width / 2), y: Math.floor(this.height / 2) };
    dungeon.gatePos = { x: this.width - 6, y: Math.floor(this.height / 2) };
    dungeon.exitPos = { x: this.width - 3, y: this.height - 3 };

    const gateTile = dungeon.getTile(dungeon.gatePos.x, dungeon.gatePos.y);
    if (gateTile) gateTile.type = TILE_LOCKED_GATE;

    const exitTile = dungeon.getTile(dungeon.exitPos.x, dungeon.exitPos.y);
    if (exitTile) exitTile.type = TILE_EXIT;

    return dungeon;
  }
}
