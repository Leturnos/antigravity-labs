/**
 * SectorGraph - Sector Campaign Graph & Cyberware Upgrade System for Aether Cyber Tactics.
 * Manages a 3-sector campaign graph with branching nodes, node travel states,
 * credit/tech core currencies, unit repairs, and cyberware upgrades.
 */

export const NODE_TYPES = {
  BATTLE_STANDARD: 'BATTLE_STANDARD',
  BATTLE_ELITE: 'BATTLE_ELITE',
  CYBER_SHOP: 'CYBER_SHOP',
  SECTOR_BOSS: 'SECTOR_BOSS'
};

export const NODE_STATUS = {
  LOCKED: 'locked',
  AVAILABLE: 'available',
  VISITED: 'visited',
  COMPLETED: 'completed'
};

export const UPGRADE_TYPES = {
  HP: 'HP boost',
  AP: 'AP boost',
  MOVE: 'Move boost',
  PUSH_RANGE: 'Push range boost'
};

export const CAMPAIGN_STATUS = {
  IN_PROGRESS: 'IN_PROGRESS',
  VICTORY: 'VICTORY',
  GAME_OVER: 'GAME_OVER'
};

/**
 * Creates a simple PRNG for deterministic sector graph generation.
 * @param {number|string} seed
 */
