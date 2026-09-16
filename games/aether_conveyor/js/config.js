/**
 * Aether Conveyor (Factorio-Lite) — Game Constants & Configuration
 */

export const TILE_SIZE = 48;
export const WORLD_WIDTH = 50;
export const WORLD_HEIGHT = 50;

export const SIMULATION_TICK_RATE = 60; // 60 Hz deterministic simulation
export const SIMULATION_DT = 1 / SIMULATION_TICK_RATE;

export const ITEM_SPACING = 0.32; // Minimum normalized spacing between items on a conveyor tile
export const CONVEYOR_SPEED = 1.6; // Tiles per second normalized movement speed

// Cardinal directions
export const DIR = {
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3,
};

export const DIR_DELTA = [
  { dx: 0, dy: -1 }, // UP
  { dx: 1, dy: 0 },  // RIGHT
  { dx: 0, dy: 1 },  // DOWN
  { dx: -1, dy: 0 }, // LEFT
];

export const OPPOSITE_DIR = [2, 3, 0, 1];

// Resource and Item Definitions
export const ITEMS = {
  // Raw Ores
  IRON_ORE: {
    id: 'IRON_ORE',
    name: 'Iron Ore',
    displayName: 'Minério de Ferro',
    element: 'Fe',
    category: 'ore',
    color: '#94a3b8',
    glowColor: 'rgba(148, 163, 184, 0.4)',
    symbol: 'Fe',
    icon: '⛏️',
    description: 'Minério metálico bruto. Funda em Fornalhas para obter Placas de Ferro.',
  },
  COPPER_ORE: {
    id: 'COPPER_ORE',
    name: 'Copper Ore',
    displayName: 'Minério de Cobre',
    element: 'Cu',
    category: 'ore',
    color: '#f97316',
    glowColor: 'rgba(249, 115, 22, 0.4)',
    symbol: 'Cu',
    icon: '⚡',
    description: 'Excelente condutor térmico/elétrico. Funda para obter Fios e Placas de Circuito.',
  },
  COAL: {
    id: 'COAL',
    name: 'Coal',
    displayName: 'Carvão Mineral',
    element: 'C',
    category: 'ore',
    color: '#475569',
    glowColor: 'rgba(71, 85, 105, 0.5)',
    symbol: 'C',
    icon: '🔥',
    description: 'Combustível fóssil rico em carbono. Alimenta Dínamos para gerar energia contínua.',
  },
  SILICON_ORE: {
    id: 'SILICON_ORE',
    name: 'Silicon Ore',
    displayName: 'Minério de Silício',
    element: 'Si',
    category: 'ore',
    color: '#06b6d4',
    glowColor: 'rgba(6, 182, 212, 0.5)',
    symbol: 'Si',
    icon: '💎',
    description: 'Células cristalinas de alta pureza. Essencial para microchips e baterias de alta tecnologia.',
  },

  // Smelted Products
  IRON_PLATE: {
    id: 'IRON_PLATE',
    name: 'Iron Plate',
    category: 'plate',
    color: '#e2e8f0',
    glowColor: 'rgba(226, 232, 240, 0.5)',
    symbol: '■',
  },
  COPPER_INGOT: {
    id: 'COPPER_INGOT',
    name: 'Copper Ingot',
    category: 'plate',
    color: '#ea580c',
    glowColor: 'rgba(234, 88, 12, 0.5)',
    symbol: '■',
  },
  SILICON_WAFER: {
    id: 'SILICON_WAFER',
    name: 'Silicon Wafer',
    category: 'intermediate',
    color: '#22d3ee',
    glowColor: 'rgba(34, 211, 238, 0.6)',
    symbol: '◈',
  },

  // Manufactured Goods
  COPPER_WIRE: {
    id: 'COPPER_WIRE',
    name: 'Copper Wire',
    category: 'intermediate',
    color: '#fb923c',
    glowColor: 'rgba(251, 146, 60, 0.5)',
    symbol: '∿',
  },
  CIRCUIT_BOARD: {
    id: 'CIRCUIT_BOARD',
    name: 'Circuit Board',
    category: 'component',
    color: '#10b981',
    glowColor: 'rgba(16, 185, 129, 0.6)',
    symbol: '▦',
  },
  MICROCHIP: {
    id: 'MICROCHIP',
    name: 'Advanced Microchip',
    category: 'component',
    color: '#3b82f6',
    glowColor: 'rgba(59, 130, 246, 0.6)',
    symbol: '▤',
  },
  BATTERY_PACK: {
    id: 'BATTERY_PACK',
    name: 'Aether Battery',
    category: 'power',
    color: '#eab308',
    glowColor: 'rgba(234, 179, 8, 0.6)',
    symbol: '⚡',
  },
  AETHER_CORE: {
    id: 'AETHER_CORE',
    name: 'Aether Warp Core',
    category: 'high-tech',
    color: '#c084fc',
    glowColor: 'rgba(192, 132, 252, 0.8)',
    symbol: '🔮',
  },
};

