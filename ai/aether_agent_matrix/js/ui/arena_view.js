/**
 * Aether Agent Matrix - Arena View
 * Controls the visual 3-pod debate stage (Debater A, Debater B, Judge),
 * glowing active speaker highlights, real-time streaming speech bubbles,
 * timeline transcript feed, audience voting bar, and final judge verdict.
 */

import { StreamWriter, renderMarkdown, escapeHtml } from '../utils/text_streamer.js';

export class ArenaView {
  /**
   * @param {Object} [options]
   * @param {Object} [options.selectors] - Custom DOM selectors
   * @param {Object} [options.elements] - Direct element references (test mocks)
   */
  constructor(options = {}) {
    this.selectors = {
      podA: '#pod-debater-a, [data-pod="debaterA"]',
      podB: '#pod-debater-b, [data-pod="debaterB"]',
      podJudge: '#pod-judge, [data-pod="judge"]',

      avatarA: '#avatar-debater-a, [data-avatar="debaterA"]',
      avatarB: '#avatar-debater-b, [data-avatar="debaterB"]',
      avatarJudge: '#avatar-judge, [data-avatar="judge"]',

      nameA: '#name-debater-a, [data-name="debaterA"]',
      nameB: '#name-debater-b, [data-name="debaterB"]',
      nameJudge: '#name-judge, [data-name="judge"]',

      roleA: '#role-debater-a, [data-role="debaterA"]',
      roleB: '#role-debater-b, [data-role="debaterB"]',
      roleJudge: '#role-judge, [data-role="judge"]',

      statusA: '#status-debater-a, [data-status="debaterA"]',
      statusB: '#status-debater-b, [data-status="debaterB"]',
      statusJudge: '#status-judge, [data-status="judge"]',

      bubbleA: '#bubble-debater-a, [data-bubble="debaterA"]',
      bubbleB: '#bubble-debater-b, [data-bubble="debaterB"]',
      bubbleJudge: '#bubble-judge, [data-bubble="judge"]',

      timelineFeed: '#timeline-feed, [data-timeline="feed"]',

      voteBarA: '#vote-bar-a, [data-vote-bar="debaterA"]',
      voteBarB: '#vote-bar-b, [data-vote-bar="debaterB"]',
      voteCountA: '#vote-count-a, [data-vote-count="debaterA"]',
      voteCountB: '#vote-count-b, [data-vote-count="debaterB"]',
      votePercentA: '#vote-pct-a, [data-vote-pct="debaterA"]',
      votePercentB: '#vote-pct-b, [data-vote-pct="debaterB"]',

      verdictModal: '#modal-verdict, [data-modal="verdict"]',
      verdictWinner: '#verdict-winner, [data-verdict="winner"]',
      verdictScoreA: '#verdict-score-a, [data-verdict="scoreA"]',
      verdictScoreB: '#verdict-score-b, [data-verdict="scoreB"]',
      verdictContent: '#verdict-content, [data-verdict="content"]',

      ...(options.selectors || {})
    };

    this.elements = options.elements || {};
    this.activeSpeaker = null;

    // Stream writers for each speaker pod
    this.streamWriters = {
      debaterA: new StreamWriter(this._getElement('bubbleA')),
      debaterB: new StreamWriter(this._getElement('bubbleB')),
      judge: new StreamWriter(this._getElement('bubbleJudge'))
    };

    // Stored personas
    this.personas = {
      debaterA: null,
      debaterB: null,
      judge: null
    };
  }

  /**
   * Resolves a DOM element safely across browser and test environments.
   * @param {string} key
   * @returns {HTMLElement|Object|null}
   * @private
   */
  _getElement(key) {
    if (this.elements && this.elements[key]) {
      return this.elements[key];
    }
    if (typeof document !== 'undefined' && document !== null && typeof document.querySelector === 'function') {
      const sel = this.selectors[key];
      if (sel) {
        return document.querySelector(sel);
      }
    }
    return null;
  }

