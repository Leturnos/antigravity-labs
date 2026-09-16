/**
 * ConveyorSystem — Deterministic Conveyor Belt Physics & Backpressure Engine
 *
 * Implements physically plausible conveyor flow:
 * - Items move continuously along belt centerlines.
 * - Strict distance spacing (ITEM_SPACING).
 * - True backpressure: blocked items stall smoothly, propagating queues upstream.
 * - Seamless handoffs between conveyors, splitters, tunnels, and machines.
 */

import {
  TILE_SIZE,
  DIR,
  DIR_DELTA,
  OPPOSITE_DIR,
  ITEM_SPACING,
  CONVEYOR_SPEED,
} from '../config.js';

let nextItemId = 1;

export class ConveyorSystem {
  /**
   * @param {WorldGrid} grid
   * @param {SpatialHashGrid} spatialHash
   */
  constructor(grid, spatialHash) {
    this.grid = grid;
    this.spatialHash = spatialHash;
    this.conveyors = new Map(); // "gx,gy" -> conveyor building
    this.allItems = new Map(); // itemId -> item
  }

  clear() {
    this.conveyors.clear();
    this.allItems.clear();
    if (this.spatialHash) this.spatialHash.clear();
  }

  /**
   * Registers a conveyor, splitter, or underground tunnel.
   */
  register(building) {
    const key = `${building.gx},${building.gy}`;
    building.items = building.items || [];
    this.conveyors.set(key, building);
  }

  /**
   * Unregisters a conveyor and recovers any items on it.
   */
  unregister(gx, gy) {
    const key = `${gx},${gy}`;
    const conveyor = this.conveyors.get(key);
    if (!conveyor) return [];

    const recovered = [...conveyor.items];
    for (const item of recovered) {
      this.allItems.delete(item.id);
    }
    conveyor.items = [];
    this.conveyors.delete(key);
    return recovered;
  }

  /**
   * Gets conveyor at grid position.
   */
  getAt(gx, gy) {
    return this.conveyors.get(`${gx},${gy}`);
  }

  /**
   * Attempts to spawn an item onto a conveyor tile.
   * @param {number} gx
   * @param {number} gy
   * @param {string} itemType
   * @param {number} [initialProgress=0.0]
   * @returns {object|null} The created item or null if blocked
   */
  spawnItem(gx, gy, itemType, initialProgress = 0.0) {
    const conveyor = this.getAt(gx, gy);
    if (!conveyor) return null;

    // Check if entrance is clear
    if (conveyor.items.length > 0) {
      const lastItem = conveyor.items[conveyor.items.length - 1];
      if (lastItem.progress < initialProgress + ITEM_SPACING) {
        return null; // No space at entrance
      }
    }

    const item = {
      id: nextItemId++,
      type: itemType,
      progress: initialProgress,
      blocked: false,
      conveyorGx: gx,
      conveyorGy: gy,
      fromDir: null, // Entrance direction for curved belts
      worldX: 0,
      worldY: 0,
    };

    conveyor.items.push(item);
    this.allItems.set(item.id, item);
    this.updateItemWorldPos(item, conveyor);
    return item;
  }

