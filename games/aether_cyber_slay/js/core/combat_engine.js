import { StatusSystem, STATUS_TYPES } from '../effects/status_system.js';

export class CombatEngine {
    constructor(config = {}) {
        this.player = config.player || null;
        this.enemies = config.enemies || [];
        this.deck = config.deck || null;
        this.turn = 0;
        this.isPlayerTurn = false;
        this.onEvent = config.onEvent || (() => {});
    }

    startCombat(player, enemies, deck) {
        if (player) this.player = player;
        if (enemies) this.enemies = enemies;
        if (deck) this.deck = deck;
        return this.start();
    }

    start() {
        this.turn = 1;
        if (this.deck) {
            this.deck.resetForCombat();
        }
        
        // Relic: Worm Spreader applies 2 Malware to all enemies at combat start
        if (this.player && this.player.hasRelic && this.player.hasRelic('worm_spreader')) {
            this.enemies.forEach(e => StatusSystem.apply(e, STATUS_TYPES.MALWARE, 2));
        }

        this.startPlayerTurn();
    }

    startPlayerTurn() {
        this.isPlayerTurn = true;
        if (this.player) {
            this.player.startTurn();

            // Relic: Neural Accelerator grants +1 RAM on turn 1
            if (this.turn === 1 && this.player.hasRelic && this.player.hasRelic('neural_accelerator')) {
                this.player.ram += 1;
            }
        }

        if (this.deck) {
            this.deck.draw(5);
        }
        this.onEvent('TURN_START', { turn: this.turn });
    }

    playCard(card, target = null) {
        if (!this.isPlayerTurn) return { success: false, reason: 'Not player turn' };
        if (!card) return { success: false, reason: 'No card provided' };
        if (this.player.ram < card.cost) return { success: false, reason: 'Not enough RAM' };
        if (card.type === 'ATTACK' || card.type === 'EXPLOIT') {
            if (!target || !target.isAlive()) {
                target = this.enemies.find(e => e.isAlive());
            }
            if (!target) return { success: false, reason: 'No valid target' };
        }

        this.player.ram -= card.cost;
        card.execute({
            player: this.player,
            target: target,
            enemies: this.enemies,
            deck: this.deck
        });

        this.deck.discardCard(card);
        this.onEvent('CARD_PLAYED', { card, target });

        const endState = this.checkCombatEnd();
        return { success: true, endState };
    }

    endTurn() {
        if (!this.isPlayerTurn) return;
        this.isPlayerTurn = false;
        if (this.deck) {
            this.deck.discardHand();
        }
        if (this.player) {
            StatusSystem.tickEndOfTurn(this.player);
        }

        this.resolveEnemyTurn();
    }

    resolveEnemyTurn() {
        // 1. Tick Start of Turn DoT (Malware) on enemies
        this.enemies.forEach(enemy => {
            if (enemy.isAlive()) {
                const tick = StatusSystem.tickStartOfTurn(enemy);
                if (tick.directDamage > 0) {
                    enemy.hp = Math.max(0, enemy.hp - tick.directDamage);
                    this.onEvent('MALWARE_DAMAGE', { enemy, damage: tick.directDamage });
                }
            }
        });

        if (this.checkCombatEnd()) return;

        // 2. Execute Enemy Intent
        this.enemies.forEach(enemy => {
            if (!enemy.isAlive()) return;
            const intent = enemy.getIntent(this.turn);
            if (!intent) return;
            if (intent.type === 'ATTACK' || intent.type === 'MEGA_ATTACK') {
                let dmg = intent.value;
                if (StatusSystem.get(enemy, STATUS_TYPES.CORRODE) > 0) {
                    dmg = Math.floor(dmg * 0.75);
                }
                const taken = this.player.takeDamage(dmg);
                this.onEvent('PLAYER_DAMAGED', { damage: taken });
            } else if (intent.type === 'DEFEND' || intent.type === 'SUMMON_SHIELD') {
                StatusSystem.apply(enemy, STATUS_TYPES.BUFFER, intent.value);
            } else if (intent.type === 'ATTACK_DEBUFF') {
                let dmg = intent.value;
                if (StatusSystem.get(enemy, STATUS_TYPES.CORRODE) > 0) dmg = Math.floor(dmg * 0.75);
                const taken = this.player.takeDamage(dmg);
                if (intent.status && intent.statusValue) {
                    StatusSystem.apply(this.player, intent.status, intent.statusValue);
                }
                this.onEvent('PLAYER_DAMAGED', { damage: taken, debuff: intent.status });
            } else if (intent.type === 'TRACE') {
                StatusSystem.apply(this.player, STATUS_TYPES.TRACE, intent.value);
            }
        });

        // 3. Status decay end of enemy turn
        this.enemies.forEach(e => StatusSystem.tickEndOfTurn(e));

        if (this.checkCombatEnd()) return;

        // 4. Advance Turn
        this.turn += 1;
        this.startPlayerTurn();
    }

    checkCombatEnd() {
        if (this.player && this.player.hp <= 0) {
            this.onEvent('VICTORY_STATE', { state: 'DEFEAT' });
            return 'DEFEAT';
        }
        const allEnemiesDead = this.enemies.length > 0 && this.enemies.every(e => !e.isAlive());
        if (allEnemiesDead) {
            this.onEvent('VICTORY_STATE', { state: 'VICTORY' });
            return 'VICTORY';
        }
        return null;
    }
}
