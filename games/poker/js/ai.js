let EvaluatorRef;
if (typeof require !== 'undefined') {
  EvaluatorRef = require('./evaluator.js').HandEvaluator;
} else {
  EvaluatorRef = window.HandEvaluator;
}

class PokerAI {
  static decideAction(bot, table) {
    const toCall = table.currentCallAmount - bot.currentBet;
    if (toCall >= bot.stack) {
      return { action: 'call', amount: bot.currentBet + bot.stack };
    }

    const isRandom = bot.personality === 'random';
    let decision;
    
    if (toCall <= 0) {
      // We can Check
      if (isRandom) {
        decision = Math.random() < 0.3 ? { action: 'raise', amount: table.minRaiseAmount } : { action: 'check', amount: 0 };
      } else {
        decision = PokerAI.decideWithIntelligentIA(bot, table, true);
      }
    } else {
      // Facing a bet
      if (isRandom) {
        const rand = Math.random();
        if (rand < 0.4) decision = { action: 'fold', amount: 0 };
        else if (rand < 0.8) decision = { action: 'call', amount: toCall };
        else decision = { action: 'raise', amount: Math.min(bot.currentBet + bot.stack, table.minRaiseAmount) };
      } else {
        decision = PokerAI.decideWithIntelligentIA(bot, table, false);
      }
    }

    return PokerAI.sanitizeDecision(decision, bot, table);
  }

  static decideWithIntelligentIA(bot, table, canCheck) {
    const toCall = table.currentCallAmount - bot.currentBet;
    if (toCall >= bot.stack) {
      return { action: 'call', amount: bot.currentBet + bot.stack };
    }

    const handStrength = PokerAI.calculateHandStrength(bot.cards, table.communityCards);
    const potOdds = (table.pot + toCall) > 0 ? toCall / (table.pot + toCall) : 0;
    const personality = bot.personality || 'shark';
    let decision;

    // Decisions based on profiles
    if (personality === 'shark') {
      // Tight-Aggressive
      if (handStrength > 0.7) {
        // Very strong, bet/raise
        const raiseVal = Math.min(bot.currentBet + bot.stack, table.minRaiseAmount + Math.floor(Math.random() * 3) * 20);
        decision = { action: 'raise', amount: raiseVal };
      } else if (handStrength > potOdds || handStrength > 0.4) {
        decision = canCheck ? { action: 'check', amount: 0 } : { action: 'call', amount: toCall };
      } else {
        decision = canCheck ? { action: 'check', amount: 0 } : { action: 'fold', amount: 0 };
      }
    } else if (personality === 'fish') {
      // Loose-Aggressive / Bluff-prone
      const isRiverOrUndefined = table.round === 'river' || table.round === undefined;
      const bluffRate = isRiverOrUndefined ? 0.25 : 0.05;
      const wantsBluff = Math.random() < bluffRate;
      if (handStrength > 0.55 || wantsBluff) {
        const raiseVal = Math.min(bot.currentBet + bot.stack, table.minRaiseAmount + (wantsBluff ? 60 : 20));
        decision = { action: 'raise', amount: raiseVal };
      } else if (handStrength > potOdds - 0.1) {
        decision = canCheck ? { action: 'check', amount: 0 } : { action: 'call', amount: toCall };
      } else {
        decision = canCheck ? { action: 'check', amount: 0 } : { action: 'fold', amount: 0 };
      }
    } else {
      // Passive calling station
      if (handStrength > potOdds || handStrength > 0.35) {
        decision = canCheck ? { action: 'check', amount: 0 } : { action: 'call', amount: toCall };
      } else {
        decision = canCheck ? { action: 'check', amount: 0 } : { action: 'fold', amount: 0 };
      }
    }

    return PokerAI.sanitizeDecision(decision, bot, table);
  }

  static sanitizeDecision(decision, bot, table) {
    if (decision.action === 'raise') {
      const toCall = table.currentCallAmount - bot.currentBet;
      if (bot.stack <= toCall) {
        return { action: 'call', amount: bot.currentBet + bot.stack };
      }
      let raiseTotal = decision.amount;
      if (raiseTotal - bot.currentBet > bot.stack) {
        raiseTotal = bot.currentBet + bot.stack;
      }
      if (raiseTotal < table.minRaiseAmount) {
        if (raiseTotal === bot.currentBet + bot.stack) {
          decision.amount = raiseTotal;
        } else {
          decision = { action: 'call', amount: Math.min(bot.stack, toCall) };
        }
      } else {
        decision.amount = raiseTotal;
      }
    }
    return decision;
  }

  // Basic estimation of hand strength (0 to 1) based on combinations
  static calculateHandStrength(cards, community) {
    if (community.length === 0) {
      // Pre-flop basic strength (values and high card check)
      const v1 = cards[0].value;
      const v2 = cards[1].value;
      const isPair = v1 === v2;
      const isSuited = cards[0].suit === cards[1].suit;
      const high = Math.max(v1, v2);
      
      let score = high / 14.0 * 0.4;
      if (isPair) score += 0.4;
      if (isSuited) score += 0.1;
      return Math.min(0.95, score);
    }

    // Post-flop evaluation
    const evalResult = EvaluatorRef.evaluateHand(cards, community);
    // Normalize rank (0-9) to a float
    let strength = evalResult.rank / 9.0;
    // Add sub-value based on high card within category
    strength += (evalResult.score % 16) / 256;
    return Math.min(0.99, strength);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PokerAI };
} else {
  window.PokerAI = PokerAI;
}