  /**
   * Renders debater and judge cards/pods with their personas, avatars, names, and roles.
   * @param {Object} debaterA
   * @param {Object} debaterB
   * @param {Object} judge
   */
  renderDebaters(debaterA, debaterB, judge) {
    this.personas.debaterA = debaterA || null;
    this.personas.debaterB = debaterB || null;
    this.personas.judge = judge || null;

    // Pod Debater A
    if (debaterA) {
      const elAvatar = this._getElement('avatarA');
      if (elAvatar) elAvatar.textContent = debaterA.avatar || '🤖';

      const elName = this._getElement('nameA');
      if (elName) elName.textContent = debaterA.name || 'Debatedor A';

      const elRole = this._getElement('roleA');
      if (elRole) elRole.textContent = debaterA.role || debaterA.persona || 'A Favor';

      const elPod = this._getElement('podA');
      if (elPod && elPod.style && debaterA.color) {
        elPod.style.setProperty('--pod-accent-color', debaterA.color);
      }
    }

    // Pod Debater B
    if (debaterB) {
      const elAvatar = this._getElement('avatarB');
      if (elAvatar) elAvatar.textContent = debaterB.avatar || '🌿';

      const elName = this._getElement('nameB');
      if (elName) elName.textContent = debaterB.name || 'Debatedor B';

      const elRole = this._getElement('roleB');
      if (elRole) elRole.textContent = debaterB.role || debaterB.persona || 'Contra';

      const elPod = this._getElement('podB');
      if (elPod && elPod.style && debaterB.color) {
        elPod.style.setProperty('--pod-accent-color', debaterB.color);
      }
    }

    // Pod Judge
    if (judge) {
      const elAvatar = this._getElement('avatarJudge');
      if (elAvatar) elAvatar.textContent = judge.avatar || '⚖️';

      const elName = this._getElement('nameJudge');
      if (elName) elName.textContent = judge.name || 'Juiz Lexis';

      const elRole = this._getElement('roleJudge');
      if (elRole) elRole.textContent = judge.role || 'Árbitro Neutro';

      const elPod = this._getElement('podJudge');
      if (elPod && elPod.style && judge.color) {
        elPod.style.setProperty('--pod-accent-color', judge.color);
      }
    }

    // Reattach bubble elements to stream writers if needed
    this.streamWriters.debaterA.attachElement(this._getElement('bubbleA'));
    this.streamWriters.debaterB.attachElement(this._getElement('bubbleB'));
    this.streamWriters.judge.attachElement(this._getElement('bubbleJudge'));
  }

  /**
   * Sets the active speaker pod with glowing effect and status labels.
   * Removes speaking indicator from other pods.
   * @param {'debaterA'|'debaterB'|'judge'|string|null} agentKey
   * @param {string} [statusText='🎙️ Falando...']
   */
  setActiveSpeaker(agentKey, statusText = '🎙️ Falando...') {
    this.activeSpeaker = agentKey;

    const pods = {
      debaterA: { pod: this._getElement('podA'), status: this._getElement('statusA') },
      debaterB: { pod: this._getElement('podB'), status: this._getElement('statusB') },
      judge: { pod: this._getElement('podJudge'), status: this._getElement('statusJudge') }
    };

    // Normalize agentKey if persona id was passed
    let normalizedKey = agentKey;
    if (agentKey) {
      if (agentKey === 'debaterA' || agentKey === this.personas.debaterA?.id) normalizedKey = 'debaterA';
      else if (agentKey === 'debaterB' || agentKey === this.personas.debaterB?.id) normalizedKey = 'debaterB';
      else if (agentKey === 'judge' || agentKey === this.personas.judge?.id) normalizedKey = 'judge';
    }

    for (const [key, { pod, status }] of Object.entries(pods)) {
      const isCurrent = Boolean(normalizedKey && key === normalizedKey);

      if (pod && pod.classList) {
        if (isCurrent) {
          pod.classList.add('is-speaking', 'active');
        } else {
          pod.classList.remove('is-speaking', 'active');
        }
      }

      if (status) {
        status.textContent = isCurrent ? statusText : 'Aguardando';
      }
    }
  }

