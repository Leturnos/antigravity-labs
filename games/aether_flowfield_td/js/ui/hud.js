import { CONFIG } from '../config.js';

/**
 * HUD Controller for Aether Flowfield TD.
 * Encapsulates DOM element queries, metrics display, tower inspector,
 * button states, speed toggles, modal dialogs, and user interaction callbacks.
 */
export class HUD {
  /**
   * @param {object|null} [customElements=null] Optional mock or explicit DOM element map
   */
  constructor(customElements = null) {
    this.elements = customElements || this._queryDOMElements();

    // Callbacks map
    this.callbacks = {
      onBuildSelect: null,
      onUpgrade: null,
      onSell: null,
      onCloseInspector: null,
      onNextWave: null,
      onSpeedChange: null,
      onToggleFlowDebug: null,
      onToggleAudio: null,
      onRestart: null,
      onSubmitScore: null
    };

    this._bindEvents();
  }

  /**
   * Queries DOM elements if running inside a browser.
   * @private
   */
  _queryDOMElements() {
    if (typeof document === 'undefined') return {};

    const byId = id => document.getElementById(id);

    return {
      coreHpFill: byId('coreHpFill'),
      coreHpText: byId('coreHpText'),
      creditsText: byId('creditsText'),
      waveText: byId('waveText'),
      creepsCountText: byId('creepsCountText'),
      fpsText: byId('fpsText'),
      btnSpeedPause: byId('btnSpeedPause'),
      btnSpeed1x: byId('btnSpeed1x'),
      btnSpeed2x: byId('btnSpeed2x'),
      btnSpeed4x: byId('btnSpeed4x'),
      btnFlowDebug: byId('btnFlowDebug'),
      btnAudioToggle: byId('btnAudioToggle'),
      breachAlertBanner: byId('breachAlertBanner'),
      btnBuildGatling: byId('btnBuildGatling'),
      btnBuildMortar: byId('btnBuildMortar'),
      btnBuildStasis: byId('btnBuildStasis'),
      towerInspector: byId('towerInspector'),
      inspectorTitle: byId('inspectorTitle'),
      inspectorLevel: byId('inspectorLevel'),
      inspectorStats: byId('inspectorStats'),
      inspectorCloseBtn: byId('inspectorCloseBtn'),
      btnUpgradeTower: byId('btnUpgradeTower'),
      btnSellTower: byId('btnSellTower'),
      btnNextWave: byId('btnNextWave'),
      waveTimerBadge: byId('waveTimerBadge'),
      gameOverModal: byId('gameOverModal'),
      modalWavesSurvived: byId('modalWavesSurvived'),
      modalTotalKills: byId('modalTotalKills'),
      modalFinalScore: byId('modalFinalScore'),
      callsignInput: byId('callsignInput'),
      btnSubmitScore: byId('btnSubmitScore'),
      scoreFeedbackMsg: byId('scoreFeedbackMsg'),
      btnRestartGame: byId('btnRestartGame')
    };
  }