// Crafting Recipes
export const RECIPES = {
  // Smelter Recipes
  SMELT_IRON: {
    id: 'SMELT_IRON',
    name: 'Smelt Iron Plate',
    machineType: 'SMELTER',
    craftTime: 2.0,
    inputs: { IRON_ORE: 1 },
    outputs: { IRON_PLATE: 1 },
  },
  SMELT_COPPER: {
    id: 'SMELT_COPPER',
    name: 'Smelt Copper Ingot',
    machineType: 'SMELTER',
    craftTime: 2.0,
    inputs: { COPPER_ORE: 1 },
    outputs: { COPPER_INGOT: 1 },
  },
  SMELT_SILICON: {
    id: 'SMELT_SILICON',
    name: 'Purify Silicon Wafer',
    machineType: 'SMELTER',
    craftTime: 3.0,
    inputs: { SILICON_ORE: 1 },
    outputs: { SILICON_WAFER: 1 },
  },

  // Assembler Recipes
  CRAFT_WIRE: {
    id: 'CRAFT_WIRE',
    name: 'Draw Copper Wire',
    machineType: 'ASSEMBLER',
    craftTime: 1.0,
    inputs: { COPPER_INGOT: 1 },
    outputs: { COPPER_WIRE: 2 },
  },
  CRAFT_CIRCUIT: {
    id: 'CRAFT_CIRCUIT',
    name: 'Assemble Circuit Board',
    machineType: 'ASSEMBLER',
    craftTime: 2.0,
    inputs: { IRON_PLATE: 1, COPPER_WIRE: 2 },
    outputs: { CIRCUIT_BOARD: 1 },
  },
  CRAFT_CHIP: {
    id: 'CRAFT_CHIP',
    name: 'Fabricate Microchip',
    machineType: 'ASSEMBLER',
    craftTime: 3.0,
    inputs: { SILICON_WAFER: 1, COPPER_WIRE: 2 },
    outputs: { MICROCHIP: 1 },
  },
  CRAFT_BATTERY: {
    id: 'CRAFT_BATTERY',
    name: 'Build Aether Battery',
    machineType: 'ASSEMBLER',
    craftTime: 4.0,
    inputs: { IRON_PLATE: 2, COAL: 1, COPPER_WIRE: 1 },
    outputs: { BATTERY_PACK: 1 },
  },
  CRAFT_AETHER_CORE: {
    id: 'CRAFT_AETHER_CORE',
    name: 'Synthesize Warp Core',
    machineType: 'ASSEMBLER',
    craftTime: 6.0,
    inputs: { MICROCHIP: 2, BATTERY_PACK: 1 },
    outputs: { AETHER_CORE: 1 },
  },
};

