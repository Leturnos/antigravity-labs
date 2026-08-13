/**
 * Unit System - Archetypes, stats, and unit management for Aether Cyber Tactics.
 */

/**
 * Player Operative Class Standard Configurations
 */
export const PLAYER_CLASSES = {
  Vanguard: {
    name: 'Vanguard Operative',
    maxHp: 10,
    maxAp: 2,
    moveRange: 3,
    skills: ['KINETIC_STRIKE', 'SEISMIC_SLAM']
  },
  Hacker: {
    name: 'Hacker Operative',
    maxHp: 7,
    maxAp: 2,
    moveRange: 4,
    skills: ['CYBER_OVERRIDE', 'POSITION_SWAP']
  },
  Artillery: {
    name: 'Artillery Operative',
    maxHp: 6,
    maxAp: 2,
    moveRange: 2,
    skills: ['MORTAR_STRIKE', 'GRAPPLE_BEAM']
  }
};

/**
 * Enemy Unit Archetype Configurations
 */
export const ENEMY_TYPES = {
  GRUNT: {
    name: 'Cyber Grunt',
    maxHp: 6,
    maxAp: 2,
    moveRange: 3,
    skills: ['KINETIC_STRIKE']
  },
  CHARGER: {
    name: 'Heavy Charger',
    maxHp: 8,
    maxAp: 2,
    moveRange: 4,
    skills: ['KINETIC_STRIKE']
  },
  ARTILLERY_DRONE: {
    name: 'Artillery Drone',
    maxHp: 5,
    maxAp: 2,
    moveRange: 2,
    skills: ['MORTAR_STRIKE']
  },
  CYBER_BOSS: {
    name: 'Cyber Core Boss',
    maxHp: 25,
    maxAp: 2,
    moveRange: 3,
    skills: ['KINETIC_STRIKE', 'SEISMIC_SLAM', 'CYBER_OVERRIDE']
  }
};

/**
 * Unit class representing player operatives and enemy combatants on the tactical grid.
 */
export class Unit {
  /**
   * @param {Object} config
   */
  constructor(config = {}) {
    this.id = config.id || `unit_${Math.random().toString(36).substring(2, 9)}`;
    this.name = config.name || 'Operative';
    this.faction = config.faction || 'player'; // 'player' | 'enemy'
    this.type = config.type || 'Vanguard';
    this.x = config.x || 0;
    this.y = config.y || 0;
    this.maxHp = config.maxHp !== undefined ? config.maxHp : (config.hp || 10);
    this.hp = config.hp !== undefined ? config.hp : this.maxHp;
    this.maxAp = config.maxAp !== undefined ? config.maxAp : 2;
    this.ap = config.ap !== undefined ? config.ap : this.maxAp;
    this.moveRange = config.moveRange !== undefined ? config.moveRange : 3;
    this.skills = config.skills ? [...config.skills] : [];
    this.statusEffects = config.statusEffects ? [...config.statusEffects] : [];
    this.intent = config.intent || null;
  }

  /**
   * Applies damage to the unit.
   * @param {number} amount
   */
  takeDamage(amount) {
    if (amount <= 0 || !this.isAlive()) return;
    this.hp = Math.max(0, this.hp - amount);
  }

  /**
   * Heals the unit up to maxHp.
   * @param {number} amount
   */
  heal(amount) {
    if (amount <= 0 || !this.isAlive()) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /**
   * Resets AP to maxAp at the start of a turn.
   */
  resetAp() {
    this.ap = this.maxAp;
  }

  /**
   * Returns true if unit HP > 0.
   * @returns {boolean}
   */
  isAlive() {
    return this.hp > 0;
  }

  /**
   * Checks if unit has a specific status effect.
   * @param {string} status
   * @returns {boolean}
   */
  hasStatus(status) {
    return this.statusEffects.includes(status);
  }

  /**
   * Adds a status effect if not already present.
   * @param {string} status
   */
  addStatus(status) {
    if (!this.hasStatus(status)) {
      this.statusEffects.push(status);
    }
  }

  /**
   * Removes a status effect if present.
   * @param {string} status
   */
  removeStatus(status) {
    const idx = this.statusEffects.indexOf(status);
    if (idx !== -1) {
      this.statusEffects.splice(idx, 1);
    }
  }
}

/**
 * Generator function to create the standard 3-unit player squad.
 * @param {Array<{x: number, y: number}>} [startPositions]
 * @returns {Array<Unit>} Array containing Vanguard, Hacker, and Artillery units.
 */
export function createPlayerSquad(startPositions = null) {
  const defaultPositions = [
    { x: 1, y: 2 }, // Vanguard
    { x: 1, y: 1 }, // Hacker
    { x: 0, y: 1 }  // Artillery
  ];
  const positions = startPositions || defaultPositions;

  const vanguard = new Unit({
    id: 'player_vanguard',
    name: 'Vanguard',
    faction: 'player',
    type: 'Vanguard',
    x: positions[0] ? positions[0].x : 1,
    y: positions[0] ? positions[0].y : 2,
    ...PLAYER_CLASSES.Vanguard
  });

  const hacker = new Unit({
    id: 'player_hacker',
    name: 'Hacker',
    faction: 'player',
    type: 'Hacker',
    x: positions[1] ? positions[1].x : 1,
    y: positions[1] ? positions[1].y : 1,
    ...PLAYER_CLASSES.Hacker
  });

  const artillery = new Unit({
    id: 'player_artillery',
    name: 'Artillery',
    faction: 'player',
    type: 'Artillery',
    x: positions[2] ? positions[2].x : 0,
    y: positions[2] ? positions[2].y : 1,
    ...PLAYER_CLASSES.Artillery
  });

  return [vanguard, hacker, artillery];
}

/**
 * Generator function to create an enemy unit archetype.
 * @param {string} type - 'GRUNT' | 'CHARGER' | 'ARTILLERY_DRONE' | 'CYBER_BOSS'
 * @param {number} x
 * @param {number} y
 * @returns {Unit}
 */
export function createEnemyUnit(type, x, y) {
  const archetype = ENEMY_TYPES[type] || ENEMY_TYPES.GRUNT;
  return new Unit({
    id: `enemy_${type.toLowerCase()}_${Math.random().toString(36).substring(2, 7)}`,
    name: archetype.name,
    faction: 'enemy',
    type: type,
    x,
    y,
    ...archetype
  });
}
