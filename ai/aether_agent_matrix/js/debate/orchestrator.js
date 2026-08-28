/**
 * Aether Agent Matrix - Debate Orchestrator & Finite State Machine (FSM)
 * Coordinates turns between debaters and judge, manages streaming generation,
 * handles user moderation (pause, resume, audience questions, voting) and scoring.
 */

import { StateManager, appState, DEFAULT_TOPIC } from '../state.js?v=20260828c';
import { DEFAULT_PERSONAS, getPersona } from './personas.js?v=20260828c';
import { PromptBuilder, promptBuilder } from './prompt_builder.js?v=20260828c';
import { createEngine, MockEngine } from '../engine/engine_adapter.js?v=20260828c';

/**
 * Finite State Machine (FSM) States for Debate Orchestration.
 */
export const DEBATE_STATES = {
  IDLE: 'IDLE',
  INTRO: 'INTRO',
  OPENING_A: 'OPENING_A',
  OPENING_B: 'OPENING_B',
  REBUTTAL_A: 'REBUTTAL_A',
  REBUTTAL_B: 'REBUTTAL_B',
  AUDIENCE_INTERVENTION: 'AUDIENCE_INTERVENTION',
  CLOSING_A: 'CLOSING_A',
  CLOSING_B: 'CLOSING_B',
  JUDGE_VERDICT: 'JUDGE_VERDICT',
  COMPLETED: 'COMPLETED'
};

export const STATES = DEBATE_STATES;

/**
 * Extracts numeric scores (0-100) and winner from judge's evaluation text.
 * @param {string} verdictText
 * @param {Object} debaterA
 * @param {Object} debaterB
 * @returns {{ debaterA: { id: string, name: string, score: number }, debaterB: { id: string, name: string, score: number }, winner: string, winnerKey: string, raw: string }}
 */
