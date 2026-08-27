export const STATUS_TYPES = {
    BUFFER: 'BUFFER',
    MALWARE: 'MALWARE',
    EXPLOIT: 'EXPLOIT',
    CORRODE: 'CORRODE',
    TRACE: 'TRACE'
};

export class StatusSystem {
    static apply(entity, statusType, amount) {
        if (!entity.statuses) entity.statuses = {};
        entity.statuses[statusType] = (entity.statuses[statusType] || 0) + amount;
        if (entity.statuses[statusType] <= 0) {
            delete entity.statuses[statusType];
        }
    }

    static get(entity, statusType) {
        return (entity.statuses && entity.statuses[statusType]) || 0;
    }

    static clear(entity, statusType) {
        if (entity.statuses) delete entity.statuses[statusType];
    }

    static tickStartOfTurn(entity) {
        let directDamage = 0;
        if (entity.statuses?.[STATUS_TYPES.MALWARE]) {
            directDamage += entity.statuses[STATUS_TYPES.MALWARE];
            entity.statuses[STATUS_TYPES.MALWARE] = Math.max(0, entity.statuses[STATUS_TYPES.MALWARE] - 1);
            if (entity.statuses[STATUS_TYPES.MALWARE] === 0) delete entity.statuses[STATUS_TYPES.MALWARE];
        }
        return { directDamage };
    }

    static tickEndOfTurn(entity) {
        if (entity.statuses?.[STATUS_TYPES.EXPLOIT]) {
            entity.statuses[STATUS_TYPES.EXPLOIT] = Math.max(0, entity.statuses[STATUS_TYPES.EXPLOIT] - 1);
            if (entity.statuses[STATUS_TYPES.EXPLOIT] === 0) delete entity.statuses[STATUS_TYPES.EXPLOIT];
        }
        if (entity.statuses?.[STATUS_TYPES.CORRODE]) {
            entity.statuses[STATUS_TYPES.CORRODE] = Math.max(0, entity.statuses[STATUS_TYPES.CORRODE] - 1);
            if (entity.statuses[STATUS_TYPES.CORRODE] === 0) delete entity.statuses[STATUS_TYPES.CORRODE];
        }
    }
}