  /**
   * Updates deterministic conveyor item movement for one tick.
   * @param {number} dt Time step in seconds
   * @param {Function} [onItemDelivered] Callback when item reaches Tech Hub or machine
   */
  update(dt, onItemDelivered = null) {
    const moveDist = CONVEYOR_SPEED * (this.speedMultiplier || 1.0) * dt;

    // Process all conveyors
    for (const conveyor of this.conveyors.values()) {
      if (conveyor.items.length === 0) continue;

      // Handle Underground Belt Exit pairing
      if (conveyor.type === 'UNDERGROUND_BELT' && conveyor.isExit) {
        // Exit belts behave like normal belts pushing forward
      }

      // Sort items by progress descending (lead item at index 0)
      conveyor.items.sort((a, b) => b.progress - a.progress);

      const itemsToRemove = [];

      for (let i = 0; i < conveyor.items.length; i++) {
        const item = conveyor.items[i];

        if (i === 0) {
          // Lead item: moves toward exit (progress = 1.0)
          if (item.progress + moveDist >= 1.0) {
            const nextGx = conveyor.gx + DIR_DELTA[conveyor.direction].dx;
            const nextGy = conveyor.gy + DIR_DELTA[conveyor.direction].dy;

            // Handle Splitter logic
            if (conveyor.type === 'SPLITTER') {
              const transferred = this._handleSplitterTransition(item, conveyor, moveDist, onItemDelivered);
              if (transferred) {
                itemsToRemove.push(i);
                continue;
              } else {
                item.progress = 1.0;
                item.blocked = true;
              }
            } else if (conveyor.type === 'UNDERGROUND_BELT' && !conveyor.isExit) {
              // Entrance tunnel: find paired exit in direction
              const transferred = this._handleUndergroundTransition(item, conveyor);
              if (transferred) {
                itemsToRemove.push(i);
                continue;
              } else {
                item.progress = 1.0;
                item.blocked = true;
              }
            } else {
              // Standard Conveyor handoff
              const transferred = this._handleTileTransition(item, conveyor, nextGx, nextGy, moveDist, onItemDelivered);
              if (transferred) {
                itemsToRemove.push(i);
                continue;
              } else {
                item.progress = 1.0;
                item.blocked = true;
              }
            }
          } else {
            item.progress += moveDist;
            item.blocked = false;
          }
        } else {
          // Trailing item: constrained by item ahead
          const itemAhead = conveyor.items[i - 1];
          const maxAllowedProgress = Math.max(0, itemAhead.progress - ITEM_SPACING);

          if (item.progress + moveDist >= maxAllowedProgress) {
            item.progress = maxAllowedProgress;
            item.blocked = itemAhead.blocked || item.progress === maxAllowedProgress;
          } else {
            item.progress += moveDist;
            item.blocked = false;
          }
        }

        this.updateItemWorldPos(item, conveyor);
      }

      // Remove items that transitioned to another tile or were consumed
      if (itemsToRemove.length > 0) {
        // Remove in reverse order to keep indices stable
        for (let r = itemsToRemove.length - 1; r >= 0; r--) {
          conveyor.items.splice(itemsToRemove[r], 1);
        }
      }
    }
  }

