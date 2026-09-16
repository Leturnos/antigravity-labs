/**
 * HUD — User Interface, Hotbar, Inspector Modal & Campaign Status Bar
 */

import {
  BUILDINGS,
  ITEMS,
  RECIPES,
  CAMPAIGN_SECTORS,
  RESEARCH_TECHS,
  DIR,
} from '../config.js';

export class HUD {
  /**
   * @param {object} app Main application instance
   */
  constructor(app) {
    this.app = app;

    // DOM Elements
    this.elEnergyBar = document.getElementById('base-energy-fill');
    this.elEnergyTxt = document.getElementById('base-energy-txt');
    this.elSectorTitle = document.getElementById('sector-title');
    this.elSectorReqs = document.getElementById('sector-requirements');
    this.elThroughput = document.getElementById('throughput-rate');
    this.elPowerGen = document.getElementById('power-gen-txt');
    this.elPowerRatio = document.getElementById('power-ratio-txt');

    this.elInspector = document.getElementById('inspector-panel');
    this.elInspectorTitle = document.getElementById('inspector-title');
    this.elInspectorBody = document.getElementById('inspector-body');

    this.elStockpile = document.getElementById('stockpile-items');
    this.elResearchModal = document.getElementById('research-modal');
    this.elResearchList = document.getElementById('research-cards-list');

    this.selectedBuildingForInspect = null;
  }

  /**
   * Updates topbar indicators every tick or render cycle.
   */
  updateStatusBar(gameState) {
    // 1. Base Energy Gauge
    const energyPct = Math.max(0, Math.min(100, (gameState.baseEnergy / gameState.maxBaseEnergy) * 100));
    if (this.elEnergyBar) {
      this.elEnergyBar.style.width = `${energyPct}%`;
      if (energyPct < 20) {
        this.elEnergyBar.classList.add('critical');
      } else {
        this.elEnergyBar.classList.remove('critical');
      }
    }
    if (this.elEnergyTxt) {
      const mins = Math.floor(gameState.baseEnergy / 60);
      const secs = Math.floor(gameState.baseEnergy % 60);
      this.elEnergyTxt.textContent = `${energyPct.toFixed(0)}% (${mins}:${secs.toString().padStart(2, '0')})`;
    }

    // 2. Sector Requirements
    const sector = CAMPAIGN_SECTORS[gameState.currentSector - 1];
    if (sector) {
      if (this.elSectorTitle) {
        this.elSectorTitle.textContent = `${sector.title}`;
      }
      if (this.elSectorReqs) {
        const parts = [];
        for (const [itemType, reqQty] of Object.entries(sector.targetDeliverables)) {
          const current = gameState.sectorDeliveries[itemType] || 0;
          const itemName = ITEMS[itemType] ? ITEMS[itemType].name : itemType;
          const done = current >= reqQty;
          parts.push(`<span class="${done ? 'req-done' : 'req-pending'}">${itemName}: ${current}/${reqQty}</span>`);
        }
        this.elSectorReqs.innerHTML = parts.join(' | ');
      }
    } else {
      if (this.elSectorTitle) this.elSectorTitle.textContent = 'Modo Infinito (Throughput)';
      if (this.elSectorReqs) this.elSectorReqs.textContent = 'Otimize a produção e abasteça o núcleo!';
    }

    // 3. Throughput & Power
    if (this.elThroughput) {
      this.elThroughput.textContent = `${gameState.itemsPerMinute.toFixed(1)}/min`;
    }
    if (this.elPowerGen) {
      this.elPowerGen.textContent = `${gameState.powerGen}W / ${gameState.powerDemand}W`;
    }
    if (this.elPowerRatio) {
      const pct = Math.floor(gameState.powerRatio * 100);
      this.elPowerRatio.textContent = `${pct}%`;
      this.elPowerRatio.style.color = pct >= 90 ? '#10b981' : (pct >= 50 ? '#f59e0b' : '#ef4444');
    }

    // 4. Update Inspector if open
    if (this.selectedBuildingForInspect) {
      this.renderInspectorContent(this.selectedBuildingForInspect);
    }
  }

