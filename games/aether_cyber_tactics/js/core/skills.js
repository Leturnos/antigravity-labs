/**
 * Tactical Skill System & Physics Execution Engine for Aether Cyber Tactics.
 */

/**
 * Registry of available tactical skills, AP costs, ranges, and metadata.
 */
export const SKILLS_REGISTRY = {
  KINETIC_STRIKE: {
    id: 'KINETIC_STRIKE',
    name: 'Kinetic Strike',
    apCost: 1,
    range: 1,
    description: 'Deals 2 damage + pushes target 2 tiles back.'
  },
  SEISMIC_SLAM: {
    id: 'SEISMIC_SLAM',
    name: 'Seismic Slam',
    apCost: 1,
    range: 1,
    description: 'Deals 1 AoE damage and lowers target/adjacent tile Z elevations by 1.'
  },
  CYBER_OVERRIDE: {
    id: 'CYBER_OVERRIDE',
    name: 'Cyber Override',
    apCost: 1,
    range: 3,
    description: 'Applies HACKED status to enemy, canceling its intent.'
  },
  POSITION_SWAP: {
    id: 'POSITION_SWAP',
    name: 'Position Swap',
    apCost: 1,
    range: 4,
    description: 'Swaps grid coordinates (x, y) between caster and target unit.'
  },
  MORTAR_STRIKE: {
    id: 'MORTAR_STRIKE',
    name: 'Mortar Strike',
    apCost: 1,
    range: 5,
    description: '3x3 AoE lob shell (2 damage epicenter, 1 cross/AoE, pushes away from epicenter).'
  },
  GRAPPLE_BEAM: {
    id: 'GRAPPLE_BEAM',
    name: 'Grapple Beam',
    apCost: 1,
    range: 4,
    description: 'Pulls target 2 tiles toward caster.'
  }
};

/**
 * Applies push or pull displacement to a unit step-by-step, taking into account
 * unit collisions, cover wall collisions, height elevation drop fall damage, and void drops.
 *
 * @param {import('./units.js').Unit} targetUnit - Unit being pushed or pulled.
 * @param {number} dirX - Direction vector X (-1, 0, or 1).
 * @param {number} dirY - Direction vector Y (-1, 0, or 1).
 * @param {number} distance - Number of tiles to push/pull.
 * @param {import('../engine/grid_manager.js').GridManager} gridManager
 * @param {Array<import('./units.js').Unit>} unitsList
 * @param {Object} [soundSynth]
 * @returns {Array<string>} Array of event log strings.
 */
export function applyPushPhysics(targetUnit, dirX, dirY, distance, gridManager, unitsList, soundSynth = null) {
  const logs = [];
  if (!targetUnit || !targetUnit.isAlive() || (dirX === 0 && dirY === 0) || distance <= 0) {
    return logs;
  }

  for (let step = 0; step < distance; step++) {
    if (!targetUnit.isAlive()) break;

    const currentTile = gridManager.getTile(targetUnit.x, targetUnit.y);
    const currentElev = currentTile ? currentTile.elevation : 0;

    const nextX = targetUnit.x + dirX;
    const nextY = targetUnit.y + dirY;
    const nextTile = gridManager.getTile(nextX, nextY);

    // 1. Out of Bounds Collision
    if (!nextTile) {
      targetUnit.takeDamage(1);
      if (soundSynth && typeof soundSynth.playKineticPunch === 'function') {
        soundSynth.playKineticPunch();
      }
      logs.push(`${targetUnit.name} hit the grid boundary at (${nextX}, ${nextY}), taking 1 collision damage!`);
      break;
    }

    // 2. Unit Collision: 1 extra damage to both units if path blocked by another unit
    const blockingUnit = unitsList.find(u => u.isAlive() && u !== targetUnit && u.x === nextX && u.y === nextY);
    if (blockingUnit) {
      targetUnit.takeDamage(1);
      blockingUnit.takeDamage(1);
      if (soundSynth && typeof soundSynth.playKineticPunch === 'function') {
        soundSynth.playKineticPunch();
      }
      logs.push(`${targetUnit.name} collided with ${blockingUnit.name} at (${nextX}, ${nextY})! Both units take 1 extra collision damage!`);
      break;
    }

    // 3. Cover Wall Collision: 1 damage to unit, 1 damage to cover
    if (nextTile.type === 'COVER') {
      targetUnit.takeDamage(1);
      const destroyed = gridManager.damageTile(nextX, nextY, 1);
      if (soundSynth && typeof soundSynth.playTileShatter === 'function') {
        soundSynth.playTileShatter();
      }
      logs.push(`${targetUnit.name} slammed into Cover at (${nextX}, ${nextY})! Unit took 1 damage and Cover was ${destroyed ? 'destroyed into VOID' : 'damaged'}.`);
      break;
    }

    // Advance position
    targetUnit.x = nextX;
    targetUnit.y = nextY;

    // 4. Void Drop: Immediate destruction if unit lands on VOID tile (hp = 0)
    if (nextTile.type === 'VOID') {
      targetUnit.hp = 0;
      if (soundSynth && typeof soundSynth.playTileShatter === 'function') {
        soundSynth.playTileShatter();
      }
      logs.push(`${targetUnit.name} fell into the VOID abyss at (${nextX}, ${nextY}) and was destroyed!`);
      break;
    }

    // 5. Fall Damage: 1 damage per height level dropped (ΔZ)
    const nextElev = nextTile.elevation;
    const deltaZ = currentElev - nextElev;
    if (deltaZ > 0) {
      targetUnit.takeDamage(deltaZ);
      if (soundSynth && typeof soundSynth.playKineticPunch === 'function') {
        soundSynth.playKineticPunch();
      }
      logs.push(`${targetUnit.name} dropped ${deltaZ} height level(s), taking ${deltaZ} fall damage!`);
    }
  }

  return logs;
}