export function parseJudgeScores(verdictText, debaterA = DEFAULT_PERSONAS.debaterA, debaterB = DEFAULT_PERSONAS.debaterB) {
  const nameA = debaterA?.name || 'Dr. Marcus Vance';
  const nameB = debaterB?.name || 'Dra. Helena Rios';

  const result = {
    debaterA: {
      id: debaterA?.id || 'debaterA',
      name: nameA,
      score: 75
    },
    debaterB: {
      id: debaterB?.id || 'debaterB',
      name: nameB,
      score: 75
    },
    winner: 'Empate Técnico',
    winnerKey: 'tie',
    raw: verdictText || ''
  };

  if (!verdictText || typeof verdictText !== 'string') {
    return result;
  }

  const text = verdictText;

  // Clean prefixes/titles from names
  const cleanNameA = nameA.replace(/^(Dr\.|Dra\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, '').trim();
  const firstNameA = cleanNameA.split(/\s+/)[0] || nameA;
  const lastNameA = cleanNameA.split(/\s+/).slice(-1)[0] || nameA;

  const cleanNameB = nameB.replace(/^(Dr\.|Dra\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, '').trim();
  const firstNameB = cleanNameB.split(/\s+/)[0] || nameB;
  const lastNameB = cleanNameB.split(/\s+/).slice(-1)[0] || nameB;

  // Escape regex special chars
  const esc = (s) => s ? s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';

  // 1. Try finding explicit scores for Debater A (limit distance to 20 chars so we don't cross to other debaters)
  const aliasesA = [esc(nameA), esc(cleanNameA), esc(firstNameA), esc(lastNameA), 'debaterA', 'Debatedor A'].filter(Boolean);
  const patternA = new RegExp(`(?:${aliasesA.join('|')})[^\n\d]{0,25}?(\\d{1,3})(?:\\s*\\/\\s*100|\\s*pontos|\\b)`, 'i');
  const matchA = text.match(patternA);
  if (matchA && matchA[1]) {
    const s = parseInt(matchA[1], 10);
    if (!isNaN(s) && s >= 0 && s <= 100) {
      result.debaterA.score = s;
    }
  }

  // 2. Try finding explicit scores for Debater B (limit distance to 20 chars)
  const aliasesB = [esc(nameB), esc(cleanNameB), esc(firstNameB), esc(lastNameB), 'debaterB', 'Debatedor B'].filter(Boolean);
  const patternB = new RegExp(`(?:${aliasesB.join('|')})[^\n\d]{0,25}?(\\d{1,3})(?:\\s*\\/\\s*100|\\s*pontos|\\b)`, 'i');
  const matchB = text.match(patternB);
  if (matchB && matchB[1]) {
    const s = parseInt(matchB[1], 10);
    if (!isNaN(s) && s >= 0 && s <= 100) {
      result.debaterB.score = s;
    }
  }

  // 3. Fallback: Find general score lines like "[Nota]/100" in order
  if (!matchA || !matchB) {
    const scoreMatches = [...text.matchAll(/(\d{1,3})\s*\/\s*100/g)];
    if (scoreMatches.length >= 2) {
      if (!matchA) {
        const s0 = parseInt(scoreMatches[0][1], 10);
        if (!isNaN(s0) && s0 >= 0 && s0 <= 100) result.debaterA.score = s0;
      }
      if (!matchB) {
        const s1 = parseInt(scoreMatches[1][1], 10);
        if (!isNaN(s1) && s1 >= 0 && s1 <= 100) result.debaterB.score = s1;
      }
    }
  }

  // 4. Winner parsing (allow dots in names like Dr./Dra. Helena Rios)
  const winnerMatch = text.match(/(?:###\s*)?(?:Vencedor|Winner|Vencedora|Resultado)\s*:\s*([^\n\r,;]+?)(?:\s*(?:\.\s+[A-Z]|\.$|\n|\r|$))/i)
    || text.match(/(?:###\s*)?(?:Vencedor|Winner|Vencedora|Resultado)\s*:\s*([^\n\r]+)/i);
  const declaredWinner = winnerMatch ? winnerMatch[1].replace(/[*_#`\[\]]/g, '').trim() : '';

  const cleanDeclared = declaredWinner.toLowerCase();
  const lowerNameA = nameA.toLowerCase();
  const lowerCleanA = cleanNameA.toLowerCase();
  const lowerNameB = nameB.toLowerCase();
  const lowerCleanB = cleanNameB.toLowerCase();
  const lowerFirstA = firstNameA.toLowerCase();
  const lowerFirstB = firstNameB.toLowerCase();
  const lowerLastA = lastNameA.toLowerCase();
  const lowerLastB = lastNameB.toLowerCase();

  if (cleanDeclared.includes('empate') || cleanDeclared.includes('tie')) {
    result.winner = 'Empate Técnico';
    result.winnerKey = 'tie';
  } else if (
    cleanDeclared.includes(lowerNameA) ||
    cleanDeclared.includes(lowerCleanA) ||
    cleanDeclared.includes(lowerFirstA) ||
    cleanDeclared.includes(lowerLastA) ||
    cleanDeclared.includes('debatera')
  ) {
    result.winner = nameA;
    result.winnerKey = 'debaterA';
  } else if (
    cleanDeclared.includes(lowerNameB) ||
    cleanDeclared.includes(lowerCleanB) ||
    cleanDeclared.includes(lowerFirstB) ||
    cleanDeclared.includes(lowerLastB) ||
    cleanDeclared.includes('debaterb')
  ) {
    result.winner = nameB;
    result.winnerKey = 'debaterB';
  } else {
    // Determine winner based on scores
    if (result.debaterA.score > result.debaterB.score) {
      result.winner = nameA;
      result.winnerKey = 'debaterA';
    } else if (result.debaterB.score > result.debaterA.score) {
      result.winner = nameB;
      result.winnerKey = 'debaterB';
    } else {
      result.winner = 'Empate Técnico';
      result.winnerKey = 'tie';
    }
  }

  return result;
}

/**
 * DebateOrchestrator FSM and turn execution manager.
 */
export class DebateOrchestrator {
  static STATES = DEBATE_STATES;
  static parseJudgeScores = parseJudgeScores;

  /**
   * @param {Object} [options]
   * @param {Object} [options.engine] - LLMEngineAdapter instance
   * @param {StateManager} [options.state] - StateManager instance
   * @param {PromptBuilder} [options.promptBuilder] - PromptBuilder instance
   */
  constructor({ engine = null, state = null, promptBuilder: pb = null } = {}) {
    this.engine = engine || (typeof createEngine === 'function' ? createEngine('mock') : new MockEngine());
    this.state = state || appState;
    this.promptBuilder = pb || promptBuilder;

    this.currentState = DEBATE_STATES.IDLE;
    this.isPaused = false;
    this.autoplay = true;
    this.turnDelayMs = 2000;
    this.timer = null;
    this.isGenerating = false;

    this.topic = DEFAULT_TOPIC;
    this.activeDebaters = {
      debaterA: { ...DEFAULT_PERSONAS.debaterA },
      debaterB: { ...DEFAULT_PERSONAS.debaterB },
      judge: { ...DEFAULT_PERSONAS.judge }
    };

    this.hasAudienceQuestion = false;
    this.pendingAudienceQuestion = null;
    this.verdict = null;
    this.scores = null;

    this._listeners = new Map();
  }

  /**
   * Sets or updates the active inference engine.
   * @param {Object} engine
   */
  setEngine(engine) {
    if (engine) {
      this.engine = engine;
    }
  }

  /**
   * Registers an event callback hook.
   * @param {string} event
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);

    return () => this.off(event, callback);
  }

  /**
   * Removes an event callback hook.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    const set = this._listeners.get(event);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  /**
   * Emits an event to registered listeners.
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    const set = this._listeners.get(event);
    if (set) {
      set.forEach(cb => {
        try {
          cb(data, event);
        } catch (err) {
          console.error(`Error in DebateOrchestrator listener for "${event}":`, err);
        }
      });
    }

    const wildcard = this._listeners.get('*');
    if (wildcard) {
      wildcard.forEach(cb => {
        try {
          cb(event, data);
        } catch (err) {
          console.error(`Error in DebateOrchestrator wildcard listener:`, err);
        }
      });
    }
  }

  /**
   * Starts a new debate session.
   * Supports both object params and positional params.
   * @param {Object|string} optionsOrTopic
   * @param {Object} [maybeDebaterA]
   * @param {Object} [maybeDebaterB]
   * @param {Object} [maybeJudge]
   */
  async startDebate(optionsOrTopic = {}, maybeDebaterA = null, maybeDebaterB = null, maybeJudge = null) {
    let opts = {};
    if (typeof optionsOrTopic === 'string') {
      opts = {
        topic: optionsOrTopic,
        debaterA: maybeDebaterA,
        debaterB: maybeDebaterB,
        judge: maybeJudge
      };
    } else if (optionsOrTopic && typeof optionsOrTopic === 'object') {
      opts = optionsOrTopic;
    }

    const {
      topic = this.state.get('topic') || DEFAULT_TOPIC,
      debaterA = this.state.get('activeDebaters.debaterA') || DEFAULT_PERSONAS.debaterA,
      debaterB = this.state.get('activeDebaters.debaterB') || DEFAULT_PERSONAS.debaterB,
      judge = this.state.get('activeDebaters.judge') || DEFAULT_PERSONAS.judge,
      autoplay = true,
      turnDelayMs = 2000,
      manualScheduleTurnEnd = false
    } = opts;

    this.reset();

    this.topic = topic;
    this.activeDebaters = {
      debaterA: { ...debaterA },
      debaterB: { ...debaterB },
      judge: { ...judge }
    };
    this.autoplay = autoplay;
    this.turnDelayMs = turnDelayMs;
    this.manualScheduleTurnEnd = Boolean(manualScheduleTurnEnd);
    this.isPaused = false;

    // Sync state
    this.state.set('topic', this.topic);
    this.state.set('activeDebaters', this.activeDebaters);
    this.state.set('currentRoundIndex', 0);
    this.state.set('isPaused', false);
    this.state.set('isIntervening', false);

    const previousState = this.currentState;
    this.currentState = DEBATE_STATES.INTRO;
    this.state.set('currentTurn', DEBATE_STATES.INTRO);

    this.emit('stateChange', {
      state: DEBATE_STATES.INTRO,
      previousState,
      topic: this.topic,
      activeDebaters: this.activeDebaters
    });

    if (this.autoplay && !this.isPaused) {
      if (this.turnDelayMs > 0) {
        this.timer = setTimeout(() => {
          this.timer = null;
          if (!this.isPaused && this.currentState !== DEBATE_STATES.COMPLETED) {
            this.nextTurn().catch(err => this.emit('error', { error: err.message, state: this.currentState }));
          }
        }, this.turnDelayMs);
      } else {
        await this.nextTurn();
      }
    }

    return this;
  }

  /**
   * Computes the next state in the debate FSM.
   * @param {string} current
   * @returns {string}
   */
  _getNextState(current) {
    switch (current) {
      case DEBATE_STATES.IDLE:
      case DEBATE_STATES.INTRO:
        return DEBATE_STATES.OPENING_A;

      case DEBATE_STATES.OPENING_A:
        return DEBATE_STATES.OPENING_B;

      case DEBATE_STATES.OPENING_B:
        return DEBATE_STATES.REBUTTAL_A;

      case DEBATE_STATES.REBUTTAL_A:
        return DEBATE_STATES.REBUTTAL_B;

      case DEBATE_STATES.REBUTTAL_B:
        return this.hasAudienceQuestion
          ? DEBATE_STATES.AUDIENCE_INTERVENTION
          : DEBATE_STATES.CLOSING_A;

      case DEBATE_STATES.AUDIENCE_INTERVENTION:
        return DEBATE_STATES.CLOSING_A;

      case DEBATE_STATES.CLOSING_A:
        return DEBATE_STATES.CLOSING_B;

      case DEBATE_STATES.CLOSING_B:
        return DEBATE_STATES.JUDGE_VERDICT;

      case DEBATE_STATES.JUDGE_VERDICT:
        return DEBATE_STATES.COMPLETED;

      case DEBATE_STATES.COMPLETED:
      default:
        return DEBATE_STATES.COMPLETED;
    }
  }

  /**
   * Executes generation for the active turn using PromptBuilder and engine.generateStream.
   * Updates state with streaming tokens and appends finalized turn entry to transcriptHistory.
   * Schedules the next turn if autoplay is active and not paused.
   * @returns {Promise<Object|null>} Turn entry object
   */
  async nextTurn() {
    if (this.isGenerating) {
      return null;
    }

    if (this.currentState === DEBATE_STATES.COMPLETED) {
      return null;
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const previousState = this.currentState;
    const nextState = this._getNextState(this.currentState);

    if (nextState === DEBATE_STATES.COMPLETED && this.currentState === DEBATE_STATES.COMPLETED) {
      return null;
    }

    this.currentState = nextState;
    this.state.set('currentTurn', nextState);

    // Determine speaker and round
    let speakerKey = 'debaterA';
    let activePersona = this.activeDebaters.debaterA;
    let roundIndex = 1;
    let stance = 'favor';

    switch (nextState) {
      case DEBATE_STATES.OPENING_A:
        speakerKey = 'debaterA';
        activePersona = this.activeDebaters.debaterA;
        roundIndex = 1;
        stance = 'favor';
        break;

      case DEBATE_STATES.OPENING_B:
        speakerKey = 'debaterB';
        activePersona = this.activeDebaters.debaterB;
        roundIndex = 1;
        stance = 'against';
        break;

      case DEBATE_STATES.REBUTTAL_A:
        speakerKey = 'debaterA';
        activePersona = this.activeDebaters.debaterA;
        roundIndex = 2;
        break;

      case DEBATE_STATES.REBUTTAL_B:
        speakerKey = 'debaterB';
        activePersona = this.activeDebaters.debaterB;
        roundIndex = 2;
        break;

      case DEBATE_STATES.AUDIENCE_INTERVENTION: {
        const targetId = this.pendingAudienceQuestion?.targetAgentId || 'debaterB';
        if (targetId === 'debaterA' || targetId === this.activeDebaters.debaterA?.id) {
          speakerKey = 'debaterA';
          activePersona = this.activeDebaters.debaterA;
        } else {
          speakerKey = 'debaterB';
          activePersona = this.activeDebaters.debaterB;
        }
        roundIndex = 2;
        break;
      }

      case DEBATE_STATES.CLOSING_A:
        speakerKey = 'debaterA';
        activePersona = this.activeDebaters.debaterA;
        roundIndex = 3;
        break;

      case DEBATE_STATES.CLOSING_B:
        speakerKey = 'debaterB';
        activePersona = this.activeDebaters.debaterB;
        roundIndex = 3;
        break;

      case DEBATE_STATES.JUDGE_VERDICT:
        speakerKey = 'judge';
        activePersona = this.activeDebaters.judge;
        roundIndex = 3;
        break;

      default:
        break;
    }

    this.state.set('currentRoundIndex', roundIndex);

    this.emit('stateChange', {
      state: nextState,
      previousState,
      speaker: speakerKey,
      persona: activePersona,
      round: roundIndex
    });

    this.emit('turnStart', {
      state: nextState,
      speaker: speakerKey,
      persona: activePersona,
      round: roundIndex
    });

    // Build prompt messages based on state
    const transcriptHistory = this.state.get('transcriptHistory') || [];
    let messages = [];

    if (nextState === DEBATE_STATES.OPENING_A || nextState === DEBATE_STATES.OPENING_B) {
      messages = this.promptBuilder.buildOpeningPrompt(activePersona, this.topic, stance);
    } else if (nextState === DEBATE_STATES.REBUTTAL_A) {
      const opponentPersona = this.activeDebaters.debaterB;
      const lastOpponentTurn = [...transcriptHistory].reverse().find(t => t.speaker === 'debaterB');
      const opponentArgument = lastOpponentTurn?.content || 'A regulação e a desaceleração são imperativos morais.';
      messages = this.promptBuilder.buildRebuttalPrompt(
        activePersona,
        opponentPersona,
        opponentArgument,
        this.topic,
        transcriptHistory,
        roundIndex
      );
    } else if (nextState === DEBATE_STATES.REBUTTAL_B) {
      const opponentPersona = this.activeDebaters.debaterA;
      const lastOpponentTurn = [...transcriptHistory].reverse().find(t => t.speaker === 'debaterA');
      const opponentArgument = lastOpponentTurn?.content || 'A inovação tecnológica acelera o bem-estar da humanidade.';
      messages = this.promptBuilder.buildRebuttalPrompt(
        activePersona,
        opponentPersona,
        opponentArgument,
        this.topic,
        transcriptHistory,
        roundIndex
      );
    } else if (nextState === DEBATE_STATES.CLOSING_A) {
      messages = this.promptBuilder.buildClosingPrompt(
        activePersona,
        this.activeDebaters.debaterB,
        this.topic,
        transcriptHistory
      );
    } else if (nextState === DEBATE_STATES.CLOSING_B) {
      messages = this.promptBuilder.buildClosingPrompt(
        activePersona,
        this.activeDebaters.debaterA,
        this.topic,
        transcriptHistory
      );
    } else if (nextState === DEBATE_STATES.AUDIENCE_INTERVENTION) {
      const question = this.pendingAudienceQuestion?.question || 'Como você responde aos questionamentos e riscos levantados pelo público?';
      messages = this.promptBuilder.buildAudienceResponsePrompt(
        activePersona,
        question,
        this.topic,
        transcriptHistory
      );
      this.hasAudienceQuestion = false;
      this.pendingAudienceQuestion = null;
      this.state.set('isIntervening', false);
    } else if (nextState === DEBATE_STATES.JUDGE_VERDICT) {
      messages = this.promptBuilder.buildJudgeVerdictPrompt(
        activePersona,
        this.activeDebaters.debaterA,
        this.activeDebaters.debaterB,
        transcriptHistory,
        this.topic
      );
    }

    // Execute streaming generation
    this.isGenerating = true;
    let accumulatedText = '';
    let genResult = null;

    try {
      if (!this.engine.isLoaded()) {
        const modelId = this.state.get('selectedModel') || 'SmolLM2-360M-Instruct-q4f16_1-MLC';
        await this.engine.init(modelId);
      }

      const maxTokens = nextState === DEBATE_STATES.JUDGE_VERDICT
        ? (this.state.get('settings.maxTokensJudge') || 150)
        : (this.state.get('settings.maxTokensPerTurn') || 75);

      const audienceVotes = this.state.get('audienceVotes') || { debaterA: 0, debaterB: 0 };
      const tokenDelay = (this.turnDelayMs !== null && this.turnDelayMs <= 10) ? 1 : (this.tokenDelayMs || 35);

      genResult = await this.engine.generateStream(
        messages,
        {
          temperature: 0.7,
          max_tokens: maxTokens,
          votes: audienceVotes,
          tokenDelayMs: tokenDelay
        },
        (token, fullText, stats) => {
          accumulatedText = fullText;
          if (stats?.tokensPerSec) {
            this.state.set('telemetry.tokensPerSec', stats.tokensPerSec);
          }
          this.emit('token', {
            token,
            fullText,
            stats,
            state: nextState,
            speaker: speakerKey,
            persona: activePersona
          });
        }
      );
    } catch (err) {
      this.isGenerating = false;
      this.emit('error', {
        error: err.message || String(err),
        state: nextState,
        speaker: speakerKey
      });
      throw err;
    } finally {
      this.isGenerating = false;
    }

    const finalText = genResult?.fullText || accumulatedText;

    // Update telemetry in state
    if (genResult?.timeMs) {
      this.state.set('telemetry.turnTimeMs', genResult.timeMs);
    }
    if (genResult?.tokensPerSec) {
      this.state.set('telemetry.tokensPerSec', genResult.tokensPerSec);
    }

    // Build finalized turn entry
    const turnEntry = {
      turn: nextState,
      speaker: speakerKey,
      speakerName: activePersona.name,
      role: activePersona.role,
      persona: { ...activePersona },
      content: finalText,
      round: roundIndex,
      timestamp: Date.now(),
      stats: {
        tokensGenerated: genResult?.tokensGenerated || 0,
        tokensPerSec: genResult?.tokensPerSec || 0,
        timeMs: genResult?.timeMs || 0
      }
    };

    // If Judge verdict, parse scores and complete debate
    if (nextState === DEBATE_STATES.JUDGE_VERDICT) {
      const scores = parseJudgeScores(finalText, this.activeDebaters.debaterA, this.activeDebaters.debaterB);
      turnEntry.scores = scores;
      this.scores = scores;
      this.verdict = finalText;

      const prevVerdictState = this.currentState;
      this.currentState = DEBATE_STATES.COMPLETED;
      this.state.set('currentTurn', DEBATE_STATES.COMPLETED);

      this.emit('stateChange', {
        state: DEBATE_STATES.COMPLETED,
        previousState: prevVerdictState,
        scores,
        verdict: finalText
      });
    }

    // Append to transcriptHistory
    const updatedHistory = this.state.get('transcriptHistory') || [];
    updatedHistory.push(turnEntry);
    this.state.set('transcriptHistory', updatedHistory);

    this.emit('turnEnd', {
      state: nextState,
      entry: turnEntry,
      isCompleted: this.currentState === DEBATE_STATES.COMPLETED
    });

    if (this.currentState === DEBATE_STATES.COMPLETED) {
      this.emit('debateComplete', {
        transcript: updatedHistory,
        scores: this.scores,
        verdict: this.verdict
      });
    } else if (this.autoplay && !this.isPaused && !this.manualScheduleTurnEnd) {
      this.scheduleNextTurn();
    }

    return turnEntry;
  }

  /**
   * Schedules next turn execution with customizable delay.
   * @param {number|null} [delayMs=null]
   */
  scheduleNextTurn(delayMs = null) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.autoplay && !this.isPaused && this.currentState !== DEBATE_STATES.COMPLETED) {
      const wait = delayMs !== null ? delayMs : this.turnDelayMs;
      this.timer = setTimeout(() => {
        this.timer = null;
        if (!this.isPaused && this.currentState !== DEBATE_STATES.COMPLETED) {
          this.nextTurn().catch(err => this.emit('error', { error: err.message, state: this.currentState }));
        }
      }, wait);
    }
  }

  /**
   * Pauses the debate and clears the autoplay timer.
   */
  pause() {
    this.isPaused = true;
    this.state.set('isPaused', true);

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.emit('pause', { state: this.currentState });
  }

  /**
   * Resumes the debate from the current state.
   */
  resume() {
    this.isPaused = false;
    this.state.set('isPaused', false);

    this.emit('resume', { state: this.currentState });

    if (!this.isGenerating && this.currentState !== DEBATE_STATES.COMPLETED && this.currentState !== DEBATE_STATES.IDLE) {
      if (this.turnDelayMs > 0) {
        this.timer = setTimeout(() => {
          this.timer = null;
          if (!this.isPaused && this.currentState !== DEBATE_STATES.COMPLETED) {
            this.nextTurn().catch(err => this.emit('error', { error: err.message, state: this.currentState }));
          }
        }, this.turnDelayMs);
      } else {
        this.nextTurn().catch(err => this.emit('error', { error: err.message, state: this.currentState }));
      }
    }
  }

  /**
   * Queues an audience question intervention.
   * @param {string} question
   * @param {string} [targetAgentId] - 'debaterA', 'debaterB', or persona id
   */
  injectAudienceQuestion(question, targetAgentId = 'debaterB') {
    if (!question || typeof question !== 'string') {
      throw new Error('Question must be a non-empty string');
    }

    this.hasAudienceQuestion = true;
    this.pendingAudienceQuestion = {
      question: question.trim(),
      targetAgentId
    };
    this.state.set('isIntervening', true);

    this.emit('audienceInterventionQueued', {
      question: this.pendingAudienceQuestion.question,
      targetAgentId
    });
  }

  /**
   * Increments audience vote for 'debaterA' or 'debaterB'.
   * @param {string} agentKey - 'debaterA', 'debaterB', or persona id
   * @returns {{ debaterA: number, debaterB: number }}
   */
  vote(agentKey) {
    const votes = this.state.get('audienceVotes') || { debaterA: 0, debaterB: 0 };

    if (agentKey === 'debaterA' || agentKey === this.activeDebaters.debaterA?.id) {
      votes.debaterA = (votes.debaterA || 0) + 1;
    } else if (agentKey === 'debaterB' || agentKey === this.activeDebaters.debaterB?.id) {
      votes.debaterB = (votes.debaterB || 0) + 1;
    } else {
      // Default to debaterA if unrecognized
      votes.debaterA = (votes.debaterA || 0) + 1;
    }

    this.state.set('audienceVotes', votes);
    this.emit('vote', { agentKey, votes });
    return votes;
  }

  /**
   * Resets the orchestrator, halts generation, clears timers, and resets state to IDLE.
   */
  reset() {
    if (this.isGenerating && this.engine && typeof this.engine.abort === 'function') {
      try {
        this.engine.abort();
      } catch (e) {
        console.warn('Error aborting engine on reset:', e);
      }
    }

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const previousState = this.currentState;
    this.currentState = DEBATE_STATES.IDLE;
    this.isPaused = false;
    this.isGenerating = false;
    this.hasAudienceQuestion = false;
    this.pendingAudienceQuestion = null;
    this.verdict = null;
    this.scores = null;

    this.state.resetDebate();

    this.emit('stateChange', {
      state: DEBATE_STATES.IDLE,
      previousState
    });
    this.emit('reset', { state: DEBATE_STATES.IDLE });
  }

  /**
   * Extracts scores from verdict text using instance persona context.
   * @param {string} verdictText
   * @returns {Object}
   */
  parseJudgeScores(verdictText) {
    return parseJudgeScores(verdictText, this.activeDebaters.debaterA, this.activeDebaters.debaterB);
  }

  /**
   * Gets current FSM state.
   * @returns {string}
   */
  getState() {
    return this.currentState;
  }

  /**
   * Gets recorded transcript history.
   * @returns {Array<Object>}
   */
  getTranscript() {
    return this.state.get('transcriptHistory') || [];
  }

  /**
   * Gets parsed judge scores if verdict has occurred.
   * @returns {Object|null}
   */
  getScores() {
    return this.scores;
  }

  /**
   * Gets judge verdict text.
   * @returns {string|null}
   */
  getVerdict() {
    return this.verdict;
  }
}

export const debateOrchestrator = new DebateOrchestrator();
export default DebateOrchestrator;
