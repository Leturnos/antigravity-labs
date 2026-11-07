/**
 * Aether QuorumDB Dashboard Client Controller.
 * Handles real-time WebSockets telemetry, simulation controls, and SQL execution.
 */

let ws = null;
let isAutoTicking = false;
let autoTickTimer = null;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  initWebSocket();
  fetchState();

  // Ctrl+Enter shortcut in SQL editor
  const sqlInput = document.getElementById('sql-input');
  sqlInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  });

  // Preload default query
  setQuery('SELECT * FROM users;');
});

// ============================================================================
// WebSocket Connection
// ============================================================================

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/quorum`;
  const badge = document.getElementById('ws-badge');

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    badge.textContent = '● Conectado';
    badge.className = 'badge ws-live';
    logEvent('WS', 'Conectado ao cluster em tempo real');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'cluster_state') {
        renderClusterState(msg.data);
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  };

  ws.onclose = () => {
    badge.textContent = '● Desconectado';
    badge.className = 'badge ws-disconnected';
    setTimeout(initWebSocket, 2000);
  };
}

// ============================================================================
// REST API Actions
// ============================================================================

async function fetchState() {
  try {
    const res = await fetch('/api/quorum/state');
    const data = await res.json();
    renderClusterState(data);
  } catch (err) {
    console.error('Failed to fetch state:', err);
  }
}

async function stepSimulation(ticks = 1) {
  try {
    const res = await fetch('/api/quorum/step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticks })
    });
    const data = await res.json();
    renderClusterState(data);
    logEvent('STEP', `Simulação avançou +${ticks} ticks`);
  } catch (err) {
    logEvent('ERRO', `Falha ao avançar ticks: ${err.message}`, 'error');
  }
}

function toggleAutoTick() {
  isAutoTicking = !isAutoTicking;
  const btn = document.getElementById('auto-tick-btn');

  if (isAutoTicking) {
    btn.textContent = '⏸️ Auto-Tick: Ligado';
    btn.classList.add('btn-primary');
    autoTickTimer = setInterval(() => stepSimulation(1), 600);
  } else {
    btn.textContent = '⏱️ Auto-Tick: Desligado';
    btn.classList.remove('btn-primary');
    clearInterval(autoTickTimer);
    autoTickTimer = null;
  }
}

async function resetCluster() {
  if (!confirm('Deseja realmente reiniciar o cluster e redefinir o estado?')) return;
  try {
    const res = await fetch('/api/quorum/reset', { method: 'POST' });
    const data = await res.json();
    renderClusterState(data);
    logEvent('RESET', 'Cluster redefinido para o estado inicial');
  } catch (err) {
    logEvent('ERRO', `Falha ao resetar cluster: ${err.message}`, 'error');
  }
}

async function injectFault(action, nodeId = null) {
  try {
    const res = await fetch('/api/quorum/fault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, node_id: nodeId })
    });
    const data = await res.json();
    renderClusterState(data);
    logEvent('FAULT', `Injeção de falha: ${action} ${nodeId !== null ? `(Node ${nodeId})` : ''}`);
  } catch (err) {
    logEvent('ERRO', `Falha na injeção: ${err.message}`, 'error');
  }
}

async function runQuery() {
  const sql = document.getElementById('sql-input').value.trim();
  if (!sql) return;

  const statusEl = document.getElementById('query-status');
  statusEl.textContent = 'Executando...';
  statusEl.style.color = 'var(--color-candidate)';

  try {
    const res = await fetch('/api/quorum/sql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql })
    });
    const data = await res.json();

    if (data.status === 'ok') {
      statusEl.textContent = `OK (${data.row_count} linhas, ${data.execution_time_ms}ms)`;
      statusEl.style.color = 'var(--color-leader)';
      renderResults(data.columns, data.rows);
      logEvent('SQL', `Executado com sucesso: ${sql.substring(0, 40)}...`, 'commit');
    } else {
      statusEl.textContent = 'Erro';
      statusEl.style.color = 'var(--color-crashed)';
      renderError(data.error);
      logEvent('SQL_ERR', data.error, 'error');
    }
  } catch (err) {
    statusEl.textContent = 'Falha na rede';
    statusEl.style.color = 'var(--color-crashed)';
    renderError(err.message);
  }
}

function setQuery(sql) {
  const el = document.getElementById('sql-input');
  el.value = sql;
  el.focus();
}

// ============================================================================
// DOM Rendering
// ============================================================================

function renderClusterState(state) {
  // Badges
  document.getElementById('clock-badge').textContent = `Clock: ${state.clock} ticks`;
  const leaderText = state.leader_id !== null ? `Leader: Node ${state.leader_id}` : 'Leader: Eleição...';
  document.getElementById('leader-badge').textContent = leaderText;

  // Network stats
  document.getElementById('net-sent').textContent = state.network.sent;
  document.getElementById('net-delivered').textContent = state.network.delivered;
  document.getElementById('net-dropped').textContent = state.network.dropped;
  document.getElementById('net-blocked').textContent = state.network.blocked;
  document.getElementById('net-inflight').textContent = state.network.in_flight_count;

  // Node cards
  const container = document.getElementById('nodes-container');
  container.innerHTML = '';

  state.nodes.forEach(node => {
    const isLeader = node.role === 'leader';
    const isCrashed = !node.is_running;

    const card = document.createElement('div');
    card.className = `node-card ${isLeader ? 'is-leader' : ''} ${isCrashed ? 'is-crashed' : ''}`;

    const shortHash = node.state_checksum ? `${node.state_checksum.substring(0, 16)}...` : 'N/A';

    card.innerHTML = `
      <div class="node-header">
        <span class="node-name">🖥️ Node ${node.node_id}</span>
        <span class="role-badge ${node.role}">${node.role}</span>
      </div>
      <table class="node-stats-table">
        <tr>
          <td style="color: var(--color-text-muted);">Term:</td>
          <td>${node.term}</td>
        </tr>
        <tr>
          <td style="color: var(--color-text-muted);">Commit Index:</td>
          <td>${node.commit_index}</td>
        </tr>
        <tr>
          <td style="color: var(--color-text-muted);">Last Applied:</td>
          <td>${node.last_applied}</td>
        </tr>
        <tr>
          <td style="color: var(--color-text-muted);">Log Entries:</td>
          <td>${node.log_length} (compacted: ${node.last_included_index})</td>
        </tr>
      </table>
      <div class="checksum-tag" title="${node.state_checksum || ''}">
        Hash: ${shortHash}
      </div>
      <div class="node-actions">
        ${node.is_running 
          ? `<button class="btn-ctrl btn-danger" style="flex: 1;" onclick="injectFault('crash_node', ${node.node_id})">💥 Crash</button>`
          : `<button class="btn-ctrl btn-primary" style="flex: 1;" onclick="injectFault('restart_node', ${node.node_id})">🔌 Reiniciar</button>`
        }
      </div>
    `;
    container.appendChild(card);
  });
}

function renderResults(columns, rows) {
  const wrapper = document.getElementById('results-wrapper');

  if (columns.length === 1 && columns[0] === 'EXPLAIN') {
    // Render formatted EXPLAIN tree
    const text = rows.map(r => r[0]).join('\n');
    wrapper.innerHTML = `<div class="explain-view">${escapeHtml(text)}</div>`;
    return;
  }

  if (rows.length === 0) {
    wrapper.innerHTML = '<div style="padding: 1rem; color: var(--color-text-muted); text-align: center;">Nenhuma linha retornada.</div>';
    return;
  }

  let html = '<table class="results-table"><thead><tr>';
  columns.forEach(col => {
    html += `<th>${escapeHtml(col)}</th>`;
  });
  html += '</tr></thead><tbody>';

  rows.forEach(row => {
    html += '<tr>';
    row.forEach(val => {
      const displayVal = val === null ? '<span style="color: var(--color-text-muted); font-style: italic;">NULL</span>' : escapeHtml(String(val));
      html += `<td>${displayVal}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  wrapper.innerHTML = html;
}

function renderError(err) {
  const wrapper = document.getElementById('results-wrapper');
  wrapper.innerHTML = `<div style="padding: 1rem; color: var(--color-crashed); font-family: var(--font-mono);">${escapeHtml(err)}</div>`;
}

function logEvent(type, text, styleClass = '') {
  const logEl = document.getElementById('event-log');
  const now = new Date().toLocaleTimeString();

  const entry = document.createElement('div');
  entry.className = `log-entry ${styleClass}`;
  entry.innerHTML = `<span class="time">${now}</span><span class="type">[${type}]</span>${escapeHtml(text)}`;

  logEl.prepend(entry);
}

function clearEventLog() {
  document.getElementById('event-log').innerHTML = '';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
