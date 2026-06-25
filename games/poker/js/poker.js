/**
 * Aether Poker — Game Engine & Visual Loop
 * Manages game state, Texas Hold'em betting rounds, showdown side-pots,
 * async bot delays, keyboard shortcuts, and REST backend score synchronization.
 */

(function () {
  // --- Game Config & Constants ---
  const BOT_NAMES = [
    { name: "QuantumAI", personality: "shark" },
    { name: "CyberBluff", personality: "fish" },
    { name: "NeuroFold", personality: "caller" },
    { name: "DeepShark", personality: "shark" },
    { name: "ApexCortex", personality: "fish" }
  ];

  const SUIT_SYMBOLS = {
    'S': '♠', // Spades
    'H': '♥', // Hearts
    'D': '♦', // Diamonds
    'C': '♣'  // Clubs
  };

  // State
  let gameMode = 'cash'; // 'cash' or 'tournament'
  let botDifficulty = 'smart'; // 'smart' or 'random'
  let initialStackSize = 1000;
  let players = []; // Player is always index 0
  let deck = [];
  let communityCards = [];
  let pot = 0;
  let currentCallAmount = 0;
  let minRaiseAmount = 0;
  let dealerIndex = 0;
  let currentTurnIndex = 0;
  let currentRound = 'preflop'; // 'preflop', 'flop', 'turn', 'river', 'showdown'
  let handCount = 0;
  let bigBlindAmount = 20;
  let smallBlindAmount = 10;
  
  // Track consecutive passes to end betting round
  let activeTurnCount = 0;
  let isAwaitingPlayer = false;
  let botTimeoutId = null;

  let renderedCommunityCount = 0;
  let playerPreparedToAnimate = true;

  // DB Score Records
  let recordStack = 0;
  let recordCashWins = 0;
  let recordCashLosses = 0;
  let recordTourneyWins = 0;
  let recordTourneyLosses = 0;

  // --- DOM Elements ---
  const container = document.getElementById("aether-container");
  const settingsBar = document.getElementById("settings-bar");
  const activeModeName = document.getElementById("lbl-active-mode-name");
  const apiStatus = document.getElementById("api-status");
  
  // Panel Info
  const panelMode = document.getElementById("panel-game-mode");
  const panelBlinds = document.getElementById("panel-blinds");
  const panelPot = document.getElementById("panel-pot");
  const panelCurrentCall = document.getElementById("panel-current-call");
  const panelRound = document.getElementById("panel-hand-round");
  const panelHandCount = document.getElementById("panel-hand-count");
  const cashActionsPanel = document.getElementById("cash-actions-panel");
  const btnCashout = document.getElementById("btn-cashout");

  // Board
  const tablePotVal = document.getElementById("table-pot-val");
  const communityCardsContainer = document.getElementById("community-cards");
  
  // Overlays
  const startOverlay = document.getElementById("start-overlay");
  const nextHandOverlay = document.getElementById("next-hand-overlay");
  const nextHandTitle = document.getElementById("next-hand-title");
  const nextHandMessage = document.getElementById("next-hand-message");
  const payoutSummary = document.getElementById("payout-summary");
  const btnNextHand = document.getElementById("btn-next-hand");
  
  const gameoverOverlay = document.getElementById("gameover-overlay");
  const gameoverHeading = document.getElementById("gameover-heading");
  const gameoverMessage = document.getElementById("gameover-message");
  const gameoverStatsSummary = document.getElementById("gameover-stats-summary");
  const btnRetry = document.getElementById("btn-retry");

  // Controls
  const playerControls = document.getElementById("player-controls");
  const btnFold = document.getElementById("btn-fold");
  const btnCall = document.getElementById("btn-call");
  const lblBtnCall = document.getElementById("lbl-btn-call");
  const lblBtnCallVal = document.getElementById("lbl-btn-call-val");
  const btnRaise = document.getElementById("btn-raise");
  const lblBtnRaiseVal = document.getElementById("lbl-btn-raise-val");
  
  const raiseSliderPanel = document.getElementById("raise-slider-panel");
  const lblMinRaise = document.getElementById("lbl-min-raise");
  const lblMaxRaise = document.getElementById("lbl-max-raise");
  const inputRaiseVal = document.getElementById("input-raise-val");
  const sliderRaiseVal = document.getElementById("slider-raise-val");
  const btnRaiseMin = document.getElementById("btn-raise-min");
  const btnRaiseHalf = document.getElementById("btn-raise-half");
  const btnRaisePot = document.getElementById("btn-raise-pot");
  const btnRaiseAllin = document.getElementById("btn-raise-allin");

  // Header & Footer
  const btnSoundToggle = document.getElementById("btn-sound-toggle");
  const btnInfo = document.getElementById("btn-info");
  const modalInfo = document.getElementById("modal-info");
  const modalInfoClose = document.getElementById("modal-info-close");
  const btnInfoCloseOk = document.getElementById("btn-info-close-ok");
  const btnResetScores = document.getElementById("btn-reset-scores");
  
  const valRecordStack = document.getElementById("val-record-stack");
  const valRecordCash = document.getElementById("val-record-cash");
  const valRecordTournament = document.getElementById("val-record-tournament");

  // Confirm Modal
  const modalConfirm = document.getElementById("modal-confirm");
  const btnConfirmYes = document.getElementById("btn-confirm-yes");
  const btnConfirmNo = document.getElementById("btn-confirm-no");

  // --- Initial Setup ---
  window.addEventListener("load", () => {
    initLobbyControls();
    fetchRecords();
    initSoundToggle();
    initModals();
    initKeyboardShortcuts();
  });

  function initSoundToggle() {
    btnSoundToggle.addEventListener("click", () => {
      const active = window.PokerSounds.toggleSound();
      btnSoundToggle.querySelector(".label").textContent = `Som: ${active ? 'LIGADO' : 'MUTADO'}`;
      btnSoundToggle.querySelector(".icon").textContent = active ? '🔊' : '🔇';
    });
  }

  function initModals() {
    btnInfo.addEventListener("click", () => {
      window.PokerSounds.playClick();
      modalInfo.classList.remove("hidden");
    });
    
    const closeInfo = () => {
      window.PokerSounds.playClick();
      modalInfo.classList.add("hidden");
    };
    modalInfoClose.addEventListener("click", closeInfo);
    btnInfoCloseOk.addEventListener("click", closeInfo);

    // Score Reset Confirm
    btnResetScores.addEventListener("click", () => {
      window.PokerSounds.playClick();
      modalConfirm.classList.remove("hidden");
    });
    
    btnConfirmNo.addEventListener("click", () => {
      window.PokerSounds.playClick();
      modalConfirm.classList.add("hidden");
    });

    btnConfirmYes.addEventListener("click", async () => {
      window.PokerSounds.playClick();
      modalConfirm.classList.add("hidden");
      await resetDatabaseScores();
    });
  }

  function initLobbyControls() {
    // Game mode toggle buttons
    const btnModeCash = document.getElementById("btn-lobby-mode-cash");
    const btnModeTourney = document.getElementById("btn-lobby-mode-tournament");
    
    btnModeCash.addEventListener("click", () => {
      window.PokerSounds.playClick();
      gameMode = 'cash';
      btnModeCash.classList.add("active");
      btnModeTourney.classList.remove("active");
    });
    
    btnModeTourney.addEventListener("click", () => {
      window.PokerSounds.playClick();
      gameMode = 'tournament';
      btnModeTourney.classList.add("active");
      btnModeCash.classList.remove("active");
    });

    // AI strategy buttons
    const btnAISmart = document.getElementById("btn-lobby-ai-smart");
    const btnAIRandom = document.getElementById("btn-lobby-ai-random");
    
    btnAISmart.addEventListener("click", () => {
      window.PokerSounds.playClick();
      botDifficulty = 'smart';
      btnAISmart.classList.add("active");
      btnAIRandom.classList.remove("active");
    });
    
    btnAIRandom.addEventListener("click", () => {
      window.PokerSounds.playClick();
      botDifficulty = 'random';
      btnAIRandom.classList.add("active");
      btnAISmart.classList.remove("active");
    });

    // Opponent Count Selector
    const qtyButtons = document.querySelectorAll(".qty-btn");
    let selectedOpponents = 3;
    qtyButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        window.PokerSounds.playClick();
        qtyButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedOpponents = parseInt(btn.getAttribute("data-qty"));
      });
    });

    // Initial Stack Size Selector
    const stackButtons = document.querySelectorAll(".stack-btn");
    stackButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        window.PokerSounds.playClick();
        stackButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        initialStackSize = parseInt(btn.getAttribute("data-stack"));
      });
    });

    // Start Game Button
    const btnStart = document.getElementById("btn-start");
    btnStart.addEventListener("click", () => {
      window.PokerSounds.playWin(); // plays nice fanfare to start
      startOverlay.classList.add("hidden");
      container.classList.remove("game-idle");
      container.classList.add("game-playing");
      
      setupGame(selectedOpponents);
    });

    // Next Hand button
    btnNextHand.addEventListener("click", () => {
      window.PokerSounds.playClick();
      nextHandOverlay.classList.add("hidden");
      startNewHand();
    });

    // Play again after GameOver
    btnRetry.addEventListener("click", () => {
      window.PokerSounds.playClick();
      gameoverOverlay.classList.add("hidden");
      startOverlay.classList.remove("hidden");
      container.classList.remove("game-playing");
      container.classList.add("game-idle");
    });

    // Player action buttons
    btnFold.addEventListener("click", () => handlePlayerAction('fold'));
    btnCall.addEventListener("click", () => handlePlayerAction('call'));
    btnRaise.addEventListener("click", () => {
      const raiseVal = parseInt(inputRaiseVal.value);
      handlePlayerAction('raise', raiseVal);
    });

    // Quick raise helpers
    btnRaiseMin.addEventListener("click", (e) => { e.stopPropagation(); setRaiseSliderValue(minRaiseAmount); });
    btnRaiseHalf.addEventListener("click", (e) => { e.stopPropagation(); setRaiseSliderValue(Math.max(minRaiseAmount, Math.floor(pot / 2))); });
    btnRaisePot.addEventListener("click", (e) => { e.stopPropagation(); setRaiseSliderValue(Math.max(minRaiseAmount, pot)); });
    btnRaiseAllin.addEventListener("click", (e) => { e.stopPropagation(); setRaiseSliderValue(players[0].stack + players[0].currentBet); });

    // Slider inputs
    sliderRaiseVal.addEventListener("input", () => {
      const val = parseInt(sliderRaiseVal.value);
      inputRaiseVal.value = val;
      updateRaiseButtonLabel(val);
    });

    inputRaiseVal.addEventListener("change", () => {
      let val = parseInt(inputRaiseVal.value);
      const maxVal = players[0].stack + players[0].currentBet;
      if (isNaN(val) || val < minRaiseAmount) val = minRaiseAmount;
      if (val > maxVal) val = maxVal;
      inputRaiseVal.value = val;
      sliderRaiseVal.value = val;
      updateRaiseButtonLabel(val);
    });

    // Cash out option
    btnCashout.addEventListener("click", () => {
      window.PokerSounds.playClick();
      endGameSession('win', players[0].stack);
    });
  }

  // --- Keyboard Shortcuts ---
  function initKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      // Prevent default page scroll for arrow keys on the game page
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (isAwaitingPlayer && !playerControls.classList.contains("hidden")) {
          adjustRaiseSlider(e.key === 'ArrowUp' ? 10 : -10);
        }
        return;
      }
      
      if (!isAwaitingPlayer || playerControls.classList.contains("hidden")) return;
      
      const key = e.key.toUpperCase();
      if (key === 'F') {
        e.preventDefault();
        btnFold.click();
      } else if (key === 'C') {
        e.preventDefault();
        btnCall.click();
      } else if (key === 'R') {
        e.preventDefault();
        btnRaise.click();
      }
    });
  }

  function adjustRaiseSlider(amount) {
    let currentVal = parseInt(sliderRaiseVal.value);
    const maxVal = parseInt(sliderRaiseVal.max);
    const minVal = parseInt(sliderRaiseVal.min);
    
    currentVal = Math.min(maxVal, Math.max(minVal, currentVal + amount));
    setRaiseSliderValue(currentVal);
  }

  function setRaiseSliderValue(val) {
    window.PokerSounds.playClick();
    sliderRaiseVal.value = val;
    inputRaiseVal.value = val;
    updateRaiseButtonLabel(val);
  }

  function updateRaiseButtonLabel(val) {
    lblBtnRaiseVal.textContent = `$${val.toLocaleString('pt-BR')}`;
  }

  // --- Game Initializer ---
  function setupGame(opponentsCount) {
    handCount = 0;
    bigBlindAmount = 20;
    smallBlindAmount = 10;
    dealerIndex = Math.floor(Math.random() * (opponentsCount + 1));
    
    // Create human player
    players = [
      {
        id: 0,
        name: "Jogador (Você)",
        stack: initialStackSize,
        cards: [],
        currentBet: 0,
        handContribution: 0, // Track total chips contributed in current hand
        folded: false,
        isAllIn: false,
        isActive: true,
        personality: 'shark'
      }
    ];

    // Create bots
    const shuffledBots = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < opponentsCount; i++) {
      const botDef = shuffledBots[i % shuffledBots.length];
      players.push({
        id: i + 1,
        name: botDef.name,
        stack: initialStackSize,
        cards: [],
        currentBet: 0,
        handContribution: 0,
        folded: false,
        isAllIn: false,
        isActive: true,
        personality: botDifficulty === 'smart' ? botDef.personality : 'random'
      });
    }

    // Layout mapping for active seats based on total players (players.length)
    // 0: Bottom (Player), 1: Left Bottom, 2: Left Top, 3: Top, 4: Right Top, 5: Right Bottom
    const SEAT_LAYOUTS = {
      2: [0, 3],               // Heads-up: Player Bottom + Top
      3: [0, 2, 4],            // 3-handed: Player Bottom + Left Top + Right Top
      4: [0, 1, 3, 5],         // 4-handed: Player Bottom + Left Bottom + Top + Right Bottom
      5: [0, 1, 2, 3, 4],      // 5-handed: Player Bottom + Left Bottom + Left Top + Top + Right Top
      6: [0, 1, 2, 3, 4, 5]    // 6-handed: Full ring (all seats)
    };

    const currentLayout = SEAT_LAYOUTS[players.length] || SEAT_LAYOUTS[6];

    // Clean position classes from all seats (0 to 5) and assign the layout positions
    for (let s = 0; s <= 5; s++) {
      const seatEl = document.getElementById(`seat-${s}`);
      if (seatEl) {
        // Remove all possible positioning classes first to avoid overlapping or multiple classes
        for (let pIdx = 0; pIdx <= 5; pIdx++) {
          seatEl.classList.remove(`seat-position-${pIdx}`);
        }

        if (s < players.length) {
          const physicalPos = currentLayout[s];
          seatEl.classList.add(`seat-position-${physicalPos}`);
          seatEl.classList.remove("empty-seat");
          if (s > 0) {
            document.getElementById(`name-${s}`).textContent = players[s].name;
          }
        } else {
          // Re-apply standard positioning for empty seats to keep layout definitions valid
          seatEl.classList.add(`seat-position-${s}`);
          seatEl.classList.add("empty-seat");
        }
      }
    }

    // Show/hide side panel controls
    if (gameMode === 'cash') {
      cashActionsPanel.classList.remove("hidden");
    } else {
      cashActionsPanel.classList.add("hidden");
    }

    // Set panel info
    panelMode.textContent = gameMode === 'cash' ? "CASH GAME" : "TORNEIO SIT & GO";
    activeModeName.textContent = gameMode === 'cash' ? "CASH GAME" : "TORNEIO SIT & GO";

    startNewHand();
  }

  // --- Start Hand Loop ---
  function startNewHand() {
    handCount++;
    currentRound = 'preflop';
    communityCards = [];
    pot = 0;
    currentCallAmount = 0;
    minRaiseAmount = bigBlindAmount;
    
    renderedCommunityCount = 0;
    playerPreparedToAnimate = true;
    // Reset player states for new hand
    players.forEach(p => {
      p.cardsRevealedAnimateDone = false;
      p.cards = [];
      p.currentBet = 0;
      p.handContribution = 0;
      p.folded = false;
      p.isAllIn = false;
      
      // Eliminate players with 0 chips in Tournament
      if (p.stack <= 0 && gameMode === 'tournament') {
        p.isActive = false;
      } else if (p.stack <= 0 && gameMode === 'cash' && p.id === 0) {
        // Player broke in Cash Game, give them the reload screen
        triggerGameOver("Você faliu! Fichas zeradas no Cash Game.");
        return;
      } else if (p.stack <= 0 && gameMode === 'cash') {
        // Reload bots automatically in cash game
        p.stack = initialStackSize;
        p.isActive = true;
      } else {
        p.isActive = true;
      }
    });

    // Check end condition for tournament
    const activePlayers = players.filter(p => p.isActive);
    if (activePlayers.length === 1) {
      if (activePlayers[0].id === 0) {
        endGameSession('win', players[0].stack);
      } else {
        endGameSession('loss', 0);
      }
      return;
    }
    
    // Check if player has been eliminated in Tournament
    if (!players[0].isActive) {
      endGameSession('loss', 0);
      return;
    }

    // Blinds schedule for Tournament: double every 5 hands
    if (gameMode === 'tournament' && handCount > 1 && (handCount - 1) % 5 === 0) {
      bigBlindAmount *= 2;
      smallBlindAmount *= 2;
    }

    panelBlinds.textContent = `$${smallBlindAmount.toLocaleString('pt-BR')} / $${bigBlindAmount.toLocaleString('pt-BR')}`;
    panelHandCount.textContent = handCount;
    panelRound.textContent = "PRE-FLOP";
    
    // Advance Dealer button
    do {
      dealerIndex = (dealerIndex + 1) % players.length;
    } while (!players[dealerIndex].isActive);

    // Position dealer badge on UI
    updateDealerPositionUI();

    // Create & shuffle deck
    createDeck();
    shuffleDeck();

    // Distribute cards
    dealPocketCards();

    // Post Blinds
    postBlinds();

    // Reset board UI
    renderCommunityCards();
    updatePlayersUI();
    updatePotUI();

    // Pre-flop action starts after Big Blind
    // SB is (Dealer+1), BB is (Dealer+2), UTG (Under the gun) is (Dealer+3)
    let utgIndex = (dealerIndex + 3) % players.length;
    while (!players[utgIndex].isActive) {
      utgIndex = (utgIndex + 1) % players.length;
    }
    currentTurnIndex = utgIndex;

    activeTurnCount = 0;
    
    // Start action round
    runTurnCycle();
  }

  function createDeck() {
    deck = [];
    const suits = ['S', 'H', 'D', 'C'];
    for (let suit of suits) {
      for (let val = 2; val <= 14; val++) {
        deck.push({ value: val, suit: suit });
      }
    }
  }

  function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]]
    }
  };

  function dealPocketCards() {
    players.forEach(p => {
      if (p.isActive) {
        p.cards = [deck.pop(), deck.pop()];
        window.PokerSounds.playDeal();
      }
    });

    // Show hand strength for Player
    updatePlayerHandStrengthUI();
  }

  function postBlinds() {
    const activeIndices = [];
    for (let i = 0; i < players.length; i++) {
      if (players[i].isActive) activeIndices.push(i);
    }

    let sbIndex, bbIndex;
    if (activeIndices.length === 2) {
      // Heads-up: Dealer is Small Blind, other is Big Blind
      sbIndex = dealerIndex;
      bbIndex = activeIndices.find(idx => idx !== dealerIndex);
    } else {
      let currentIdx = (dealerIndex + 1) % players.length;
      while (!players[currentIdx].isActive) {
        currentIdx = (currentIdx + 1) % players.length;
      }
      sbIndex = currentIdx;

      currentIdx = (currentIdx + 1) % players.length;
      while (!players[currentIdx].isActive) {
        currentIdx = (currentIdx + 1) % players.length;
      }
      bbIndex = currentIdx;
    }

    const sbPlayer = players[sbIndex];
    const bbPlayer = players[bbIndex];

    // SB Contribution
    const sbCost = Math.min(sbPlayer.stack, smallBlindAmount);
    sbPlayer.stack -= sbCost;
    sbPlayer.currentBet = sbCost;
    sbPlayer.handContribution = sbCost;
    if (sbPlayer.stack === 0) sbPlayer.isAllIn = true;
    showActionBubble(sbIndex, `SB $${sbCost}`, 'action-check');

    // BB Contribution
    const bbCost = Math.min(bbPlayer.stack, bigBlindAmount);
    bbPlayer.stack -= bbCost;
    bbPlayer.currentBet = bbCost;
    bbPlayer.handContribution = bbCost;
    if (bbPlayer.stack === 0) bbPlayer.isAllIn = true;
    showActionBubble(bbIndex, `BB $${bbCost}`, 'action-check');

    currentCallAmount = Math.max(sbCost, bbCost);
    minRaiseAmount = currentCallAmount * 2;
  }

  // --- Betting Turn Cycle ---
  function runTurnCycle() {
    if (botTimeoutId) clearTimeout(botTimeoutId);
    
    // Check if betting round is completed
    if (isBettingRoundComplete()) {
      advanceBettingRound();
      return;
    }

    const currentPlayer = players[currentTurnIndex];
    
    // Skip folded, all-in, or inactive players
    if (!currentPlayer.isActive || currentPlayer.folded || currentPlayer.isAllIn) {
      advanceTurnIndex();
      runTurnCycle();
      return;
    }

    // UI: Set active player border
    players.forEach((p, idx) => {
      const seatEl = document.getElementById(`seat-${idx}`);
      if (idx === currentTurnIndex) {
        seatEl.classList.add("active-turn");
      } else {
        seatEl.classList.remove("active-turn");
      }
    });

    if (currentPlayer.id === 0) {
      // It is the human's turn
      isAwaitingPlayer = true;
      enablePlayerControlsUI();
    } else {
      // It is a bot's turn
      isAwaitingPlayer = false;
      playerControls.classList.add("hidden");
      
      const delay = 1000 + Math.random() * 800; // visual delay for bot decisions
      botTimeoutId = setTimeout(() => {
        executeBotTurn(currentPlayer);
      }, delay);
    }
  }

  function isBettingRoundComplete() {
    const activeNotFolded = players.filter(p => p.isActive && !p.folded);
    
    // If only one player left who hasn't folded, round is done (they will win)
    if (activeNotFolded.length <= 1) return true;

    const eligibleCount = activeNotFolded.filter(p => !p.isAllIn).length;
    if (eligibleCount <= 1) return true;
    
    // If all eligible players have checked/called and everyone has had a turn
    if (activeTurnCount >= players.filter(p => p.isActive).length) {
      const allMatched = activeNotFolded.every(p => p.currentBet === currentCallAmount || p.isAllIn);
      if (allMatched) return true;
    }

    return false;
  }

  function advanceTurnIndex() {
    currentTurnIndex = (currentTurnIndex + 1) % players.length;
    activeTurnCount++;
  }

  // --- Bot Action Executer ---
  function executeBotTurn(bot) {
    // Make table state matching ai.js signature
    const tableState = {
      communityCards: communityCards,
      pot: pot,
      currentCallAmount: currentCallAmount,
      minRaiseAmount: minRaiseAmount,
      round: currentRound
    };

    const decision = window.PokerAI.decideAction(bot, tableState);
    
    let realAmount = decision.amount;
    
    // Process action
    processPlayerAction(bot.id, decision.action, realAmount);
  }

  // --- Player Action Handler ---
  function handlePlayerAction(action, amount) {
    if (!isAwaitingPlayer) return;
    
    isAwaitingPlayer = false;
    playerControls.classList.add("hidden");
    
    let actionAmount = 0;
    let finalAction = action;
    if (action === 'call') {
      actionAmount = currentCallAmount - players[0].currentBet;
      if (actionAmount === 0) {
        finalAction = 'check';
      }
    } else if (action === 'raise') {
      actionAmount = amount;
    }

    processPlayerAction(0, finalAction, actionAmount);
  }

  // --- Main Action Processor ---
  function processPlayerAction(playerIndex, action, amount) {
    const player = players[playerIndex];
    let actionLabel = action.toUpperCase();
    let bubbleClass = 'action-check';

    if (action === 'fold') {
      player.folded = true;
      actionLabel = "FOLD";
      bubbleClass = "action-fold";
      window.PokerSounds.playFold();
      
      // Grayscale/opaque cards
      const cardsCont = document.getElementById(`cards-${playerIndex}`);
      cardsCont.querySelectorAll(".card").forEach(c => c.classList.add("folded"));
    }
    else if (action === 'check') {
      actionLabel = "CHECK";
      bubbleClass = "action-check";
      window.PokerSounds.playCheck();
    }
    else if (action === 'call') {
      const needed = currentCallAmount - player.currentBet;
      const cost = Math.min(player.stack, needed);

      player.stack -= cost;
      player.currentBet += cost;
      player.handContribution += cost;
      pot += cost;
      
      if (player.stack === 0 && needed > 0) {
        player.isAllIn = true;
        actionLabel = "ALL-IN";
        bubbleClass = "action-allin";
      } else {
        actionLabel = "CALL";
        bubbleClass = "action-call";
      }
      
      window.PokerSounds.playChip();
    }
    else if (action === 'raise') {
      // Amount is the target absolute currentBet of the raise
      let cost = amount - player.currentBet;
      if (cost >= player.stack) {
        cost = player.stack;
        player.currentBet += cost;
        player.handContribution += cost;
        player.stack = 0;
        player.isAllIn = true;
        actionLabel = "ALL-IN";
        bubbleClass = "action-allin";
      } else {
        player.stack -= cost;
        player.currentBet = amount;
        player.handContribution += cost;
        actionLabel = `RAISE $${amount}`;
        bubbleClass = "action-raise";
      }
      
      pot += cost;
      currentCallAmount = player.currentBet;
      minRaiseAmount = currentCallAmount + Math.max(bigBlindAmount, cost);
      
      window.PokerSounds.playBet();
    }

    showActionBubble(playerIndex, actionLabel, bubbleClass);
    updatePlayersUI();
    updatePotUI();

    // Check if the game has ended early (only 1 player remaining who hasn't folded)
    const activeNotFolded = players.filter(p => p.isActive && !p.folded);
    if (activeNotFolded.length === 1) {
      // Early win, direct to payouts!
      setTimeout(() => {
        handleEarlyWin(activeNotFolded[0]);
      }, 1000);
      return;
    }

    // Advance turn
    advanceTurnIndex();
    
    // Visual loop execution
    setTimeout(() => {
      runTurnCycle();
    }, 100);
  }

  // --- Handle Phase Advancements ---
  function advanceBettingRound() {
    // Reset player bets for the round (move to pot done incrementally, now just reset player bets)
    players.forEach(p => {
      p.currentBet = 0;
    });
    
    currentCallAmount = 0;
    minRaiseAmount = bigBlindAmount;
    activeTurnCount = 0;

    // Remove action bubbles
    for (let i = 0; i < players.length; i++) {
      hideActionBubble(i);
    }

    updatePlayersUI();

    if (currentRound === 'preflop') {
      currentRound = 'flop';
      panelRound.textContent = "FLOP";
      // Deal 3 community cards
      deck.pop(); // Burn card
      communityCards.push(deck.pop(), deck.pop(), deck.pop());
      window.PokerSounds.playDeal();
      renderCommunityCards();
      startNewBettingRound();
    }
    else if (currentRound === 'flop') {
      currentRound = 'turn';
      panelRound.textContent = "TURN";
      // Deal 4th community card
      deck.pop(); // Burn card
      communityCards.push(deck.pop());
      window.PokerSounds.playDeal();
      renderCommunityCards();
      startNewBettingRound();
    }
    else if (currentRound === 'turn') {
      currentRound = 'river';
      panelRound.textContent = "RIVER";
      // Deal 5th community card
      deck.pop(); // Burn card
      communityCards.push(deck.pop());
      window.PokerSounds.playDeal();
      renderCommunityCards();
      startNewBettingRound();
    }
    else if (currentRound === 'river') {
      currentRound = 'showdown';
      panelRound.textContent = "SHOWDOWN";
      processShowdown();
    }
  }

  function startNewBettingRound() {
    updatePlayerHandStrengthUI();
    
    const activeWithChips = players.filter(p => p.isActive && !p.folded && !p.isAllIn);
    if (activeWithChips.length <= 1) {
      runAutoBoardRunout();
      return;
    }
    
    // First active player after Dealer acts first post-flop
    let nextIdx = (dealerIndex + 1) % players.length;
    while (!players[nextIdx].isActive || players[nextIdx].folded || players[nextIdx].isAllIn) {
      nextIdx = (nextIdx + 1) % players.length;
      if (nextIdx === (dealerIndex + 1) % players.length) break; // Infinite loop safety
    }
    currentTurnIndex = nextIdx;
    
    runTurnCycle();
  }

  async function runAutoBoardRunout() {
    for (let i = 0; i < players.length; i++) {
      hideActionBubble(i);
    }
    while (currentRound !== 'river' && currentRound !== 'showdown') {
      if (currentRound === 'preflop') {
        currentRound = 'flop';
        deck.pop();
        communityCards.push(deck.pop(), deck.pop(), deck.pop());
      } else if (currentRound === 'flop') {
        currentRound = 'turn';
        deck.pop();
        communityCards.push(deck.pop());
      } else if (currentRound === 'turn') {
        currentRound = 'river';
        deck.pop();
        communityCards.push(deck.pop());
      }
      window.PokerSounds.playDeal();
      renderCommunityCards();
      await new Promise(r => setTimeout(r, 800));
    }
    currentRound = 'showdown';
    panelRound.textContent = "SHOWDOWN";
    processShowdown();
  }

  // --- Showdown & Side Pots Resolution ---
  function handleEarlyWin(winner) {
    // Sound victory
    if (winner.id === 0) {
      window.PokerSounds.playWin();
    } else {
      window.PokerSounds.playFold();
    }

    // Distribute chips
    winner.stack += pot;

    nextHandTitle.textContent = winner.id === 0 ? "VOCÊ VENCEU A MÃO!" : "MÃO FINALIZADA";
    nextHandMessage.textContent = `${winner.name} venceu o pote de $${pot.toLocaleString('pt-BR')} (Todos desistiram)`;
    payoutSummary.innerHTML = `
      <div class="payout-row font-mono">
        <span>${winner.name}</span>
        <span class="status-good font-bold">+$${pot.toLocaleString('pt-BR')}</span>
      </div>
    `;

    pot = 0;
    updatePotUI();
    updatePlayersUI();
    
    nextHandOverlay.classList.remove("hidden");
  }

  function processShowdown() {
    // Flip all cards of active players
    revealActiveCards();

    // Copy contributions for the robust side pot algorithm
    const contributions = players.map(p => p.handContribution || 0);
    
    // Active showdown candidates
    const showdownList = players
      .filter(p => !p.folded && p.isActive)
      .map(p => {
        const evaluation = window.HandEvaluator.evaluateHand(p.cards, communityCards);
        return {
          player: p,
          score: evaluation.score,
          name: evaluation.name
        };
      });

    // Sort by descending score
    showdownList.sort((a, b) => b.score - a.score);

    const payouts = players.map(() => 0);
    let totalPot = pot;

    // Perfect Side-Pots algorithm
    while (totalPot > 0) {
      const eligible = showdownList.filter(s => contributions[s.player.id] > 0);
      if (eligible.length === 0) {
        // Remaining pot fallback
        if (showdownList.length > 0) {
          payouts[showdownList[0].player.id] += totalPot;
        }
        break;
      }

      // Highest score
      const bestScore = Math.max(...eligible.map(e => e.score));
      const winners = eligible.filter(e => e.score === bestScore);

      // Lowest contribution among winners of this round
      const minContrib = Math.min(...winners.map(w => contributions[w.player.id]));

      // Collect contribution from all
      let collected = 0;
      for (let i = 0; i < players.length; i++) {
        const take = Math.min(contributions[i], minContrib);
        contributions[i] -= take;
        collected += take;
      }

      // Distribute collected
      const splitVal = Math.floor(collected / winners.length);
      const remainder = collected % winners.length;

      winners.forEach(w => {
        payouts[w.player.id] += splitVal;
      });
      if (remainder > 0 && winners.length > 0) {
        payouts[winners[0].player.id] += remainder;
      }

      totalPot -= collected;
    }

    // Pay out to players
    let winningString = "";
    let htmlSummary = "";
    let playerWon = false;

    players.forEach((p, idx) => {
      if (payouts[idx] > 0) {
        p.stack += payouts[idx];
        
        // Show winner label
        showActionBubble(idx, `Venceu $${payouts[idx]}`, 'action-call');
        
        const evaluation = window.HandEvaluator.evaluateHand(p.cards, communityCards);
        htmlSummary += `
          <div class="payout-row font-mono">
            <span>${p.name} (${evaluation.name})</span>
            <span class="status-good font-bold">+$${payouts[idx].toLocaleString('pt-BR')}</span>
          </div>
        `;

        if (idx === 0) playerWon = true;
        winningString += `${p.name} (${evaluation.name}), `;
      }
    });

    if (playerWon) {
      window.PokerSounds.playWin();
      nextHandTitle.textContent = "VOCÊ VENCEU A MÃO!";
    } else {
      window.PokerSounds.playFold();
      nextHandTitle.textContent = "FIM DA MÃO";
    }

    nextHandMessage.textContent = `Vencedores: ${winningString.slice(0, -2)}`;
    payoutSummary.innerHTML = htmlSummary;
    
    pot = 0;
    updatePotUI();
    updatePlayersUI();
    
    nextHandOverlay.classList.remove("hidden");
  }

  function revealActiveCards() {
    players.forEach((p, idx) => {
      if (p.isActive && !p.folded && idx !== 0) {
        const cardCont = document.getElementById(`cards-${idx}`);
        cardCont.innerHTML = "";
        p.cards.forEach(card => {
          cardCont.appendChild(createCardHTML(card, true));
        });
      }
    });
  }

  // --- UI Renderers ---
  function updateDealerPositionUI() {
    players.forEach((_, idx) => {
      const seatEl = document.getElementById(`seat-${idx}`);
      // Remove old dealer badge if exists
      const oldDealer = seatEl.querySelector(".dealer-badge");
      if (oldDealer) oldDealer.remove();
      
      if (idx === dealerIndex) {
        const badge = document.createElement("div");
        badge.className = "dealer-badge font-mono";
        badge.textContent = "D";
        seatEl.querySelector(".seat-info-card").appendChild(badge);
      }
    });
  }

  function updatePlayersUI() {
    players.forEach((p, idx) => {
      const seatEl = document.getElementById(`seat-${idx}`);
      const stackValEl = document.getElementById(`stack-val-${idx}`);
      const betValEl = document.getElementById(`bet-val-${idx}`);
      const cardsCont = document.getElementById(`cards-${idx}`);

      if (!p.isActive) {
        seatEl.classList.add("empty-seat");
        return;
      }

      seatEl.classList.remove("empty-seat");
      stackValEl.textContent = `$${p.stack.toLocaleString('pt-BR')}`;
      
      if (p.currentBet > 0) {
        betValEl.textContent = `Aposta: $${p.currentBet}`;
        betValEl.style.visibility = "visible";
      } else {
        betValEl.style.visibility = "hidden";
      }

      if (p.folded) {
        seatEl.classList.add("folded");
      } else {
        seatEl.classList.remove("folded");
      }

      // Render cards
      cardsCont.innerHTML = "";
      p.cards.forEach(card => {
        const isFlipped = (idx === 0 || currentRound === 'showdown');
        let shouldAnimate = false;
        if (isFlipped) {
          if (idx === 0) {
            shouldAnimate = playerPreparedToAnimate;
          } else {
            shouldAnimate = (currentRound === 'showdown' && !p.folded && !p.cardsRevealedAnimateDone);
          }
        }
        cardsCont.appendChild(createCardHTML(card, isFlipped, shouldAnimate));
      });
      if (idx === 0 && playerPreparedToAnimate) {
        playerPreparedToAnimate = false;
      }
      if (idx > 0 && currentRound === 'showdown' && !p.folded) {
        p.cardsRevealedAnimateDone = true;
      }
    });
  }

  function createCardHTML(card, isFlipped, animate = false) {
    const cardEl = document.createElement("div");
    cardEl.className = `card ${isFlipped && !animate ? 'flipped' : ''}`;
    cardEl.setAttribute("data-value", card.value);
    cardEl.setAttribute("data-suit", card.suit);

    const innerEl = document.createElement("div");
    innerEl.className = "card-inner";

    const frontEl = document.createElement("div");
    frontEl.className = "card-front";
    
    let displayVal = card.value;
    if (card.value === 11) displayVal = 'J';
    else if (card.value === 12) displayVal = 'Q';
    else if (card.value === 13) displayVal = 'K';
    else if (card.value === 14) displayVal = 'A';

    frontEl.innerHTML = `
      <span class="card-val">${displayVal}</span>
      <span class="card-suit">${SUIT_SYMBOLS[card.suit]}</span>
    `;

    const backEl = document.createElement("div");
    backEl.className = "card-back";

    innerEl.appendChild(frontEl);
    innerEl.appendChild(backEl);
    cardEl.appendChild(innerEl);

    // Timeout to apply flip animation smoothly
    if (isFlipped && animate) {
      setTimeout(() => {
        cardEl.classList.add("flipped");
      }, 50);
    }

    return cardEl;
  }

  function updatePotUI() {
    panelPot.textContent = `$${pot.toLocaleString('pt-BR')}`;
    tablePotVal.textContent = `$${pot.toLocaleString('pt-BR')}`;
    panelCurrentCall.textContent = `$${currentCallAmount.toLocaleString('pt-BR')}`;
  }

  function renderCommunityCards() {
    communityCardsContainer.innerHTML = "";
    
    // Render community cards
    for (let i = 0; i < 5; i++) {
      if (i < communityCards.length) {
        const shouldAnimate = (i >= renderedCommunityCount);
        communityCardsContainer.appendChild(createCardHTML(communityCards[i], true, shouldAnimate));
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "card-placeholder";
        communityCardsContainer.appendChild(placeholder);
      }
    }
    renderedCommunityCount = communityCards.length;
  }

  function updatePlayerHandStrengthUI() {
    const handStrengthEl = document.getElementById("hand-strength-0");
    if (players[0].isActive && !players[0].folded && players[0].cards.length === 2) {
      const evaluation = window.HandEvaluator.evaluateHand(players[0].cards, communityCards);
      if (evaluation && evaluation.name) {
        handStrengthEl.textContent = evaluation.name;
        handStrengthEl.classList.remove("hidden");
        return;
      }
    }
    handStrengthEl.classList.add("hidden");
  }

  function enablePlayerControlsUI() {
    playerControls.classList.remove("hidden");
    
    const toCall = currentCallAmount - players[0].currentBet;
    
    // Check Option
    if (toCall <= 0) {
      lblBtnCall.textContent = "CHECK";
      lblBtnCallVal.textContent = "";
    } else {
      lblBtnCall.textContent = "CALL";
      lblBtnCallVal.textContent = `$${Math.min(players[0].stack, toCall).toLocaleString('pt-BR')}`;
    }

    // Raise Option setup
    const playerTotalStack = players[0].stack + players[0].currentBet;
    if (playerTotalStack <= currentCallAmount || players[0].stack <= toCall) {
      // Not enough stack to raise
      btnRaise.disabled = true;
    } else {
      btnRaise.disabled = false;
      
      // Calculate min raise bounds
      const minRaiseTotal = Math.max(minRaiseAmount, currentCallAmount + bigBlindAmount);
      const allowedMinRaise = Math.min(playerTotalStack, minRaiseTotal);
      
      // Raise limit is players total chips
      const allowedMaxRaise = playerTotalStack;

      lblMinRaise.textContent = `$${allowedMinRaise.toLocaleString('pt-BR')}`;
      lblMaxRaise.textContent = `$${allowedMaxRaise.toLocaleString('pt-BR')}`;
      
      sliderRaiseVal.min = allowedMinRaise;
      sliderRaiseVal.max = allowedMaxRaise;
      sliderRaiseVal.value = allowedMinRaise;
      inputRaiseVal.min = allowedMinRaise;
      inputRaiseVal.max = allowedMaxRaise;
      inputRaiseVal.value = allowedMinRaise;

      updateRaiseButtonLabel(allowedMinRaise);
    }
  }

  // --- Action Bubbles (Temporary badges) ---
  function showActionBubble(playerIndex, text, className) {
    const bubble = document.getElementById(`action-bubble-${playerIndex}`);
    bubble.className = `action-bubble ${className}`;
    bubble.textContent = text;
    bubble.classList.remove("hidden");
  }

  function hideActionBubble(playerIndex) {
    const bubble = document.getElementById(`action-bubble-${playerIndex}`);
    bubble.classList.add("hidden");
  }

  // --- End Game & API Score Synchronization ---
  function triggerGameOver(msg) {
    if (botTimeoutId) clearTimeout(botTimeoutId);
    isAwaitingPlayer = false;
    playerControls.classList.add("hidden");

    gameoverHeading.textContent = "Fim do Stack";
    gameoverMessage.textContent = msg;

    let finalScore = 0;
    if (gameMode === 'cash') {
      finalScore = 0;
      gameoverStatsSummary.innerHTML = `
        <div class="summary-row">
          <span class="summary-label">Modo de Jogo:</span>
          <span class="summary-value">Cash Game</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Mãos Jogadas:</span>
          <span class="summary-value">${handCount}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Stack Final:</span>
          <span class="summary-value status-danger">$0</span>
        </div>
      `;
    }

    gameoverOverlay.classList.remove("hidden");
    saveScore('loss', finalScore);
  }

  function endGameSession(result, finalStack) {
    if (botTimeoutId) clearTimeout(botTimeoutId);
    isAwaitingPlayer = false;
    playerControls.classList.add("hidden");

    gameoverHeading.textContent = result === 'win' ? "Sessão Finalizada!" : "Eliminado do Torneio";
    gameoverMessage.textContent = result === 'win' 
      ? "Parabéns! Você recolheu seus lucros da mesa." 
      : "Infelizmente todos os seus oponentes levaram suas fichas.";

    gameoverStatsSummary.innerHTML = `
      <div class="summary-row">
        <span class="summary-label">Modo de Jogo:</span>
        <span class="summary-value">${gameMode === 'cash' ? 'Cash Game' : 'Torneio Sit&Go'}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Mãos Disputadas:</span>
        <span class="summary-value">${handCount}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Stack Acumulado:</span>
        <span class="summary-value ${result === 'win' ? 'status-good' : 'status-danger'}">$${finalStack.toLocaleString('pt-BR')}</span>
      </div>
    `;

    gameoverOverlay.classList.remove("hidden");
    saveScore(result, finalStack);
  }

  // --- API Score Requests ---
  async function fetchRecords() {
    try {
      const response = await fetch('/api/score?game=poker');
      if (response.ok) {
        const data = await response.json();
        
        recordStack = data.maior_stack || 0;
        recordCashWins = data.cash?.vitorias || 0;
        recordCashLosses = data.cash?.derrotas || 0;
        recordTourneyWins = data.torneio?.vitorias || 0;
        recordTourneyLosses = data.torneio?.derrotas || 0;

        renderRecordBoardUI();
      }
    } catch (err) {
      console.warn("Could not connect to database scores. Playing locally.", err);
    }
  }

  async function saveScore(result, finalStack) {
    const payload = {
      mode: gameMode,
      result: result,
      stack: finalStack
    };

    try {
      const response = await fetch('/api/score?game=poker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        
        recordStack = data.scores.maior_stack || 0;
        recordCashWins = data.scores.cash?.vitorias || 0;
        recordCashLosses = data.scores.cash?.derrotas || 0;
        recordTourneyWins = data.scores.torneio?.vitorias || 0;
        recordTourneyLosses = data.scores.torneio?.derrotas || 0;

        renderRecordBoardUI();
      }
    } catch (err) {
      console.warn("Failed to post score to backend.", err);
      // Fallback local highscore
      if (finalStack > recordStack) {
        recordStack = finalStack;
      }
      if (gameMode === 'cash') {
        if (result === 'win') recordCashWins++;
        else recordCashLosses++;
      } else {
        if (result === 'win') recordTourneyWins++;
        else recordTourneyLosses++;
      }
      renderRecordBoardUI();
    }
  }

  async function resetDatabaseScores() {
    try {
      const response = await fetch('/api/score?game=poker', {
        method: 'DELETE'
      });
      if (response.ok) {
        recordStack = 0;
        recordCashWins = 0;
        recordCashLosses = 0;
        recordTourneyWins = 0;
        recordTourneyLosses = 0;
        renderRecordBoardUI();
      }
    } catch (err) {
      console.error("Failed to delete score database records.", err);
    }
  }

  function renderRecordBoardUI() {
    valRecordStack.textContent = `$${recordStack.toLocaleString('pt-BR')}`;
    valRecordCash.textContent = `${recordCashWins} V / ${recordCashLosses} D`;
    valRecordTournament.textContent = `${recordTourneyWins} V / ${recordTourneyLosses} D`;
  }
})();
