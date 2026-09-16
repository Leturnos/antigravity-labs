/**
 * InserterSystem — Robotic Inserter Arm Kinematics, Pickup & Drop Mechanics
 */

import {
  TILE_SIZE,
  DIR,
  DIR_DELTA,
  OPPOSITE_DIR,
} from '../config.js';

let nextInserterItemId = 50000;

export class InserterSystem {
  /**
   * @param {WorldGrid} grid
   * @param {ConveyorSystem} conveyorSystem
   */
  constructor(grid, conveyorSystem) {
    this.grid = grid;
    this.conveyorSystem = conveyorSystem;
    this.inserters = new Map(); // "gx,gy" -> inserter
  }

  clear() {
    this.inserters.clear();
  }

  /**
   * Registers an inserter building.
   */
  register(building) {
    const key = `${building.gx},${building.gy}`;
    building.state = 'IDLE'; // IDLE, SWING_TO_TARGET, SWING_TO_SOURCE
    building.swingProgress = 0.0; // 0.0 = pointing at source, 1.0 = pointing at target
    building.heldItem = null;
    building.swingDuration = building.swingDuration || 0.8;
    building.filterItem = null; // null = any item
    this.inserters.set(key, building);
  }

  /**
   * Unregisters an inserter and drops any held item.
   */
  unregister(gx, gy) {
    const key = `${gx},${gy}`;
    const inserter = this.inserters.get(key);
    if (!inserter) return null;

    const held = inserter.heldItem;
    inserter.heldItem = null;
    this.inserters.delete(key);
    return held;
  }

  /**
   * Gets inserter at grid coordinate.
   */
  getAt(gx, gy) {
    return this.inserters.get(`${gx},${gy}`);
  }

  /**
   * Updates all inserters by dt seconds.
   * @param {number} dt Delta time
   * @param {number} powerRatio Power satisfaction multiplier (0.0 to 1.0)
   * @param {Function} [onItemDelivered] Callback when dropped into Tech Hub
   */
  update(dt, powerRatio = 1.0, onItemDelivered = null) {
    if (powerRatio <= 0.05) return; // Unpowered, stalled

    const effectiveDt = dt * powerRatio;

    for (const inserter of this.inserters.values()) {
      const sourceDir = OPPOSITE_DIR[inserter.direction];
      const targetDir = inserter.direction;

      const srcGx = inserter.gx + DIR_DELTA[sourceDir].dx;
      const srcGy = inserter.gy + DIR_DELTA[sourceDir].dy;
      const dstGx = inserter.gx + DIR_DELTA[targetDir].dx;
      const dstGy = inserter.gy + DIR_DELTA[targetDir].dy;

      const swingSpeed = 1.0 / (inserter.swingDuration || 0.8);

      switch (inserter.state) {
        case 'IDLE': {
          // Check if we can pick an item from source
          const picked = this._tryPickup(inserter, srcGx, srcGy);
          if (picked) {
            inserter.heldItem = picked;
            inserter.state = 'SWING_TO_TARGET';
          }
          break;
        }

        case 'SWING_TO_TARGET': {
          inserter.swingProgress += swingSpeed * effectiveDt;
          if (inserter.swingProgress >= 1.0) {
            inserter.swingProgress = 1.0;
            // Try to drop item onto target
            const dropped = this._tryDrop(inserter, dstGx, dstGy, onItemDelivered);
            if (dropped) {
              inserter.heldItem = null;
              inserter.state = 'SWING_TO_SOURCE';
            }
          }
          break;
        }

        case 'SWING_TO_SOURCE': {
          inserter.swingProgress -= swingSpeed * effectiveDt;
          if (inserter.swingProgress <= 0.0) {
            inserter.swingProgress = 0.0;
            inserter.state = 'IDLE';
          }
          break;
        }
      }
    }
  }

  /**
   * Attempts to pick up an item from source tile (belt or machine).
   * @private
   */
  _tryPickup(inserter, srcGx, srcGy) {
    // 1. Check conveyor belt at source
    const srcBelt = this.conveyorSystem.getAt(srcGx, srcGy);
    if (srcBelt && srcBelt.items.length > 0) {
      // Find eligible item matching filter
      for (let i = 0; i < srcBelt.items.length; i++) {
        const item = srcBelt.items[i];
        if (!inserter.filterItem || item.type === inserter.filterItem) {
          // Remove from conveyor and world items
          srcBelt.items.splice(i, 1);
          this.conveyorSystem.allItems.delete(item.id);
          return { type: item.type };
        }
      }
    }

    // 2. Check machine output buffer at source
    const srcBuilding = this.grid.getBuildingAt(srcGx, srcGy);
    if (srcBuilding && srcBuilding.outputBuffer) {
      const keys = Object.keys(srcBuilding.outputBuffer);
      for (const itemType of keys) {
        if (!inserter.filterItem || itemType === inserter.filterItem) {
          if (srcBuilding.outputBuffer[itemType] > 0) {
            srcBuilding.outputBuffer[itemType]--;
            return { type: itemType };
          }
        }
      }
    }

    return null;
  }

  /**
   * Attempts to deposit held item into target tile (belt, machine or tech hub).
   * @private
   */
  _tryDrop(inserter, dstGx, dstGy, onItemDelivered) {
    const itemType = inserter.heldItem.type;

    // 1. Check if target is a conveyor belt
    const dstBelt = this.conveyorSystem.getAt(dstGx, dstGy);
    if (dstBelt) {
      const spawned = this.conveyorSystem.spawnItem(dstGx, dstGy, itemType, 0.4);
      if (spawned) return true;
      // Also try near entrance if 0.4 was congested
      const spawnedAtStart = this.conveyorSystem.spawnItem(dstGx, dstGy, itemType, 0.0);
      if (spawnedAtStart) return true;
      return false;
    }

    // 2. Check if target is a machine or tech hub
    const dstBuilding = this.grid.getBuildingAt(dstGx, dstGy);
    if (dstBuilding) {
      if (dstBuilding.type === 'TECH_HUB' && onItemDelivered) {
        return onItemDelivered(itemType, dstBuilding);
      }

      // Check machine input buffer
      if (dstBuilding.inputBuffer) {
        // Only accept if machine recipe needs it, or if it's fuel for dynamo
        const canAccept = this._machineCanAccept(dstBuilding, itemType);
        if (canAccept) {
          const currentCount = dstBuilding.inputBuffer[itemType] || 0;
          const maxCap = dstBuilding.maxInput || 20;
          if (currentCount < maxCap) {
            dstBuilding.inputBuffer[itemType] = currentCount + 1;
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Verifies if a target machine accepts this item type as an ingredient or fuel.
   * @private
   */
  _machineCanAccept(building, itemType) {
    if (building.type === 'DYNAMO_GENERATOR') {
      return itemType === 'COAL';
    }
    if (building.recipe && building.recipe.inputs) {
      return Boolean(building.recipe.inputs[itemType]);
    }
    if (building.type === 'SMELTER') {
      return itemType === 'IRON_ORE' || itemType === 'COPPER_ORE' || itemType === 'SILICON_ORE';
    }
    return false;
  }
}
