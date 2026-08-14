/**
 * WebSocket Live Testing Client for Aether API Workbench.
 * Supports direct and proxied WebSocket connections, real-time message stream, and RTT latency tracking.
 */

import { showToast } from '../utils/toast.js';
import { formatMs, highlightJson, escapeHtml } from '../utils/formatters.js';

let activeWs = null;
let wsStatus = 'disconnected'; // 'disconnected', 'connecting', 'connected', 'error'
let wsFrames = [];
let pendingSentTimes = new Map(); // id or hash -> sent timestamp for RTT calculation
let autoScroll = true;

const wsState = {
  url: 'wss://echo.websocket.events',
  useProxy: true,
  payload: '{\n  "action": "ping",\n  "timestamp": ' + Date.now() + '\n}'
};

/**
 * Render WebSocket Tester inside target container.
 * @param {HTMLElement} container - Target tab pane element.
 */
export function renderWsTester(container) {
  container.innerHTML = `
    <div class="ws-tester-container">
      <!-- Connection Setup Card -->
      <div class="glass-card ws-connection-card">
        <div class="ws-connection-bar">
          <div class="ws-status-indicator ${wsStatus}" id="ws-status-badge">
            <span class="ws-dot"></span>
            <span class="ws-status-label">${getStatusLabel(wsStatus)}</span>
          </div>

          <div class="ws-url-wrap">
            <input 
              type="text" 
              id="ws-url-input" 
              class="input-text input-mono ws-url-input" 
              placeholder="ws:// ou wss://echo.websocket.events" 
              value="${escapeHtml(wsState.url)}"
              autocomplete="off"
            />
          </div>

          <div class="ws-connect-actions">
            <label class="ws-proxy-toggle" title="Roteia via backend FastAPI para medição de latência precisa">
              <input type="checkbox" id="ws-use-proxy-chk" ${wsState.useProxy ? 'checked' : ''} />
              <span>Proxy Backend</span>
            </label>
            <button id="btn-ws-connect" class="btn btn-primary btn-ws-conn">
              <span class="btn-icon">⚡</span> Conectar
            </button>
          </div>
        </div>
      </div>

      <!-- Split View: Frame Composer vs Live Frames Stream -->
      <div class="ws-split-view">
        <!-- Left: Frame Sender -->
        <div class="glass-card ws-sender-card">
          <div class="card-header-flex">
            <h4>Enviar Mensagem WebSocket</h4>
            <div class="ws-presets">
              <button class="btn btn-sm btn-ghost ws-preset-btn" data-preset="ping">Ping</button>
              <button class="btn btn-sm btn-ghost ws-preset-btn" data-preset="echo">Echo JSON</button>
              <button class="btn btn-sm btn-ghost ws-preset-btn" data-preset="sub">Subscribe</button>
            </div>
          </div>

          <div class="ws-composer-body">
            <textarea 
              id="ws-payload-textarea" 
              class="input-textarea input-mono ws-payload-editor" 
              rows="10" 
              spellcheck="false" 
              placeholder="Digite a mensagem de texto ou payload JSON..."
            >${escapeHtml(wsState.payload)}</textarea>
          </div>

          <div class="ws-sender-footer">
            <button id="btn-ws-format-json" class="btn btn-sm btn-ghost">✨ Formatar JSON</button>
            <button id="btn-ws-send" class="btn btn-success" disabled>
              <span>📤</span> Enviar Frame (Ctrl+Enter)
            </button>
          </div>
        </div>

        <!-- Right: Live Frame Stream -->
        <div class="glass-card ws-stream-card">
          <div class="card-header-flex">
            <div class="stream-title-group">
              <h4>Histórico de Frames</h4>
              <span class="badge-count" id="ws-frame-count">0</span>
            </div>
            <div class="stream-actions">
              <label class="autoscroll-chk" title="Rolar automaticamente para o último frame">
                <input type="checkbox" id="ws-autoscroll-chk" ${autoScroll ? 'checked' : ''} /> Auto-scroll
              </label>
              <button id="btn-ws-clear-stream" class="btn btn-sm btn-ghost" title="Limpar frames">Limpar</button>
            </div>
          </div>

          <div class="ws-frames-timeline" id="ws-frames-timeline">
            <div class="ws-empty-state">
              <span class="empty-icon">🔌</span>
              <p>Conecte-se a um servidor WebSocket para monitorar o tráfego de frames em tempo real.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  attachWsEvents(container);
}

/**
 * Bind interactive events for WebSocket Tester.
 */
function attachWsEvents(container) {
  const urlInput = container.querySelector('#ws-url-input');
  const proxyChk = container.querySelector('#ws-use-proxy-chk');
  const connectBtn = container.querySelector('#btn-ws-connect');
  const sendBtn = container.querySelector('#btn-ws-send');
  const formatBtn = container.querySelector('#btn-ws-format-json');
  const clearBtn = container.querySelector('#btn-ws-clear-stream');
  const payloadArea = container.querySelector('#ws-payload-textarea');
  const autoScrollChk = container.querySelector('#ws-autoscroll-chk');

  if (urlInput) {
    urlInput.addEventListener('input', (e) => {
      wsState.url = e.target.value;
    });
  }

  if (proxyChk) {
    proxyChk.addEventListener('change', (e) => {
      wsState.useProxy = e.target.checked;
    });
  }

  if (connectBtn) {
    connectBtn.addEventListener('click', toggleWsConnection);
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', sendWsFrame);
  }

  if (payloadArea) {
    payloadArea.addEventListener('input', (e) => {
      wsState.payload = e.target.value;
    });

    payloadArea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        sendWsFrame();
      }
    });
  }

  if (formatBtn && payloadArea) {
    formatBtn.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(payloadArea.value);
        payloadArea.value = JSON.stringify(parsed, null, 2);
        wsState.payload = payloadArea.value;
        showToast('JSON formatado!', 'success', 2000);
      } catch {
        showToast('Payload não é um JSON válido', 'warning');
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      wsFrames = [];
      updateFramesTimeline();
    });
  }

  if (autoScrollChk) {
    autoScrollChk.addEventListener('change', (e) => {
      autoScroll = e.target.checked;
    });
  }

  // Presets
  container.querySelectorAll('.ws-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-preset');
      if (preset === 'ping') {
        payloadArea.value = 'ping';
      } else if (preset === 'echo') {
        payloadArea.value = JSON.stringify({ event: 'echo', message: 'Hello from Aether Workbench', timestamp: Date.now() }, null, 2);
      } else if (preset === 'sub') {
        payloadArea.value = JSON.stringify({ action: 'subscribe', channel: 'telemetry_stream', id: 101 }, null, 2);
      }
      wsState.payload = payloadArea.value;
    });
  });
}

function getStatusLabel(status) {
  switch (status) {
    case 'connected': return 'Conectado';
    case 'connecting': return 'Conectando...';
    case 'error': return 'Erro na Conexão';
    default: return 'Desconectado';
  }
}

function updateWsStatusUI() {
  const badge = document.getElementById('ws-status-badge');
  const connectBtn = document.getElementById('btn-ws-connect');
  const sendBtn = document.getElementById('btn-ws-send');

  if (badge) {
    badge.className = `ws-status-indicator ${wsStatus}`;
    const label = badge.querySelector('.ws-status-label');
    if (label) label.innerText = getStatusLabel(wsStatus);
  }

  if (connectBtn) {
    if (wsStatus === 'connected') {
      connectBtn.className = 'btn btn-danger btn-ws-conn';
      connectBtn.innerHTML = `<span>⏹</span> Desconectar`;
    } else if (wsStatus === 'connecting') {
      connectBtn.className = 'btn btn-secondary btn-ws-conn';
      connectBtn.innerHTML = `<span class="loading-spinner-sm"></span> Conectando...`;
    } else {
      connectBtn.className = 'btn btn-primary btn-ws-conn';
      connectBtn.innerHTML = `<span>⚡</span> Conectar`;
    }
  }

  if (sendBtn) {
    sendBtn.disabled = wsStatus !== 'connected';
  }
}

/**
 * Connect or disconnect WebSocket.
 */
function toggleWsConnection() {
  if (wsStatus === 'connected' || wsStatus === 'connecting') {
    disconnectWebSocket();
    return;
  }

  const targetUrl = wsState.url.trim();
  if (!targetUrl) {
    showToast('Informe uma URL de WebSocket válida.', 'warning');
    return;
  }

  let finalUrl = targetUrl;
  if (wsState.useProxy) {
    const loc = window.location;
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    finalUrl = `${wsProto}//${loc.host}/api/proxy/ws?target_url=${encodeURIComponent(targetUrl)}`;
  }

  wsStatus = 'connecting';
  updateWsStatusUI();

  try {
    activeWs = new WebSocket(finalUrl);

    activeWs.onopen = () => {
      wsStatus = 'connected';
      updateWsStatusUI();
      showToast('WebSocket conectado com sucesso!', 'success');
      appendFrame({
        direction: 'system',
        timestamp: new Date(),
        data: `Conexão estabelecida com ${targetUrl} ${wsState.useProxy ? '(via Proxy Aether)' : ''}`
      });
    };

    activeWs.onmessage = (e) => {
      const now = performance.now();
      let latencyMs = null;

      let frameData = e.data;
      try {
        const parsed = JSON.parse(frameData);
        if (parsed && typeof parsed === 'object' && '_latency_ms' in parsed) {
          latencyMs = parsed._latency_ms;
          delete parsed._latency_ms;
          frameData = JSON.stringify(parsed, null, 2);
        }
      } catch {
        // Plain string
      }

      // Check client-measured RTT fallback
      if (latencyMs === null && pendingSentTimes.size > 0) {
        const firstKey = pendingSentTimes.keys().next().value;
        const sentTime = pendingSentTimes.get(firstKey);
        latencyMs = Math.round((now - sentTime) * 10) / 10;
        pendingSentTimes.delete(firstKey);
      }

      appendFrame({
        direction: 'recv',
        timestamp: new Date(),
        latency_ms: latencyMs,
        data: frameData
      });
    };

    activeWs.onerror = (err) => {
      wsStatus = 'error';
      updateWsStatusUI();
      appendFrame({
        direction: 'system',
        timestamp: new Date(),
        data: `Erro na conexão WebSocket: ${err.message || 'Falha de handshake ou rede'}`
      });
      showToast('Erro na conexão WebSocket', 'error');
    };

    activeWs.onclose = (e) => {
      wsStatus = 'disconnected';
      updateWsStatusUI();
      appendFrame({
        direction: 'system',
        timestamp: new Date(),
        data: `Conexão fechada (Código: ${e.code || 1000}, Motivo: ${e.reason || 'Normal'})`
      });
      activeWs = null;
    };

  } catch (err) {
    wsStatus = 'error';
    updateWsStatusUI();
    showToast(`Erro ao instanciar WebSocket: ${err.message}`, 'error');
  }
}

