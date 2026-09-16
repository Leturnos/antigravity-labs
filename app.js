function showView(viewId) {
  const views = document.querySelectorAll('.dashboard-view');
  let target = document.getElementById(viewId);
  
  // Fallback to categories view if the target doesn't exist
  if (!target) {
    viewId = 'view-categories';
    target = document.getElementById(viewId);
  }

  views.forEach(view => {
    view.classList.remove('active');
  });

  if (target) {
    target.classList.add('active');
    
    // Update URL query param without reload
    let newUrl = window.location.pathname;
    if (viewId !== 'view-categories') {
      newUrl += `?view=${viewId}`;
    }
    window.history.replaceState({ view: viewId }, '', newUrl);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

async function loadStats() {
  try {
    const response = await fetch('/api/score');
    if (response.ok) {
      const db = await response.json();
      
      // Render Chess stats
      const chess = db.chess || { vitorias: 0, derrotas: 0, empates: 0 };
      document.getElementById('stats-chess-txt').innerHTML = `
        Vitórias: ${chess.vitorias} | Derrotas: ${chess.derrotas}<br>
        Empates: ${chess.empates}
      `;
      
      // Render Sweeper stats
      const sweeper = db.minesweeper || { vitorias: 0, derrotas: 0, tempo_recorde: 0 };
      document.getElementById('stats-sweeper-txt').innerHTML = `
        Vitórias: ${sweeper.vitorias} | Derrotas: ${sweeper.derrotas}<br>
        Tempo Recorde: ${sweeper.tempo_recorde > 0 ? sweeper.tempo_recorde + ' s' : '-- s'}
      `;
      
      // Render Tetris stats
      const tetris = db.tetris || { classico: { pontuacao_maxima: 0 }, contrarrelogio: { tempo_recorde: 0 } };
      const tetrisClassico = tetris.classico || { pontuacao_maxima: 0, vitorias: 0, derrotas: 0 };
      const tetrisCR = tetris.contrarrelogio || { tempo_recorde: 0 };
      document.getElementById('stats-tetris-txt').innerHTML = `
        Recorde Clássico: ${tetrisClassico.pontuacao_maxima.toLocaleString('pt-BR')} pts<br>
        Recorde Contrarrelógio: ${tetrisCR.tempo_recorde > 0 ? formatTime(tetrisCR.tempo_recorde) : '-- s'}
      `;

      // Render Snake stats
      const snake = db.snake || { pontuacao_maxima: 0, comprimento_maximo: 0, partidas_jogadas: 0 };
      document.getElementById('stats-snake-txt').innerHTML = `
        Recorde Pontos: ${snake.pontuacao_maxima} pts<br>
        Comprimento Máximo: ${snake.comprimento_maximo} blocos
      `;

      // Render Tic-Tac-Toe stats
      const tictactoe = db.tictactoe || { vitorias: 0, derrotas: 0, empates: 0 };
      document.getElementById('stats-tictactoe-txt').innerHTML = `
        Vitórias: ${tictactoe.vitorias} | Derrotas: ${tictactoe.derrotas}<br>
        Empates: ${tictactoe.empates}
      `;

      // Render Poker stats
      const poker = db.poker || { cash: { vitorias: 0, derrotas: 0 }, torneio: { vitorias: 0, derrotas: 0 }, maior_stack: 0 };
      document.getElementById('stats-poker-txt').innerHTML = `
        Cash - V: ${poker.cash.vitorias} | D: ${poker.cash.derrotas}<br>
        Torneio - V: ${poker.torneio.vitorias} | Maior Stack: $${poker.maior_stack.toLocaleString('pt-BR')}
      `;

      // Render Cyber Tactics stats
      const tactics = db.aether_cyber_tactics || { vitorias: 0, derrotas: 0, pontuacao_maxima: 0, maior_setor: 0 };
      const tacticsEl = document.getElementById('stats-tactics-txt');
      if (tacticsEl) {
        tacticsEl.innerHTML = `
          Vitórias: ${tactics.vitorias || 0} | Maior Setor: ${tactics.maior_setor || 1}<br>
          Pontuação Máxima: ${(tactics.pontuacao_maxima || 0).toLocaleString('pt-BR')} pts
        `;
      }

      // Render Cyber Slay stats
      const cyberSlay = db.aether_cyber_slay || { vitorias: 0, derrotas: 0, pontuacao_maxima: 0, maior_setor: 0 };
      const cyberSlayEl = document.getElementById('stats-cyber-slay-txt');
      if (cyberSlayEl) {
        cyberSlayEl.innerHTML = `
          Vitórias: ${cyberSlay.vitorias || 0} | Maior Setor: ${cyberSlay.maior_setor || 1}<br>
          Pontuação Máxima: ${(cyberSlay.pontuacao_maxima || 0).toLocaleString('pt-BR')} pts
        `;
      }

      // Render Raycaster stats
      const raycaster = db.aether_raycaster || { vitorias: 0, derrotas: 0, pontuacao_maxima: 0, maior_setor: 0 };
      const raycasterEl = document.getElementById('stats-raycaster-txt');
      if (raycasterEl) {
        raycasterEl.innerHTML = `
          3D Raycasting • Canvas 2D • Procedural<br>
          Pontuação Máxima: ${(raycaster.pontuacao_maxima || 0).toLocaleString('pt-BR')} pts | Maior Setor: 0${raycaster.maior_setor || 1}
        `;
      }

      // Render Flowfield TD stats
      const flowfieldTd = db.aether_flowfield_td || { vitorias: 0, derrotas: 0, pontuacao_maxima: 0, maior_onda: 0 };
      const flowfieldTdEl = document.getElementById('stats-flowfield-td-txt');
      if (flowfieldTdEl) {
        flowfieldTdEl.innerHTML = `
          10.000+ Partículas • Flow Field • Web Audio<br>
          Pontuação Máxima: ${(flowfieldTd.pontuacao_maxima || 0).toLocaleString('pt-BR')} pts | Maior Onda: ${flowfieldTd.maior_onda || 1}
        `;
      }

      // Render Conveyor stats
      const conveyor = db.aether_conveyor || { vitorias: 0, derrotas: 0, pontuacao_maxima: 0, maior_setor: 0 };
      const conveyorEl = document.getElementById('stats-conveyor-txt');
      if (conveyorEl) {
        conveyorEl.innerHTML = `
          Física Contínua • Backpressure • Spatial Hash<br>
          Vitórias: ${conveyor.vitorias || 0} | Maior Setor: 0${conveyor.maior_setor || 1}
        `;
      }

      // Global dashboard stats calculation
      const totalWins = chess.vitorias + sweeper.vitorias + (tetrisClassico.vitorias || 0) + tictactoe.vitorias + poker.cash.vitorias + poker.torneio.vitorias + (tactics.vitorias || 0) + (cyberSlay.vitorias || 0) + (raycaster.vitorias || 0) + (flowfieldTd.vitorias || 0) + (conveyor.vitorias || 0);
      const totalLosses = chess.derrotas + sweeper.derrotas + (tetrisClassico.derrotas || 0) + tictactoe.derrotas + poker.cash.derrotas + poker.torneio.derrotas + (tactics.derrotas || 0) + (cyberSlay.derrotas || 0) + (raycaster.derrotas || 0) + (flowfieldTd.derrotas || 0) + (conveyor.derrotas || 0);
      const totalGames = totalWins + totalLosses + chess.empates + tictactoe.empates + (snake.partidas_jogadas || 0);
      
      document.getElementById('dashboard-total-wins').textContent = totalWins;
      document.getElementById('dashboard-total-games').textContent = totalGames;
      document.getElementById('dashboard-tetris-record').textContent = tetrisClassico.pontuacao_maxima > 0 
        ? `${tetrisClassico.pontuacao_maxima.toLocaleString('pt-BR')} pts` 
        : '--';
    }
  } catch (err) {
    console.error('Falha ao carregar placar do servidor.', err);
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

document.getElementById('btn-reset-all').addEventListener('click', async () => {
  if (!confirm('Deseja realmente zerar TODAS as estatísticas de TODOS os jogos?')) return;
  try {
    await fetch('/api/score?game=chess', { method: 'DELETE' });
    await fetch('/api/score?game=minesweeper', { method: 'DELETE' });
    await fetch('/api/score?game=tetris', { method: 'DELETE' });
    await fetch('/api/score?game=snake', { method: 'DELETE' });
    await fetch('/api/score?game=tictactoe', { method: 'DELETE' });
    await fetch('/api/score?game=poker', { method: 'DELETE' });
    await fetch('/api/score?game=aether_cyber_tactics', { method: 'DELETE' });
    await fetch('/api/score?game=aether_cyber_slay', { method: 'DELETE' });
    await fetch('/api/score?game=aether_raycaster', { method: 'DELETE' });
    await fetch('/api/score?game=aether_flowfield_td', { method: 'DELETE' });
    await fetch('/api/score?game=aether_conveyor', { method: 'DELETE' });
    loadStats();
  } catch (err) {
    console.error('Erro ao resetar scores.', err);
  }
});

// Accessibility keydown event listener for category and game cards
document.querySelectorAll('.category-card, .game-card').forEach(card => {
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      card.click();
    }
  });
});

window.addEventListener('DOMContentLoaded', () => {
  loadStats();
  const urlParams = new URLSearchParams(window.location.search);
  const view = urlParams.get('view');
  if (view) {
    showView(view);
  }
});
