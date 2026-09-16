/**
 * MachineSystem — Mining Drills, Smelters, Assemblers & Crafting Loops
 */

import {
  RECIPES,
  BUILDINGS,
  DIR_DELTA,
  DIR,
} from '../config.js';

export class MachineSystem {
  /**
   * @param {WorldGrid} grid
   * @param {ConveyorSystem} conveyorSystem
   */
  constructor(grid, conveyorSystem) {
    this.grid = grid;
    this.conveyorSystem = conveyorSystem;
    this.machines = new Map(); // id -> machine
    this.particles = []; // visual sparks, smoke, ore flakes
  }

  clear() {
    this.machines.clear();
    this.particles = [];
  }

  /**
   * Registers a production machine.
   */
  register(building) {
    building.craftProgress = 0.0;
    building.craftDuration = 1.0;
    building.inputBuffer = building.inputBuffer || {};
    building.outputBuffer = building.outputBuffer || {};
    building.maxInput = 30;
    building.maxOutput = 30;
    building.active = false;

    // Set default recipe if applicable
    if (building.type === 'SMELTER') {
      building.recipe = RECIPES.SMELT_IRON;
      building.craftDuration = RECIPES.SMELT_IRON.craftTime;
    } else if (building.type === 'ASSEMBLER') {
      building.recipe = building.recipe || RECIPES.CRAFT_WIRE;
      building.craftDuration = building.recipe.craftTime;
    } else if (building.type === 'MINER') {
      building.craftDuration = building.mineCycleTime || 1.8;
      // Determine what ore vein is beneath
      building.targetOre = this._detectOreUnderFootprint(building);
    } else if (building.type === 'DYNAMO_GENERATOR') {
      building.burnTimeRemaining = 0.0;
      building.isGenerating = false;
    }

    this.machines.set(building.id, building);
  }

  /**
   * Unregisters a machine and returns all stored buffer items.
   */
  unregister(buildingId) {
    const machine = this.machines.get(buildingId);
    if (!machine) return null;

    const recovered = { ...machine.inputBuffer, ...machine.outputBuffer };
    this.machines.delete(buildingId);
    return recovered;
  }

  /**
   * Configures active recipe on an Assembler or Smelter.
   */
  setRecipe(machineId, recipeId) {
    const machine = this.machines.get(machineId);
    if (!machine || !RECIPES[recipeId]) return false;

    machine.recipe = RECIPES[recipeId];
    machine.craftDuration = machine.recipe.craftTime;
    machine.craftProgress = 0.0;
    return true;
  }