function disconnectWebSocket() {
  if (activeWs) {
    activeWs.close(1000, 'User requested disconnect');
    activeWs = null;
  }
  wsStatus = 'disconnected';
  updateWsStatusUI();
}

/**
 * Send WebSocket frame payload to server.
 */
function sendWsFrame() {
  if (!activeWs || wsStatus !== 'connected') {
    showToast('WebSocket não está conectado!', 'warning');
    return;
  }

  const payload = wsState.payload;
  if (!payload || !payload.trim()) {
    showToast('Insira uma mensagem para enviar.', 'warning');
    return;
  }

  const sendTimestamp = performance.now();
  pendingSentTimes.set(Date.now(), sendTimestamp);

  try {
    activeWs.send(payload);
    appendFrame({
      direction: 'sent',
      timestamp: new Date(),
      data: payload
    });
  } catch (err) {
    showToast(`Falha ao enviar frame: ${err.message}`, 'error');
  }
}

function appendFrame(frameObj) {
  wsFrames.push(frameObj);
  updateFramesTimeline();
}

function updateFramesTimeline() {
  const container = document.getElementById('ws-frames-timeline');
  const countBadge = document.getElementById('ws-frame-count');
  if (!container) return;

  if (countBadge) countBadge.innerText = String(wsFrames.length);

  if (wsFrames.length === 0) {
    container.innerHTML = `
      <div class="ws-empty-state">
        <span class="empty-icon">🔌</span>
        <p>Aguardando tráfego de frames WebSocket...</p>
      </div>
    `;
    return;
  }

  let html = '';
  wsFrames.forEach((frame, idx) => {
    const timeStr = frame.timestamp.toLocaleTimeString();
    let badgeClass = 'system';
    let badgeText = '⚙ SYSTEM';

    if (frame.direction === 'sent') {
      badgeClass = 'sent';
      badgeText = '↑ SENT';
    } else if (frame.direction === 'recv') {
      badgeClass = 'recv';
      badgeText = '↓ RECV';
    }

    html += `
      <div class="ws-frame-card ${badgeClass}">
        <div class="ws-frame-header">
          <span class="ws-dir-badge ${badgeClass}">${badgeText}</span>
          <span class="ws-time">${timeStr}</span>
          ${frame.latency_ms !== null && frame.latency_ms !== undefined ? `<span class="ws-latency-pill">${formatMs(frame.latency_ms)}</span>` : ''}
          <button class="btn-copy-frame" data-frame-idx="${idx}" title="Copiar frame">📋</button>
        </div>
        <div class="ws-frame-content">
          <pre class="code-block">${highlightJson(frame.data)}</pre>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Copy frame clicks
  container.querySelectorAll('.btn-copy-frame').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-frame-idx'), 10);
      const targetFrame = wsFrames[idx];
      if (targetFrame && targetFrame.data) {
        navigator.clipboard.writeText(targetFrame.data)
          .then(() => showToast('Frame copiado!', 'success', 1500))
          .catch(() => showToast('Erro ao copiar frame', 'error'));
      }
    });
  });

  if (autoScroll) {
    container.scrollTop = container.scrollHeight;
  }
}
