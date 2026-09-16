/**
 * WorldGrid — Map, Terrain, Ore Veins & Building Placement Manager
 */

import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  TILE_SIZE,
  BUILDINGS,
} from '../config.js';

export class WorldGrid {
  /**
   * @param {number} width
   * @param {number} height
   */
  constructor(width = WORLD_WIDTH, height = WORLD_HEIGHT) {
    this.width = width;
    this.height = height;
    this.tiles = new Array(width * height);
    this.buildings = new Map(); // id -> building object
    this.techHub = null;

    this.initEmptyGrid();
  }

  /**
   * Initializes empty grid tiles.
   */
  initEmptyGrid() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;
        this.tiles[idx] = {
          x,
          y,
          terrain: 'floor_metal',
          ore: null,
          oreAmount: 0,
          building: null,
          buildingRoot: null, // { gx, gy } for multi-tile buildings
        };
      }
    }
  }

  /**
   * Generates procedural ore patches using deterministic pseudo-random circles.
   */
  generateMap(seed = 1337) {
    this.initEmptyGrid();
    this.buildings.clear();

    // Pseudo-random helper
    let s = seed;
    const random = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };

    const spawnVein = (oreType, centerX, centerY, radius, richness = 50000) => {
      const r2 = radius * radius;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const distSq = dx * dx + dy * dy;
          if (distSq <= r2) {
            const gx = Math.floor(centerX + dx);
            const gy = Math.floor(centerY + dy);
            if (gx >= 1 && gx < this.width - 1 && gy >= 1 && gy < this.height - 1) {
              // Soft edge falloff
              if (distSq < r2 * 0.75 || random() > 0.3) {
                const tile = this.getTile(gx, gy);
                if (tile && !tile.ore) {
                  tile.ore = oreType;
                  tile.oreAmount = richness;
                }
              }
            }
          }
        }
      }
    };

    const midX = Math.floor(this.width / 2);
    const midY = Math.floor(this.height / 2);

    // Place Tech Hub in center (4x4 tiles)
    const hubX = midX - 2;
    const hubY = midY - 2;
    this.techHub = {
      id: 'tech_hub',
      type: 'TECH_HUB',
      name: 'Central Tech Core',
      gx: hubX,
      gy: hubY,
      width: 4,
      height: 4,
      category: 'hub',
      powerUsage: 0,
      deliveredCounts: {},
      inventory: {},
    };

    // Mark hub tiles
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const tile = this.getTile(hubX + dx, hubY + dy);
        if (tile) {
          tile.building = this.techHub;
          tile.buildingRoot = { gx: hubX, gy: hubY };
        }
      }
    }
    this.buildings.set(this.techHub.id, this.techHub);

    // Spawn rich ore clusters around center with ergonomic clearance
    // 1. Iron Ore: North-West of Hub
    spawnVein('IRON_ORE', midX - 11, midY - 8, 4.5, 99999);
    spawnVein('IRON_ORE', midX - 16, midY + 10, 4.0, 99999);

    // 2. Copper Ore: North-East of Hub
    spawnVein('COPPER_ORE', midX + 11, midY - 8, 4.2, 99999);
    spawnVein('COPPER_ORE', midX + 15, midY + 9, 3.8, 99999);

    // 3. Coal: South of Hub
    spawnVein('COAL', midX - 2, midY + 14, 4.0, 99999);

    // 4. Silicon Ore: East of Hub
    spawnVein('SILICON_ORE', midX + 16, midY - 1, 3.8, 99999);
  }

  /**
   * Returns tile at grid coordinates.
   */
  getTile(gx, gy) {
    if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) {
      return null;
    }
    return this.tiles[gy * this.width + gx];
  }

  /**
   * Checks if an area is free to build a structure of dimensions width x height.
   */
  isBuildable(gx, gy, width = 1, height = 1) {
    if (gx < 0 || gy < 0 || gx + width > this.width || gy + height > this.height) {
      return false;
    }

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const tile = this.getTile(gx + dx, gy + dy);
        if (!tile || tile.building) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Places a building on the grid and registers its footprint.
   */
  placeBuilding(building) {
    const { gx, gy, width = 1, height = 1 } = building;

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const tile = this.getTile(gx + dx, gy + dy);
        if (tile) {
          tile.building = building;
          tile.buildingRoot = { gx, gy };
        }
      }
    }

    this.buildings.set(building.id, building);
    return true;
  }

  /**
   * Removes building occupying (gx, gy) and clears all footprint tiles.
   */
  removeBuilding(gx, gy) {
    const tile = this.getTile(gx, gy);
    if (!tile || !tile.building) return null;

    const building = tile.building;
    // Cannot dismantle the central tech hub
    if (building.type === 'TECH_HUB') return null;

    const root = tile.buildingRoot || { gx: building.gx, gy: building.gy };
    const width = building.width || 1;
    const height = building.height || 1;

    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const t = this.getTile(root.gx + dx, root.gy + dy);
        if (t && t.building === building) {
          t.building = null;
          t.buildingRoot = null;
        }
      }
    }

    this.buildings.delete(building.id);
    return building;
  }

  /**
   * Returns the building instance at (gx, gy).
   */
  getBuildingAt(gx, gy) {
    const tile = this.getTile(gx, gy);
    return tile ? tile.building : null;
  }
}