  /**
   * Clears speaking glow and resets all status badges to 'Aguardando'.
   */
  clearActiveSpeaker() {
    this.activeSpeaker = null;
    const pods = {
      debaterA: { pod: this._getElement('podA'), status: this._getElement('statusA') },
      debaterB: { pod: this._getElement('podB'), status: this._getElement('statusB') },
      judge: { pod: this._getElement('podJudge'), status: this._getElement('statusJudge') }
    };
    for (const { pod, status } of Object.values(pods)) {
      if (pod && pod.classList) {
        pod.classList.remove('is-speaking', 'active');
      }
      if (status) {
        status.textContent = 'Aguardando';
      }
    }
  }

  /**
   * Appends streaming token to the specified agent's speech bubble.
   * @param {'debaterA'|'debaterB'|'judge'|string} agentKey
   * @param {string} token
   */
  appendToken(agentKey, token) {
    let key = agentKey;
    if (agentKey === this.personas.debaterA?.id) key = 'debaterA';
    else if (agentKey === this.personas.debaterB?.id) key = 'debaterB';
    else if (agentKey === this.personas.judge?.id) key = 'judge';

    const writer = this.streamWriters[key];
    if (writer) {
      // Ensure element attached
      const bubbleMap = { debaterA: 'bubbleA', debaterB: 'bubbleB', judge: 'bubbleJudge' };
      writer.attachElement(this._getElement(bubbleMap[key]));
      writer.append(token);
    }
  }

  /**
   * Finalizes the current speaker's turn:
   * - Completes streaming and formats markdown in the active bubble
   * - Creates and appends an entry to the timeline transcript feed
   * - Auto-scrolls timeline feed to bottom
   * @param {Object} turnData
   * @param {string} [turnData.speaker] - 'debaterA' | 'debaterB' | 'judge'
   * @param {string} [turnData.speakerName]
   * @param {string} [turnData.turn] - State/Turn enum name (e.g. OPENING_A)
   * @param {number} [turnData.round]
   * @param {string} [turnData.content]
   * @param {string} [turnData.timestamp]
   * @param {Object} [turnData.persona]
   */
  finalizeTurn(turnData = {}) {
    let key = turnData.speaker || this.activeSpeaker || 'debaterA';
    if (key === this.personas.debaterA?.id) key = 'debaterA';
    else if (key === this.personas.debaterB?.id) key = 'debaterB';
    else if (key === this.personas.judge?.id) key = 'judge';

    const writer = this.streamWriters[key];
    let finalContent = turnData.content;

    if (writer) {
      if (!finalContent) {
        finalContent = writer.getText();
      }
      writer.complete(finalContent);
    }

    // Mark speaker status as completed
    const statusMap = { debaterA: 'statusA', debaterB: 'statusB', judge: 'statusJudge' };
    const statusEl = this._getElement(statusMap[key]);
    if (statusEl) {
      statusEl.textContent = '✓ Concluído';
    }

    // Add entry to timeline feed
    const timeline = this._getElement('timelineFeed');
    if (timeline) {
      const persona = turnData.persona || this.personas[key] || {};
      const speakerName = turnData.speakerName || persona.name || key;
      const avatar = persona.avatar || (key === 'judge' ? '⚖️' : key === 'debaterB' ? '🌿' : '🤖');
      const roundLabel = turnData.round ? `Rodada ${turnData.round}` : '';
      const turnLabel = turnData.turn ? String(turnData.turn).replace(/_/g, ' ') : 'Discurso';
      const timeStr = turnData.timestamp || new Date().toLocaleTimeString();
      const formattedHtml = renderMarkdown(finalContent || '');

      const entryHtml = `
        <div class="timeline-entry timeline-entry-${escapeHtml(key)}" data-turn="${escapeHtml(turnData.turn || '')}">
          <div class="timeline-header">
            <span class="timeline-avatar">${escapeHtml(avatar)}</span>
            <span class="timeline-speaker">${escapeHtml(speakerName)}</span>
            <span class="timeline-badge">${escapeHtml(turnLabel)}${roundLabel ? ` (${escapeHtml(roundLabel)})` : ''}</span>
            <span class="timeline-time">${escapeHtml(timeStr)}</span>
          </div>
          <div class="timeline-body">${formattedHtml}</div>
        </div>
      `;

      if (typeof timeline.insertAdjacentHTML === 'function') {
        timeline.insertAdjacentHTML('beforeend', entryHtml);
      } else if ('innerHTML' in timeline) {
        timeline.innerHTML += entryHtml;
      }

      // Auto-scroll to bottom
      if (typeof timeline.scrollTo === 'function') {
        timeline.scrollTo({ top: timeline.scrollHeight, behavior: 'smooth' });
      } else if ('scrollTop' in timeline) {
        timeline.scrollTop = timeline.scrollHeight;
      }
    }
  }

