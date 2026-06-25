class HandEvaluator {
  static evaluateHand(playerCards, communityCards) {
    const allCards = [...playerCards, ...communityCards];
    if (allCards.length < 5) {
      return HandEvaluator.evaluatePreflopHand(allCards);
    }
    const combinations = HandEvaluator.getCombinations(allCards, 5);
    
    let bestHand = null;
    
    for (const combo of combinations) {
      const evaluation = HandEvaluator.evaluateFiveCards(combo);
      if (!bestHand || evaluation.score > bestHand.score) {
        bestHand = evaluation;
      }
    }
    
    return bestHand;
  }

  static evaluatePreflopHand(cards) {
    if (cards.length === 0) {
      return { rank: 0, name: "Sem Cartas", score: 0 };
    }
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    
    let rank = 0;
    let name = "";
    const scoreOrder = [];
    
    if (sorted.length === 2 && sorted[0].value === sorted[1].value) {
      rank = 1;
      const val = sorted[0].value;
      const names = { 11: 'Valetes', 12: 'Damas', 13: 'Reis', 14: 'Áses' };
      const nameStr = names[val] || `${val}s`;
      name = `Par de ${nameStr}`;
      scoreOrder.push(val, val);
    } else {
      rank = 0;
      const highVal = sorted[0].value;
      const names = { 11: 'Valete', 12: 'Dama', 13: 'Rei', 14: 'Ás' };
      const nameStr = names[highVal] || highVal;
      name = `Carta Alta ${nameStr}`;
      sorted.forEach(c => scoreOrder.push(c.value));
    }
    
    let score = rank;
    for (let i = 0; i < 5; i++) {
      score = score * 16 + (scoreOrder[i] || 0);
    }
    
    return { rank, name, score };
  }

  // Returns all combinations of k elements from an array
  static getCombinations(array, k) {
    const result = [];
    function helper(temp, start) {
      if (temp.length === k) {
        result.push([...temp]);
        return;
      }
      for (let i = start; i < array.length; i++) {
        temp.push(array[i]);
        helper(temp, i + 1);
        temp.pop();
      }
    }
    helper([], 0);
    return result;
  }

  static evaluateFiveCards(hand5) {
    // Sort cards descending by value (Ace = 14, King = 13...)
    const sorted = [...hand5].sort((a, b) => b.value - a.value);
    
    const values = sorted.map(c => c.value);
    const suits = sorted.map(c => c.suit);
    
    const isFlush = suits.every(s => s === suits[0]);
    
    // Check straight (handles Ace-low straight 5-4-3-2-A separately)
    let isStraight = false;
    let straightHigh = 0;
    
    const uniqueValues = [...new Set(values)];
    if (uniqueValues.length === 5) {
      if (values[0] - values[4] === 4) {
        isStraight = true;
        straightHigh = values[0];
      } else if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
        // Ace-low Straight (5-4-3-2-A)
        isStraight = true;
        straightHigh = 5;
      }
    }

    // Counts occurrences
    const counts = {};
    values.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const countPairs = Object.entries(counts).map(([val, qty]) => ({ val: parseInt(val), qty })).sort((a, b) => b.qty - a.qty || b.val - a.val);

    let rank = 0;
    let name = "High Card";
    
    // Assign base ranks
    if (isFlush && isStraight) {
      if (straightHigh === 14) {
        rank = 9;
        name = "Royal Flush";
      } else {
        rank = 8;
        name = "Straight Flush";
      }
    } else if (countPairs[0].qty === 4) {
      rank = 7;
      name = "Four of a Kind";
    } else if (countPairs[0].qty === 3 && countPairs[1].qty === 2) {
      rank = 6;
      name = "Full House";
    } else if (isFlush) {
      rank = 5;
      name = "Flush";
    } else if (isStraight) {
      rank = 4;
      name = "Straight";
    } else if (countPairs[0].qty === 3) {
      rank = 3;
      name = "Three of a Kind";
    } else if (countPairs[0].qty === 2 && countPairs[1].qty === 2) {
      rank = 2;
      name = "Two Pair";
    } else if (countPairs[0].qty === 2) {
      rank = 1;
      name = "One Pair";
    }

    // Calculate dynamic base 16 score to resolve ties easily
    // score = rank * 16^5 + val1 * 16^4 + val2 * 16^3 + ...
    let score = rank;
    const scoreOrder = [];
    
    if (rank === 8 || rank === 9 || rank === 4) {
      scoreOrder.push(straightHigh);
      if (isStraight && straightHigh === 5) {
        scoreOrder.length = 0;
        scoreOrder.push(5, 4, 3, 2, 14); // Ace is low
      }
    } else {
      // For pairs, trips, full houses, push the groups first, then kickers
      countPairs.forEach(cp => {
        for (let i = 0; i < cp.qty; i++) {
          scoreOrder.push(cp.val);
        }
      });
    }

    for (let i = 0; i < 5; i++) {
      score = score * 16 + (scoreOrder[i] || 0);
    }

    return { rank, name, score };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HandEvaluator };
} else {
  window.HandEvaluator = HandEvaluator;
}
