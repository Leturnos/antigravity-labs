import { StatusSystem, STATUS_TYPES } from '../effects/status_system.js';

export class PlayerRig {
    constructor(config = {}) {
        this.maxHp = config.maxHp || 60;
        this.hp = config.hp !== undefined ? config.hp : this.maxHp;
        this.maxRam = config.maxRam || 3;
        this.ram = config.ram !== undefined ? config.ram : this.maxRam;
        this.overheat = config.overheat || 0;
        this.credits = config.credits !== undefined ? config.credits : 50;
        this.relics = config.relics || [];
        this.statuses = config.statuses || {};
        this.nextTurnRamPenalty = config.nextTurnRamPenalty || 0;
        this.retainBuffer = false;
    }

    isOverclocked() {
        return this.overheat >= 50 && this.overheat < 100;
    }

    addHeat(amount) {
        // Relic: Overclock Heatsink reduces heat gain by 5%
        if (this.hasRelic('overclock_heatsink')) {
            amount = Math.max(0, amount - 5);
        }
        this.overheat += amount;
        if (this.overheat >= 100) {
            return this.triggerMeltdown();
        }
        return { meltdown: false };
    }

    cool(amount) {
        this.overheat = Math.max(0, this.overheat - amount);
    }

    triggerMeltdown() {
        this.hp = Math.max(1, this.hp - 6);
        this.overheat = 40;
        this.nextTurnRamPenalty = 1;
        return { meltdown: true, damage: 6 };
    }

    applyStatus(name, stacks) {
        StatusSystem.apply(this, name, stacks);
    }

    takeDamage(rawDamage) {
        let damage = rawDamage;
        const currentBuffer = StatusSystem.get(this, STATUS_TYPES.BUFFER);
        if (currentBuffer > 0) {
            if (currentBuffer >= damage) {
                StatusSystem.apply(this, STATUS_TYPES.BUFFER, -damage);
                damage = 0;
            } else {
                damage -= currentBuffer;
                StatusSystem.clear(this, STATUS_TYPES.BUFFER);
            }
        }
        this.hp = Math.max(0, this.hp - damage);
        return damage;
    }

    heal(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
    }

    startTurn() {
        this.ram = Math.max(1, this.maxRam - this.nextTurnRamPenalty);
        this.nextTurnRamPenalty = 0;
        // Buffer resets on player turn unless retained
        if (!this.retainBuffer) {
            StatusSystem.clear(this, STATUS_TYPES.BUFFER);
        }
        this.retainBuffer = false;
    }

    hasRelic(id) {
        return this.relics.some(r => r.id === id);
    }
}