// Building Definitions
export const BUILDINGS = {
  CONVEYOR: {
    id: 'CONVEYOR',
    name: 'Conveyor Belt',
    width: 1,
    height: 1,
    category: 'logistics',
    cost: { IRON_PLATE: 1 },
    powerUsage: 0,
    icon: '➔',
    hotkey: '1',
    description: 'Transports items with physical backpressure flow.',
  },
  UNDERGROUND_BELT: {
    id: 'UNDERGROUND_BELT',
    name: 'Underground Tunnel',
    width: 1,
    height: 1,
    category: 'logistics',
    cost: { IRON_PLATE: 5 },
    powerUsage: 0,
    maxSpan: 5,
    icon: '⮑',
    hotkey: '2',
    description: 'Allows crossing perpendicular belt lines underneath the surface.',
  },
  SPLITTER: {
    id: 'SPLITTER',
    name: 'Conveyor Splitter',
    width: 1,
    height: 1,
    category: 'logistics',
    cost: { IRON_PLATE: 4, COPPER_WIRE: 4 },
    powerUsage: 0,
    icon: '⑂',
    hotkey: '3',
    description: 'Alternates items between forward and side outputs 1:1.',
  },
  INSERTER: {
    id: 'INSERTER',
    name: 'Robotic Inserter',
    width: 1,
    height: 1,
    category: 'logistics',
    cost: { IRON_PLATE: 2, COPPER_WIRE: 2 },
    powerUsage: 15, // Watts
    swingDuration: 0.8, // seconds for 180° swing
    icon: '🦾',
    hotkey: '4',
    description: 'Grabs items from behind and swings 180° to deposit ahead.',
  },
  MINER: {
    id: 'MINER',
    name: 'Electric Mining Drill',
    width: 2,
    height: 2,
    category: 'production',
    cost: { IRON_PLATE: 10, COPPER_WIRE: 8 },
    powerUsage: 40,
    mineCycleTime: 1.8, // seconds per ore
    icon: '⛏️',
    hotkey: '5',
    description: 'Extracts raw ores from veins and ejects them directly ahead.',
  },
  SMELTER: {
    id: 'SMELTER',
    name: 'Electric Smelter',
    width: 2,
    height: 2,
    category: 'production',
    cost: { IRON_PLATE: 12, COPPER_WIRE: 10 },
    powerUsage: 60,
    icon: '🔥',
    hotkey: '6',
    description: 'Smelts ores into plates and wafers using electrical heat.',
  },
  ASSEMBLER: {
    id: 'ASSEMBLER',
    name: 'Automated Fabricator',
    width: 2,
    height: 2,
    category: 'production',
    cost: { IRON_PLATE: 15, CIRCUIT_BOARD: 2 },
    powerUsage: 80,
    icon: '⚙️',
    hotkey: '7',
    description: 'Assembles intermediate components and high-tech items.',
  },
  POWER_POLE: {
    id: 'POWER_POLE',
    name: 'Substation Pylon',
    width: 1,
    height: 1,
    category: 'power',
    cost: { COPPER_WIRE: 4, IRON_PLATE: 2 },
    supplyRadius: 4.5, // radius in tiles
    wireDistance: 7.5, // max connection distance between poles
    icon: '⚡',
    hotkey: '8',
    description: 'Supplies electrical power to all buildings within radius.',
  },
  DYNAMO_GENERATOR: {
    id: 'DYNAMO_GENERATOR',
    name: 'Combustion Dynamo',
    width: 2,
    height: 2,
    category: 'power',
    cost: { IRON_PLATE: 10 },
    powerGeneration: 160, // Watts
    fuelPerSecond: 0.1, // Consumes 1 coal every 10s
    icon: '🔋',
    hotkey: '9',
    description: 'Burns coal to generate steady electrical power for the grid.',
  },
  SOLAR_PANEL: {
    id: 'SOLAR_PANEL',
    name: 'Solar Collector',
    width: 2,
    height: 2,
    category: 'power',
    cost: { IRON_PLATE: 8, COPPER_WIRE: 12 },
    powerGeneration: 50,
    icon: '☀️',
    hotkey: '0',
    description: 'Clean perpetual electrical power without fuel requirements.',
  },
};

