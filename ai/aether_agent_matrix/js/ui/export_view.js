/**
 * Aether Agent Matrix - Export View
 * Generates and downloads comprehensive structured Markdown reports and JSON data
 * of debate sessions, including personas, audience votes, timeline turns, and judge verdict.
 */

export class ExportView {
  /**
   * Generates a complete, publication-ready Markdown transcript of the debate session.
   * @param {Object} sessionData
   * @param {string} [sessionData.topic]
   * @param {string} [sessionData.selectedModel]
   * @param {string} [sessionData.backend]
   * @param {number} [sessionData.rounds]
   * @param {Object} [sessionData.activeDebaters]
   * @param {Object} [sessionData.audienceVotes]
   * @param {Array<Object>} [sessionData.transcript]
   * @param {Object} [sessionData.scores]
   * @param {string} [sessionData.verdict]
   * @param {string} [sessionData.timestamp]
   * @returns {string}
   */
  static generateMarkdown(sessionData = {}) {
    const topic = sessionData.topic || 'Tema não especificado';
    const model = sessionData.selectedModel || 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
    const backend = sessionData.backend || 'WebGPU';
    const rounds = sessionData.rounds || 3;
    const dateStr = sessionData.timestamp || new Date().toISOString();

    const debA = sessionData.activeDebaters?.debaterA || { name: 'Dr. Marcus Vance', role: 'A Favor', avatar: '🤖' };
    const debB = sessionData.activeDebaters?.debaterB || { name: 'Dra. Helena Rios', role: 'Contra', avatar: '🌿' };
    const judge = sessionData.activeDebaters?.judge || { name: 'Lexis-9', role: 'Árbitro Neutro', avatar: '⚖️' };

    const votes = sessionData.audienceVotes || { debaterA: 0, debaterB: 0 };
    const vA = votes.debaterA || 0;
    const vB = votes.debaterB || 0;
    const totalVotes = vA + vB;
    const pctA = totalVotes > 0 ? Math.round((vA / totalVotes) * 100) : 50;
    const pctB = totalVotes > 0 ? 100 - pctA : 50;

    const transcript = sessionData.transcript || sessionData.transcriptHistory || [];
    const scores = sessionData.scores || {};
    const verdict = sessionData.verdict || 'Veredito não registrado.';
    const winner = scores.winner || (scores.winnerKey === 'debaterA' ? debA.name : scores.winnerKey === 'debaterB' ? debB.name : 'Empate Técnico');

    let md = `# Aether Agent Matrix — Relatório do Debate\n\n`;
    md += `**Tema:** ${topic}\n`;
    md += `**Data/Hora:** ${dateStr}\n`;
    md += `**Modelo LLM:** \`${model}\` | **Backend:** \`${backend}\` | **Rodadas:** ${rounds}\n\n`;

    md += `---\n\n`;
    md += `## 👥 Participantes\n\n`;
    md += `- **${debA.avatar || '🤖'} ${debA.name}** (${debA.role || 'A Favor'}): ${debA.persona || debA.description || 'Debatedor A'}\n`;
    md += `- **${debB.avatar || '🌿'} ${debB.name}** (${debB.role || 'Contra'}): ${debB.persona || debB.description || 'Debatedor B'}\n`;
    md += `- **${judge.avatar || '⚖️'} ${judge.name}** (${judge.role || 'Juiz'}): ${judge.persona || judge.description || 'Árbitro Sintético'}\n\n`;

    md += `---\n\n`;
    md += `## 🗳️ Votação do Público\n\n`;
    md += `- **${debA.name}:** ${vA} votos (${pctA}%)\n`;
    md += `- **${debB.name}:** ${vB} votos (${pctB}%)\n`;
    md += `- **Total de Votos:** ${totalVotes}\n\n`;

    md += `---\n\n`;
    md += `## 📜 Transcrição Completa\n\n`;

    if (transcript.length === 0) {
      md += `*(Nenhuma fala registrada no debate)*\n\n`;
    } else {
      transcript.forEach((turn, idx) => {
        const speakerKey = turn.speaker || 'debaterA';
        const persona = turn.persona || (speakerKey === 'debaterA' ? debA : speakerKey === 'debaterB' ? debB : judge);
        const name = turn.speakerName || persona.name || speakerKey;
        const avatar = persona.avatar || '💬';
        const roundNum = turn.round || 1;
        const turnLabel = turn.turn ? String(turn.turn).replace(/_/g, ' ') : `Turno ${idx + 1}`;
        const time = turn.timestamp || '';

        md += `### ${avatar} [${turnLabel}] ${name}${roundNum ? ` (Rodada ${roundNum})` : ''}\n`;
        if (time) md += `*${time}*\n\n`;
        md += `${(turn.content || '').trim()}\n\n`;
      });
    }

    md += `---\n\n`;
    md += `## ⚖️ Veredito do Juiz & Pontuação\n\n`;
    md += `**🏆 Vencedor Oficial:** **${winner}**\n\n`;

    if (scores.debaterA || scores.debaterB) {
      md += `### Pontuação:\n`;
      if (scores.debaterA) {
        md += `- **${debA.name}:** ${scores.debaterA.score || 0}/100`;
        if (scores.debaterA.reasoning) md += ` — *${scores.debaterA.reasoning}*`;
        md += `\n`;
      }
      if (scores.debaterB) {
        md += `- **${debB.name}:** ${scores.debaterB.score || 0}/100`;
        if (scores.debaterB.reasoning) md += ` — *${scores.debaterB.reasoning}*`;
        md += `\n`;
      }
      md += `\n`;
    }

    md += `### Avaliação Final:\n\n`;
    md += `${verdict.trim()}\n`;

    return md;
  }

