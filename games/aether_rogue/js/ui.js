/**
 * Aether Rogue - UI Manager (HUD, Log, Minimap, Inventory, Talent Modal)
 */

import { TILE_WALL, TILE_FLOOR, TILE_CAVE, TILE_EXIT, TILE_LOCKED_GATE } from './dungeon.js';

export class UIManager {
  constructor() {
    this.elFloor = document.getElementById('hud-floor');
    this.elHpBar = document.getElementById('hud-hp-bar');
    this.elHpText = document.getElementById('hud-hp-text');
    this.elEnergyBar = document.getElementById('hud-energy-bar');
    this.elEnergyText = document.getElementById('hud-energy-text');
    this.elChips = document.getElementById('hud-chips');
    this.elSkills = document.getElementById('skills-list');
    this.elInventory = document.getElementById('inventory-list');
    this.elLog = document.getElementById('log-container');
    
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;

    this.talentModal = document.getElementById('talent-modal');
    this.elTalentTree = document.getElementById('talent-tree');
    
    this.setupListeners();
  }

  setupListeners() {
    const btnTalents = document.getElementById('btn-talents');
    const btnCloseTalents = document.getElementById('btn-close-talents');

    if (btnTalents) {
      btnTalents.addEventListener('click', () => this.toggleTalentsModal());
    }
    if (btnCloseTalents) {
      btnCloseTalents.addEventListener('click', () => this.toggleTalentsModal(false));
    }
  }

  updateHUD(player, floorNumber) {
    if (this.elFloor) this.elFloor.textContent = floorNumber;
    
    if (this.elHpBar && this.elHpText) {
      const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
      this.elHpBar.style.width = `${hpPct}%`;
      this.elHpText.textContent = `${player.hp}/${player.maxHp}`;
    }

    if (this.elEnergyBar && this.elEnergyText) {
      const energyPct = Math.max(0, Math.min(100, (player.energy / player.maxEnergy) * 100));
      this.elEnergyBar.style.width = `${energyPct}%`;
      this.elEnergyText.textContent = `${player.energy}/${player.maxEnergy}`;
    }

    if (this.elChips) this.elChips.textContent = player.cyberChips;
  }

  renderSkills(cyberware, player, onUseSkill) {
    if (!this.elSkills) return;
    this.elSkills.innerHTML = '';

    cyberware.skills.forEach((skill) => {
      const card = document.createElement('div');
      card.className = `skill-card ${skill.cdCurrent > 0 || player.energy < skill.cost ? 'disabled' : ''}`;
      
      const name = document.createElement('div');
      name.className = 'skill-name';
      name.textContent = skill.name;

      const desc = document.createElement('div');
      desc.className = 'skill-desc';
      desc.textContent = skill.desc;

      card.appendChild(name);
      card.appendChild(desc);

      if (skill.cdCurrent > 0) {
        const cd = document.createElement('div');
        cd.className = 'skill-cd';
        cd.textContent = `${skill.cdCurrent}T`;
        card.appendChild(cd);
      }

      card.addEventListener('click', () => onUseSkill(skill.id));
      this.elSkills.appendChild(card);
    });
  }

  renderInventory(player) {
    if (!this.elInventory) return;
    this.elInventory.innerHTML = '';

    const items = [];
    if (player.nanites > 0) {
      items.push({ icon: '💊', count: `x${player.nanites}`, title: 'Nanite Rebuild (Cura)' });
    }
    if (player.keycards.length > 0) {
      items.push({ icon: '🔑', count: 'CARD', title: 'Cartão de Acesso do Andar' });
    }

    // Always render 6 grid slots
    for (let i = 0; i < 6; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';

      if (i < items.length) {
        const item = items[i];
        slot.innerHTML = `<span class="inv-icon">${item.icon}</span><span class="inv-count">${item.count}</span>`;
        slot.title = item.title;
      } else {
        slot.classList.add('empty');
      }

      this.elInventory.appendChild(slot);
    }
  }

  showGameOverModal(floor, chips, onRestart) {
    const modal = document.getElementById('gameover-modal');
    const elFloor = document.getElementById('gameover-floor');
    const elChips = document.getElementById('gameover-chips');
    const btnRestart = document.getElementById('btn-restart');

    if (elFloor) elFloor.textContent = floor;
    if (elChips) elChips.textContent = chips;

    if (btnRestart) {
      btnRestart.onclick = () => {
        if (modal) modal.classList.add('hidden');
        if (onRestart) onRestart();
      };
    }

    if (modal) modal.classList.remove('hidden');
  }

  addLog(message, type = 'info') {
    if (!this.elLog) return;
    const msgEl = document.createElement('div');
    msgEl.className = `log-msg ${type}`;
    msgEl.textContent = `> ${message}`;
    this.elLog.appendChild(msgEl);
    this.elLog.scrollTop = this.elLog.scrollHeight;
  }

  renderMinimap(dungeon, player) {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    ctx.fillStyle = '#020205';
    ctx.fillRect(0, 0, w, h);

    const scaleX = w / dungeon.width;
    const scaleY = h / dungeon.height;

    for (let y = 0; y < dungeon.height; y++) {
      for (let x = 0; x < dungeon.width; x++) {
        const tile = dungeon.grid[y][x];
        if (!tile.explored) continue;

        if (tile.type === TILE_WALL) {
          ctx.fillStyle = '#1e1e38';
        } else if (tile.type === TILE_EXIT) {
          ctx.fillStyle = '#00ff88';
        } else if (tile.type === TILE_LOCKED_GATE) {
          ctx.fillStyle = '#ff0055';
        } else {
          ctx.fillStyle = tile.visible ? '#00f3ff44' : '#00f3ff11';
        }

        ctx.fillRect(x * scaleX, y * scaleY, Math.max(1, scaleX), Math.max(1, scaleY));
      }
    }

    // Render player on minimap
    ctx.fillStyle = '#00f3ff';
    ctx.fillRect(player.x * scaleX - 1, player.y * scaleY - 1, 3, 3);
  }

  toggleTalentsModal(forceState) {
    if (!this.talentModal) return;
    if (forceState !== undefined) {
      this.talentModal.classList.toggle('hidden', !forceState);
    } else {
      this.talentModal.classList.toggle('hidden');
    }
  }

  renderTalentsModal(cyberware, player, onUnlockTalent) {
    if (!this.elTalentTree) return;
    this.elTalentTree.innerHTML = '';

    cyberware.talents.forEach(t => {
      const isUnlocked = player.talents.has(t.id);
      const card = document.createElement('div');
      card.className = `talent-card ${isUnlocked ? 'unlocked' : ''}`;

      card.innerHTML = `
        <div style="font-weight:700; color:${isUnlocked ? '#00ff88' : '#e2e8f0'}">${t.name}</div>
        <div style="font-size:0.75rem; color:#94a3b8">${t.desc}</div>
        <button class="btn-glass ${isUnlocked ? '' : 'neon-purple-btn'}" style="margin-top:auto" ${isUnlocked ? 'disabled' : ''}>
          ${isUnlocked ? 'ADQUIRIDO' : `Desbloquear (${t.cost} Chips)`}
        </button>
      `;

      const btn = card.querySelector('button');
      if (btn && !isUnlocked) {
        btn.addEventListener('click', () => onUnlockTalent(t.id, t.cost));
      }

      this.elTalentTree.appendChild(card);
    });
  }
}
