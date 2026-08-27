import { PlayerRig } from '../entities/player.js';
import { SecurityDaemon, IceGuardian, SpreaderBot, ApexNeuralCoreBoss, Enemy } from '../entities/enemies.js';
import { CARD_CATALOG, CARD_TYPES } from '../entities/cards.js';
import { DeckManager } from './deck_manager.js';
import { CombatEngine } from './combat_engine.js';
import { NetworkGraph, NODE_TYPES } from '../map/network_graph.js';
import { AudioSynth } from '../audio/audio_synth.js';
import { ParticleFx } from '../effects/particle_fx.js';
import { StatusSystem, STATUS_TYPES } from '../effects/status_system.js';

export class GameState {
    constructor(options = {}) {
        this.headless = options.headless || (typeof window === 'undefined' || typeof document === 'undefined');
        this.player = null;
        this.deck = null;
        this.graph = null;
        this.combat = null;
        this.audio = new AudioSynth();
        this.fx = null;

        this.state = 'INITIALIZING'; // 'MAP', 'COMBAT', 'SHOP', 'REST', 'EVENT', 'VICTORY', 'DEFEAT'
        this.selectedCard = null;
        this.currentSector = 1;
        this.score = 0;
        this.enemiesDefeated = 0;
        this.nodesCleared = 0;
        this.activeDraftCards = [];
        this.pendingConfirmCallback = null;

        if (!this.headless) {
            const canvas = document.getElementById('fx-canvas');
            if (canvas) {
                this.fx = new ParticleFx(canvas);
            }
            this.bindEvents();
            window.addEventListener('resize', () => {
                if (this.state === 'MAP') {
                    this.drawMapConnections();
                }
            });
        }
    }

    init() {
        this.initNewRun();
    }

    initNewRun() {
        this.player = new PlayerRig({ hp: 60, maxHp: 60, ram: 3, credits: 50 });
        this.deck = new DeckManager();
        this.deck.initStarterDeck();
        this.graph = new NetworkGraph();
        this.graph.generateSector(this.currentSector);
        this.combat = null;
        this.selectedCard = null;
        this.score = 0;
        this.enemiesDefeated = 0;
        this.nodesCleared = 0;
        this.state = 'MAP';

        if (!this.headless) {
            this.renderHUD();
            this.renderMap();
            this.showView('map-view');
            this.showNotificationToast('Invasão de rede inicializada. Selecione um nó de entrada.', 'info');
        }
    }

