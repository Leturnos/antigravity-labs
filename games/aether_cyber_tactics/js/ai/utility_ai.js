/**
 * Utility AI System for Enemy Intent Evaluation in Aether Cyber Tactics.
 * Evaluates candidate (MoveTile, Skill, TargetTile) options using normalized utility metrics.
 */

import { getReachableTiles } from './pathfinding.js';
import { SKILLS_REGISTRY } from '../core/skills.js';

/**
 * Cover Utility: Returns bonus (0.0 to 1.0) if ending turn adjacent to COVER tile.
 * @param {number} x
 * @param {number} y
 * @param {import('../engine/grid_manager.js').GridManager} gridManager
 * @returns {number}
 */
export function calculateCoverUtility(x, y, gridManager) {
  const neighbors = gridManager.getAdjacentTiles(x, y);
  const hasCover = neighbors.some(n => n && n.type === 'COVER');
  return hasCover ? 0.8 : 0.0;
}

/**
 * Safety Utility: Penalizes ending turn on HAZARDOUS plasma tiles or VOID.
 * @param {number} x
 * @param {number} y
 * @param {import('../engine/grid_manager.js').GridManager} gridManager
 * @returns {number}
 */
export function calculateSafetyUtility(x, y, gridManager) {
  const tile = gridManager.getTile(x, y);
  if (!tile || tile.type === 'VOID') return 0.0;
  if (tile.type === 'HAZARDOUS') return 0.15; // Plasma hazard penalty
  return 1.0;
}

/**
 * Damage Utility: High score for dealing damage relative to target HP / max HP.
 * @param {number} damageDealt
 * @param {import('../core/units.js').Unit} targetUnit
 * @returns {number}
 */
export function calculateDamageUtility(damageDealt, targetUnit) {
  if (!targetUnit || damageDealt <= 0) return 0.0;
  if (damageDealt >= targetUnit.hp) return 1.0; // Lethal blow maximum score
  const hpRatio = damageDealt / Math.max(1, targetUnit.hp);
  return Math.min(1.0, 0.3 + hpRatio * 0.6);
}

/**
 * Environmental Kill Utility: Massive score (+0.5/1.0) if displacement drops target into VOID or collides.
 * @param {boolean} dropsToVoid
 * @param {boolean} unitCollision
 * @param {boolean} coverCollision
 * @returns {number}
 */
export function calculateEnvironmentalKillUtility(dropsToVoid, unitCollision, coverCollision) {
  if (dropsToVoid) return 1.0; // Massive score for dropping into VOID
  if (unitCollision || coverCollision) return 0.5; // Bonus for collision damage
  return 0.0;
}

/**
 * Simulates skill outcome to compute projected damage, displacement, and environmental effects.
 *
 * @param {import('../core/units.js').Unit} caster
 * @param {number} moveX
 * @param {number} moveY
 * @param {string} skillId
 * @param {number} targetX
 * @param {number} targetY
 * @param {import('../engine/grid_manager.js').GridManager} gridManager
 * @param {Array<import('../core/units.js').Unit>} unitsList
 * @returns {{ totalDamage: number, pushDistance: number, dropsToVoid: boolean, unitCollision: boolean, coverCollision: boolean, targetUnit: import('../core/units.js').Unit|null }}
 */
