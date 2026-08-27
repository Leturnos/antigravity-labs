import { StatusSystem, STATUS_TYPES } from '../effects/status_system.js';

export class Enemy {
    constructor(config = {}) {
        this.id = config.id || 'enemy';
        this.name = config.name || 'Nó de Segurança';
        this.maxHp = config.maxHp || 30;
        this.hp = config.hp || this.maxHp;
        this.statuses = {};
        this.pattern = config.pattern || [];
    }

    getIntent(turn) {
        if (!this.pattern || this.pattern.length === 0) return { type: 'ATTACK', value: 5, label: 'Ataque (5 Dano)' };
        const step = (turn - 1) % this.pattern.length;
        return this.pattern[step];
    }

    getIntents(turn) {
        return this.getIntent(turn);
    }

    executeIntent(player, turn) {
        const intent = this.getIntent(turn);
        if (!intent) return { damage: 0 };

        let dmgDealt = 0;
        if (intent.type === 'ATTACK' || intent.type === 'MEGA_ATTACK') {
            let dmg = intent.value;
            if (StatusSystem.get(this, STATUS_TYPES.CORRODE) > 0) {
                dmg = Math.floor(dmg * 0.75);
            }
            dmgDealt = player.takeDamage(dmg);
        } else if (intent.type === 'DEFEND' || intent.type === 'SUMMON_SHIELD') {
            StatusSystem.apply(this, STATUS_TYPES.BUFFER, intent.value);
        } else if (intent.type === 'ATTACK_DEBUFF') {
            let dmg = intent.value;
            if (StatusSystem.get(this, STATUS_TYPES.CORRODE) > 0) {
                dmg = Math.floor(dmg * 0.75);
            }
            dmgDealt = player.takeDamage(dmg);
            if (intent.status) {
                StatusSystem.apply(player, intent.status, intent.statusValue || 1);
            }
        } else if (intent.type === 'TRACE') {
            StatusSystem.apply(this, STATUS_TYPES.TRACE, intent.value);
        }
        return { damage: dmgDealt, intent };
    }

    takeDamage(rawDamage, isAttack = true) {
        let damage = rawDamage;
        if (isAttack && StatusSystem.get(this, STATUS_TYPES.EXPLOIT) > 0) {
            damage = Math.floor(damage * 1.5);
        }
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

    isAlive() {
        return this.hp > 0;
    }
}

export class SecurityDaemon extends Enemy {
    constructor() {
        super({
            id: 'security_daemon',
            name: 'Daemon de Segurança',
            maxHp: 28,
            pattern: [
                { type: 'ATTACK', value: 7, label: 'Golpe (7 Dano)' },
                { type: 'DEFEND', value: 6, label: 'Escudo (+6 Buffer)' },
                { type: 'ATTACK_DEBUFF', value: 5, status: STATUS_TYPES.CORRODE, statusValue: 1, label: 'Corroer (5 Dano + Corrosão)' }
            ]
        });
    }
}

export class IceGuardian extends Enemy {
    constructor() {
        super({
            id: 'ice_guardian',
            name: 'Guardião ICE',
            maxHp: 45,
            pattern: [
                { type: 'DEFEND', value: 10, label: 'Fortificar (+10 Buffer)' },
                { type: 'ATTACK', value: 12, label: 'Golpe Pesado (12 Dano)' },
                { type: 'TRACE', value: 2, label: 'Rastrear (+2 Trace)' }
            ]
        });
    }
}

export class SpreaderBot extends Enemy {
    constructor() {
        super({
            id: 'spreader_bot',
            name: 'Bot Disseminador',
            maxHp: 22,
            pattern: [
                { type: 'ATTACK_DEBUFF', value: 4, status: STATUS_TYPES.MALWARE, statusValue: 2, label: 'Infectar (4 Dano + 2 Malware)' },
                { type: 'ATTACK', value: 8, label: 'Pulso Eletromagnético (8 Dano)' },
                { type: 'DEFEND', value: 5, label: 'Barreira Digital (+5 Buffer)' }
            ]
        });
    }
}

export class ApexNeuralCoreBoss extends Enemy {
    constructor() {
        super({
            id: 'apex_neural_core',
            name: 'Núcleo IA Neural Apex',
            maxHp: 120,
            pattern: [
                { type: 'ATTACK', value: 10, label: 'Surto de Sinapse (10 Dano)' },
                { type: 'SUMMON_SHIELD', value: 15, label: 'Matriz Quântica (+15 Buffer)' },
                { type: 'ATTACK_DEBUFF', value: 14, status: STATUS_TYPES.CORRODE, statusValue: 2, label: 'Sobrecarga (14 Dano + 2 Corrosão)' },
                { type: 'MEGA_ATTACK', value: 25, label: 'LIMPEZA DE SISTEMA (25 Dano)' }
            ]
        });
        this.isBoss = true;
    }
}
