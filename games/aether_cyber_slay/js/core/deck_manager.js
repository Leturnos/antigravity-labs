import { CARD_CATALOG } from '../entities/cards.js';

export class DeckManager {
    constructor() {
        this.masterDeck = [];
        this.drawPile = [];
        this.hand = [];
        this.discardPile = [];
        this.exhaustPile = [];
    }

    createCardInstance(cardId, upgraded = false) {
        const proto = CARD_CATALOG[cardId];
        if (!proto) throw new Error(`Card ${cardId} not found in catalog`);
        return {
            ...proto,
            instanceId: Math.random().toString(36).substring(2, 9),
            upgraded: upgraded,
            name: upgraded ? `${proto.name}+` : proto.name,
            desc: upgraded ? proto.upgradeDesc : proto.desc
        };
    }

    initStarterDeck() {
        this.masterDeck = [
            this.createCardInstance('ping_strike'),
            this.createCardInstance('ping_strike'),
            this.createCardInstance('ping_strike'),
            this.createCardInstance('ping_strike'),
            this.createCardInstance('buffer_shield'),
            this.createCardInstance('buffer_shield'),
            this.createCardInstance('buffer_shield'),
            this.createCardInstance('buffer_shield'),
            this.createCardInstance('overclock_pulse'),
            this.createCardInstance('scan_exploit')
        ];
        this.resetForCombat();
    }

    resetForCombat() {
        this.drawPile = [...this.masterDeck.map(c => ({ ...c }))];
        this.hand = [];
        this.discardPile = [];
        this.exhaustPile = [];
        this.shuffle(this.drawPile);
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    draw(count = 1) {
        const drawn = [];
        for (let i = 0; i < count; i++) {
            if (this.drawPile.length === 0) {
                if (this.discardPile.length === 0) break;
                this.drawPile = [...this.discardPile];
                this.discardPile = [];
                this.shuffle(this.drawPile);
            }
            const card = this.drawPile.pop();
            this.hand.push(card);
            drawn.push(card);
        }
        return drawn;
    }

    discardHand() {
        this.discardPile.push(...this.hand);
        this.hand = [];
    }

    discardCard(cardInstance) {
        const index = this.hand.findIndex(c => c.instanceId === cardInstance.instanceId);
        if (index !== -1) {
            this.hand.splice(index, 1);
            this.discardPile.push(cardInstance);
        }
    }

    exhaustCard(cardInstance) {
        const index = this.hand.findIndex(c => c.instanceId === cardInstance.instanceId);
        if (index !== -1) {
            this.hand.splice(index, 1);
            this.exhaustPile.push(cardInstance);
        }
    }

    addCardToMasterDeck(cardId, upgraded = false) {
        const card = this.createCardInstance(cardId, upgraded);
        this.masterDeck.push(card);
        return card;
    }

    removeCardFromMasterDeck(instanceId) {
        const index = this.masterDeck.findIndex(c => c.instanceId === instanceId);
        if (index !== -1) {
            return this.masterDeck.splice(index, 1)[0];
        }
        return null;
    }

    upgradeCard(cardInstance) {
        if (!cardInstance.upgraded) {
            cardInstance.upgraded = true;
            cardInstance.name = `${cardInstance.name.replace('+', '')}+`;
            cardInstance.desc = cardInstance.upgradeDesc;
        }
    }
}