    bindEvents() {
        if (this.headless) return;

        // Initialize Audio Context on first user gesture
        const startAudio = () => {
            this.audio.init();
            this.audio.startBgm(124);
            window.removeEventListener('pointerdown', startAudio);
            window.removeEventListener('keydown', startAudio);
        };
        window.addEventListener('pointerdown', startAudio, { once: true });
        window.addEventListener('keydown', startAudio, { once: true });

        // End Turn Button
        const endTurnBtn = document.getElementById('btn-end-turn');
        if (endTurnBtn) {
            endTurnBtn.addEventListener('click', () => this.endTurn());
        }

        // Restart Run Button on Top HUD
        const restartHudBtn = document.getElementById('btn-restart-hud');
        if (restartHudBtn) {
            restartHudBtn.addEventListener('click', () => {
                this.showConfirmModal({
                    title: 'ABORTAR INVASÃO?',
                    message: 'Tem certeza que deseja abortar a incursão atual e reiniciar o Rig Neural do zero?',
                    confirmText: 'REINICIAR RUN',
                    cancelText: 'CANCELAR',
                    onConfirm: () => {
                        this.initNewRun();
                        this.showNotificationToast('Rig reinicializado com sucesso.', 'info');
                    }
                });
            });
        }

        // Sound Toggle Button
        const soundBtn = document.getElementById('btn-sound-toggle');
        if (soundBtn) {
            soundBtn.addEventListener('click', () => {
                const muted = this.audio.toggleMute();
                soundBtn.textContent = muted ? '🔇 MUTED' : '🔊 SFX';
                this.showNotificationToast(muted ? 'Áudio desativado' : 'Áudio ativado', 'info');
            });
        }

        // Map Toggle Button
        const mapBtn = document.getElementById('btn-map-toggle');
        if (mapBtn) {
            mapBtn.addEventListener('click', () => {
                if (this.state === 'MAP') {
                    if (this.combat) {
                        this.showView('combat-view');
                        this.state = 'COMBAT';
                    }
                } else {
                    this.renderMap();
                    this.showView('map-view');
                    this.state = 'MAP';
                }
            });
        }

        // Deck Inspectors
        const deckBtn = document.getElementById('btn-view-deck');
        if (deckBtn) {
            deckBtn.addEventListener('click', () => this.showDeckModal('master'));
        }

        const discardBtn = document.getElementById('btn-view-discard');
        if (discardBtn) {
            discardBtn.addEventListener('click', () => this.showDeckModal('discard'));
        }

        const closeDeckBtn = document.getElementById('btn-close-deck-modal');
        if (closeDeckBtn) {
            closeDeckBtn.addEventListener('click', () => this.hideModal('deck-modal'));
        }

        // Help Modal
        const helpBtn = document.getElementById('btn-help-toggle');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => this.showModal('help-modal'));
        }
        const closeHelpBtn = document.getElementById('btn-close-help');
        if (closeHelpBtn) {
            closeHelpBtn.addEventListener('click', () => this.hideModal('help-modal'));
        }

        // Rest Station Buttons
        const restHealBtn = document.getElementById('btn-rest-heal');
        if (restHealBtn) {
            restHealBtn.addEventListener('click', () => this.restRepair());
        }
        const restUpgradeBtn = document.getElementById('btn-rest-upgrade');
        if (restUpgradeBtn) {
            restUpgradeBtn.addEventListener('click', () => this.openRestUpgradeModal());
        }
        const closeUpgradeBtn = document.getElementById('btn-close-upgrade-modal');
        if (closeUpgradeBtn) {
            closeUpgradeBtn.addEventListener('click', () => this.hideModal('upgrade-modal'));
        }

        // Shop Buttons
        const leaveShopBtn = document.getElementById('btn-leave-shop');
        if (leaveShopBtn) {
            leaveShopBtn.addEventListener('click', () => this.leaveShop());
        }

        // Draft Reward Skip Button
        const skipDraftBtn = document.getElementById('btn-skip-draft');
        if (skipDraftBtn) {
            skipDraftBtn.addEventListener('click', () => this.skipCardDraft());
        }

        // Game Over / Victory Restart Buttons
        const restartBtn = document.getElementById('btn-restart-game');
        if (restartBtn) {
            restartBtn.addEventListener('click', () => {
                this.hideModal('game-over-modal');
                this.initNewRun();
            });
        }
        const nextSectorBtn = document.getElementById('btn-victory-next');
        if (nextSectorBtn) {
            nextSectorBtn.addEventListener('click', () => {
                this.hideModal('victory-modal');
                this.nextSector();
            });
        }

        // Custom Confirm Modal Action Buttons
        const confirmYesBtn = document.getElementById('btn-confirm-yes');
        if (confirmYesBtn) {
            confirmYesBtn.addEventListener('click', () => {
                this.hideModal('confirm-modal');
                if (typeof this.pendingConfirmCallback === 'function') {
                    this.pendingConfirmCallback();
                    this.pendingConfirmCallback = null;
                }
            });
        }
        const confirmNoBtn = document.getElementById('btn-confirm-no');
        if (confirmNoBtn) {
            confirmNoBtn.addEventListener('click', () => {
                this.hideModal('confirm-modal');
                this.pendingConfirmCallback = null;
            });
        }
    }

    showConfirmModal(options = {}) {
        if (this.headless) return;
        const titleEl = document.getElementById('confirm-modal-title');
        const msgEl = document.getElementById('confirm-modal-message');
        const yesBtn = document.getElementById('btn-confirm-yes');
        const noBtn = document.getElementById('btn-confirm-no');

        if (titleEl) titleEl.textContent = options.title || 'CONFIRMAÇÃO';
        if (msgEl) msgEl.textContent = options.message || 'Deseja prosseguir com esta ação?';
        if (yesBtn) yesBtn.textContent = options.confirmText || 'CONFIRMAR';
        if (noBtn) noBtn.textContent = options.cancelText || 'CANCELAR';

        this.pendingConfirmCallback = options.onConfirm || null;
        this.showModal('confirm-modal');
    }

    showNotificationToast(message, type = 'info') {
        if (this.headless) return;
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast-message ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 350);
        }, 3200);
    }

    selectNode(nodeId) {
        const moveRes = this.graph.moveToNode(nodeId);
        if (!moveRes.success) return moveRes;

        const node = moveRes.node;
        this.nodesCleared++;

        switch (node.type) {
            case NODE_TYPES.COMBAT: {
                const enemies = this.generateEnemiesForLayer(node.layer, false);
                this.startCombat(enemies, false);
                break;
            }
            case NODE_TYPES.ELITE: {
                const enemies = this.generateEnemiesForLayer(node.layer, true);
                this.startCombat(enemies, true);
                break;
            }
            case NODE_TYPES.SHOP: {
                this.state = 'SHOP';
                if (!this.headless) {
                    this.renderShop();
                    this.showView('shop-view');
                }
                break;
            }
            case NODE_TYPES.REST: {
                this.state = 'REST';
                if (!this.headless) {
                    this.showView('rest-view');
                }
                break;
            }
            case NODE_TYPES.EVENT: {
                this.state = 'EVENT';
                if (!this.headless) {
                    this.renderEvent();
                    this.showView('event-view');
                }
                break;
            }
            case NODE_TYPES.BOSS: {
                const boss = new ApexNeuralCoreBoss();
                this.startCombat([boss], true);
                break;
            }
            default:
                break;
        }

        if (!this.headless) {
            this.renderHUD();
        }

        return { success: true, node };
    }

    generateEnemiesForLayer(layer, isElite = false) {
        if (isElite) {
            return [new IceGuardian(), new SpreaderBot()];
        }
        if (layer <= 1) {
            return [new SecurityDaemon()];
        } else if (layer === 2) {
            return [new SpreaderBot(), new SecurityDaemon()];
        } else if (layer <= 5) {
            return [new IceGuardian()];
        } else {
            return [new SecurityDaemon(), new SpreaderBot()];
        }
    }

    startCombat(enemies, isEliteOrBoss = false) {
        this.state = 'COMBAT';
        this.selectedCard = null;

        this.combat = new CombatEngine({
            player: this.player,
            enemies: enemies,
            deck: this.deck,
            onEvent: (event, data) => this.handleCombatEvent(event, data)
        });

        this.combat.start();

        if (!this.headless) {
            this.showView('combat-view');
            this.renderCombatArena();
            this.renderHand();
            this.renderHUD();
        }
    }

    playCard(card, target = null) {
        if (!this.combat) return { success: false, reason: 'No active combat' };
        return this.combat.playCard(card, target);
    }

    buyCard(cardId, cost = 30) {
        if (this.player.credits >= cost) {
            this.player.credits -= cost;
            const card = this.deck.addCardToMasterDeck(cardId, false);
            if (!this.headless) this.renderHUD();
            return { success: true, card };
        }
        return { success: false, reason: 'Créditos insuficientes' };
    }

    restUpgrade(cardInstanceId) {
        const card = this.deck.masterDeck.find(c => c.instanceId === cardInstanceId);
        if (card && !card.upgraded) {
            this.deck.upgradeCard(card);
            this.graph.completeCurrentNode();
            this.state = 'MAP';
            if (!this.headless) {
                this.renderHUD();
                this.renderMap();
                this.showView('map-view');
            }
            return { success: true, card };
        }
        return { success: false, reason: 'Card not found or already upgraded' };
    }

    generateCombatRewards(isEliteOrBoss = false) {
        const credits = isEliteOrBoss ? 50 : 25;
        const catalogKeys = Object.keys(CARD_CATALOG);
        const shuffled = [...catalogKeys].sort(() => Math.random() - 0.5);
        const cardDraft = shuffled.slice(0, 3).map(k => CARD_CATALOG[k]);
        return { credits, cardDraft };
    }

    claimCardReward(cardId) {
        const card = this.deck.addCardToMasterDeck(cardId, false);
        if (!this.headless) {
            this.renderHUD();
            this.renderMap();
            this.showView('map-view');
        }
        return card;
    }

    calculateScore() {
        return this.score + (this.nodesCleared * 100) + (this.enemiesDefeated * 50) + this.player.credits;
    }

    handleCombatEvent(event, data) {
        if (this.headless) return;

        switch (event) {
            case 'TURN_START':
                this.selectedCard = null;
                this.renderCombatArena();
                this.renderHand();
                this.renderHUD();
                break;

            case 'CARD_PLAYED':
                this.audio.playCardPlay();
                if (data.card.type === 'ATTACK') {
                    this.audio.playLaser();
                    if (this.fx && data.target) {
                        const targetEl = document.querySelector(`[data-enemy-id="${data.target.id}"]`);
                        if (targetEl) {
                            const rect = targetEl.getBoundingClientRect();
                            this.fx.spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, '#f43f5e', 24);
                        }
                    }
                } else if (data.card.type === 'DEFENSE') {
                    this.audio.playShield();
                    if (this.fx) {
                        const rigEl = document.getElementById('player-rig');
                        if (rigEl) {
                            const rect = rigEl.getBoundingClientRect();
                            this.fx.spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, '#00f0ff', 20);
                        }
                    }
                } else if (data.card.type === 'EXPLOIT') {
                    if (this.fx && data.target) {
                        const targetEl = document.querySelector(`[data-enemy-id="${data.target.id}"]`);
                        if (targetEl) {
                            const rect = targetEl.getBoundingClientRect();
                            this.fx.spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, '#a855f7', 25);
                        }
                    }
                }
                this.selectedCard = null;
                this.renderCombatArena();
                this.renderHand();
                this.renderHUD();
                break;

            case 'PLAYER_DAMAGED':
                if (this.fx) {
                    const rigEl = document.getElementById('player-rig');
                    if (rigEl) {
                        const rect = rigEl.getBoundingClientRect();
                        this.fx.spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, '#ef4444', 30);
                    }
                }
                this.renderHUD();
                this.renderCombatArena();
                break;

            case 'MALWARE_DAMAGE':
                if (this.fx && data.enemy) {
                    const targetEl = document.querySelector(`[data-enemy-id="${data.enemy.id}"]`);
                    if (targetEl) {
                        const rect = targetEl.getBoundingClientRect();
                        this.fx.spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, '#f43f5e', 18);
                    }
                }
                this.renderCombatArena();
                break;

            case 'VICTORY_STATE':
                if (data.state === 'VICTORY') {
                    this.onCombatVictory();
                } else if (data.state === 'DEFEAT') {
                    this.onCombatDefeat();
                }
                break;

            default:
                break;
        }
    }

    endTurn() {
        if (!this.combat || !this.combat.isPlayerTurn) return;
        this.selectedCard = null;
        this.combat.endTurn();
        if (!this.headless) {
            this.renderCombatArena();
            this.renderHand();
            this.renderHUD();
        }
    }

    onCardClick(cardInstance) {
        if (!this.combat || !this.combat.isPlayerTurn) return;

        if (this.selectedCard && this.selectedCard.instanceId === cardInstance.instanceId) {
            this.selectedCard = null;
            this.renderHand();
            this.renderCombatArena();
            return;
        }

        // If card requires a target (ATTACK / single EXPLOIT)
        if (cardInstance.type === 'ATTACK' || cardInstance.id === 'inject_worm' || cardInstance.id === 'scan_exploit') {
            this.selectedCard = cardInstance;
            this.renderHand();
            this.renderCombatArena();
        } else {
            // Self-targeted or AoE card (DEFENSE, UTILITY, EPIDEMIC)
            this.combat.playCard(cardInstance);
            this.selectedCard = null;
        }
    }

    onEnemyClick(enemyInstance) {
        if (!this.combat || !this.combat.isPlayerTurn || !this.selectedCard) return;
        if (!enemyInstance.isAlive()) return;

        this.combat.playCard(this.selectedCard, enemyInstance);
        this.selectedCard = null;
        this.renderHand();
        this.renderCombatArena();
    }

    onCombatVictory() {
        this.state = 'MAP';
        this.graph.completeCurrentNode();
        this.score += 150;
        this.enemiesDefeated += this.combat.enemies.length;
        this.player.credits += 25;

        // Check if boss node was cleared -> Sector Victory!
        const currentNode = this.graph.getCurrentNode();
        if (currentNode && currentNode.type === NODE_TYPES.BOSS) {
            this.onSectorVictory();
            return;
        }

        if (!this.headless) {
            this.openRewardModal();
        }
    }

    onCombatDefeat() {
        this.state = 'DEFEAT';
        this.audio.playMeltdown();
        this.postScore('loss', this.calculateScore(), this.currentSector);

        if (!this.headless) {
            const statsEl = document.getElementById('game-over-stats');
            if (statsEl) {
                statsEl.innerHTML = `
                    <div><strong>Pontuação Final:</strong> ${this.calculateScore()} pts</div>
                    <div><strong>Setor Alcançado:</strong> Setor ${this.currentSector}</div>
                    <div><strong>Nós Conquistados:</strong> ${this.nodesCleared}</div>
                    <div><strong>Inimigos Neutralizados:</strong> ${this.enemiesDefeated}</div>
                `;
            }
            this.showModal('game-over-modal');
        }
    }

    onSectorVictory() {
        this.state = 'VICTORY';
        this.score += 500;
        this.postScore('win', this.calculateScore(), this.currentSector);

        if (!this.headless) {
            const statsEl = document.getElementById('victory-stats');
            if (statsEl) {
                statsEl.innerHTML = `
                    <div><strong>Pontuação do Setor:</strong> ${this.calculateScore()} pts</div>
                    <div><strong>Setor Concluído:</strong> Setor ${this.currentSector}</div>
                    <div><strong>Nós Conquistados:</strong> ${this.nodesCleared}</div>
                    <div><strong>Inimigos Neutralizados:</strong> ${this.enemiesDefeated}</div>
                `;
            }
            this.showModal('victory-modal');
        }
    }

    nextSector() {
        this.currentSector++;
        this.graph.generateSector(this.currentSector);
        this.state = 'MAP';
        if (!this.headless) {
            this.renderHUD();
            this.renderMap();
            this.showView('map-view');
            this.showNotificationToast(`Entrando no Setor ${this.currentSector}... Prepare o Rig!`, 'success');
        }
    }

    openRewardModal() {
        if (this.headless) return;
        const container = document.getElementById('draft-cards-container');
        if (!container) return;

        container.innerHTML = '';
        const rewards = this.generateCombatRewards(false);
        this.activeDraftCards = rewards.cardDraft;

        this.activeDraftCards.forEach(card => {
            const cardEl = this.createCardElement(card);
            cardEl.addEventListener('click', () => {
                this.claimCardReward(card.id);
                this.hideModal('reward-modal');
                this.renderHUD();
                this.renderMap();
                this.showView('map-view');
                this.showNotificationToast(`Módulo [${card.name}] compilado no baralho!`, 'success');
            });
            container.appendChild(cardEl);
        });

        this.showModal('reward-modal');
    }

    skipCardDraft() {
        this.hideModal('reward-modal');
        if (!this.headless) {
            this.renderHUD();
            this.renderMap();
            this.showView('map-view');
        }
    }

    restRepair() {
        const healAmt = Math.floor(this.player.maxHp * 0.3);
        this.player.heal(healAmt);
        this.player.cool(50);
        this.graph.completeCurrentNode();
        this.state = 'MAP';
        if (!this.headless) {
            this.renderHUD();
            this.renderMap();
            this.showView('map-view');
            this.showNotificationToast(`Rig reparado (+${healAmt} HP) e temperatura normalizada.`, 'success');
        }
    }

    openRestUpgradeModal() {
        if (this.headless) return;
        const container = document.getElementById('upgrade-cards-container');
        if (!container) return;

        container.innerHTML = '';
        const upgradeableCards = this.deck.masterDeck.filter(c => !c.upgraded);

        if (upgradeableCards.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">Todas as cartas do seu baralho já foram aprimoradas!</p>';
        } else {
            upgradeableCards.forEach(card => {
                const cardEl = this.createCardElement(card);
                cardEl.addEventListener('click', () => {
                    this.restUpgrade(card.instanceId);
                    this.hideModal('upgrade-modal');
                    this.showNotificationToast(`Código [${card.name}] aprimorado com sucesso!`, 'success');
                });
                container.appendChild(cardEl);
            });
        }

        this.showModal('upgrade-modal');
    }

    renderShop() {
        if (this.headless) return;
        const cardsContainer = document.getElementById('shop-cards');
        const servicesContainer = document.getElementById('shop-services');
        if (!cardsContainer || !servicesContainer) return;

        cardsContainer.innerHTML = '';
        servicesContainer.innerHTML = '';

        const catalogKeys = Object.keys(CARD_CATALOG);
        const shuffled = [...catalogKeys].sort(() => Math.random() - 0.5);
        const shopCards = shuffled.slice(0, 3).map(k => CARD_CATALOG[k]);

        shopCards.forEach(card => {
            const itemEl = document.createElement('div');
            itemEl.className = 'shop-item';
            const cardEl = this.createCardElement(card);
            const cost = 30;

            const buyBtn = document.createElement('button');
            buyBtn.className = 'btn-buy';
            buyBtn.textContent = `COMPRAR: 💰 ${cost}`;
            buyBtn.addEventListener('click', () => {
                const buyRes = this.buyCard(card.id, cost);
                if (buyRes.success) {
                    itemEl.remove();
                    this.showNotificationToast(`Software [${card.name}] adquirido!`, 'success');
                } else {
                    this.showNotificationToast(buyRes.reason, 'warning');
                }
            });

            itemEl.appendChild(cardEl);
            itemEl.appendChild(buyBtn);
            cardsContainer.appendChild(itemEl);
        });

        // Shop Services: Remove Card & Heal
        const purgeService = document.createElement('div');
        purgeService.className = 'service-card';
        purgeService.innerHTML = `
            <div style="font-size: 2rem;">🗑️</div>
            <h4 style="color: var(--amber);">PURGAR CÓDIGO</h4>
            <p style="font-size: 0.75rem; color: var(--text-muted);">Remova 1 carta indesejada do seu baralho permanentemente</p>
            <button class="btn-buy">COMPRAR: 💰 50</button>
        `;
        purgeService.querySelector('button').addEventListener('click', () => {
            if (this.player.credits >= 50 && this.deck.masterDeck.length > 1) {
                this.openShopPurgeModal();
            } else if (this.player.credits < 50) {
                this.showNotificationToast('Créditos insuficientes para purgar carta!', 'warning');
            }
        });
        servicesContainer.appendChild(purgeService);

        const repairService = document.createElement('div');
        repairService.className = 'service-card';
        repairService.innerHTML = `
            <div style="font-size: 2rem;">⚡</div>
            <h4 style="color: var(--emerald);">REPARO DE RIG</h4>
            <p style="font-size: 0.75rem; color: var(--text-muted);">Recupera +20 HP de integridade estrutural</p>
            <button class="btn-buy">COMPRAR: 💰 35</button>
        `;
        repairService.querySelector('button').addEventListener('click', () => {
            if (this.player.credits >= 35) {
                this.player.credits -= 35;
                this.player.heal(20);
                this.renderHUD();
                this.showNotificationToast('Rig reparado (+20 HP)!', 'success');
            } else {
                this.showNotificationToast('Créditos insuficientes para o reparo!', 'warning');
            }
        });
        servicesContainer.appendChild(repairService);
    }

    openShopPurgeModal() {
        const container = document.getElementById('upgrade-cards-container');
        const modalTitle = document.querySelector('#upgrade-modal .modal-title');
        if (!container || !modalTitle) return;

        modalTitle.textContent = 'SELECIONE UMA CARTA PARA PURGAR DO BARALHO';
        container.innerHTML = '';

        this.deck.masterDeck.forEach(card => {
            const cardEl = this.createCardElement(card);
            cardEl.addEventListener('click', () => {
                this.player.credits -= 50;
                this.deck.removeCardFromMasterDeck(card.instanceId);
                this.hideModal('upgrade-modal');
                modalTitle.textContent = 'ESCOLHA UMA CARTA PARA APRIMORAR';
                this.renderHUD();
                this.showNotificationToast(`Carta [${card.name}] descompilada e removida.`, 'success');
            });
            container.appendChild(cardEl);
        });

        this.showModal('upgrade-modal');
    }

    leaveShop() {
        this.graph.completeCurrentNode();
        this.state = 'MAP';
        if (!this.headless) {
            this.renderMap();
            this.showView('map-view');
        }
    }

    renderEvent() {
        if (this.headless) return;
        const titleEl = document.getElementById('event-title');
        const storyEl = document.getElementById('event-story');
        const choicesEl = document.getElementById('event-choices');
        if (!titleEl || !storyEl || !choicesEl) return;

        choicesEl.innerHTML = '';

        const events = [
            {
                title: 'TERMINAL DE DADOS CORPORATIVO',
                story: 'Você encontra um servidor corporativo vulnerável contendo pacotes criptografados de alto valor.',
                choices: [
                    {
                        text: '1. Descarregar dados confidenciais (+45 Créditos, gera 30% de Calor)',
                        action: () => {
                            this.player.credits += 45;
                            this.player.addHeat(30);
                            this.showNotificationToast('Dados extraídos: +45 Créditos!', 'success');
                        }
                    },
                    {
                        text: '2. Injetar backdoor silencioso (Ganha carta Rara: Supercondutor)',
                        action: () => {
                            this.deck.addCardToMasterDeck('superconductor', false);
                            this.showNotificationToast('Módulo [Supercondutor] adicionado ao baralho!', 'success');
                        }
                    },
                    {
                        text: '3. Desconectar com cautela e seguir em frente',
                        action: () => {
                            this.showNotificationToast('Você desconectou em modo furtivo.', 'info');
                        }
                    }
                ]
            },
            {
                title: 'VAZAMENTO DE MEMÓRIA QUÂNTICA',
                story: 'Um feixe de dados desestabilizado atinge seu Rig Neural com radiação computacional.',
                choices: [
                    {
                        text: '1. Absorver fluxo quântico (Sofre 8 Dano, ganha +1 RAM Máxima temporária)',
                        action: () => {
                            this.player.takeDamage(8);
                            this.player.maxRam += 1;
                            this.showNotificationToast('Fluxo absorvido: +1 RAM Máxima!', 'warning');
                        }
                    },
                    {
                        text: '2. Isolar os núcleos de resfriamento (Reduz 40% de Calor)',
                        action: () => {
                            this.player.cool(40);
                            this.showNotificationToast('Calor do sistema resfriado!', 'success');
                        }
                    }
                ]
            }
        ];

        const ev = events[Math.floor(Math.random() * events.length)];
        titleEl.textContent = ev.title;
        storyEl.textContent = ev.story;

        ev.choices.forEach(ch => {
            const btn = document.createElement('button');
            btn.className = 'event-btn';
            btn.textContent = ch.text;
            btn.addEventListener('click', () => {
                ch.action();
                this.graph.completeCurrentNode();
                this.state = 'MAP';
                this.renderHUD();
                this.renderMap();
                this.showView('map-view');
            });
            choicesEl.appendChild(btn);
        });
    }

    renderHUD() {
        if (this.headless || !this.player) return;

        // Sector Badge
        const sectorEl = document.getElementById('hud-sector-node');
        if (sectorEl) {
            const current = this.graph?.getCurrentNode();
            sectorEl.textContent = `SETOR ${this.currentSector} // ${current ? current.name.toUpperCase() : 'ENTRADA'}`;
        }

        // HP Bar
        const hpText = document.getElementById('player-hp-text');
        const hpBar = document.getElementById('player-hp-bar');
        if (hpText && hpBar) {
            hpText.textContent = `${this.player.hp}/${this.player.maxHp}`;
            const pct = Math.max(0, Math.min(100, (this.player.hp / this.player.maxHp) * 100));
            hpBar.style.width = `${pct}%`;
        }

        // Buffer Badge
        const bufferBadge = document.getElementById('player-buffer-badge');
        if (bufferBadge) {
            const buf = StatusSystem.get(this.player, STATUS_TYPES.BUFFER);
            if (buf > 0) {
                bufferBadge.style.display = 'inline-block';
                bufferBadge.textContent = `🛡️ ${buf}`;
            } else {
                bufferBadge.style.display = 'none';
            }
        }

        // RAM Text
        const ramText = document.getElementById('player-ram-text');
        if (ramText) {
            ramText.textContent = `${this.player.ram}/${this.player.maxRam}`;
        }

        // Heat Bar
        const heatText = document.getElementById('player-heat-text');
        const heatBar = document.getElementById('player-heat-bar');
        if (heatText && heatBar) {
            heatText.textContent = `${this.player.overheat}%`;
            heatBar.style.width = `${Math.min(100, this.player.overheat)}%`;
        }

        // Credits
        const creditsText = document.getElementById('player-credits');
        if (creditsText) {
            creditsText.textContent = this.player.credits;
        }

        // Deck Counts
        const deckCount = document.getElementById('deck-count');
        if (deckCount && this.deck) {
            deckCount.textContent = this.deck.drawPile.length;
        }
        const discardCount = document.getElementById('discard-count');
        if (discardCount && this.deck) {
            discardCount.textContent = this.deck.discardPile.length;
        }

        // Relics Bar
        const relicsBar = document.getElementById('player-relics');
        if (relicsBar) {
            relicsBar.innerHTML = '';
            this.player.relics.forEach(relic => {
                const icon = document.createElement('div');
                icon.className = 'relic-icon';
                icon.textContent = relic.icon || '💎';
                icon.title = `${relic.name}: ${relic.desc}`;
                relicsBar.appendChild(icon);
            });
        }
    }

    renderCombatArena() {
        if (this.headless || !this.combat) return;

        // Render Player Statuses
        const playerStatuses = document.getElementById('player-statuses');
        if (playerStatuses) {
            playerStatuses.innerHTML = '';
            Object.entries(this.player.statuses || {}).forEach(([status, val]) => {
                if (val > 0) {
                    const badge = document.createElement('span');
                    badge.className = `status-badge ${status}`;
                    badge.textContent = `${status} ${val}`;
                    playerStatuses.appendChild(badge);
                }
            });
        }

        // Render Enemy Nodes
        const enemiesContainer = document.getElementById('enemies-container');
        if (!enemiesContainer) return;
        enemiesContainer.innerHTML = '';

        this.combat.enemies.forEach(enemy => {
            if (!enemy.isAlive()) return;

            const enemyEl = document.createElement('div');
            enemyEl.className = 'enemy-node';
            enemyEl.setAttribute('data-enemy-id', enemy.id);

            if (this.selectedCard && (this.selectedCard.type === 'ATTACK' || this.selectedCard.id === 'inject_worm' || this.selectedCard.id === 'scan_exploit')) {
                enemyEl.classList.add('targetable');
            }

            const intent = enemy.getIntent(this.combat.turn);
            const enemyBuf = StatusSystem.get(enemy, STATUS_TYPES.BUFFER);

            enemyEl.innerHTML = `
                <div class="intent-badge">${intent ? intent.label : 'AGUARDANDO'}</div>
                <div class="enemy-avatar">${enemy.isBoss ? '👾' : '🤖'}</div>
                <div class="enemy-name">${enemy.name}</div>
                <div class="stat-item" style="justify-content: center;">
                    <span>HP</span>
                    <span>${enemy.hp}/${enemy.maxHp}</span>
                    ${enemyBuf > 0 ? `<span class="buffer-badge" style="display: inline-block;">🛡️ ${enemyBuf}</span>` : ''}
                </div>
                <div class="status-container"></div>
            `;

            // Render Enemy Statuses
            const statusCont = enemyEl.querySelector('.status-container');
            Object.entries(enemy.statuses || {}).forEach(([status, val]) => {
                if (val > 0) {
                    const badge = document.createElement('span');
                    badge.className = `status-badge ${status}`;
                    badge.textContent = `${status} ${val}`;
                    statusCont.appendChild(badge);
                }
            });

            enemyEl.addEventListener('click', () => {
                this.onEnemyClick(enemy);
            });

            enemiesContainer.appendChild(enemyEl);
        });
    }

    renderHand() {
        if (this.headless || !this.deck) return;
        const handContainer = document.getElementById('hand-container');
        if (!handContainer) return;
        handContainer.innerHTML = '';

        this.deck.hand.forEach(card => {
            const cardEl = this.createCardElement(card);

            if (this.selectedCard && this.selectedCard.instanceId === card.instanceId) {
                cardEl.classList.add('card-selected');
            }

            cardEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.onCardClick(card);
            });

            handContainer.appendChild(cardEl);
        });
    }

    createCardElement(card) {
        const cardEl = document.createElement('div');
        cardEl.className = `cyber-card ${card.type.toLowerCase()}`;
        cardEl.setAttribute('data-instance-id', card.instanceId || card.id);

        const typeLabels = {
            ATTACK: 'ATAQUE',
            DEFENSE: 'DEFESA',
            EXPLOIT: 'EXPLOIT',
            UTILITY: 'UTILITÁRIO'
        };

        cardEl.innerHTML = `
            <div class="card-header">
                <span class="card-cost">${card.cost}</span>
                <span class="card-type-tag">${typeLabels[card.type] || card.type}</span>
            </div>
            <div class="card-title">${card.name}</div>
            <div class="card-body">${card.desc}</div>
            <div class="card-heat-tag">${card.heat ? `🔥 +${card.heat}%` : ''}</div>
        `;

        // 3D Perspective Tilt on Mouse Movement
        cardEl.addEventListener('mousemove', (e) => {
            const rect = cardEl.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            cardEl.style.transform = `perspective(600px) rotateX(${-y / 8}deg) rotateY(${x / 8}deg) scale(1.08)`;
        });

        cardEl.addEventListener('mouseleave', () => {
            cardEl.style.transform = '';
        });

        return cardEl;
    }

    renderMap() {
        if (this.headless) return;
        const container = document.getElementById('network-layers-wrapper');
        const mapContainer = document.getElementById('network-map-container');
        if (!container || !this.graph || !this.graph.mapData) return;

        container.innerHTML = '';
        const reachable = this.graph.getReachableNodes();
        const current = this.graph.getCurrentNode();

        const typeIcons = {
            COMBAT: '⚔️',
            ELITE: '💀',
            SHOP: '🛒',
            REST: '⚡',
            EVENT: '❓',
            BOSS: '👑'
        };

        const typeLabels = {
            COMBAT: 'Sub-rotina',
            ELITE: 'Elite ICE',
            SHOP: 'Mercado',
            REST: 'Patch',
            EVENT: 'Evento',
            BOSS: 'IA Apex'
        };

        this.graph.mapData.layers.forEach((layer, lIdx) => {
            const layerEl = document.createElement('div');
            layerEl.className = 'map-layer';
            layerEl.setAttribute('data-layer-idx', lIdx);

            layer.forEach(node => {
                const nodeEl = document.createElement('div');
                nodeEl.className = 'map-node';
                nodeEl.id = `map-node-${node.id}`;
                nodeEl.setAttribute('data-node-id', node.id);
                if (node.type === NODE_TYPES.BOSS) nodeEl.classList.add('boss');

                const isReachable = reachable.some(r => r.id === node.id);
                const isCurrent = current && current.id === node.id;

                if (isCurrent) nodeEl.classList.add('current');
                if (node.cleared) nodeEl.classList.add('cleared');
                if (isReachable) nodeEl.classList.add('reachable');

                // Organic Asymmetric Jitter Positioning
                if (node.yOffset) {
                    nodeEl.style.transform = `translateY(${node.yOffset}px)`;
                }

                nodeEl.title = `${node.name} // ${node.subName || typeLabels[node.type]}`;

                nodeEl.innerHTML = `
                    <div>${typeIcons[node.type] || '💾'}</div>
                    <div class="map-node-label">${node.type === NODE_TYPES.BOSS ? 'BOSS' : (typeLabels[node.type] || node.type)}</div>
                `;

                if (isReachable) {
                    nodeEl.addEventListener('click', () => {
                        this.selectNode(node.id);
                    });
                }

                layerEl.appendChild(nodeEl);
            });

            container.appendChild(layerEl);
        });

        // Draw dynamic connecting SVG Bézier lines after layout render
        requestAnimationFrame(() => {
            this.drawMapConnections();
        });
    }

    drawMapConnections() {
        if (this.headless) return;
        const svg = document.getElementById('network-map-svg');
        const mapContainer = document.getElementById('network-map-container');
        if (!svg || !mapContainer || !this.graph || !this.graph.mapData) return;

        svg.innerHTML = '';
        const mapRect = mapContainer.getBoundingClientRect();
        svg.setAttribute('width', mapContainer.scrollWidth || mapRect.width);
        svg.setAttribute('height', mapContainer.scrollHeight || mapRect.height);

        const reachable = this.graph.getReachableNodes();
        const current = this.graph.getCurrentNode();

        this.graph.mapData.layers.forEach(layer => {
            layer.forEach(node => {
                const sourceEl = document.getElementById(`map-node-${node.id}`);
                if (!sourceEl) return;
                const sourceRect = sourceEl.getBoundingClientRect();
                const x1 = sourceRect.left - mapRect.left + sourceRect.width / 2 + mapContainer.scrollLeft;
                const y1 = sourceRect.top - mapRect.top + sourceRect.height / 2 + mapContainer.scrollTop;

                node.connections.forEach(targetId => {
                    const targetEl = document.getElementById(`map-node-${targetId}`);
                    if (!targetEl) return;
                    const targetRect = targetEl.getBoundingClientRect();
                    const x2 = targetRect.left - mapRect.left + targetRect.width / 2 + mapContainer.scrollLeft;
                    const y2 = targetRect.top - mapRect.top + targetRect.height / 2 + mapContainer.scrollTop;

                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    const cy = (y1 + y2) / 2;
                    const d = `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
                    path.setAttribute('d', d);

                    const isSourceCurrent = current && current.id === node.id;
                    const isTargetReachable = reachable.some(r => r.id === targetId);

                    if (isSourceCurrent && isTargetReachable) {
                        path.setAttribute('class', 'map-link active-path');
                    } else if (node.cleared) {
                        path.setAttribute('class', 'map-link cleared-path');
                    } else {
                        path.setAttribute('class', 'map-link');
                    }

                    svg.appendChild(path);
                });
            });
        });
    }

    showDeckModal(pileType = 'master') {
        if (this.headless) return;
        const container = document.getElementById('master-deck-container');
        const title = document.getElementById('deck-modal-title');
        if (!container || !title || !this.deck) return;

        container.innerHTML = '';
        let cards = [];
        if (pileType === 'master') {
            title.textContent = `BARALHO PRINCIPAL (${this.deck.masterDeck.length})`;
            cards = this.deck.masterDeck;
        } else if (pileType === 'discard') {
            title.textContent = `PILHA DE DESCARTE (${this.deck.discardPile.length})`;
            cards = this.deck.discardPile;
        }

        cards.forEach(card => {
            container.appendChild(this.createCardElement(card));
        });

        this.showModal('deck-modal');
    }

    showView(viewId) {
        if (this.headless) return;
        document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(viewId);
        if (target) {
            target.classList.add('active');
        }
        if (viewId === 'map-view') {
            requestAnimationFrame(() => this.drawMapConnections());
        }
    }

    showModal(modalId) {
        if (this.headless) return;
        const m = document.getElementById(modalId);
        if (m) m.classList.add('active');
    }

    hideModal(modalId) {
        if (this.headless) return;
        const m = document.getElementById(modalId);
        if (m) m.classList.remove('active');
    }

    async postScore(result, score, sector) {
        const payload = {
            result: result,
            score: score,
            sector: sector
        };
        try {
            if (typeof fetch !== 'undefined') {
                await fetch('/api/scores/aether_cyber_slay', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
        } catch (e) {
            console.warn('Failed to post score to backend:', e);
        }
        return payload;
    }
}

// Auto-bootstrap game if running inside a browser environment
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        window.cyberSlayGame = new GameState();
        window.cyberSlayGame.init();
    });
}