  /**
   * Opens building inspector modal.
   */
  openInspector(building) {
    this.selectedBuildingForInspect = building;
    if (!this.elInspector) return;

    this.elInspector.classList.add('active');
    this.renderInspectorContent(building);
  }

  /**
   * Closes building inspector modal.
   */
  closeInspector() {
    this.selectedBuildingForInspect = null;
    if (this.elInspector) {
      this.elInspector.classList.remove('active');
    }
  }

  /**
   * Renders the dynamic inspector body content.
   */
  renderInspectorContent(building) {
    if (!this.elInspectorTitle || !this.elInspectorBody) return;

    const bDef = BUILDINGS[building.type] || { name: building.name || building.type };
    this.elInspectorTitle.textContent = `${bDef.name} [${building.gx}, ${building.gy}]`;

    let html = '';

    // Status line
    let statusText = 'Operando';
    let statusColor = '#10b981';
    if (!building.active && building.type !== 'POWER_POLE' && building.type !== 'TECH_HUB') {
      statusText = 'Aguardando Insumos / Espaço';
      statusColor = '#f59e0b';
    }
    html += `<div class="inspector-row"><span>Status:</span><strong style="color:${statusColor}">${statusText}</strong></div>`;

    // Recipe selection for Assemblers
    if (building.type === 'ASSEMBLER') {
      html += `<div class="inspector-row">
        <span>Receita:</span>
        <select id="inspector-recipe-select" class="hud-select">
          <option value="CRAFT_WIRE" ${building.recipe?.id === 'CRAFT_WIRE' ? 'selected' : ''}>Fios de Cobre</option>
          <option value="CRAFT_CIRCUIT" ${building.recipe?.id === 'CRAFT_CIRCUIT' ? 'selected' : ''}>Placa de Circuito</option>
          <option value="CRAFT_CHIP" ${building.recipe?.id === 'CRAFT_CHIP' ? 'selected' : ''}>Microchip</option>
          <option value="CRAFT_BATTERY" ${building.recipe?.id === 'CRAFT_BATTERY' ? 'selected' : ''}>Bateria Aether</option>
          <option value="CRAFT_AETHER_CORE" ${building.recipe?.id === 'CRAFT_AETHER_CORE' ? 'selected' : ''}>Núcleo Warp</option>
        </select>
      </div>`;
    }

    // Input buffer
    if (building.inputBuffer) {
      html += `<div class="buffer-section"><h4>Entrada:</h4><div class="buffer-badges">`;
      const inputs = Object.entries(building.inputBuffer);
      if (inputs.length === 0) {
        html += `<span class="empty-badge">Vazio</span>`;
      } else {
        for (const [itemType, count] of inputs) {
          const item = ITEMS[itemType];
          html += `<span class="item-badge" style="background:${item?.glowColor || '#334155'}; border:1px solid ${item?.color || '#fff'}">${item?.name || itemType}: ${count}</span>`;
        }
      }
      html += `</div></div>`;
    }

    // Output buffer
    if (building.outputBuffer) {
      html += `<div class="buffer-section"><h4>Saída:</h4><div class="buffer-badges">`;
      const outputs = Object.entries(building.outputBuffer);
      if (outputs.length === 0) {
        html += `<span class="empty-badge">Vazio</span>`;
      } else {
        for (const [itemType, count] of outputs) {
          const item = ITEMS[itemType];
          html += `<span class="item-badge" style="background:${item?.glowColor || '#334155'}; border:1px solid ${item?.color || '#fff'}">${item?.name || itemType}: ${count}</span>`;
        }
      }
      html += `</div></div>`;
    }

    // Craft Progress bar
    if (building.craftDuration) {
      const pct = Math.min(100, Math.floor((building.craftProgress / building.craftDuration) * 100));
      html += `<div class="craft-progress-container">
        <div class="craft-progress-fill" style="width:${pct}%"></div>
      </div>`;
    }

    // Demolish quick button
    if (building.type !== 'TECH_HUB') {
      html += `<button id="btn-inspect-demolish" class="btn-demolish-modal">Desmantelar Edifício</button>`;
    }

    this.elInspectorBody.innerHTML = html;

    // Attach listeners
    const recipeSelect = document.getElementById('inspector-recipe-select');
    if (recipeSelect) {
      recipeSelect.addEventListener('change', (e) => {
        this.app.machineSystem.setRecipe(building.id, e.target.value);
      });
    }

    const btnDemolish = document.getElementById('btn-inspect-demolish');
    if (btnDemolish) {
      btnDemolish.addEventListener('click', () => {
        this.app.demolishAt(building.gx, building.gy);
        this.closeInspector();
      });
    }
  }