  /**
   * Updates audience voting percentages and count labels.
   * @param {Object} votes
   * @param {number} [votes.debaterA=0]
   * @param {number} [votes.debaterB=0]
   */
  updateVotes(votes = {}) {
    const vA = Math.max(0, Number(votes.debaterA) || 0);
    const vB = Math.max(0, Number(votes.debaterB) || 0);
    const total = vA + vB;

    let pctA = 50;
    let pctB = 50;

    if (total > 0) {
      pctA = Math.round((vA / total) * 100);
      pctB = 100 - pctA;
    }

    const barA = this._getElement('voteBarA');
    if (barA && barA.style) {
      barA.style.width = `${pctA}%`;
    }

    const barB = this._getElement('voteBarB');
    if (barB && barB.style) {
      barB.style.width = `${pctB}%`;
    }

    const cntA = this._getElement('voteCountA');
    if (cntA) {
      cntA.textContent = String(vA);
    }

    const cntB = this._getElement('voteCountB');
    if (cntB) {
      cntB.textContent = String(vB);
    }

    const pA = this._getElement('votePercentA');
    if (pA) {
      pA.textContent = `${pctA}%`;
    }

    const pB = this._getElement('votePercentB');
    if (pB) {
      pB.textContent = `${pctB}%`;
    }
  }

  /**
   * Renders the final judge verdict summary.
   * @param {Object} verdictData
   * @param {string} [verdictData.winner]
   * @param {string} [verdictData.winnerKey]
   * @param {Object} [verdictData.scores]
   * @param {string} [verdictData.verdict]
   */
  renderVerdict(verdictData = {}) {
    const modal = this._getElement('verdictModal');
    if (modal) {
      if (modal.classList) {
        modal.classList.remove('hidden', 'd-none');
        modal.classList.add('active', 'show');
      }
      if (modal.style) {
        modal.style.display = 'flex';
      }
    }

    const elWinner = this._getElement('verdictWinner');
    if (elWinner) {
      elWinner.textContent = verdictData.winner || 'Empate Técnico';
    }

    const elScoreA = this._getElement('verdictScoreA');
    if (elScoreA && verdictData.scores?.debaterA) {
      elScoreA.textContent = `${verdictData.scores.debaterA.score || 0}/100`;
    }

    const elScoreB = this._getElement('verdictScoreB');
    if (elScoreB && verdictData.scores?.debaterB) {
      elScoreB.textContent = `${verdictData.scores.debaterB.score || 0}/100`;
    }

    const elContent = this._getElement('verdictContent');
    if (elContent) {
      const rawVerdict = verdictData.verdict || '';
      if ('innerHTML' in elContent) {
        elContent.innerHTML = renderMarkdown(rawVerdict);
      } else {
        elContent.textContent = rawVerdict;
      }
    }
  }

  /**
   * Resets the entire arena view to initial state.
   */
  reset() {
    this.setActiveSpeaker(null);

    // Clear all stream writers and speech bubbles
    for (const writer of Object.values(this.streamWriters)) {
      writer.clear();
    }

    // Clear timeline feed
    const timeline = this._getElement('timelineFeed');
    if (timeline) {
      if ('innerHTML' in timeline) {
        timeline.innerHTML = '';
      } else if ('textContent' in timeline) {
        timeline.textContent = '';
      }
    }

    // Reset votes to 50/50
    this.updateVotes({ debaterA: 0, debaterB: 0 });

    // Hide verdict modal
    const modal = this._getElement('verdictModal');
    if (modal) {
      if (modal.classList) {
        modal.classList.add('hidden', 'd-none');
        modal.classList.remove('active', 'show');
      }
      if (modal.style) {
        modal.style.display = 'none';
      }
    }
  }
}