/**
 * Executes a tactical skill on the grid, applying damage, terrain modification, status effects, and displacement.
 *
 * @param {string} skillId - Identifier of skill to execute.
 * @param {import('./units.js').Unit} caster - Unit casting the skill.
 * @param {number} targetX - Target grid coordinate X.
 * @param {number} targetY - Target grid coordinate Y.
 * @param {import('../engine/grid_manager.js').GridManager} gridManager
 * @param {Array<import('./units.js').Unit>} unitsList - List of all active units on the grid.
 * @param {Object} [soundSynth] - Optional sound synthesizer instance.
 * @returns {{ success: boolean, reason?: string, skillId?: string, logs: Array<string> }}
 */
export function executeSkill(skillId, caster, targetX, targetY, gridManager, unitsList, soundSynth = null) {
  const skill = SKILLS_REGISTRY[skillId];
  const logs = [];

  if (!skill) {
    return { success: false, reason: `Skill '${skillId}' is not registered.`, logs };
  }

  if (!caster || !caster.isAlive()) {
    return { success: false, reason: 'Caster is incapacitated.', logs };
  }

  if (caster.ap < skill.apCost) {
    return { success: false, reason: `Insufficient AP (${caster.ap}/${skill.apCost} required).`, logs };
  }

  // Deduct AP cost
  caster.ap -= skill.apCost;

  // Helper to find unit at target coordinates
  const getUnitAt = (x, y) => unitsList.find(u => u.isAlive() && u.x === x && u.y === y);

  switch (skillId) {
    case 'KINETIC_STRIKE': {
      const targetUnit = getUnitAt(targetX, targetY);
      if (!targetUnit) {
        // Refund AP if invalid target
        caster.ap += skill.apCost;
        return { success: false, reason: 'Kinetic Strike requires a valid target unit.', logs };
      }

      // Deal 2 base damage
      targetUnit.takeDamage(2);
      if (soundSynth && typeof soundSynth.playKineticPunch === 'function') {
        soundSynth.playKineticPunch();
      }
      logs.push(`${caster.name} performed Kinetic Strike on ${targetUnit.name} for 2 damage!`);

      // Push 2 tiles back away from caster
      let dx = Math.sign(targetX - caster.x);
      let dy = Math.sign(targetY - caster.y);
      if (dx === 0 && dy === 0) dx = 1;

      const pushLogs = applyPushPhysics(targetUnit, dx, dy, 2, gridManager, unitsList, soundSynth);
      logs.push(...pushLogs);
      break;
    }

    case 'SEISMIC_SLAM': {
      if (soundSynth && typeof soundSynth.playMortar === 'function') {
        soundSynth.playMortar();
      }
      logs.push(`${caster.name} triggered Seismic Slam around (${targetX}, ${targetY})!`);

      // 3x3 AoE around (targetX, targetY)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = targetX + dx;
          const ty = targetY + dy;
          const tile = gridManager.getTile(tx, ty);

          if (tile && tile.type !== 'VOID') {
            // Lower elevation by 1
            const newElev = Math.max(0, tile.elevation - 1);
            gridManager.setElevation(tx, ty, newElev);

            // Deal 1 damage to any unit standing on tile
            const unitOnTile = getUnitAt(tx, ty);
            if (unitOnTile) {
              unitOnTile.takeDamage(1);
              logs.push(`${unitOnTile.name} took 1 shockwave damage at (${tx}, ${ty})!`);
            }
          }
        }
      }
      break;
    }

    case 'CYBER_OVERRIDE': {
      const targetUnit = getUnitAt(targetX, targetY);
      if (!targetUnit) {
        caster.ap += skill.apCost;
        return { success: false, reason: 'Cyber Override requires a valid target unit.', logs };
      }

      targetUnit.addStatus('HACKED');
      targetUnit.intent = null; // Cancel intent
      if (soundSynth && typeof soundSynth.playHack === 'function') {
        soundSynth.playHack();
      }
      logs.push(`${caster.name} executed Cyber Override on ${targetUnit.name}! Applied HACKED status and canceled intent.`);
      break;
    }

    case 'POSITION_SWAP': {
      const targetUnit = getUnitAt(targetX, targetY);
      if (!targetUnit || targetUnit === caster) {
        caster.ap += skill.apCost;
        return { success: false, reason: 'Position Swap requires a valid target unit other than caster.', logs };
      }

      const casterOldTile = gridManager.getTile(caster.x, caster.y);
      const targetOldTile = gridManager.getTile(targetUnit.x, targetUnit.y);

      const casterOldElev = casterOldTile ? casterOldTile.elevation : 0;
      const targetOldElev = targetOldTile ? targetOldTile.elevation : 0;

      // Swap positions
      const origCasterX = caster.x;
      const origCasterY = caster.y;

      caster.x = targetUnit.x;
      caster.y = targetUnit.y;

      targetUnit.x = origCasterX;
      targetUnit.y = origCasterY;

      if (soundSynth && typeof soundSynth.playHack === 'function') {
        soundSynth.playHack();
      }
      logs.push(`${caster.name} swapped positions with ${targetUnit.name}!`);

      // Check void drops
      const casterNewTile = gridManager.getTile(caster.x, caster.y);
      if (casterNewTile && casterNewTile.type === 'VOID') {
        caster.hp = 0;
        logs.push(`${caster.name} swapped onto a VOID tile and was destroyed!`);
      } else {
        const deltaZ = casterOldElev - (casterNewTile ? casterNewTile.elevation : 0);
        if (deltaZ > 0) {
          caster.takeDamage(deltaZ);
          logs.push(`${caster.name} took ${deltaZ} fall damage after swap!`);
        }
      }

      const targetNewTile = gridManager.getTile(targetUnit.x, targetUnit.y);
      if (targetNewTile && targetNewTile.type === 'VOID') {
        targetUnit.hp = 0;
        logs.push(`${targetUnit.name} swapped onto a VOID tile and was destroyed!`);
      } else {
        const deltaZ = targetOldElev - (targetNewTile ? targetNewTile.elevation : 0);
        if (deltaZ > 0) {
          targetUnit.takeDamage(deltaZ);
          logs.push(`${targetUnit.name} took ${deltaZ} fall damage after swap!`);
        }
      }
      break;
    }

    case 'MORTAR_STRIKE': {
      if (soundSynth && typeof soundSynth.playMortar === 'function') {
        soundSynth.playMortar();
      }
      logs.push(`${caster.name} launched Mortar Strike at (${targetX}, ${targetY})!`);

      // Epicenter: 2 damage
      const epicenterUnit = getUnitAt(targetX, targetY);
      if (epicenterUnit) {
        epicenterUnit.takeDamage(2);
        logs.push(`${epicenterUnit.name} caught in Mortar Strike epicenter, taking 2 damage!`);
      }

      // 3x3 surrounding tiles: 1 damage
      const affectedUnits = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = targetX + dx;
          const ty = targetY + dy;
          if (dx === 0 && dy === 0) continue; // Epicenter already took 2 damage

          const unit = getUnitAt(tx, ty);
          if (unit && !affectedUnits.includes(unit)) {
            unit.takeDamage(1);
            affectedUnits.push(unit);
            logs.push(`${unit.name} hit by Mortar blast wave at (${tx}, ${ty}), taking 1 damage!`);
          }
        }
      }

      // Collect all units in 3x3 to push 1 tile away from epicenter
      const unitsInZone = unitsList.filter(u =>
        u.isAlive() &&
        Math.abs(u.x - targetX) <= 1 &&
        Math.abs(u.y - targetY) <= 1
      );

      for (const unit of unitsInZone) {
        let pdx = Math.sign(unit.x - targetX);
        let pdy = Math.sign(unit.y - targetY);

        if (pdx === 0 && pdy === 0) {
          pdx = Math.sign(unit.x - caster.x);
          pdy = Math.sign(unit.y - caster.y);
          if (pdx === 0 && pdy === 0) pdx = 1;
        }

        const pushLogs = applyPushPhysics(unit, pdx, pdy, 1, gridManager, unitsList, soundSynth);
        logs.push(...pushLogs);
      }
      break;
    }

    case 'GRAPPLE_BEAM': {
      const targetUnit = getUnitAt(targetX, targetY);
      if (!targetUnit) {
        caster.ap += skill.apCost;
        return { success: false, reason: 'Grapple Beam requires a valid target unit.', logs };
      }

      if (soundSynth && typeof soundSynth.playLaser === 'function') {
        soundSynth.playLaser();
      }
      logs.push(`${caster.name} targeted ${targetUnit.name} with Grapple Beam!`);

      // Pull 2 tiles toward caster
      const dx = Math.sign(caster.x - targetUnit.x);
      const dy = Math.sign(caster.y - targetUnit.y);

      const pullLogs = applyPushPhysics(targetUnit, dx, dy, 2, gridManager, unitsList, soundSynth);
      logs.push(...pullLogs);
      break;
    }
  }

  return { success: true, skillId, caster, targetX, targetY, logs };
}
