import { StatusSystem, STATUS_TYPES } from '../effects/status_system.js';

export const CARD_TYPES = {
    ATTACK: 'ATTACK',
    DEFENSE: 'DEFENSE',
    EXPLOIT: 'EXPLOIT',
    UTILITY: 'UTILITY'
};

export const CARD_CATALOG = {
    // 1. Attack & Overclock
    ping_strike: {
        id: 'ping_strike',
        name: 'Disparo Ping',
        type: CARD_TYPES.ATTACK,
        cost: 1,
        damage: 6,
        upgradeDamage: 9,
        heat: 0,
        desc: 'Causa 6 de dano.',
        upgradeDesc: 'Causa 9 de dano.',
        execute(context) {
            const dmg = this.upgraded ? 9 : 6;
            return context.target.takeDamage(dmg);
        }
    },
    overclock_pulse: {
        id: 'overclock_pulse',
        name: 'Pulso Overclock',
        type: CARD_TYPES.ATTACK,
        cost: 1,
        damage: 10,
        upgradeDamage: 14,
        heat: 20,
        desc: 'Causa 10 de dano. +20% Calor.',
        upgradeDesc: 'Causa 14 de dano. +20% Calor.',
        execute(context) {
            context.player.addHeat(20);
            const dmg = this.upgraded ? 14 : 10;
            return context.target.takeDamage(dmg);
        }
    },
    superconductor: {
        id: 'superconductor',
        name: 'Supercondutor',
        type: CARD_TYPES.ATTACK,
        cost: 2,
        damage: 14,
        upgradeDamage: 18,
        heat: 0,
        desc: 'Causa 14 de dano. Se Calor > 50%, recupera 1 RAM e compra 1 carta.',
        upgradeDesc: 'Causa 18 de dano. Se Calor > 50%, recupera 1 RAM e compra 1 carta.',
        execute(context) {
            const dmg = this.upgraded ? 18 : 14;
            const res = context.target.takeDamage(dmg);
            if (context.player.isOverclocked()) {
                context.player.ram = Math.min(context.player.maxRam, context.player.ram + 1);
                context.deck.draw(1);
            }
            return res;
        }
    },
    liquid_coolant: {
        id: 'liquid_coolant',
        name: 'Refrigerante Líquido',
        type: CARD_TYPES.DEFENSE,
        cost: 1,
        buffer: 5,
        upgradeBuffer: 8,
        cool: 35,
        desc: 'Ganha 5 de Buffer. Reduz 35% de Calor.',
        upgradeDesc: 'Ganha 8 de Buffer. Reduz 35% de Calor.',
        execute(context) {
            const buf = this.upgraded ? 8 : 5;
            StatusSystem.apply(context.player, STATUS_TYPES.BUFFER, buf);
            context.player.cool(35);
        }
    },

    // 2. Malware & Injection (DoT)
    inject_worm: {
        id: 'inject_worm',
        name: 'Injetar Worm',
        type: CARD_TYPES.EXPLOIT,
        cost: 1,
        malware: 4,
        upgradeMalware: 6,
        desc: 'Aplica 4 de Malware.',
        upgradeDesc: 'Aplica 6 de Malware.',
        execute(context) {
            const mal = this.upgraded ? 6 : 4;
            StatusSystem.apply(context.target, STATUS_TYPES.MALWARE, mal);
        }
    },
    trojan_burst: {
        id: 'trojan_burst',
        name: 'Explosão Trojan',
        type: CARD_TYPES.ATTACK,
        cost: 1,
        damage: 4,
        upgradeDamage: 6,
        desc: 'Causa 4 de dano. Se o alvo tiver Malware, dobra o Malware.',
        upgradeDesc: 'Causa 6 de dano. Se o alvo tiver Malware, dobra o Malware.',
        execute(context) {
            const dmg = this.upgraded ? 6 : 4;
            context.target.takeDamage(dmg);
            const currentMal = StatusSystem.get(context.target, STATUS_TYPES.MALWARE);
            if (currentMal > 0) {
                StatusSystem.apply(context.target, STATUS_TYPES.MALWARE, currentMal);
            }
        }
    },
    epidemic_protocol: {
        id: 'epidemic_protocol',
        name: 'Protocolo Epidemia',
        type: CARD_TYPES.EXPLOIT,
        cost: 2,
        damage: 7,
        upgradeDamage: 10,
        malware: 3,
        upgradeMalware: 5,
        desc: 'Causa 7 de dano e aplica 3 de Malware a todos os inimigos.',
        upgradeDesc: 'Causa 10 de dano e aplica 5 de Malware a todos os inimigos.',
        execute(context) {
            const dmg = this.upgraded ? 10 : 7;
            const mal = this.upgraded ? 5 : 3;
            context.enemies.forEach(e => {
                if (e.isAlive()) {
                    e.takeDamage(dmg);
                    StatusSystem.apply(e, STATUS_TYPES.MALWARE, mal);
                }
            });
        }
    },

    // 3. Defense & Cryptography
    buffer_shield: {
        id: 'buffer_shield',
        name: 'Escudo de Buffer',
        type: CARD_TYPES.DEFENSE,
        cost: 1,
        buffer: 6,
        upgradeBuffer: 9,
        desc: 'Ganha 6 de Buffer.',
        upgradeDesc: 'Ganha 9 de Buffer.',
        execute(context) {
            const buf = this.upgraded ? 9 : 6;
            StatusSystem.apply(context.player, STATUS_TYPES.BUFFER, buf);
        }
    },
    encryption_shield: {
        id: 'encryption_shield',
        name: 'Escudo Criptográfico',
        type: CARD_TYPES.DEFENSE,
        cost: 2,
        buffer: 14,
        upgradeBuffer: 18,
        desc: 'Ganha 14 de Buffer. -15% Calor.',
        upgradeDesc: 'Ganha 18 de Buffer. -15% Calor.',
        execute(context) {
            const buf = this.upgraded ? 18 : 14;
            StatusSystem.apply(context.player, STATUS_TYPES.BUFFER, buf);
            context.player.cool(15);
        }
    },

    // 4. Exploits & Utilities
    scan_exploit: {
        id: 'scan_exploit',
        name: 'Escanear Exploit',
        type: CARD_TYPES.EXPLOIT,
        cost: 0,
        exploit: 2,
        upgradeExploit: 3,
        desc: 'Aplica 2 de Exploit.',
        upgradeDesc: 'Aplica 3 de Exploit.',
        execute(context) {
            const exp = this.upgraded ? 3 : 2;
            StatusSystem.apply(context.target, STATUS_TYPES.EXPLOIT, exp);
        }
    },
    ram_booster: {
        id: 'ram_booster',
        name: 'Impulso de RAM',
        type: CARD_TYPES.UTILITY,
        cost: 0,
        heat: 25,
        desc: 'Ganha +2 de RAM neste turno. +25% Calor.',
        upgradeDesc: 'Ganha +3 de RAM neste turno. +20% Calor.',
        execute(context) {
            context.player.ram += this.upgraded ? 3 : 2;
            context.player.addHeat(this.upgraded ? 20 : 25);
        }
    },
    cycle_optimization: {
        id: 'cycle_optimization',
        name: 'Otimizar Ciclo',
        type: CARD_TYPES.UTILITY,
        cost: 1,
        desc: 'Compra 3 cartas.',
        upgradeDesc: 'Compra 4 cartas.',
        execute(context) {
            context.deck.draw(this.upgraded ? 4 : 3);
        }
    }
};