function simulateSkillOutcome(caster, moveX, moveY, skillId, targetX, targetY, gridManager, unitsList) {
  const getUnitAt = (x, y) => unitsList.find(u => u.isAlive() && u.x === x && u.y === y);
  const targetUnit = getUnitAt(targetX, targetY);

  let totalDamage = 0;
  let pushDistance = 0;
  let dropsToVoid = false;
  let unitCollision = false;
  let coverCollision = false;

  switch (skillId) {
    case 'KINETIC_STRIKE': {
      if (!targetUnit) break;
      totalDamage = 2;
      pushDistance = 2;

      let dx = Math.sign(targetX - moveX);
      let dy = Math.sign(targetY - moveY);
      if (dx === 0 && dy === 0) dx = 1;

      let currX = targetX;
      let currY = targetY;

      for (let step = 0; step < pushDistance; step++) {
        const nextX = currX + dx;
        const nextY = currY + dy;
        const nextTile = gridManager.getTile(nextX, nextY);

        if (!nextTile) {
          totalDamage += 1;
          break;
        }

        const blockingUnit = unitsList.find(u => u.isAlive() && u !== targetUnit && u.x === nextX && u.y === nextY);
        if (blockingUnit) {
          unitCollision = true;
          totalDamage += 1;
          break;
        }

        if (nextTile.type === 'COVER') {
          coverCollision = true;
          totalDamage += 1;
          break;
        }

        if (nextTile.type === 'VOID') {
          dropsToVoid = true;
          totalDamage += targetUnit.hp;
          break;
        }

        const currElev = gridManager.getTile(currX, currY)?.elevation ?? 0;
        const deltaZ = currElev - nextTile.elevation;
        if (deltaZ > 0) {
          totalDamage += deltaZ;
        }

        currX = nextX;
        currY = nextY;
      }
      break;
    }

    case 'MORTAR_STRIKE': {
      pushDistance = 1;
      if (targetUnit && targetUnit.faction === 'player') {
        totalDamage += 2;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const u = getUnitAt(targetX + dx, targetY + dy);
          if (u && u.faction === 'player') {
            totalDamage += 1;
          }
        }
      }
      break;
    }

    case 'SEISMIC_SLAM': {
      pushDistance = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const u = getUnitAt(targetX + dx, targetY + dy);
          if (u && u.faction === 'player') {
            totalDamage += 1;
          }
        }
      }
      break;
    }

    case 'CYBER_OVERRIDE': {
      pushDistance = 0;
      if (targetUnit && targetUnit.faction === 'player') {
        totalDamage = 1;
      }
      break;
    }

    case 'POSITION_SWAP': {
      pushDistance = 0;
      if (targetUnit && targetUnit.faction === 'player') {
        const enemyOldTile = gridManager.getTile(moveX, moveY);
        if (enemyOldTile && enemyOldTile.type === 'VOID') {
          dropsToVoid = true;
          totalDamage += targetUnit.hp;
        }
      }
      break;
    }

    default:
      totalDamage = 1;
      break;
  }

  return { totalDamage, pushDistance, dropsToVoid, unitCollision, coverCollision, targetUnit };
}

/**
 * Evaluates candidate (MoveTile, Skill, TargetTile) options for an enemy unit and assigns best intent.
 *
 * @param {import('../core/units.js').Unit} enemy
 * @param {Array<import('../core/units.js').Unit>} unitsList
 * @param {import('../engine/grid_manager.js').GridManager} gridManager
 * @returns {Object|null} The intent object assigned to enemy.intent, or null if incapacitated.
 */