  /**
   * Binds click and input listeners to DOM elements.
   * @private
   */
  _bindEvents() {
    const el = this.elements;
    if (!el) return;

    // Speed buttons
    const speedBtns = [
      { btn: el.btnSpeedPause, speed: 0 },
      { btn: el.btnSpeed1x, speed: 1 },
      { btn: el.btnSpeed2x, speed: 2 },
      { btn: el.btnSpeed4x, speed: 4 }
    ];
    speedBtns.forEach(({ btn, speed }) => {
      if (btn && typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', () => {
          if (this.callbacks.onSpeedChange) this.callbacks.onSpeedChange(speed);
        });
      }
    });

    // Flowfield toggle
    if (el.btnFlowDebug && typeof el.btnFlowDebug.addEventListener === 'function') {
      el.btnFlowDebug.addEventListener('click', () => {
        if (this.callbacks.onToggleFlowDebug) this.callbacks.onToggleFlowDebug();
      });
    }

    // Audio toggle
    if (el.btnAudioToggle && typeof el.btnAudioToggle.addEventListener === 'function') {
      el.btnAudioToggle.addEventListener('click', () => {
        if (this.callbacks.onToggleAudio) this.callbacks.onToggleAudio();
      });
    }

    // Tower Build Buttons
    const towerBuildBtns = [
      { btn: el.btnBuildGatling, type: 'GATLING' },
      { btn: el.btnBuildMortar, type: 'MORTAR' },
      { btn: el.btnBuildStasis, type: 'STASIS' }
    ];
    towerBuildBtns.forEach(({ btn, type }) => {
      if (btn && typeof btn.addEventListener === 'function') {
        btn.addEventListener('click', () => {
          if (this.callbacks.onBuildSelect) this.callbacks.onBuildSelect(type);
        });
      }
    });

    // Inspector Actions
    if (el.btnUpgradeTower && typeof el.btnUpgradeTower.addEventListener === 'function') {
      el.btnUpgradeTower.addEventListener('click', () => {
        if (this.callbacks.onUpgrade) this.callbacks.onUpgrade();
      });
    }

    if (el.btnSellTower && typeof el.btnSellTower.addEventListener === 'function') {
      el.btnSellTower.addEventListener('click', () => {
        if (this.callbacks.onSell) this.callbacks.onSell();
      });
    }

    if (el.inspectorCloseBtn && typeof el.inspectorCloseBtn.addEventListener === 'function') {
      el.inspectorCloseBtn.addEventListener('click', () => {
        if (this.callbacks.onCloseInspector) this.callbacks.onCloseInspector();
      });
    }

    // Next Wave Button
    if (el.btnNextWave && typeof el.btnNextWave.addEventListener === 'function') {
      el.btnNextWave.addEventListener('click', () => {
        if (this.callbacks.onNextWave) this.callbacks.onNextWave();
      });
    }

    // Restart Button
    if (el.btnRestartGame && typeof el.btnRestartGame.addEventListener === 'function') {
      el.btnRestartGame.addEventListener('click', () => {
        if (this.callbacks.onRestart) this.callbacks.onRestart();
      });
    }

    // Score Submission
    if (el.btnSubmitScore && typeof el.btnSubmitScore.addEventListener === 'function') {
      el.btnSubmitScore.addEventListener('click', () => {
        const inputVal = el.callsignInput ? el.callsignInput.value.trim().toUpperCase() : '';
        const callsign = inputVal.length >= 2 ? inputVal : 'CYBER_DEFENDER';
        el.btnSubmitScore.disabled = true;
        el.btnSubmitScore.textContent = 'ENVIANDO...';
        if (this.callbacks.onSubmitScore) this.callbacks.onSubmitScore(callsign);
      });
    }
  }

  /**
   * Update metrics panel: Core HP bar, Credits, Wave count, Creep count, FPS.
   */
  updateMetrics({
    coreHp = 100,
    maxCoreHp = 100,
    credits = 450,
    wave = 1,
    creepCount = 0,
    maxCreeps = 10000,
    fps = 60
  }) {
    const el = this.elements;
    if (!el) return;

    // Core HP
    const safeHp = Math.max(0, Math.min(maxCoreHp, coreHp));
    const hpPercent = Math.max(0, Math.min(100, (safeHp / maxCoreHp) * 100));

    if (el.coreHpFill) {
      el.coreHpFill.style.width = `${hpPercent}%`;
      if (hpPercent > 50) {
        el.coreHpFill.style.background = 'linear-gradient(90deg, #ff0055, #00ff88)';
      } else if (hpPercent > 25) {
        el.coreHpFill.style.background = 'linear-gradient(90deg, #ff0055, #ffd600)';
      } else {
        el.coreHpFill.style.background = '#ff0055';
      }
    }

    if (el.coreHpText) {
      el.coreHpText.textContent = `${Math.ceil(safeHp)} / ${maxCoreHp}`;
    }

    // Credits
    if (el.creditsText) {
      el.creditsText.textContent = `💰 ${Math.floor(credits)}`;
    }

    // Wave
    if (el.waveText) {
      el.waveText.textContent = `ONDA ${wave}`;
    }

    // Swarm active count
    if (el.creepsCountText) {
      const formattedMax = (maxCreeps >= 1000) ? `${(maxCreeps / 1000).toFixed(0)}.000` : maxCreeps;
      el.creepsCountText.textContent = `${creepCount} / ${formattedMax}`;
    }

    // FPS
    if (el.fpsText) {
      const roundedFps = Math.round(fps);
      el.fpsText.textContent = `${roundedFps}`;
      if (roundedFps >= 50) {
        el.fpsText.className = 'metric-val text-green';
      } else if (roundedFps >= 30) {
        el.fpsText.className = 'metric-val text-yellow';
      } else {
        el.fpsText.className = 'metric-val text-magenta';
      }
    }
  }

  /**
   * Updates affordability visual state on tower build cards.
   * @param {number} credits Current available credits
   */
  updateTowerCardStates(credits) {
    const el = this.elements;
    if (!el) return;

    const cards = [
      { btn: el.btnBuildGatling, cost: (CONFIG && CONFIG.TOWERS && CONFIG.TOWERS.GATLING) ? CONFIG.TOWERS.GATLING.cost : 100 },
      { btn: el.btnBuildMortar, cost: (CONFIG && CONFIG.TOWERS && CONFIG.TOWERS.MORTAR) ? CONFIG.TOWERS.MORTAR.cost : 175 },
      { btn: el.btnBuildStasis, cost: (CONFIG && CONFIG.TOWERS && CONFIG.TOWERS.STASIS) ? CONFIG.TOWERS.STASIS.cost : 140 }
    ];

    cards.forEach(({ btn, cost }) => {
      if (!btn) return;
      if (credits < cost) {
        btn.classList.add('unaffordable');
      } else {
        btn.classList.remove('unaffordable');
      }
    });
  }

  /**
   * Sets the active speed multiplier button highlight.
   * @param {number} speed 0, 1, 2, or 4
   */
  setSpeed(speed) {
    const el = this.elements;
    if (!el) return;

    const btns = [
      { el: el.btnSpeedPause, s: 0 },
      { el: el.btnSpeed1x, s: 1 },
      { el: el.btnSpeed2x, s: 2 },
      { el: el.btnSpeed4x, s: 4 }
    ];

    btns.forEach(({ el: btn, s }) => {
      if (!btn) return;
      if (s === speed) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * Toggles flowfield vector overlay button highlight.
   * @param {boolean} active
   */
  setFlowDebug(active) {
    const el = this.elements;
    if (!el || !el.btnFlowDebug) return;
    if (active) {
      el.btnFlowDebug.classList.add('active');
    } else {
      el.btnFlowDebug.classList.remove('active');
    }
  }

  /**
   * Updates audio toggle button icon and text.
   * @param {boolean} isMuted
   */
  setAudioState(isMuted) {
    const el = this.elements;
    if (!el || !el.btnAudioToggle) return;
    el.btnAudioToggle.textContent = isMuted ? '🔇 Mudo' : '🔊 Som';
    if (isMuted) {
      el.btnAudioToggle.classList.remove('active');
    } else {
      el.btnAudioToggle.classList.add('active');
    }
  }

  /**
   * Highlights the selected tower build card or clears selection.
   * @param {string|null} typeKey 'GATLING', 'MORTAR', 'STASIS', or null
   */
  setSelectedBuildType(typeKey) {
    const el = this.elements;
    if (!el) return;

    const cards = [
      { btn: el.btnBuildGatling, key: 'GATLING' },
      { btn: el.btnBuildMortar, key: 'MORTAR' },
      { btn: el.btnBuildStasis, key: 'STASIS' }
    ];

    cards.forEach(({ btn, key }) => {
      if (!btn) return;
      if (typeKey && typeKey.toUpperCase() === key) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  /**
   * Displays the Selected Tower Inspector panel with current tower stats.
   *
   * @param {object} tower Tower record
   * @param {number} investedCost Total cumulative credits invested
   * @param {number} upgradeCost Cost to upgrade to next level (0 if max)
   * @param {number} refundAmount Credits returned on sale
   * @param {boolean} canAffordUpgrade Whether player has enough credits
   */
  showTowerInspector(tower, investedCost, upgradeCost, refundAmount, canAffordUpgrade = true) {
    const el = this.elements;
    if (!el) return;

    if (el.towerInspector) {
      el.towerInspector.classList.remove('hidden');
    }

    if (el.inspectorTitle) {
      el.inspectorTitle.textContent = tower.name || tower.typeKey;
    }

    if (el.inspectorLevel) {
      el.inspectorLevel.textContent = `LVL ${tower.level} / 3`;
    }

    if (el.inspectorStats) {
      let statsHtml = '';
      if (tower.typeKey === 'GATLING') {
        statsHtml = `<span>Dano: <strong class="inspector-stat-val text-cyan">${tower.damage || (tower.stats && tower.stats.damage)}</strong></span>
                     <span>Alcance: <strong class="inspector-stat-val">${tower.range || (tower.stats && tower.stats.range)}px</strong></span>
                     <span>Cadência: <strong class="inspector-stat-val">${tower.fireRate || (tower.stats && tower.stats.fireRate)}/s</strong></span>`;
      } else if (tower.typeKey === 'MORTAR') {
        statsHtml = `<span>Dano AoE: <strong class="inspector-stat-val text-magenta">${tower.damage || (tower.stats && tower.stats.damage)}</strong></span>
                     <span>Raio Splash: <strong class="inspector-stat-val">${tower.splashRadius || (tower.stats && tower.stats.splashRadius)}px</strong></span>
                     <span>Alcance: <strong class="inspector-stat-val">${tower.range || (tower.stats && tower.stats.range)}px</strong></span>`;
      } else if (tower.typeKey === 'STASIS') {
        const slowPct = Math.round(((tower.slowPercent || (tower.stats && tower.stats.slowPercent)) || 0) * 100);
        statsHtml = `<span>Retardo: <strong class="inspector-stat-val text-yellow">${slowPct}%</strong></span>
                     <span>Raio Aura: <strong class="inspector-stat-val">${tower.range || (tower.stats && tower.stats.range)}px</strong></span>
                     <span>Pulso: <strong class="inspector-stat-val">${tower.fireRate || (tower.stats && tower.stats.pulseRate || 2)}/s</strong></span>`;
      }
      el.inspectorStats.innerHTML = statsHtml;
    }

    // Upgrade Button
    if (el.btnUpgradeTower) {
      if (tower.level >= 3 || upgradeCost <= 0) {
        el.btnUpgradeTower.disabled = true;
        el.btnUpgradeTower.textContent = '[U] NÍVEL MÁXIMO';
      } else {
        el.btnUpgradeTower.disabled = !canAffordUpgrade;
        el.btnUpgradeTower.textContent = `[U] Upgrade (${upgradeCost}¢)`;
      }
    }

    // Sell Button
    if (el.btnSellTower) {
      el.btnSellTower.textContent = `[S] Vender (+${refundAmount}¢)`;
    }
  }

  /**
   * Hides the Selected Tower Inspector panel.
   */
  hideTowerInspector() {
    const el = this.elements;
    if (!el || !el.towerInspector) return;
    el.towerInspector.classList.add('hidden');
  }

  /**
   * Updates wave call button and countdown timer display.
   */
  updateWaveTimer({
    timeRemaining = 0,
    canCallEarly = true,
    earlyBonus = 0,
    isWaveActive = false,
    waveNumber = 1
  }) {
    const el = this.elements;
    if (!el) return;

    if (el.btnNextWave) {
      const mainEl = el.btnNextWave.querySelector ? el.btnNextWave.querySelector('.wave-btn-main') : null;
      if (isWaveActive) {
        if (mainEl) mainEl.textContent = `ONDA ${waveNumber} EM ANDAMENTO`;
        el.btnNextWave.classList.remove('active');
      } else {
        if (mainEl) mainEl.textContent = 'CHAMAR PRÓXIMA ONDA [N]';
        el.btnNextWave.classList.add('active');
      }
    }

    if (el.waveTimerBadge) {
      if (isWaveActive) {
        el.waveTimerBadge.textContent = 'Defenda o Núcleo!';
        el.waveTimerBadge.style.color = 'var(--neon-cyan)';
      } else {
        const secs = Math.max(0, Math.ceil(timeRemaining));
        el.waveTimerBadge.textContent = `Iniciando em ${secs}s (+${earlyBonus}¢ Bônus)`;
        el.waveTimerBadge.style.color = 'var(--neon-yellow)';
      }
    }
  }

  /**
   * Toggles the critical Breach Mode alert banner.
   * @param {boolean} active
   */
  setBreachAlert(active) {
    const el = this.elements;
    if (!el || !el.breachAlertBanner) return;
    if (active) {
      el.breachAlertBanner.classList.remove('hidden');
    } else {
      el.breachAlertBanner.classList.add('hidden');
    }
  }

  /**
   * Shows Game Over modal with stats summary.
   */
  showGameOver({ wavesSurvived = 0, totalKills = 0, finalScore = 0 }) {
    const el = this.elements;
    if (!el) return;

    if (el.modalWavesSurvived) {
      el.modalWavesSurvived.textContent = `${wavesSurvived}`;
    }
    if (el.modalTotalKills) {
      el.modalTotalKills.textContent = `${totalKills}`;
    }
    if (el.modalFinalScore) {
      el.modalFinalScore.textContent = finalScore.toLocaleString('pt-BR');
    }
    if (el.gameOverModal) {
      el.gameOverModal.classList.remove('hidden');
    }
    if (el.btnSubmitScore) {
      el.btnSubmitScore.disabled = false;
      el.btnSubmitScore.textContent = 'ENVIAR PONTUAÇÃO';
    }
    if (el.scoreFeedbackMsg) {
      el.scoreFeedbackMsg.classList.add('hidden');
      el.scoreFeedbackMsg.textContent = '';
    }
  }

  /**
   * Hides the Game Over modal.
   */
  hideGameOver() {
    const el = this.elements;
    if (!el || !el.gameOverModal) return;
    el.gameOverModal.classList.add('hidden');
  }

  /**
   * Displays score submission feedback message.
   * @param {string} message
   * @param {'success'|'error'} [type='success']
   */
  setScoreFeedback(message, type = 'success') {
    const el = this.elements;
    if (!el || !el.scoreFeedbackMsg) return;
    el.scoreFeedbackMsg.textContent = message;
    el.scoreFeedbackMsg.className = `score-feedback ${type}`;
    el.scoreFeedbackMsg.classList.remove('hidden');
  }
}
