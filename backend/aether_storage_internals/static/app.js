/**
 * Aether Storage Internals — Interactive Dashboard Controller
 */

(() => {
  'use strict';

  // API base URLs
  const API_BASE = '/api/storage';
  const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const WS_URL = `${WS_PROTOCOL}//${window.location.host}/ws/storage`;

  // Application State
  let engineState = null;
  let ws = null;
  let reconnectTimer = null;

  // DOM Elements
  const wsStatusDot = document.getElementById('ws-status-dot');
  const wsStatusText = document.getElementById('ws-status-text');
  const statWrites = document.getElementById('stat-writes');
  const statReads = document.getElementById('stat-reads');
  const statBloom = document.getElementById('stat-bloom');
  const statDiskBytes = document.getElementById('stat-disk-bytes');

  // Pipeline Nodes
  const nodeClient = document.getElementById('node-client');
  const nodeWal = document.getElementById('node-wal');
  const nodeMem = document.getElementById('node-memtable');
  const nodeFrozen = document.getElementById('node-frozen');
  const nodeL0 = document.getElementById('node-l0');
  const nodeL1 = document.getElementById('node-l1');

  const pipelineWalInfo = document.getElementById('pipeline-wal-info');
  const pipelineMemInfo = document.getElementById('pipeline-mem-info');
  const pipelineFrozenInfo = document.getElementById('pipeline-frozen-info');
  const pipelineL0Info = document.getElementById('pipeline-l0-info');
  const pipelineL1Info = document.getElementById('pipeline-l1-info');
  const memProgress = document.getElementById('mem-progress');

  // SkipList & SSTables Containers
  const skiplistCanvas = document.getElementById('skiplist-canvas');
  const memNodesBadge = document.getElementById('memtable-badge-nodes');
  const memBytesBadge = document.getElementById('memtable-badge-bytes');
  const levelsContainer = document.getElementById('levels-container');
  const badgeTotalSst = document.getElementById('badge-total-sst');

  // Console Output
  const consoleOutput = document.getElementById('console-output');
  const tracerTimeline = document.getElementById('tracer-timeline');
  const tracerDuration = document.getElementById('tracer-duration');

  // Modals
  const hexModal = document.getElementById('hex-modal');
  const btnCloseHexModal = document.getElementById('btn-close-hex-modal');
  const hexModalFilename = document.getElementById('hex-modal-filename');
  const hexInfoBar = document.getElementById('hex-info-bar');
  const hexDumpContent = document.getElementById('hex-dump-content');

  const helpModal = document.getElementById('help-modal');
  const btnHelp = document.getElementById('btn-help');
  const btnCloseHelpModal = document.getElementById('btn-close-help-modal');

  // =========================================================================
  // Helper Formatters
  // =========================================================================

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function appendLog(message, type = 'info') {
    const timeStr = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    line.textContent = `[${timeStr}] ${message}`;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  }

  // =========================================================================
  // WebSocket Telemetry Connection
  // =========================================================================

  function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      ws = new WebSocket(WS_URL);
    } catch (e) {
      updateWsStatus(false);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      updateWsStatus(true);
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      fetchState();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleEngineEvent(msg.type, msg.data);
      } catch (e) {
        console.error('Failed parsing WS message:', e);
      }
    };

    ws.onclose = () => {
      updateWsStatus(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      updateWsStatus(false);
    };
  }

  function updateWsStatus(connected) {
    if (connected) {
      wsStatusDot.className = 'status-dot connected';
      wsStatusText.textContent = 'Tempo Real (WS)';
    } else {
      wsStatusDot.className = 'status-dot error';
      wsStatusText.textContent = 'Reconectando...';
    }
  }

  function scheduleReconnect() {
    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        connectWebSocket();
      }, 3000);
    }
  }

  // =========================================================================
  // Event & Animation Dispatcher
  // =========================================================================

  function pulseNode(element, cssClass = 'pulse-active') {
    element.classList.remove('pulse-active', 'pulse-flush', 'pulse-compact');
    void element.offsetWidth; // Trigger reflow
    element.classList.add(cssClass);
    setTimeout(() => {
      element.classList.remove(cssClass);
    }, 600);
  }

  function handleEngineEvent(type, data) {
    if (type === 'write') {
      pulseNode(nodeClient, 'pulse-active');
      setTimeout(() => pulseNode(nodeWal, 'pulse-active'), 100);
      setTimeout(() => pulseNode(nodeMem, 'pulse-active'), 200);
      appendLog(`ESCRITA (PUT) chave="${data.key}" (${data.memtable_count} itens na RAM, WAL ${formatBytes(data.wal_size)})`, 'write');
    } else if (type === 'delete') {
      pulseNode(nodeClient, 'pulse-active');
      setTimeout(() => pulseNode(nodeWal, 'pulse-active'), 100);
      setTimeout(() => pulseNode(nodeMem, 'pulse-active'), 200);
      appendLog(`EXCLUSÃO (DELETE) chave="${data.key}" (lápide gravada no WAL)`, 'delete');
    } else if (type === 'flush') {
      pulseNode(nodeMem, 'pulse-flush');
      pulseNode(nodeFrozen, 'pulse-flush');
      setTimeout(() => pulseNode(nodeL0, 'pulse-flush'), 250);
      appendLog(`FLUSH CONCLUÍDO: SSTable ${data.sstable_id} criada (${data.record_count} registros, ${formatBytes(data.file_size)})`, 'flush');
    } else if (type === 'compaction') {
      pulseNode(nodeL0, 'pulse-compact');
      setTimeout(() => pulseNode(nodeL1, 'pulse-compact'), 250);
      appendLog(`COMPACTAÇÃO L${data.source_level} ➜ L${data.target_level}: ${data.records_merged} registros mesclados, ${data.tombstones_purged} lápides purgadas`, 'compact');
    } else if (type === 'crash') {
      appendLog(`QUEDA SIMULADA (CRASH)! Memória RAM esvaziada. Registros preservados no WAL.`, 'error');
    } else if (type === 'recover') {
      pulseNode(nodeWal, 'pulse-active');
      setTimeout(() => pulseNode(nodeMem, 'pulse-active'), 250);
      appendLog(`RECUPERAÇÃO CONCLUÍDA: ${data.records_recovered} registros restaurados do WAL em ${data.duration_ms} ms`, 'success');
    }

    // Refresh state
    fetchState();
  }

  // =========================================================================
  // State Fetching & UI Rendering
  // =========================================================================

  async function fetchState() {
    try {
      const res = await fetch(`${API_BASE}/state`);
      if (!res.ok) return;
      engineState = await res.json();
      renderDashboard(engineState);
    } catch (e) {
      console.warn('Could not fetch state:', e);
    }
  }

  function renderDashboard(state) {
    if (!state) return;

    // Header Metrics
    statWrites.textContent = state.metrics.writes.toLocaleString();
    statReads.textContent = state.metrics.reads.toLocaleString();
    statBloom.textContent = `${state.metrics.bloom_hits} hits / ${state.metrics.bloom_misses} evitadas`;
    statDiskBytes.textContent = formatBytes(state.metrics.total_disk_bytes);

    // Pipeline Info
    pipelineWalInfo.textContent = `${state.wal.filename} (${formatBytes(state.wal.file_size)})`;
    pipelineMemInfo.textContent = `${state.active_memtable.count} chaves (${formatBytes(state.active_memtable.estimated_bytes)})`;
    memProgress.style.width = `${state.active_memtable.capacity_pct}%`;

    if (state.frozen_memtable) {
      pipelineFrozenInfo.textContent = `${state.frozen_memtable.count} chaves (${formatBytes(state.frozen_memtable.estimated_bytes)})`;
      nodeFrozen.style.opacity = '1';
    } else {
      pipelineFrozenInfo.textContent = 'Vazio';
      nodeFrozen.style.opacity = '0.6';
    }

    const l0List = state.levels['0'] || [];
    const l1List = state.levels['1'] || [];
    pipelineL0Info.textContent = `${l0List.length} ${l0List.length === 1 ? 'arquivo' : 'arquivos'}`;
    pipelineL1Info.textContent = `${l1List.length} ${l1List.length === 1 ? 'arquivo' : 'arquivos'}`;

    // Render SkipList
    renderSkipList(state.active_memtable.graph);

    // Render SSTables by Level
    renderSSTables(state.levels);
  }

  function renderSkipList(graph) {
    memNodesBadge.textContent = `${graph.total_nodes} nós`;
    memBytesBadge.textContent = formatBytes(graph.estimated_bytes);

    if (!graph.nodes || graph.nodes.length === 0) {
      skiplistCanvas.innerHTML = '<div class="empty-state">MemTable vazia. Insira registros para ver as torres da SkipList!</div>';
      return;
    }

    skiplistCanvas.innerHTML = '';

    graph.nodes.forEach((node) => {
      const tower = document.createElement('div');
      tower.className = 'skiplist-tower';

      // Base Node
      const nodeBox = document.createElement('div');
      nodeBox.className = `tower-node ${node.is_tombstone ? 'tombstone' : ''}`;
      nodeBox.title = `Chave: ${node.key}\nValor: ${node.value}\nAltura: Nível ${node.level}`;

      const keyEl = document.createElement('div');
      keyEl.className = 'tower-key';
      keyEl.textContent = node.key;

      const valEl = document.createElement('div');
      valEl.className = 'tower-val';
      valEl.textContent = node.is_tombstone ? 'TOMBSTONE' : node.value;

      nodeBox.appendChild(keyEl);
      nodeBox.appendChild(valEl);

      // Level Blocks Tower
      const levelBlocks = document.createElement('div');
      levelBlocks.className = 'tower-level-blocks';

      for (let lvl = 0; lvl < node.level; lvl++) {
        const block = document.createElement('div');
        block.className = `level-block l${lvl % 3}`;
        block.textContent = `L${lvl}`;
        levelBlocks.appendChild(block);
      }

      tower.appendChild(nodeBox);
      tower.appendChild(levelBlocks);

      skiplistCanvas.appendChild(tower);
    });
  }

  function renderSSTables(levels) {
    const totalFiles = (levels['0']?.length || 0) + (levels['1']?.length || 0) + (levels['2']?.length || 0);
    badgeTotalSst.textContent = `${totalFiles} ${totalFiles === 1 ? 'SSTable' : 'SSTables'}`;

    levelsContainer.innerHTML = '';

    ['0', '1', '2'].forEach((lvl) => {
      const files = levels[lvl] || [];
      const group = document.createElement('div');
      group.className = 'level-group';

      const title = document.createElement('div');
      title.className = 'level-title';
      title.innerHTML = `
        <span>Nível ${lvl} ${lvl === '0' ? '(Novas / Sobrepostas)' : '(Compactadas / Disjuntas)'}</span>
        <span class="badge ${lvl === '0' ? 'amber' : 'purple'}">${files.length} arquivos</span>
      `;
      group.appendChild(title);

      if (files.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'panel-hint';
        empty.style.margin = '0.3rem 0';
        empty.textContent = `Nenhum arquivo SSTable no Nível ${lvl}.`;
        group.appendChild(empty);
      } else {
        const grid = document.createElement('div');
        grid.className = 'sstables-grid';

        files.forEach((sst) => {
          const card = document.createElement('div');
          card.className = 'sstable-card';

          const bloomDensity = sst.bloom_stats?.density_pct !== undefined ? `${sst.bloom_stats.density_pct}% bits` : 'OK';

          card.innerHTML = `
            <div class="sst-header">
              <span class="sst-id">${sst.file_id}.sst</span>
              <span class="sst-size">${formatBytes(sst.file_size)}</span>
            </div>
            <div class="sst-range" title="Intervalo de chaves">
              [${sst.min_key || 'ø'} ... ${sst.max_key || 'ø'}]
            </div>
            <div class="sst-bloom">
              ${sst.record_count} registros • Bloom: ${bloomDensity}
            </div>
            <div class="sst-actions">
              <button class="pill-btn small btn-inspect-hex" data-filename="${sst.file_id}.sst">
                🔍 Inspecionar Hex
              </button>
            </div>
          `;

          grid.appendChild(card);
        });

        group.appendChild(grid);
      }

      levelsContainer.appendChild(group);
    });

    // Wire hex inspector buttons
    document.querySelectorAll('.btn-inspect-hex').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const filename = e.currentTarget.dataset.filename;
        openHexModal(filename);
      });
    });
  }

  // =========================================================================
  // Hex Dump Inspector Modal
  // =========================================================================

  async function openHexModal(filename) {
    hexModalFilename.textContent = `Inspecionando: ${filename}`;
    hexInfoBar.innerHTML = 'Carregando blocos e estrutura do arquivo...';
    hexDumpContent.textContent = 'Lendo bytes em disco...';
    hexModal.classList.remove('hidden');

    try {
      const res = await fetch(`${API_BASE}/raw-block/${filename}`);
      if (!res.ok) {
        hexDumpContent.textContent = `Erro ao carregar arquivo: HTTP ${res.status}`;
        return;
      }
      const data = await res.json();

      hexInfoBar.innerHTML = `
        <span>Tamanho: <b>${formatBytes(data.file_size)}</b></span>
        <span>Bytes Exibidos: <b>${data.bytes_inspected} B</b></span>
        ${data.layout ? `<span>Registros: <b>${data.layout.record_count}</b></span>` : ''}
      `;

      // Render Hex Lines
      let text = '';
      data.hex_lines.forEach((l) => {
        text += `${l.offset}  ${l.hex.padEnd(48, ' ')}  |${l.ascii}|\n`;
      });
      hexDumpContent.textContent = text;
    } catch (e) {
      hexDumpContent.textContent = `Erro ao conectar à API: ${e.message}`;
    }
  }

  btnCloseHexModal.addEventListener('click', () => {
    hexModal.classList.add('hidden');
  });

  // =========================================================================
  // Query Execution Tracer
  // =========================================================================

  async function executeTraceGet(key) {
    tracerTimeline.innerHTML = '<div class="tracer-placeholder">Rastreando camadas da LSM-Tree...</div>';
    tracerDuration.textContent = 'Processando...';

    try {
      const res = await fetch(`${API_BASE}/trace/${encodeURIComponent(key)}`);
      if (!res.ok) {
        tracerTimeline.innerHTML = `<div class="tracer-placeholder" style="color: var(--accent-rose);">Erro na consulta: HTTP ${res.status}</div>`;
        return;
      }
      const trace = await res.json();
      tracerDuration.textContent = `${trace.duration_ms} ms`;

      tracerTimeline.innerHTML = '';

      trace.steps.forEach((step, idx) => {
        const card = document.createElement('div');
        let cardClass = 'trace-step-card';
        if (step.hit) cardClass += ' hit';
        if (step.disk_read_avoided) cardClass += ' avoided';
        card.className = cardClass;

        let badgeClass = 'ram';
        if (step.layer === 'sstable_bloom') badgeClass = 'bloom';
        if (step.layer === 'sstable_data') badgeClass = 'disk';

        card.innerHTML = `
          <div class="step-left">
            <span class="step-badge ${badgeClass}">Passo ${idx + 1}</span>
            <div class="step-info">
              <span class="step-target">${step.target}</span>
              <span class="step-detail">${step.detail}</span>
            </div>
          </div>
          <div class="step-status ${step.hit ? 'text-emerald' : (step.disk_read_avoided ? 'text-cyan' : 'text-dim')}">
            ${step.hit ? '✅ ENCONTRADO' : (step.disk_read_avoided ? '🛡️ DISCO EVITADO' : '❌ NÃO ENCONTRADO')}
          </div>
        `;

        tracerTimeline.appendChild(card);
      });

      // Final result card
      const resultCard = document.createElement('div');
      resultCard.className = `trace-step-card ${trace.found ? 'hit' : ''}`;
      resultCard.style.marginTop = '0.35rem';
      resultCard.innerHTML = `
        <div class="step-left">
          <span class="step-badge ${trace.found ? 'ram' : 'disk'}">Resultado</span>
          <div class="step-info">
            <span class="step-target">${trace.found ? `Valor: "${trace.value}"` : (trace.is_tombstone ? 'Lápide (Registro excluído)' : 'Chave inexistente')}</span>
            <span class="step-detail">Busca finalizada em ${trace.duration_ms} ms</span>
          </div>
        </div>
      `;
      tracerTimeline.appendChild(resultCard);

      appendLog(`CONSULTA (GET) chave="${key}" ➜ ${trace.found ? `"${trace.value}"` : (trace.is_tombstone ? 'Lápide (excluída)' : 'não encontrada')} (${trace.duration_ms} ms)`, 'info');
    } catch (e) {
      tracerTimeline.innerHTML = `<div class="tracer-placeholder" style="color: var(--accent-rose);">Erro: ${e.message}</div>`;
    }
  }

  // =========================================================================
  // Forms & Actions
  // =========================================================================

  // Tab switching
  document.querySelectorAll('.tab-pill').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-pill').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

      e.currentTarget.classList.add('active');
      const targetTab = e.currentTarget.dataset.tab;
      document.getElementById(targetTab)?.classList.add('active');
    });
  });

  // PUT Form
  document.getElementById('form-put').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = document.getElementById('put-key').value.trim();
    const val = document.getElementById('put-val').value.trim();
    if (!key) return;

    try {
      const res = await fetch(`${API_BASE}/kv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: val }),
      });
      if (res.ok) {
        document.getElementById('put-val').value = '';
      }
    } catch (err) {
      appendLog(`Erro no PUT: ${err.message}`, 'error');
    }
  });

  // GET & TRACE Form
  document.getElementById('form-get').addEventListener('submit', (e) => {
    e.preventDefault();
    const key = document.getElementById('get-key').value.trim();
    if (!key) return;
    executeTraceGet(key);
  });

  // DELETE Form
  document.getElementById('form-del').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = document.getElementById('del-key').value.trim();
    if (!key) return;

    try {
      await fetch(`${API_BASE}/kv/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      appendLog(`Erro no DELETE: ${err.message}`, 'error');
    }
  });

  // SCAN Form
  document.getElementById('form-scan').addEventListener('submit', async (e) => {
    e.preventDefault();
    const start = document.getElementById('scan-start').value.trim();
    const end = document.getElementById('scan-end').value.trim();
    const limit = document.getElementById('scan-limit').value || 25;

    let url = `${API_BASE}/scan?limit=${limit}`;
    if (start) url += `&start_key=${encodeURIComponent(start)}`;
    if (end) url += `&end_key=${encodeURIComponent(end)}`;

    try {
      const res = await fetch(url);
      if (res.ok) {
        const records = await res.json();
        appendLog(`SCAN retornou ${records.length} registros no intervalo [${start || 'início'}, ${end || 'fim'}]:`, 'info');
        records.forEach((r) => {
          appendLog(`  • ${r.key} = "${r.value}" (ts: ${r.timestamp})`, 'info');
        });
      }
    } catch (err) {
      appendLog(`Erro no SCAN: ${err.message}`, 'error');
    }
  });

  // Storage Action Buttons
  document.getElementById('btn-action-flush').addEventListener('click', async () => {
    try {
      const res = await fetch(`${API_BASE}/actions/flush`, { method: 'POST' });
      const data = await res.json();
      appendLog(data.message, data.status === 'ok' ? 'flush' : 'info');
    } catch (err) {
      appendLog(`Erro no flush: ${err.message}`, 'error');
    }
  });

  document.getElementById('btn-action-compact').addEventListener('click', async () => {
    try {
      const res = await fetch(`${API_BASE}/actions/compact?source_level=0`, { method: 'POST' });
      const data = await res.json();
      appendLog(data.message, 'compact');
    } catch (err) {
      appendLog(`Erro na compactação: ${err.message}`, 'error');
    }
  });

  document.getElementById('btn-action-crash').addEventListener('click', async () => {
    try {
      const res = await fetch(`${API_BASE}/actions/crash`, { method: 'POST' });
      const data = await res.json();
      appendLog(data.message, 'error');
    } catch (err) {
      appendLog(`Erro no crash: ${err.message}`, 'error');
    }
  });

  document.getElementById('btn-action-recover').addEventListener('click', async () => {
    try {
      const res = await fetch(`${API_BASE}/actions/recover`, { method: 'POST' });
      const data = await res.json();
      appendLog(data.message, 'success');
    } catch (err) {
      appendLog(`Erro na recuperação: ${err.message}`, 'error');
    }
  });

  // Benchmark Buttons
  document.querySelectorAll('[data-workload]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const workload = e.currentTarget.dataset.workload;
      const feedback = document.getElementById('bench-feedback');
      feedback.classList.remove('hidden');
      feedback.textContent = `Executando benchmark '${workload}' (100 ops)...`;

      try {
        const res = await fetch(`${API_BASE}/bench`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workload, count: 100 }),
        });
        const data = await res.json();
        feedback.textContent = `✅ ${data.data.total_ops} ops em ${data.data.duration_seconds}s (${data.data.throughput_ops_per_sec} ops/s)`;
        appendLog(data.message, 'success');
        fetchState();
      } catch (err) {
        feedback.textContent = `Erro: ${err.message}`;
      }
    });
  });

  // Refresh and Log Buttons
  document.getElementById('btn-refresh').addEventListener('click', () => {
    fetchState();
    appendLog('Estado sincronizado manualmente com a storage engine.', 'info');
  });

  document.getElementById('btn-clear-log').addEventListener('click', () => {
    consoleOutput.innerHTML = '';
  });

  // Help Modal
  btnHelp.addEventListener('click', () => {
    helpModal.classList.remove('hidden');
  });

  btnCloseHelpModal.addEventListener('click', () => {
    helpModal.classList.add('hidden');
  });

  // Keyboard escape closes modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hexModal.classList.add('hidden');
      helpModal.classList.add('hidden');
    }
  });

  // Periodic State Polling Fallback
  setInterval(() => {
    fetchState();
  }, 3000);

  // Initialize
  connectWebSocket();
  fetchState();
})();