  /**
   * Handles item handoff from conveyor to next tile or building.
   * @private
   */
  _handleTileTransition(item, currentConveyor, nextGx, nextGy, moveDist, onItemDelivered) {
    const nextConveyor = this.getAt(nextGx, nextGy);

    if (nextConveyor) {
      // Check if next conveyor has room at entrance
      const itemsOnNext = nextConveyor.items;
      let hasRoom = true;

      if (itemsOnNext.length > 0) {
        // Find smallest progress on next tile
        let minProgress = 2.0;
        for (let k = 0; k < itemsOnNext.length; k++) {
          if (itemsOnNext[k].progress < minProgress) {
            minProgress = itemsOnNext[k].progress;
          }
        }
        if (minProgress < ITEM_SPACING) {
          hasRoom = false;
        }
      }

      if (hasRoom) {
        // Transition to next conveyor
        item.fromDir = OPPOSITE_DIR[currentConveyor.direction];
        item.conveyorGx = nextGx;
        item.conveyorGy = nextGy;
        item.progress = Math.max(0, (item.progress + moveDist) - 1.0);
        item.blocked = false;
        nextConveyor.items.push(item);
        this.updateItemWorldPos(item, nextConveyor);
        return true;
      }
      return false;
    }

    // Check if next tile is a Machine or Tech Hub accepting input
    const targetBuilding = this.grid.getBuildingAt(nextGx, nextGy);
    if (targetBuilding) {
      if (targetBuilding.type === 'TECH_HUB' && onItemDelivered) {
        const accepted = onItemDelivered(item.type, targetBuilding);
        if (accepted) {
          this.allItems.delete(item.id);
          return true;
        }
      } else if (targetBuilding.inputBuffer) {
        // Machine input buffer check
        const currentCount = targetBuilding.inputBuffer[item.type] || 0;
        const maxInput = targetBuilding.maxInput || 20;
        if (currentCount < maxInput) {
          targetBuilding.inputBuffer[item.type] = currentCount + 1;
          this.allItems.delete(item.id);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Splitter: Alternates output between straight and 90° right (or both forward lanes).
   * @private
   */
  _handleSplitterTransition(item, splitter, moveDist, onItemDelivered) {
    splitter.splitState = splitter.splitState || 0; // 0: primary, 1: secondary

    const dir1 = splitter.direction;
    const dir2 = (splitter.direction + 1) % 4; // Right branch

    const targetDirs = splitter.splitState === 0 ? [dir1, dir2] : [dir2, dir1];

    for (const targetDir of targetDirs) {
      const nx = splitter.gx + DIR_DELTA[targetDir].dx;
      const ny = splitter.gy + DIR_DELTA[targetDir].dy;
      const nextConveyor = this.getAt(nx, ny);

      if (nextConveyor) {
        let hasRoom = true;
        if (nextConveyor.items.length > 0) {
          let minProgress = 2.0;
          for (let k = 0; k < nextConveyor.items.length; k++) {
            if (nextConveyor[k].progress < minProgress) {
              minProgress = nextConveyor[k].progress;
            }
          }
          if (minProgress < ITEM_SPACING) {
            hasRoom = false;
          }
        }

        if (hasRoom) {
          item.fromDir = OPPOSITE_DIR[targetDir];
          item.conveyorGx = nx;
          item.conveyorGy = ny;
          item.progress = Math.max(0, (item.progress + moveDist) - 1.0);
          item.blocked = false;
          nextConveyor.items.push(item);
          this.updateItemWorldPos(item, nextConveyor);
          // Toggle splitter output for next item
          splitter.splitState = 1 - splitter.splitState;
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Underground tunnel: finds matching exit up to maxSpan tiles in same direction.
   * @private
   */
  _handleUndergroundTransition(item, entrance) {
    const delta = DIR_DELTA[entrance.direction];
    const maxSpan = entrance.maxSpan || 5;

    for (let d = 1; d <= maxSpan; d++) {
      const tx = entrance.gx + delta.dx * d;
      const ty = entrance.gy + delta.dy * d;
      const target = this.getAt(tx, ty);

      if (target && target.type === 'UNDERGROUND_BELT' && target.isExit && target.direction === entrance.direction) {
        let hasRoom = true;
        if (target.items.length > 0) {
          let minProgress = 2.0;
          for (let k = 0; k < target.items.length; k++) {
            if (target.items[k].progress < minProgress) {
              minProgress = target.items[k].progress;
            }
          }
          if (minProgress < ITEM_SPACING) hasRoom = false;
        }

        if (hasRoom) {
          item.fromDir = entrance.direction;
          item.conveyorGx = tx;
          item.conveyorGy = ty;
          item.progress = 0.0;
          item.blocked = false;
          target.items.push(item);
          this.updateItemWorldPos(item, target);
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Computes world pixel coordinates for an item on a conveyor tile.
   * Handles smooth 90° curve interpolation when item entered from a side!
   */
  updateItemWorldPos(item, conveyor) {
    const cx = conveyor.gx * TILE_SIZE + TILE_SIZE / 2;
    const cy = conveyor.gy * TILE_SIZE + TILE_SIZE / 2;
    const p = Math.max(0, Math.min(1, item.progress));

    const outDelta = DIR_DELTA[conveyor.direction];
    const exitX = cx + outDelta.dx * (TILE_SIZE / 2);
    const exitY = cy + outDelta.dy * (TILE_SIZE / 2);

    if (item.fromDir !== null && item.fromDir !== OPPOSITE_DIR[conveyor.direction]) {
      // Corner curve: enter from fromDir, exit to conveyor.direction
      const inDelta = DIR_DELTA[item.fromDir];
      const enterX = cx + inDelta.dx * (TILE_SIZE / 2);
      const enterY = cy + inDelta.dy * (TILE_SIZE / 2);

      // Quadratic bezier through center (cx, cy)
      const invP = 1 - p;
      item.worldX = invP * invP * enterX + 2 * invP * p * cx + p * p * exitX;
      item.worldY = invP * invP * enterY + 2 * invP * p * cy + p * p * exitY;
    } else {
      // Straight line flow
      const enterX = cx - outDelta.dx * (TILE_SIZE / 2);
      const enterY = cy - outDelta.dy * (TILE_SIZE / 2);

      item.worldX = enterX + (exitX - enterX) * p;
      item.worldY = enterY + (exitY - enterY) * p;
    }

    // Re-insert into spatial hash for proximity detection & culling
    if (this.spatialHash) {
      this.spatialHash.insert(item.id, item.worldX, item.worldY);
    }
  }
}