  /**
   * Updates the global resource stockpile bar on HUD.
   */
  updateStockpile(inventory) {
    if (!this.elStockpile) return;

    const trackKeys = ['IRON_PLATE', 'COPPER_INGOT', 'COPPER_WIRE', 'CIRCUIT_BOARD', 'MICROCHIP', 'BATTERY_PACK', 'AETHER_CORE'];
    const parts = [];

    for (const key of trackKeys) {
      const count = inventory[key] || 0;
      const item = ITEMS[key];
      if (item && (count > 0 || key === 'IRON_PLATE' || key === 'COPPER_WIRE' || key === 'CIRCUIT_BOARD')) {
        parts.push(`<span class="stockpile-chip" style="border-color:${item.color}">
          <span style="color:${item.color}">${item.symbol}</span>
          <span class="stock-name">${item.name.split(' ')[0]}:</span>
          <strong>${count}</strong>
        </span>`);
      }
    }

    this.elStockpile.innerHTML = parts.join('');
  }

  /**
   * Opens the Technology Research Tree modal.
   */
  openResearchModal() {
    if (!this.elResearchModal) return;
    this.renderResearchModal();
    this.elResearchModal.classList.add('active');
  }

  closeResearchModal() {
    if (this.elResearchModal) {
      this.elResearchModal.classList.remove('active');
    }
  }

  renderResearchModal() {
    if (!this.elResearchList) return;

    const inventory = this.app.techHubInventory;
    const unlocked = this.app.unlockedTechs;

    let html = '';

    for (const tech of RESEARCH_TECHS) {
      const isUnlocked = unlocked.has(tech.id);
      let canAfford = true;

      const costBadges = [];
      for (const [itemType, reqQty] of Object.entries(tech.cost)) {
        const hasQty = inventory[itemType] || 0;
        const item = ITEMS[itemType];
        const met = hasQty >= reqQty;
        if (!met) canAfford = false;
        costBadges.push(`<span class="tech-cost-badge ${met ? 'met' : 'missing'}">
          ${item?.name || itemType}: ${hasQty}/${reqQty}
        </span>`);
      }

      html += `
        <div class="tech-card ${isUnlocked ? 'unlocked' : (canAfford ? 'affordable' : 'locked')}">
          <div class="tech-card-top">
            <span class="tech-card-icon">${tech.icon}</span>
            <div class="tech-card-title-group">
              <h4>${tech.name}</h4>
              <p>${tech.description}</p>
            </div>
            <div class="tech-card-action">
              ${isUnlocked
                ? `<button class="btn-ctrl" disabled style="color:#10b981; border-color:#10b981;">✓ Desbloqueado</button>`
                : `<button class="btn-ctrl btn-accent btn-buy-tech" data-tech="${tech.id}" ${canAfford ? '' : 'disabled'}>
                    ${canAfford ? '🔬 Pesquisar' : 'Insumos Insuficientes'}
                   </button>`
              }
            </div>
          </div>
          <div class="tech-card-costs">
            <span>Custo:</span>
            ${costBadges.join(' ')}
          </div>
        </div>
      `;
    }

    this.elResearchList.innerHTML = html;

    // Attach buy listeners
    const buyButtons = this.elResearchList.querySelectorAll('.btn-buy-tech');
    buyButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const techId = btn.dataset.tech;
        this.app.unlockResearch(techId);
        this.renderResearchModal();
      });
    });
  }
}