  /**
   * Generates a structured JSON string representation of the debate session.
   * @param {Object} sessionData
   * @returns {string}
   */
  static generateJSON(sessionData = {}) {
    const formatted = {
      metadata: {
        title: 'Aether Agent Matrix Debate Session',
        exportedAt: new Date().toISOString(),
        topic: sessionData.topic || '',
        model: sessionData.selectedModel || '',
        backend: sessionData.backend || 'webgpu',
        rounds: sessionData.rounds || 3,
        sessionTimestamp: sessionData.timestamp || null
      },
      debaters: sessionData.activeDebaters || {},
      audienceVotes: sessionData.audienceVotes || { debaterA: 0, debaterB: 0 },
      transcript: sessionData.transcript || sessionData.transcriptHistory || [],
      verdict: {
        scores: sessionData.scores || null,
        verdictText: sessionData.verdict || ''
      }
    };

    return JSON.stringify(formatted, null, 2);
  }

  /**
   * Triggers browser download of the debate transcript as a Markdown (.md) file.
   * @param {Object} sessionData
   * @param {string} [filename='aether_debate_transcript.md']
   * @returns {boolean}
   */
  static downloadMarkdown(sessionData, filename = 'aether_debate_transcript.md') {
    const markdown = ExportView.generateMarkdown(sessionData);
    return ExportView._triggerDownload(markdown, filename, 'text/markdown;charset=utf-8');
  }

  /**
   * Triggers browser download of the debate session data as a JSON (.json) file.
   * @param {Object} sessionData
   * @param {string} [filename='aether_debate_session.json']
   * @returns {boolean}
   */
  static downloadJSON(sessionData, filename = 'aether_debate_session.json') {
    const json = ExportView.generateJSON(sessionData);
    return ExportView._triggerDownload(json, filename, 'application/json;charset=utf-8');
  }

  /**
   * Copies the full formatted Markdown transcript to the user's system clipboard.
   * @param {Object} sessionData
   * @returns {Promise<boolean>}
   */
  static async copyTranscriptToClipboard(sessionData) {
    const text = ExportView.generateMarkdown(sessionData);

    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn('Clipboard writeText failed:', err);
      }
    }

    // Fallback using textarea execCommand if in browser
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return Boolean(success);
      } catch (e) {
        console.warn('execCommand copy fallback failed:', e);
      }
    }

    return false;
  }

  /**
   * Helper to trigger browser file downloads safely.
   * @param {string} content
   * @param {string} filename
   * @param {string} mimeType
   * @returns {boolean}
   * @private
   */
  static _triggerDownload(content, filename, mimeType) {
    if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof document === 'undefined') {
      return false;
    }

    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      console.warn('Download triggering failed:', err);
      return false;
    }
  }
}