// Campaign Objective Tiers
export const CAMPAIGN_SECTORS = [
  {
    sector: 1,
    title: 'Setor 1: Extração & Metalurgia Primária',
    description: 'Explore o veio de ferro, monte esteiras e fornalhas para abastecer o Tech Hub com placas de ferro.',
    targetDeliverables: { IRON_PLATE: 25 },
    energyDuration: 180, // 3 minutes before base power shield fails
    rewardScore: 1000,
  },
  {
    sector: 2,
    title: 'Setor 2: Condutores & Linhas Paralelas',
    description: 'Conecte o veio de cobre, alimente montadoras para trefilar fios de cobre e envie placas e fios ao núcleo.',
    targetDeliverables: { COPPER_WIRE: 40, IRON_PLATE: 30 },
    energyDuration: 240,
    rewardScore: 2500,
  },
  {
    sector: 3,
    title: 'Setor 3: Placas Lógicas & Eletrônica',
    description: 'Combine placas de ferro e fios em montadoras dedicadas para criar as primeiras Placas de Circuito.',
    targetDeliverables: { CIRCUIT_BOARD: 30 },
    energyDuration: 300,
    rewardScore: 5000,
  },
  {
    sector: 4,
    title: 'Setor 4: Purificação de Silício & Microchips',
    description: 'Minere silício bruto, purifique-o em wafers e componha Microchips de alta performance.',
    targetDeliverables: { MICROCHIP: 35 },
    energyDuration: 360,
    rewardScore: 9000,
  },
  {
    sector: 5,
    title: 'Setor 5: O Núcleo Warp da Aether',
    description: 'Incorpore baterias de carbono e produza Núcleos Warp para selar a matriz de sustentação da base.',
    targetDeliverables: { BATTERY_PACK: 30, AETHER_CORE: 15 },
    energyDuration: 420,
    rewardScore: 20000,
  },
];

// Interactive Research & Technology Tree
export const RESEARCH_TECHS = [
  {
    id: 'TECH_FAST_CONVEYORS',
    name: 'Logística de Alta Frequência',
    icon: '⚡',
    cost: { IRON_PLATE: 20 },
    description: 'Aumenta a velocidade das esteiras rolantes em +50%.',
    effect: 'conveyorSpeedBoost',
  },
  {
    id: 'TECH_FAST_INSERTERS',
    name: 'Servomotores Overclockados',
    icon: '🦾',
    cost: { COPPER_WIRE: 25, IRON_PLATE: 15 },
    description: 'Reduz o tempo de giro de todos os braços mecânicos para 0.4s.',
    effect: 'inserterSpeedBoost',
  },
  {
    id: 'TECH_SOLAR_EFFICIENCY',
    name: 'Células Solares Cristalinas',
    icon: '☀️',
    cost: { CIRCUIT_BOARD: 15 },
    description: 'Dobra a geração dos Painéis Solares de 50W para 100W.',
    effect: 'solarBoost',
  },
  {
    id: 'TECH_ARC_FURNACES',
    name: 'Indução Eletromagnética Térmica',
    icon: '🔥',
    cost: { MICROCHIP: 15 },
    description: 'Dobra a velocidade de fusão de minérios nas Fornalhas Elétricas.',
    effect: 'smelterBoost',
  },
  {
    id: 'TECH_AETHER_SHIELD',
    name: 'Matriz Supercondutora Aether',
    icon: '🔮',
    cost: { BATTERY_PACK: 15, AETHER_CORE: 5 },
    description: 'Dobra a capacidade de escudo e bônus de recarga do Tech Hub.',
    effect: 'shieldBoost',
  },
];