function createPRNG(seed) {
  let s = typeof seed === 'number' ? seed : 987654321;
  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class SectorGraph {
  /**
   * @param {Object} [options={}]
   * @param {number|string} [options.seed] - Seed for procedural sector graph generation
   * @param {number} [options.startingCredits=100]
   * @param {number} [options.startingTechCores=1]
   */
  constructor(options = {}) {
    this.seed = options.seed !== undefined ? options.seed : Date.now();
    this.prng = createPRNG(this.seed);

    this.credits = options.startingCredits !== undefined ? options.startingCredits : 100;
    this.techCores = options.startingTechCores !== undefined ? options.startingTechCores : 1;

    this.currentSectorIndex = 0;
    this.currentNodeId = null;
    this.status = CAMPAIGN_STATUS.IN_PROGRESS;

    // Upgrades state summary
    this.upgrades = {
      [UPGRADE_TYPES.HP]: 0,
      [UPGRADE_TYPES.AP]: 0,
      [UPGRADE_TYPES.MOVE]: 0,
      [UPGRADE_TYPES.PUSH_RANGE]: 0
    };

    this.sectors = [];
    this.initCampaign();
  }

  /**
   * Initializes 3 procedural sectors with 6 to 8 branching nodes per sector.
   */
  initCampaign() {
    this.sectors = [];
    const sectorNames = [
      'Sector 1: Outer Subnet Matrix',
      'Sector 2: Deep Core Relay',
      'Sector 3: Apex Cyber Core'
    ];

    for (let sIndex = 0; sIndex < 3; sIndex++) {
      const sector = this.generateSector(sIndex, sectorNames[sIndex]);
      this.sectors.push(sector);
    }

    // Unlock entry nodes of Sector 0
    if (this.sectors[0] && this.sectors[0].nodes.length > 0) {
      for (const node of this.sectors[0].nodes) {
        if (node.layer === 0) {
          node.status = NODE_STATUS.AVAILABLE;
        }
      }
    }
  }

  /**
   * Generates a single sector graph with 6 to 8 branching nodes across 4-5 layers.
   * @param {number} sectorIndex
   * @param {string} sectorName
   * @returns {Object} Sector object
   */
  generateSector(sectorIndex, sectorName) {
    const nodes = [];
    const edges = [];

    // Define layers structure: 4 layers per sector (Layer 0, Layer 1, Layer 2, Layer 3)
    // Total nodes: 1 (start) + 2 (layer 1) + 2..3 (layer 2) + 1 (boss) = 6 to 7 nodes per sector
    const layerDefs = [
      { layer: 0, count: 1, allowedTypes: [NODE_TYPES.BATTLE_STANDARD] },
      { layer: 1, count: 2, allowedTypes: [NODE_TYPES.BATTLE_STANDARD, NODE_TYPES.CYBER_SHOP] },
      { layer: 2, count: 3, allowedTypes: [NODE_TYPES.BATTLE_STANDARD, NODE_TYPES.BATTLE_ELITE, NODE_TYPES.CYBER_SHOP] },
      { layer: 3, count: 1, allowedTypes: [NODE_TYPES.SECTOR_BOSS] }
    ];

    const nodesByLayer = [];

    let nodeCounter = 0;
    for (const def of layerDefs) {
      const layerNodes = [];
      for (let i = 0; i < def.count; i++) {
        const nodeId = `s${sectorIndex}_n${nodeCounter++}`;
        const type = def.allowedTypes[Math.floor(this.prng() * def.allowedTypes.length)];

        let rewards = { credits: 40, techCores: 0 };
        if (type === NODE_TYPES.BATTLE_ELITE) rewards = { credits: 80, techCores: 1 };
        if (type === NODE_TYPES.SECTOR_BOSS) rewards = { credits: 150, techCores: 2 };
        if (type === NODE_TYPES.CYBER_SHOP) rewards = { credits: 0, techCores: 0 };

        const node = {
          id: nodeId,
          sector: sectorIndex,
          layer: def.layer,
          type,
          name: this.getNodeName(type, nodeId),
          status: NODE_STATUS.LOCKED,
          nextNodes: [],
          prevNodes: [],
          rewards
        };

        nodes.push(node);
        layerNodes.push(node);
      }
      nodesByLayer.push(layerNodes);
    }

    // Connect layers (branching graph edges)
    for (let l = 0; l < nodesByLayer.length - 1; l++) {
      const currentLayer = nodesByLayer[l];
      const nextLayer = nodesByLayer[l + 1];

      for (const srcNode of currentLayer) {
        // Guarantee at least 1 outgoing link
        const targetNode = nextLayer[Math.floor(this.prng() * nextLayer.length)];
        if (!srcNode.nextNodes.includes(targetNode.id)) {
          srcNode.nextNodes.push(targetNode.id);
          targetNode.prevNodes.push(srcNode.id);
          edges.push({ from: srcNode.id, to: targetNode.id });
        }
      }

      // Ensure every node in nextLayer has at least 1 incoming link
      for (const destNode of nextLayer) {
        if (destNode.prevNodes.length === 0) {
          const srcNode = currentLayer[Math.floor(this.prng() * currentLayer.length)];
          if (!srcNode.nextNodes.includes(destNode.id)) {
            srcNode.nextNodes.push(destNode.id);
            destNode.prevNodes.push(srcNode.id);
            edges.push({ from: srcNode.id, to: destNode.id });
          }
        }
      }
    }

    return {
      id: sectorIndex,
      name: sectorName,
      nodes,
      edges
    };
  }

  /**
   * Helper to format descriptive node titles.
   */
  getNodeName(type, id) {
    switch (type) {
      case NODE_TYPES.BATTLE_STANDARD:
        return `Subnet Combat (${id})`;
      case NODE_TYPES.BATTLE_ELITE:
        return `Elite Cyber Ambush (${id})`;
      case NODE_TYPES.CYBER_SHOP:
        return `Cyberware Haven (${id})`;
      case NODE_TYPES.SECTOR_BOSS:
        return `Sector Boss Apex Core (${id})`;
      default:
        return `Sector Encounter (${id})`;
    }
  }

  /**
   * Returns current active sector object.
   */
  getCurrentSector() {
    return this.sectors[this.currentSectorIndex] || null;
  }

  /**
   * Returns list of currently reachable/available nodes in active sector.
   * @returns {Array<Object>}
   */
  getAvailableNodes() {
    const sector = this.getCurrentSector();
    if (!sector) return [];
    return sector.nodes.filter(node => node.status === NODE_STATUS.AVAILABLE);
  }

  /**
   * Finds a node by ID across all sectors.
   * @param {string} nodeId
   * @returns {Object|null}
   */
  getNode(nodeId) {
    for (const sector of this.sectors) {
      const node = sector.nodes.find(n => n.id === nodeId);
      if (node) return node;
    }
    return null;
  }

  /**
   * Selects and enters a node in the campaign graph.
   * @param {string} nodeId
   * @returns {boolean} True if successfully selected
   */
  selectNode(nodeId) {
    const node = this.getNode(nodeId);
    if (!node) return false;
    if (node.sector !== this.currentSectorIndex) return false;
    if (node.status !== NODE_STATUS.AVAILABLE) return false;

    this.currentNodeId = nodeId;
    node.status = NODE_STATUS.VISITED;
    return true;
  }

  /**
   * Completes the active node, awards rewards, unlocks next branching nodes,
   * and advances sectors if sector boss is defeated.
   * @param {Object} [battleResults={}]
   * @returns {Object} Summary of rewards and progression
   */
  completeCurrentNode(battleResults = {}) {
    if (!this.currentNodeId) {
      return { success: false, message: 'No active node selected.' };
    }

    const node = this.getNode(this.currentNodeId);
    if (!node) {
      return { success: false, message: 'Active node not found.' };
    }

    node.status = NODE_STATUS.COMPLETED;

    // Grant rewards
    const creditsEarned = battleResults.credits !== undefined ? battleResults.credits : (node.rewards ? node.rewards.credits : 0);
    const techCoresEarned = battleResults.techCores !== undefined ? battleResults.techCores : (node.rewards ? node.rewards.techCores : 0);

    this.credits += creditsEarned;
    this.techCores += techCoresEarned;

    const sector = this.getCurrentSector();
    let sectorAdvanced = false;

    if (node.type === NODE_TYPES.SECTOR_BOSS) {
      // Sector Boss Defeated
      if (this.currentSectorIndex < 2) {
        this.currentSectorIndex++;
        sectorAdvanced = true;
        // Unlock entry nodes of new sector
        const newSector = this.getCurrentSector();
        if (newSector) {
          for (const n of newSector.nodes) {
            if (n.layer === 0) {
              n.status = NODE_STATUS.AVAILABLE;
            }
          }
        }
      } else {
        // Sector 3 Boss defeated -> Campaign Victory
        this.status = CAMPAIGN_STATUS.VICTORY;
      }
    } else {
      // Unlock connected next nodes in current sector
      for (const nextId of node.nextNodes) {
        const nextNode = this.getNode(nextId);
        if (nextNode && nextNode.status === NODE_STATUS.LOCKED) {
          nextNode.status = NODE_STATUS.AVAILABLE;
        }
      }
    }

    const completedId = this.currentNodeId;
    this.currentNodeId = null;

    return {
      success: true,
      nodeId: completedId,
      creditsEarned,
      techCoresEarned,
      sectorAdvanced,
      currentSector: this.currentSectorIndex,
      campaignStatus: this.status
    };
  }

  /**
   * Restores HP to a squad unit using credits currency.
   * @param {import('../core/units.js').Unit} unit
   * @param {number} [amount=5] - Amount of HP to restore
   * @param {number} [costPerPoint=5] - Credit cost per 1 HP restored
   * @returns {{ success: boolean, message: string, creditsSpent: number, hpRestored: number }}
   */
  repairUnit(unit, amount = 5, costPerPoint = 5) {
    if (!unit || typeof unit.heal !== 'function') {
      return { success: false, message: 'Invalid unit provided.', creditsSpent: 0, hpRestored: 0 };
    }

    if (unit.hp >= unit.maxHp) {
      return { success: false, message: `${unit.name} is already at full health.`, creditsSpent: 0, hpRestored: 0 };
    }

    const neededHp = unit.maxHp - unit.hp;
    const hpToRestore = Math.min(neededHp, amount);
    const totalCost = hpToRestore * costPerPoint;

    if (this.credits < totalCost) {
      return { success: false, message: `Insufficient credits. Need ${totalCost} credits.`, creditsSpent: 0, hpRestored: 0 };
    }

    this.credits -= totalCost;
    unit.heal(hpToRestore);

    return {
      success: true,
      message: `Repaired ${unit.name} (+${hpToRestore} HP).`,
      creditsSpent: totalCost,
      hpRestored: hpToRestore
    };
  }

  /**
   * Cyberware Upgrade Shop Inventory with Costs and Descriptions.
   */
  getShopInventory() {
    return [
      {
        id: UPGRADE_TYPES.HP,
        name: 'Reforço de Nanites (Bônus de HP)',
        description: 'Aumenta o HP Máximo e o HP Atual do operativo em +2.',
        costCredits: 50,
        costTechCores: 0,
        type: UPGRADE_TYPES.HP
      },
      {
        id: UPGRADE_TYPES.AP,
        name: 'Processador Neural Acelerado (+1 AP)',
        description: 'Aumenta os Pontos de Ação (AP) Máximos em +1.',
        costCredits: 100,
        costTechCores: 1,
        type: UPGRADE_TYPES.AP
      },
      {
        id: UPGRADE_TYPES.MOVE,
        name: 'Servomotores de Locomoção (+1 Alcance)',
        description: 'Aumenta o alcance de Movimento em +1 tile.',
        costCredits: 60,
        costTechCores: 0,
        type: UPGRADE_TYPES.MOVE
      },
      {
        id: UPGRADE_TYPES.PUSH_RANGE,
        name: 'Emissor de Impulso Cinético (+1 Empurrão)',
        description: 'Aumenta a distância de empurrão das habilidades em +1 tile.',
        costCredits: 70,
        costTechCores: 0,
        type: UPGRADE_TYPES.PUSH_RANGE
      }
    ];
  }

  /**
   * Applies a cyberware upgrade (HP boost, AP boost, Move boost, Push range boost) to a unit.
   * @param {string} upgradeType - UPGRADE_TYPES value
   * @param {import('../core/units.js').Unit} [unit=null] - Optional target squad unit
   * @returns {{ success: boolean, message: string }}
   */
  applyCyberwareUpgrade(upgradeType, unit = null) {
    const shop = this.getShopInventory();
    const item = shop.find(i => i.type === upgradeType || i.id === upgradeType);

    if (!item) {
      return { success: false, message: `Unknown upgrade type: ${upgradeType}` };
    }

    if (this.credits < item.costCredits) {
      return { success: false, message: `Insufficient credits. Requires ${item.costCredits} credits.` };
    }

    if (this.techCores < item.costTechCores) {
      return { success: false, message: `Insufficient tech cores. Requires ${item.costTechCores} tech cores.` };
    }

    // Deduct resources
    this.credits -= item.costCredits;
    this.techCores -= item.costTechCores;

    // Increment global upgrade counter
    if (this.upgrades[item.type] !== undefined) {
      this.upgrades[item.type]++;
    }

    // Apply stat boosts to unit if provided
    if (unit) {
      switch (item.type) {
        case UPGRADE_TYPES.HP:
          unit.maxHp += 2;
          unit.hp += 2;
          break;
        case UPGRADE_TYPES.AP:
          unit.maxAp += 1;
          unit.ap += 1;
          break;
        case UPGRADE_TYPES.MOVE:
          unit.moveRange += 1;
          break;
        case UPGRADE_TYPES.PUSH_RANGE:
          unit.pushRange = (unit.pushRange || 1) + 1;
          break;
      }
    }

    return {
      success: true,
      message: `Purchased ${item.name}${unit ? ' for ' + unit.name : ''}!`,
      upgrade: item,
      unit
    };
  }

  /**
   * Adds credits to currency pool.
   * @param {number} amount
   */
  addCredits(amount) {
    if (amount > 0) this.credits += amount;
  }

  /**
   * Adds tech cores to currency pool.
   * @param {number} amount
   */
  addTechCores(amount) {
    if (amount > 0) this.techCores += amount;
  }

  /**
   * Returns current overall status summary of the campaign.
   */
  getCampaignStatus() {
    return {
      status: this.status,
      currentSector: this.currentSectorIndex,
      currentSectorName: this.getCurrentSector() ? this.getCurrentSector().name : '',
      currentNodeId: this.currentNodeId,
      credits: this.credits,
      techCores: this.techCores,
      upgrades: { ...this.upgrades }
    };
  }

  /**
   * Serializes campaign state to JSON object for save games.
   */
  toJSON() {
    return {
      seed: this.seed,
      credits: this.credits,
      techCores: this.techCores,
      currentSectorIndex: this.currentSectorIndex,
      currentNodeId: this.currentNodeId,
      status: this.status,
      upgrades: this.upgrades,
      sectors: this.sectors
    };
  }

  /**
   * Deserializes campaign state from saved JSON object.
   * @param {Object} data
   */
  fromJSON(data) {
    if (!data) return;
    if (data.seed !== undefined) this.seed = data.seed;
    if (data.credits !== undefined) this.credits = data.credits;
    if (data.techCores !== undefined) this.techCores = data.techCores;
    if (data.currentSectorIndex !== undefined) this.currentSectorIndex = data.currentSectorIndex;
    if (data.currentNodeId !== undefined) this.currentNodeId = data.currentNodeId;
    if (data.status !== undefined) this.status = data.status;
    if (data.upgrades) this.upgrades = { ...data.upgrades };
    if (data.sectors) this.sectors = data.sectors;
  }
}