export function evaluateEnemyIntent(enemy, unitsList, gridManager) {
  if (!enemy || !enemy.isAlive() || enemy.hasStatus('HACKED')) {
    enemy.intent = null;
    return null;
  }

  const playerUnits = unitsList.filter(u => u.isAlive() && u.faction === 'player');
  if (playerUnits.length === 0) {
    enemy.intent = null;
    return null;
  }

  const reachableTiles = getReachableTiles(enemy, enemy.moveRange, gridManager, enemy);
  const currentTileEntry = { x: enemy.x, y: enemy.y, elevation: gridManager.getTile(enemy.x, enemy.y)?.elevation ?? 0 };

  if (!reachableTiles.some(t => t.x === enemy.x && t.y === enemy.y)) {
    reachableTiles.unshift(currentTileEntry);
  }

  const candidates = [];

  for (const moveTile of reachableTiles) {
    const mx = moveTile.x;
    const my = moveTile.y;

    const coverUtil = calculateCoverUtility(mx, my, gridManager);
    const safetyUtil = calculateSafetyUtility(mx, my, gridManager);

    for (const skillId of enemy.skills) {
      const skill = SKILLS_REGISTRY[skillId];
      if (!skill) continue;

      if (['KINETIC_STRIKE', 'CYBER_OVERRIDE', 'POSITION_SWAP', 'GRAPPLE_BEAM'].includes(skillId)) {
        for (const player of playerUnits) {
          const dist = Math.abs(mx - player.x) + Math.abs(my - player.y);
          if (dist <= skill.range) {
            const outcome = simulateSkillOutcome(enemy, mx, my, skillId, player.x, player.y, gridManager, unitsList);

            const dmgUtil = calculateDamageUtility(outcome.totalDamage, player);
            const envKillUtil = calculateEnvironmentalKillUtility(outcome.dropsToVoid, outcome.unitCollision, outcome.coverCollision);

            let score = (dmgUtil * 0.45) + (envKillUtil * 0.30) + (safetyUtil * 0.15) + (coverUtil * 0.10);
            if (outcome.dropsToVoid) score += 0.5;

            candidates.push({
              moveX: mx,
              moveY: my,
              skillId,
              targetX: player.x,
              targetY: player.y,
              targetUnitId: player.id,
              damage: outcome.totalDamage,
              pushDistance: outcome.pushDistance,
              score,
              description: `${skill.name} -> ${player.name} (${outcome.totalDamage} DMG)`
            });
          }
        }
      } else if (['MORTAR_STRIKE', 'SEISMIC_SLAM'].includes(skillId)) {
        for (let ty = 0; ty < gridManager.height; ty++) {
          for (let tx = 0; tx < gridManager.width; tx++) {
            const dist = Math.abs(mx - tx) + Math.abs(my - ty);
            if (dist <= skill.range) {
              const outcome = simulateSkillOutcome(enemy, mx, my, skillId, tx, ty, gridManager, unitsList);
              if (outcome.totalDamage > 0) {
                const dmgUtil = Math.min(1.0, outcome.totalDamage / 5.0);
                const score = (dmgUtil * 0.55) + (safetyUtil * 0.25) + (coverUtil * 0.20);

                candidates.push({
                  moveX: mx,
                  moveY: my,
                  skillId,
                  targetX: tx,
                  targetY: ty,
                  targetUnitId: outcome.targetUnit ? outcome.targetUnit.id : null,
                  damage: outcome.totalDamage,
                  pushDistance: outcome.pushDistance,
                  score,
                  description: `${skill.name} at (${tx}, ${ty}) (${outcome.totalDamage} AoE DMG)`
                });
              }
            }
          }
        }
      }
    }

    let closestPlayer = playerUnits[0];
    let minDist = Infinity;
    for (const player of playerUnits) {
      const d = Math.abs(mx - player.x) + Math.abs(my - player.y);
      if (d < minDist) {
        minDist = d;
        closestPlayer = player;
      }
    }

    const distUtil = Math.max(0, 1.0 - (minDist / (gridManager.width + gridManager.height)));
    const moveScore = (distUtil * 0.50) + (safetyUtil * 0.25) + (coverUtil * 0.25);

    candidates.push({
      moveX: mx,
      moveY: my,
      skillId: null,
      targetX: mx,
      targetY: my,
      targetUnitId: null,
      damage: 0,
      pushDistance: 0,
      score: moveScore,
      description: `Approach ${closestPlayer.name} (${mx}, ${my})`
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  enemy.intent = {
    moveX: best.moveX,
    moveY: best.moveY,
    skillId: best.skillId,
    targetX: best.targetX,
    targetY: best.targetY,
    targetUnitId: best.targetUnitId,
    damage: best.damage,
    pushDistance: best.pushDistance,
    description: best.description
  };

  return enemy.intent;
}

/**
 * Evaluates intents for all active enemy units.
 *
 * @param {Array<import('../core/units.js').Unit>} unitsList
 * @param {import('../engine/grid_manager.js').GridManager} gridManager
 * @returns {Array<{ enemyId: string, intent: Object }>}
 */
export function evaluateAllEnemies(unitsList, gridManager) {
  const enemies = unitsList.filter(u => u.isAlive() && u.faction === 'enemy');
  const results = [];

  for (const enemy of enemies) {
    const intent = evaluateEnemyIntent(enemy, unitsList, gridManager);
    if (intent) {
      results.push({ enemyId: enemy.id, intent });
    }
  }

  return results;
}
