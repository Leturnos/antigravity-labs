export const CONFIG = {
  GRID: {
    COLS: 64,
    ROWS: 36,
    CELL_SIZE: 20,
    WIDTH: 1280,
    HEIGHT: 720
  },
  CORE: {
    COL: 32,
    ROW: 18,
    MAX_HP: 100,
    RADIUS: 24
  },
  SPAWNS: [
    { col: 1, row: 1, name: 'Northwest Portal' },
    { col: 62, row: 1, name: 'Northeast Portal' },
    { col: 1, row: 34, name: 'Southwest Portal' },
    { col: 62, row: 34, name: 'Southeast Portal' }
  ],
  SWARM: {
    MAX_PARTICLES: 10000,
    SEPARATION_DISTANCE: 12,
    SEPARATION_FORCE: 0.8
  },
  TOWERS: {
    GATLING: {
      name: 'Pulse Gatling',
      cost: 100,
      description: 'Rapid single-target plasma blaster. Pierces fast swarms.',
      levels: [
        { level: 1, damage: 14, range: 120, fireRate: 8, upgradeCost: 75, hp: 120 },
        { level: 2, damage: 22, range: 140, fireRate: 11, upgradeCost: 140, hp: 180 },
        { level: 3, damage: 35, range: 160, fireRate: 15, upgradeCost: 0, hp: 260 }
      ]
    },
    MORTAR: {
      name: 'Plasma Mortar',
      cost: 175,
      description: 'Heavy kinetic artillery. AoE shockwave pushes and shreds clusters.',
      levels: [
        { level: 1, damage: 45, splashRadius: 65, range: 210, fireRate: 1.2, upgradeCost: 120, hp: 160 },
        { level: 2, damage: 85, splashRadius: 85, range: 240, fireRate: 1.5, upgradeCost: 200, hp: 240 },
        { level: 3, damage: 150, splashRadius: 110, range: 270, fireRate: 1.8, upgradeCost: 0, hp: 350 }
      ]
    },
    STASIS: {
      name: 'Stasis Field',
      cost: 140,
      description: 'Cryogenic aura. Slows creeping swarms by up to 60%.',
      levels: [
        { level: 1, slowPercent: 0.40, range: 100, pulseRate: 2.0, upgradeCost: 90, hp: 140 },
        { level: 2, slowPercent: 0.50, range: 125, pulseRate: 2.5, upgradeCost: 160, hp: 200 },
        { level: 3, slowPercent: 0.60, range: 150, pulseRate: 3.0, upgradeCost: 0, hp: 300 }
      ]
    }
  },
  CREEPS: {
    SWARMER: {
      id: 0,
      name: 'Neon Swarmer',
      hp: 20,
      speed: 1.7,
      radius: 3,
      credits: 2,
      score: 10,
      color: '#00f3ff'
    },
    BRUTE: {
      id: 1,
      name: 'Goliath Brute',
      hp: 180,
      speed: 0.85,
      radius: 6,
      credits: 10,
      score: 50,
      color: '#ff0055'
    },
    DISRUPTOR: {
      id: 2,
      name: 'Flux Disruptor',
      hp: 60,
      speed: 1.4,
      radius: 4,
      credits: 6,
      score: 30,
      color: '#ffd600'
    }
  },
  ECONOMY: {
    INITIAL_CREDITS: 450,
    INITIAL_CORE_HP: 100,
    REFUND_RATE: 0.75
  }
};