  /**
   * Updates all machines for one tick.
   * @param {number} dt Delta time in seconds
   * @param {number} powerRatio Power grid satisfaction (0.0 to 1.0)
   */
  update(dt, powerRatio = 1.0) {
    const effectiveDt = dt * powerRatio;

    // Update floating particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    for (const machine of this.machines.values()) {
      switch (machine.type) {
        case 'MINER':
          this._updateMiner(machine, dt, effectiveDt);
          break;
        case 'SMELTER':
          this._updateSmelter(machine, dt, effectiveDt);
          break;
        case 'ASSEMBLER':
          this._updateAssembler(machine, dt, effectiveDt);
          break;
        case 'DYNAMO_GENERATOR':
          this._updateDynamo(machine, dt);
          break;
      }
    }
  }

  /**
   * Mining drill logic: extracts ore from deposit and pushes out front.
   * @private
   */
  _updateMiner(miner, rawDt, effectiveDt) {
    if (!miner.targetOre) {
      // Re-scan in case ore was under newly placed tiles
      miner.targetOre = this._detectOreUnderFootprint(miner);
      if (!miner.targetOre) {
        miner.active = false;
        return;
      }
    }

    // Check if output buffer is full
    const currentStored = miner.outputBuffer[miner.targetOre] || 0;
    if (currentStored >= miner.maxOutput) {
      miner.active = false;
      this._tryEjectMinerOutput(miner);
      return;
    }

    if (effectiveDt <= 0.001) {
      miner.active = false;
      return;
    }

    miner.active = true;
    miner.craftProgress += effectiveDt;

    // Spawn tiny mining dust particles
    if (Math.random() < 0.25) {
      this._spawnParticle(
        miner.gx * 48 + 48 + (Math.random() * 20 - 10),
        miner.gy * 48 + 48 + (Math.random() * 20 - 10),
        '#94a3b8',
        0.5
      );
    }

    if (miner.craftProgress >= miner.craftDuration) {
      miner.craftProgress = 0.0;
      miner.outputBuffer[miner.targetOre] = currentStored + 1;
    }

    // Continuously try to eject extracted ore onto front conveyor/building
    this._tryEjectMinerOutput(miner);
  }

  /**
   * Tries to eject miner's mined ore into the tile immediately facing it.
   * @private
   */
  _tryEjectMinerOutput(miner) {
    if (!miner.targetOre || !miner.outputBuffer[miner.targetOre]) return;

    // Output tile is directly ahead of the miner's center
    const dirDelta = DIR_DELTA[miner.direction || DIR.DOWN];
    const outGx = miner.direction === DIR.DOWN || miner.direction === DIR.UP
      ? miner.gx + Math.floor(miner.width / 2) + dirDelta.dx
      : (miner.direction === DIR.RIGHT ? miner.gx + miner.width : miner.gx - 1);
    const outGy = miner.direction === DIR.RIGHT || miner.direction === DIR.LEFT
      ? miner.gy + Math.floor(miner.height / 2) + dirDelta.dy
      : (miner.direction === DIR.DOWN ? miner.gy + miner.height : miner.gy - 1);

    const conveyor = this.conveyorSystem.getAt(outGx, outGy);
    if (conveyor) {
      const spawned = this.conveyorSystem.spawnItem(outGx, outGy, miner.targetOre, 0.1);
      if (spawned) {
        miner.outputBuffer[miner.targetOre]--;
      }
    }
  }

  /**
   * Smelter logic: converts ore to plates/wafers.
   * @private
   */
  _updateSmelter(smelter, rawDt, effectiveDt) {
    // Determine which recipe can run based on input buffer
    let recipe = smelter.recipe;

    // Smart auto-select recipe if matching ore is present
    if (!this._hasRecipeInputs(smelter, recipe)) {
      if ((smelter.inputBuffer.IRON_ORE || 0) > 0) recipe = RECIPES.SMELT_IRON;
      else if ((smelter.inputBuffer.COPPER_ORE || 0) > 0) recipe = RECIPES.SMELT_COPPER;
      else if ((smelter.inputBuffer.SILICON_ORE || 0) > 0) recipe = RECIPES.SMELT_SILICON;
      smelter.recipe = recipe;
    }

    if (!recipe || !this._hasRecipeInputs(smelter, recipe)) {
      smelter.active = false;
      return;
    }

    // Check if output buffer has space for outputs
    if (!this._hasOutputSpace(smelter, recipe)) {
      smelter.active = false;
      return;
    }

    if (effectiveDt <= 0.001) {
      smelter.active = false;
      return;
    }

    smelter.active = true;
    smelter.craftProgress += effectiveDt;

    // Heat smoke puff
    if (Math.random() < 0.2) {
      this._spawnParticle(
        smelter.gx * 48 + 48,
        smelter.gy * 48 + 20,
        'rgba(255, 120, 30, 0.7)',
        0.8,
        0,
        -15
      );
    }

    if (smelter.craftProgress >= recipe.craftTime) {
      smelter.craftProgress = 0.0;
      this._consumeInputs(smelter, recipe);
      this._produceOutputs(smelter, recipe);
    }
  }

  /**
   * Assembler logic: crafts components based on active recipe.
   * @private
   */
  _updateAssembler(assembler, rawDt, effectiveDt) {
    const recipe = assembler.recipe;
    if (!recipe) {
      assembler.active = false;
      return;
    }

    if (!this._hasRecipeInputs(assembler, recipe) || !this._hasOutputSpace(assembler, recipe)) {
      assembler.active = false;
      return;
    }

    if (effectiveDt <= 0.001) {
      assembler.active = false;
      return;
    }

    assembler.active = true;
    assembler.craftProgress += effectiveDt;

    // Electric sparks
    if (Math.random() < 0.2) {
      this._spawnParticle(
        assembler.gx * 48 + 30 + Math.random() * 36,
        assembler.gy * 48 + 30 + Math.random() * 36,
        '#00f3ff',
        0.4,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 30
      );
    }

    if (assembler.craftProgress >= recipe.craftTime) {
      assembler.craftProgress = 0.0;
      this._consumeInputs(assembler, recipe);
      this._produceOutputs(assembler, recipe);
    }
  }

  /**
   * Dynamo logic: burns coal to generate power.
   * @private
   */
  _updateDynamo(dynamo, dt) {
    if (dynamo.burnTimeRemaining > 0) {
      dynamo.burnTimeRemaining -= dt;
      dynamo.isGenerating = true;
    } else {
      // Try to consume 1 coal
      const coalCount = dynamo.inputBuffer.COAL || 0;
      if (coalCount > 0) {
        dynamo.inputBuffer.COAL = coalCount - 1;
        dynamo.burnTimeRemaining = 10.0; // 10 seconds burn time per coal
        dynamo.isGenerating = true;
      } else {
        dynamo.isGenerating = false;
      }
    }
  }

  _hasRecipeInputs(building, recipe) {
    if (!recipe || !recipe.inputs) return false;
    for (const [itemType, reqQty] of Object.entries(recipe.inputs)) {
      if ((building.inputBuffer[itemType] || 0) < reqQty) {
        return false;
      }
    }
    return true;
  }

  _hasOutputSpace(building, recipe) {
    if (!recipe || !recipe.outputs) return true;
    for (const [itemType, outQty] of Object.entries(recipe.outputs)) {
      const current = building.outputBuffer[itemType] || 0;
      if (current + outQty > building.maxOutput) {
        return false;
      }
    }
    return true;
  }

  _consumeInputs(building, recipe) {
    for (const [itemType, reqQty] of Object.entries(recipe.inputs)) {
      building.inputBuffer[itemType] -= reqQty;
    }
  }

  _produceOutputs(building, recipe) {
    for (const [itemType, outQty] of Object.entries(recipe.outputs)) {
      building.outputBuffer[itemType] = (building.outputBuffer[itemType] || 0) + outQty;
    }
  }

  _detectOreUnderFootprint(building) {
    for (let dy = 0; dy < building.height; dy++) {
      for (let dx = 0; dx < building.width; dx++) {
        const tile = this.grid.getTile(building.gx + dx, building.gy + dy);
        if (tile && tile.ore) {
          return tile.ore;
        }
      }
    }
    return null;
  }

  _spawnParticle(x, y, color, life = 0.5, vx = 0, vy = -10) {
    if (this.particles.length > 150) return; // Limit particle count
    this.particles.push({ x, y, color, life, maxLife: life, vx, vy, size: 2 + Math.random() * 2 });
  }
}
