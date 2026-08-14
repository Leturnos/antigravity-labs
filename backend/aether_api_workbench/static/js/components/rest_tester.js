/**
 * REST HTTP & SSE Composer Component for Aether API Workbench.
 * Full-featured HTTP client with query builder, headers, auth, body editor, SSE stream, and response metrics.
 */

import { showToast } from '../utils/toast.js';
import { formatBytes, formatMs, highlightJson, escapeHtml } from '../utils/formatters.js';

let activeComposerTab = 'params'; // 'params', 'headers', 'auth', 'body'
let activeResponseTab = 'pretty'; // 'pretty', 'raw', 'headers', 'timing'
let abortController = null;
let sseEventSource = null;
let currentResponseData = null;
let loadedRequestId = null; // if modifying an existing saved request

// Model state for composer
const composerState = {
  method: 'GET',
  url: 'https://jsonplaceholder.typicode.com/todos/1',
  params: [{ enabled: true, key: '', value: '' }],
  headers: [{ enabled: true, key: 'Accept', value: 'application/json' }],
  auth: { type: 'none', token: '', username: '', password: '' },
  bodyType: 'json',
  bodyContent: '{\n  "name": "Aether Item",\n  "status": "active"\n}',
  isStreamingSSE: false,
  sseEvents: []
};

/**
 * Render REST Tester view inside container.
 * @param {HTMLElement} container - Tab pane container element.
 */
export function renderRestTester(container) {
  container.innerHTML = `
    <div class="rest-tester-container">
      <!-- Top Request Bar -->
      <div class="glass-card request-bar-card">
        <div class="request-bar-grid">
          <select id="rest-method-select" class="input-select method-select">
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
            <option value="PATCH">PATCH</option>
            <option value="OPTIONS">OPTIONS</option>
            <option value="HEAD">HEAD</option>
          </select>

          <div class="url-input-wrap">
            <input 
              type="text" 
              id="rest-url-input" 
              class="input-text input-mono url-input" 
              placeholder="https://api.example.com/v1/resource ou /mock/users" 
              value="${escapeHtml(composerState.url)}"
              autocomplete="off"
            />
          </div>

          <div class="request-actions">
            <button id="btn-send-request" class="btn btn-primary btn-send">
              <span class="send-icon">🚀</span> <span class="send-text">Enviar</span>
            </button>
            <button id="btn-sse-stream" class="btn btn-secondary btn-sse" title="Ouvir Server-Sent Events (SSE)">
              <span class="sse-icon">📡</span> SSE
            </button>
            <button id="btn-save-request" class="btn btn-secondary btn-save" title="Salvar na Coleção">
              <span>💾</span> Salvar
            </button>
          </div>
        </div>
      </div>

      <!-- Two-Column Workspace: Composer vs Response -->
      <div class="rest-split-view">
        <!-- Left: Request Configuration Tabs -->
        <div class="glass-card composer-card">
          <div class="card-header-tabs">
            <div class="composer-tabs" role="tablist">
              <button class="comp-tab active" data-tab="params">Parâmetros <span class="badge-count" id="params-count">0</span></button>
              <button class="comp-tab" data-tab="headers">Cabeçalhos <span class="badge-count" id="headers-count">1</span></button>
              <button class="comp-tab" data-tab="auth">Autenticação</button>
              <button class="comp-tab" data-tab="body">Corpo (Body)</button>
            </div>
          </div>

          <div class="composer-tab-content">
            <!-- Params Tab -->
            <div class="comp-pane active" id="pane-comp-params">
              <div class="table-actions-top">
                <span class="sub-label">Query Parameters</span>
                <button id="btn-add-param" class="btn btn-sm btn-secondary">+ Adicionar Parâmetro</button>
              </div>
              <div class="key-value-list" id="params-list-container"></div>
            </div>

            <!-- Headers Tab -->
            <div class="comp-pane" id="pane-comp-headers">
              <div class="table-actions-top">
                <span class="sub-label">HTTP Request Headers</span>
                <div class="header-presets">
                  <button class="btn btn-sm btn-ghost preset-btn" data-header="Content-Type" data-val="application/json">+ JSON</button>
                  <button class="btn btn-sm btn-ghost preset-btn" data-header="Accept" data-val="application/json">+ Accept</button>
                  <button id="btn-add-header" class="btn btn-sm btn-secondary">+ Adicionar</button>
                </div>
              </div>
              <div class="key-value-list" id="headers-list-container"></div>
            </div>

            <!-- Auth Tab -->
            <div class="comp-pane" id="pane-comp-auth">
              <div class="auth-config-box">
                <label class="auth-type-label">Tipo de Autenticação:</label>
                <select id="auth-type-select" class="input-select">
                  <option value="none">Nenhuma (No Auth)</option>
                  <option value="bearer">Bearer Token</option>
                  <option value="basic">Basic Auth</option>
                </select>

                <div id="auth-bearer-inputs" class="auth-fields-group hidden">
                  <label class="field-label">Token:</label>
                  <input type="text" id="auth-bearer-token" class="input-text input-mono" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />
                </div>

                <div id="auth-basic-inputs" class="auth-fields-group hidden">
                  <label class="field-label">Usuário:</label>
                  <input type="text" id="auth-basic-user" class="input-text" placeholder="username" />
                  <label class="field-label">Senha:</label>
                  <input type="password" id="auth-basic-pass" class="input-text" placeholder="••••••••" />
                </div>
              </div>
            </div>

            <!-- Body Tab -->
            <div class="comp-pane" id="pane-comp-body">
              <div class="body-toolbar">
                <div class="body-type-select">
                  <label><input type="radio" name="body-type" value="json" checked> JSON</label>
                  <label><input type="radio" name="body-type" value="text"> Texto Puro</label>
                  <label><input type="radio" name="body-type" value="empty"> Vazio</label>
                </div>
                <div class="body-actions">
                  <button id="btn-format-json-body" class="btn btn-sm btn-ghost" title="Formatar JSON">✨ Prettify</button>
                  <button id="btn-clear-body" class="btn btn-sm btn-ghost" title="Limpar">Limpar</button>
                </div>
              </div>
              <textarea id="rest-body-textarea" class="input-textarea input-mono body-editor" rows="9" spellcheck="false" placeholder="Insira o payload JSON aqui...">${escapeHtml(composerState.bodyContent)}</textarea>
            </div>
          </div>
        </div>

        <!-- Right: Response Viewer & SSE Stream -->
        <div class="glass-card response-card">
          <!-- Response Status Bar -->
          <div class="response-status-bar" id="response-status-bar">
            <div class="resp-status-left">
              <span class="status-placeholder-text">Pronto para enviar requisição</span>
            </div>
            <div class="resp-status-right">
              <button id="btn-copy-response" class="btn btn-sm btn-ghost hidden" title="Copiar resposta">📋 Copiar</button>
            </div>
          </div>

          <!-- Response Tabs -->
          <div class="card-header-tabs resp-tabs-header">
            <div class="response-tabs" role="tablist">
              <button class="resp-tab active" data-tab="pretty">Pretty JSON</button>
              <button class="resp-tab" data-tab="raw">Raw</button>
              <button class="resp-tab" data-tab="headers">Cabeçalhos <span class="badge-count" id="resp-headers-count">0</span></button>
              <button class="resp-tab" data-tab="timing">Métricas &amp; Timing</button>
              <button class="resp-tab hidden" data-tab="sse" id="resp-tab-sse">SSE Stream <span class="badge-count" id="sse-event-count">0</span></button>
            </div>
          </div>

          <!-- Response Body Views -->
          <div class="response-content-area" id="response-content-area">
            <div class="response-empty-state">
              <span class="empty-icon">🛰️</span>
              <p>Envie uma requisição HTTP ou inicie um stream SSE para visualizar o payload e as métricas de resposta.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  attachRestTesterEvents(container);
  syncParamsFromUrl();
  renderParamsList();
  renderHeadersList();
}

/**
 * Bind all interactive event listeners for REST Tester.
 */
function attachRestTesterEvents(container) {
  const methodSelect = container.querySelector('#rest-method-select');
  const urlInput = container.querySelector('#rest-url-input');
  const sendBtn = container.querySelector('#btn-send-request');
  const sseBtn = container.querySelector('#btn-sse-stream');
  const saveBtn = container.querySelector('#btn-save-request');
  const addParamBtn = container.querySelector('#btn-add-param');
  const addHeaderBtn = container.querySelector('#btn-add-header');
  const formatBodyBtn = container.querySelector('#btn-format-json-body');
  const clearBodyBtn = container.querySelector('#btn-clear-body');
  const copyRespBtn = container.querySelector('#btn-copy-response');
  const authSelect = container.querySelector('#auth-type-select');

  // Method change
  if (methodSelect) {
    methodSelect.value = composerState.method;
    methodSelect.addEventListener('change', (e) => {
      composerState.method = e.target.value;
    });
  }

  // URL input change (syncs query params)
  if (urlInput) {
    urlInput.addEventListener('input', (e) => {
      composerState.url = e.target.value;
      syncParamsFromUrl();
      renderParamsList();
    });
  }

  // Send HTTP button
  if (sendBtn) {
    sendBtn.addEventListener('click', handleSendRequest);
  }

  // SSE Stream button
  if (sseBtn) {
    sseBtn.addEventListener('click', handleToggleSSE);
  }

  // Save to collection button
  if (saveBtn) {
    saveBtn.addEventListener('click', handleSaveRequestPrompt);
  }

  // Add Param & Header
  if (addParamBtn) {
    addParamBtn.addEventListener('click', () => {
      composerState.params.push({ enabled: true, key: '', value: '' });
      renderParamsList();
    });
  }

  if (addHeaderBtn) {
    addHeaderBtn.addEventListener('click', () => {
      composerState.headers.push({ enabled: true, key: '', value: '' });
      renderHeadersList();
    });
  }

  // Header presets
  container.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const headerKey = btn.getAttribute('data-header');
      const headerVal = btn.getAttribute('data-val');
      const existing = composerState.headers.find(h => h.key.toLowerCase() === headerKey.toLowerCase());
      if (existing) {
        existing.value = headerVal;
        existing.enabled = true;
      } else {
        composerState.headers.push({ enabled: true, key: headerKey, value: headerVal });
      }
      renderHeadersList();
    });
  });

  // Auth Type
  if (authSelect) {
    authSelect.addEventListener('change', (e) => {
      composerState.auth.type = e.target.value;
      const bearerBox = container.querySelector('#auth-bearer-inputs');
      const basicBox = container.querySelector('#auth-basic-inputs');
      if (bearerBox) bearerBox.classList.toggle('hidden', composerState.auth.type !== 'bearer');
      if (basicBox) basicBox.classList.toggle('hidden', composerState.auth.type !== 'basic');
      applyAuthToHeaders();
    });
  }

  const tokenInput = container.querySelector('#auth-bearer-token');
  if (tokenInput) {
    tokenInput.addEventListener('input', (e) => {
      composerState.auth.token = e.target.value;
      applyAuthToHeaders();
    });
  }

  const userInput = container.querySelector('#auth-basic-user');
  const passInput = container.querySelector('#auth-basic-pass');
  if (userInput && passInput) {
    const updateBasic = () => {
      composerState.auth.username = userInput.value;
      composerState.auth.password = passInput.value;
      applyAuthToHeaders();
    };
    userInput.addEventListener('input', updateBasic);
    passInput.addEventListener('input', updateBasic);
  }

  // Body editor
  const bodyTextarea = container.querySelector('#rest-body-textarea');
  if (bodyTextarea) {
    bodyTextarea.addEventListener('input', (e) => {
      composerState.bodyContent = e.target.value;
    });
  }

  if (formatBodyBtn && bodyTextarea) {
    formatBodyBtn.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(bodyTextarea.value);
        bodyTextarea.value = JSON.stringify(parsed, null, 2);
        composerState.bodyContent = bodyTextarea.value;
        showToast('JSON formatado com sucesso!', 'success', 2000);
      } catch (err) {
        showToast('JSON inválido para formatação', 'warning');
      }
    });
  }

  if (clearBodyBtn && bodyTextarea) {
    clearBodyBtn.addEventListener('click', () => {
      bodyTextarea.value = '';
      composerState.bodyContent = '';
    });
  }

  // Copy Response
  if (copyRespBtn) {
    copyRespBtn.addEventListener('click', () => {
      if (currentResponseData && currentResponseData.body) {
        navigator.clipboard.writeText(currentResponseData.body)
          .then(() => showToast('Resposta copiada para o clipboard!', 'success', 2000))
          .catch(() => showToast('Erro ao copiar', 'error'));
      }
    });
  }

  // Composer Tabs
  container.querySelectorAll('.comp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.comp-tab').forEach(t => t.classList.remove('active'));
      container.querySelectorAll('.comp-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      activeComposerTab = tab.getAttribute('data-tab');
      const targetPane = container.querySelector(`#pane-comp-${activeComposerTab}`);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Response Tabs
  container.querySelectorAll('.resp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      container.querySelectorAll('.resp-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeResponseTab = tab.getAttribute('data-tab');
      renderResponseView();
    });
  });

  // Global listeners from Sidebar / History
  window.addEventListener('aether:load-request', (e) => {
    if (e.detail) loadRequestIntoComposer(e.detail);
  });

  window.addEventListener('aether:load-history', (e) => {
    if (e.detail) loadHistoryIntoComposer(e.detail);
  });

  window.addEventListener('aether:new-request', (e) => {
    resetComposer();
    if (e.detail && e.detail.collection_id) {
      loadedRequestId = null;
      composerState.targetCollectionId = e.detail.collection_id;
    }
  });
}

/**
 * Synchronize Query Parameters table from the current URL query string.
 */
function syncParamsFromUrl() {
  try {
    const rawUrl = composerState.url.trim();
    if (!rawUrl.includes('?')) return;

    const queryPart = rawUrl.substring(rawUrl.indexOf('?') + 1);
    const searchParams = new URLSearchParams(queryPart);
    
    const newParams = [];
    searchParams.forEach((val, key) => {
      newParams.push({ enabled: true, key, value: val });
    });

    if (newParams.length > 0) {
      composerState.params = newParams;
    }
  } catch (e) {
    // Ignore URL parse errors while typing
  }
}

/**
 * Rebuild URL from Base URL + active Query Parameters table.
 */
function updateUrlFromParams() {
  try {
    let rawUrl = composerState.url.trim();
    const qIndex = rawUrl.indexOf('?');
    const baseUrl = qIndex !== -1 ? rawUrl.substring(0, qIndex) : rawUrl;

    const activeParams = composerState.params.filter(p => p.enabled && p.key.trim().length > 0);
    if (activeParams.length === 0) {
      composerState.url = baseUrl;
    } else {
      const searchParams = new URLSearchParams();
      activeParams.forEach(p => searchParams.append(p.key.trim(), p.value));
      composerState.url = `${baseUrl}?${searchParams.toString()}`;
    }

    const urlInput = document.getElementById('rest-url-input');
    if (urlInput && urlInput.value !== composerState.url) {
      urlInput.value = composerState.url;
    }
  } catch (e) {
    console.error('Error rebuilding URL from params:', e);
  }
}

/**
 * Render Key-Value query parameters list.
 */
function renderParamsList() {
  const container = document.getElementById('params-list-container');
  const countBadge = document.getElementById('params-count');
  if (!container) return;

  if (countBadge) {
    const activeCount = composerState.params.filter(p => p.enabled && p.key).length;
    countBadge.innerText = String(activeCount);
  }

  if (composerState.params.length === 0) {
    composerState.params.push({ enabled: true, key: '', value: '' });
  }

  let html = '';
  composerState.params.forEach((param, index) => {
    html += `
      <div class="key-value-row" data-param-idx="${index}">
        <label class="kv-checkbox-wrap">
          <input type="checkbox" class="param-enable-toggle" ${param.enabled ? 'checked' : ''} />
        </label>
        <input type="text" class="input-text input-mono kv-key" placeholder="Key" value="${escapeHtml(param.key)}" />
        <input type="text" class="input-text input-mono kv-value" placeholder="Value" value="${escapeHtml(param.value)}" />
        <button class="btn-icon-del btn-del-param" title="Remover">&times;</button>
      </div>
    `;
  });

  container.innerHTML = html;

  // Bind row inputs
  container.querySelectorAll('.key-value-row').forEach(row => {
    const idx = parseInt(row.getAttribute('data-param-idx'), 10);
    const chk = row.querySelector('.param-enable-toggle');
    const keyInp = row.querySelector('.kv-key');
    const valInp = row.querySelector('.kv-value');
    const delBtn = row.querySelector('.btn-del-param');

    if (chk) {
      chk.onchange = () => {
        composerState.params[idx].enabled = chk.checked;
        updateUrlFromParams();
        renderParamsList();
      };
    }

    if (keyInp) {
      keyInp.oninput = () => {
        composerState.params[idx].key = keyInp.value;
        updateUrlFromParams();
      };
    }

    if (valInp) {
      valInp.oninput = () => {
        composerState.params[idx].value = valInp.value;
        updateUrlFromParams();
      };
    }

    if (delBtn) {
      delBtn.onclick = () => {
        composerState.params.splice(idx, 1);
        updateUrlFromParams();
        renderParamsList();
      };
    }
  });
}

/**
 * Render Key-Value headers list.
 */
function renderHeadersList() {
  const container = document.getElementById('headers-list-container');
  const countBadge = document.getElementById('headers-count');
  if (!container) return;

  if (countBadge) {
    const activeCount = composerState.headers.filter(h => h.enabled && h.key).length;
    countBadge.innerText = String(activeCount);
  }

  if (composerState.headers.length === 0) {
    composerState.headers.push({ enabled: true, key: '', value: '' });
  }

  let html = '';
  composerState.headers.forEach((header, index) => {
    html += `
      <div class="key-value-row" data-header-idx="${index}">
        <label class="kv-checkbox-wrap">
          <input type="checkbox" class="header-enable-toggle" ${header.enabled ? 'checked' : ''} />
        </label>
        <input type="text" class="input-text input-mono kv-key" placeholder="Header name" value="${escapeHtml(header.key)}" />
        <input type="text" class="input-text input-mono kv-value" placeholder="Header value" value="${escapeHtml(header.value)}" />
        <button class="btn-icon-del btn-del-header" title="Remover">&times;</button>
      </div>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.key-value-row').forEach(row => {
    const idx = parseInt(row.getAttribute('data-header-idx'), 10);
    const chk = row.querySelector('.header-enable-toggle');
    const keyInp = row.querySelector('.kv-key');
    const valInp = row.querySelector('.kv-value');
    const delBtn = row.querySelector('.btn-del-header');

    if (chk) {
      chk.onchange = () => {
        composerState.headers[idx].enabled = chk.checked;
        renderHeadersList();
      };
    }

    if (keyInp) {
      keyInp.oninput = () => {
        composerState.headers[idx].key = keyInp.value;
      };
    }

    if (valInp) {
      valInp.oninput = () => {
        composerState.headers[idx].value = valInp.value;
      };
    }

    if (delBtn) {
      delBtn.onclick = () => {
        composerState.headers.splice(idx, 1);
        renderHeadersList();
      };
    }
  });
}

/**
 * Apply Bearer or Basic Auth to the HTTP headers list.
 */
function applyAuthToHeaders() {
  const authIdx = composerState.headers.findIndex(h => h.key.toLowerCase() === 'authorization');
  
  if (composerState.auth.type === 'none') {
    if (authIdx !== -1) {
      composerState.headers.splice(authIdx, 1);
    }
  } else if (composerState.auth.type === 'bearer') {
    const val = `Bearer ${composerState.auth.token || ''}`.trim();
    if (authIdx !== -1) {
      composerState.headers[authIdx] = { enabled: true, key: 'Authorization', value: val };
    } else {
      composerState.headers.push({ enabled: true, key: 'Authorization', value: val });
    }
  } else if (composerState.auth.type === 'basic') {
    const encoded = btoa(`${composerState.auth.username || ''}:${composerState.auth.password || ''}`);
    const val = `Basic ${encoded}`;
    if (authIdx !== -1) {
      composerState.headers[authIdx] = { enabled: true, key: 'Authorization', value: val };
    } else {
      composerState.headers.push({ enabled: true, key: 'Authorization', value: val });
    }
  }

  renderHeadersList();
}

/**
 * Execute HTTP Request via backend Proxy /api/proxy.
 */
async function handleSendRequest() {
  const sendBtn = document.getElementById('btn-send-request');
  const url = composerState.url.trim();

  if (!url) {
    showToast('Informe uma URL válida para a requisição.', 'warning');
    return;
  }

  // Prepare Headers Object
  const headersObj = {};
  composerState.headers
    .filter(h => h.enabled && h.key.trim().length > 0)
    .forEach(h => {
      headersObj[h.key.trim()] = h.value;
    });

  // Prepare Body
  let bodyPayload = null;
  const method = composerState.method.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && composerState.bodyContent.trim()) {
    try {
      bodyPayload = JSON.parse(composerState.bodyContent);
    } catch {
      bodyPayload = composerState.bodyContent;
    }
  }

  // Set loading UI
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = `<span class="loading-spinner-sm"></span> Executando...`;
  }

  const statusBar = document.getElementById('response-status-bar');
  if (statusBar) {
    statusBar.innerHTML = `
      <div class="resp-status-left">
        <span class="loading-pulse-badge">🚀 Enviando requisição...</span>
      </div>
    `;
  }

  abortController = new AbortController();

  try {
    const proxyPayload = {
      method: composerState.method,
      url: composerState.url,
      headers: headersObj,
      body: bodyPayload,
      timeout_seconds: 30.0
    };

    const res = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyPayload),
      signal: abortController.signal
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(errData.detail || `Erro no proxy HTTP ${res.status}`);
    }

    const data = await res.json();
    currentResponseData = data;

    renderResponseHeaderStatusBar(data);
    renderResponseView();

    // Dispatch custom event to notify Sidebar History and Latency Analytics
    window.dispatchEvent(new CustomEvent('aether:request-executed', { detail: data }));
    showToast(`Requisição concluída (${data.status_code}) em ${formatMs(data.execution_time_ms)}`, 'success', 2500);

  } catch (err) {
    if (err.name === 'AbortError') {
      showToast('Requisição cancelada pelo usuário.', 'info');
    } else {
      showToast(`Erro na requisição: ${err.message}`, 'error', 4000);
      renderErrorResponse(err.message);
    }
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = `<span class="send-icon">🚀</span> <span class="send-text">Enviar</span>`;
    }
    abortController = null;
  }
}

/**
 * Handle Server-Sent Events (SSE) live streaming listener.
 */
function handleToggleSSE() {
  const sseBtn = document.getElementById('btn-sse-stream');
  const sseTabBtn = document.getElementById('resp-tab-sse');

  if (composerState.isStreamingSSE) {
    // Stop stream
    if (sseEventSource) {
      sseEventSource.close();
      sseEventSource = null;
    }
    composerState.isStreamingSSE = false;
    if (sseBtn) {
      sseBtn.classList.remove('btn-danger');
      sseBtn.classList.add('btn-secondary');
      sseBtn.innerHTML = `<span class="sse-icon">📡</span> SSE`;
    }
    showToast('SSE Stream finalizado.', 'info');
    return;
  }

  // Start Stream
  const url = composerState.url.trim();
  if (!url) {
    showToast('Informe uma URL SSE válida.', 'warning');
    return;
  }

  try {
    composerState.sseEvents = [];
    if (sseTabBtn) sseTabBtn.classList.remove('hidden');

    sseEventSource = new EventSource(url);
    composerState.isStreamingSSE = true;

    if (sseBtn) {
      sseBtn.classList.remove('btn-secondary');
      sseBtn.classList.add('btn-danger');
      sseBtn.innerHTML = `<span class="sse-icon">⏹</span> Parar SSE`;
    }

    // Switch to SSE tab
    activeResponseTab = 'sse';
    document.querySelectorAll('.resp-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === 'sse');
    });

    sseEventSource.onopen = () => {
      showToast('Conexão SSE estabelecida!', 'success');
      appendSSEEvent({ type: 'system', data: 'Conexão aberta com o servidor SSE', timestamp: new Date() });
    };

    sseEventSource.onmessage = (e) => {
      appendSSEEvent({ type: 'message', data: e.data, lastEventId: e.lastEventId, timestamp: new Date() });
    };

    sseEventSource.onerror = (err) => {
      appendSSEEvent({ type: 'error', data: 'Erro na conexão SSE ou conexão fechada pelo servidor', timestamp: new Date() });
      if (sseEventSource.readyState === EventSource.CLOSED) {
        handleToggleSSE();
      }
    };

  } catch (err) {
    showToast(`Falha ao iniciar SSE: ${err.message}`, 'error');
    composerState.isStreamingSSE = false;
  }
}

function appendSSEEvent(eventObj) {
  composerState.sseEvents.unshift(eventObj);
  const countBadge = document.getElementById('sse-event-count');
  if (countBadge) countBadge.innerText = String(composerState.sseEvents.length);
  if (activeResponseTab === 'sse') {
    renderResponseView();
  }
}

/**
 * Render Response status header bar with Status badge, Latency, Size, and Copy button.
 */
function renderResponseHeaderStatusBar(data) {
  const statusBar = document.getElementById('response-status-bar');
  const copyBtn = document.getElementById('btn-copy-response');
  const headersCount = document.getElementById('resp-headers-count');
  if (!statusBar) return;

  const status = data.status_code || 200;
  const statusClass = `s${String(status)[0]}xx`;
  const bodySize = data.body ? new Blob([data.body]).size : 0;

  if (headersCount && data.headers) {
    headersCount.innerText = String(Object.keys(data.headers).length);
  }

  statusBar.innerHTML = `
    <div class="resp-status-left">
      <span class="badge-status ${statusClass}">${status}</span>
      <span class="resp-pill" title="Tempo Total">${formatMs(data.execution_time_ms || 0)}</span>
      <span class="resp-pill" title="Tamanho do Payload">${formatBytes(bodySize)}</span>
      ${data.timing?.ttfb_ms ? `<span class="resp-pill subtle" title="TTFB (Time to First Byte)">TTFB: ${data.timing.ttfb_ms} ms</span>` : ''}
      ${data.timing?.dns_ms ? `<span class="resp-pill subtle" title="Resolução DNS">DNS: ${data.timing.dns_ms} ms</span>` : ''}
    </div>
    <div class="resp-status-right">
      <button id="btn-copy-response" class="btn btn-sm btn-ghost" title="Copiar resposta">📋 Copiar</button>
    </div>
  `;

  const newCopyBtn = statusBar.querySelector('#btn-copy-response');
  if (newCopyBtn) {
    newCopyBtn.onclick = () => {
      if (data.body) {
        navigator.clipboard.writeText(data.body)
          .then(() => showToast('Resposta copiada para o clipboard!', 'success', 2000))
          .catch(() => showToast('Erro ao copiar', 'error'));
      }
    };
  }
}

/**
 * Render main response view based on active response tab.
 */
function renderResponseView() {
  const contentArea = document.getElementById('response-content-area');
  if (!contentArea) return;

  if (activeResponseTab === 'sse') {
    renderSSEResponseView(contentArea);
    return;
  }

  if (!currentResponseData) {
    contentArea.innerHTML = `
      <div class="response-empty-state">
        <span class="empty-icon">🛰️</span>
        <p>Envie uma requisição HTTP para visualizar os dados de retorno.</p>
      </div>
    `;
    return;
  }

  const { body, headers, timing } = currentResponseData;

  if (activeResponseTab === 'pretty') {
    const highlighted = highlightJson(body);
    contentArea.innerHTML = `<pre class="code-block code-pretty">${highlighted}</pre>`;
  } else if (activeResponseTab === 'raw') {
    contentArea.innerHTML = `<pre class="code-block code-raw">${escapeHtml(body || '')}</pre>`;
  } else if (activeResponseTab === 'headers') {
    if (!headers || Object.keys(headers).length === 0) {
      contentArea.innerHTML = `<div class="empty-col-hint">Nenhum cabeçalho retornado.</div>`;
      return;
    }
    let html = `<div class="headers-table-wrap"><table class="headers-table"><thead><tr><th>Header</th><th>Value</th></tr></thead><tbody>`;
    for (const [k, v] of Object.entries(headers)) {
      html += `<tr><td class="header-name">${escapeHtml(k)}</td><td class="header-val">${escapeHtml(String(v))}</td></tr>`;
    }
    html += `</tbody></table></div>`;
    contentArea.innerHTML = html;
  } else if (activeResponseTab === 'timing') {
    renderTimingDetailsView(contentArea, timing);
  }
}

function renderSSEResponseView(container) {
  if (composerState.sseEvents.length === 0) {
    container.innerHTML = `
      <div class="response-empty-state">
        <span class="empty-icon">📡</span>
        <p>Aguardando eventos do stream SSE...</p>
      </div>
    `;
    return;
  }

  let html = `<div class="sse-events-stream">`;
  composerState.sseEvents.forEach(evt => {
    const timeStr = evt.timestamp.toLocaleTimeString();
    html += `
      <div class="sse-event-card ${evt.type}">
        <div class="sse-card-header">
          <span class="sse-type-badge">${evt.type.toUpperCase()}</span>
          <span class="sse-time">${timeStr}</span>
          ${evt.lastEventId ? `<span class="sse-id">ID: ${escapeHtml(evt.lastEventId)}</span>` : ''}
        </div>
        <div class="sse-card-body">
          <pre class="code-block">${highlightJson(evt.data)}</pre>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  container.innerHTML = html;
}

function renderTimingDetailsView(container, timing) {
  const dns = timing?.dns_ms || 0;
  const ttfb = timing?.ttfb_ms || 0;
  const total = timing?.total_ms || currentResponseData?.execution_time_ms || 0;
  const download = Math.max(0, total - ttfb);

  container.innerHTML = `
    <div class="timing-breakdown-card">
      <h4 class="timing-title">Detalhamento de Latência e Conexão</h4>
      
      <div class="timing-bar-container">
        <div class="timing-bar-segment dns" style="width: ${Math.max(5, (dns / total) * 100)}%" title="DNS: ${dns} ms">DNS (${dns} ms)</div>
        <div class="timing-bar-segment ttfb" style="width: ${Math.max(10, ((ttfb - dns) / total) * 100)}%" title="TTFB: ${ttfb} ms">TTFB (${ttfb} ms)</div>
        <div class="timing-bar-segment download" style="width: ${Math.max(10, (download / total) * 100)}%" title="Download: ${download.toFixed(1)} ms">Download (${download.toFixed(1)} ms)</div>
      </div>

      <div class="timing-stats-grid">
        <div class="stat-box">
          <span class="stat-label">DNS Lookup</span>
          <span class="stat-val">${dns} ms</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">TTFB (Server Processing)</span>
          <span class="stat-val">${ttfb} ms</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Content Download</span>
          <span class="stat-val">${download.toFixed(1)} ms</span>
        </div>
        <div class="stat-box highlight">
          <span class="stat-label">Tempo Total (RTT)</span>
          <span class="stat-val">${total} ms</span>
        </div>
      </div>
    </div>
  `;
}

function renderErrorResponse(errorMessage) {
  const statusBar = document.getElementById('response-status-bar');
  const contentArea = document.getElementById('response-content-area');

  if (statusBar) {
    statusBar.innerHTML = `
      <div class="resp-status-left">
        <span class="badge-status s5xx">ERROR</span>
        <span class="resp-pill">Falha na Conexão</span>
      </div>
    `;
  }

  if (contentArea) {
    contentArea.innerHTML = `
      <div class="response-error-state">
        <span class="error-icon">⚠️</span>
        <h4>Erro na execução da requisição</h4>
        <p class="error-detail">${escapeHtml(errorMessage)}</p>
      </div>
    `;
  }
}

/**
 * Load saved request into composer fields.
 */
function loadRequestIntoComposer(req) {
  loadedRequestId = req.id;
  composerState.method = req.method || 'GET';
  composerState.url = req.url || '';
  composerState.bodyContent = req.body || '';

  // Parse Headers
  if (req.headers) {
    try {
      const parsed = typeof req.headers === 'string' ? JSON.parse(req.headers) : req.headers;
      composerState.headers = Object.entries(parsed).map(([k, v]) => ({ enabled: true, key: k, value: String(v) }));
    } catch {
      composerState.headers = [{ enabled: true, key: 'Accept', value: 'application/json' }];
    }
  }

  // Update UI inputs
  const methodSelect = document.getElementById('rest-method-select');
  const urlInput = document.getElementById('rest-url-input');
  const bodyArea = document.getElementById('rest-body-textarea');

  if (methodSelect) methodSelect.value = composerState.method;
  if (urlInput) urlInput.value = composerState.url;
  if (bodyArea) bodyArea.value = composerState.bodyContent;

  syncParamsFromUrl();
  renderParamsList();
  renderHeadersList();
  showToast(`Requisição "${req.name || req.url}" carregada`, 'info', 2000);
}

/**
 * Load History entry into composer fields.
 */
function loadHistoryIntoComposer(log) {
  loadedRequestId = null;
  composerState.method = log.request_method || 'GET';
  composerState.url = log.request_url || '';
  composerState.bodyContent = log.request_body || '';

  const methodSelect = document.getElementById('rest-method-select');
  const urlInput = document.getElementById('rest-url-input');
  const bodyArea = document.getElementById('rest-body-textarea');

  if (methodSelect) methodSelect.value = composerState.method;
  if (urlInput) urlInput.value = composerState.url;
  if (bodyArea) bodyArea.value = composerState.bodyContent;

  // Headers
  if (log.request_headers) {
    try {
      const parsed = typeof log.request_headers === 'string' ? JSON.parse(log.request_headers) : log.request_headers;
      composerState.headers = Object.entries(parsed).map(([k, v]) => ({ enabled: true, key: k, value: String(v) }));
    } catch {
      composerState.headers = [{ enabled: true, key: 'Accept', value: 'application/json' }];
    }
  }

  syncParamsFromUrl();
  renderParamsList();
  renderHeadersList();

  // If response exists in history, render preview
  if (log.response_body || log.response_status) {
    currentResponseData = {
      status_code: log.response_status,
      body: log.response_body,
      headers: log.response_headers ? (typeof log.response_headers === 'string' ? JSON.parse(log.response_headers) : log.response_headers) : {},
      execution_time_ms: log.execution_time_ms || 0
    };
    renderResponseHeaderStatusBar(currentResponseData);
    renderResponseView();
  }

  showToast('Histórico carregado no composer', 'info', 2000);
}

function resetComposer() {
  loadedRequestId = null;
  composerState.method = 'GET';
  composerState.url = '';
  composerState.params = [{ enabled: true, key: '', value: '' }];
  composerState.headers = [{ enabled: true, key: 'Accept', value: 'application/json' }];
  composerState.bodyContent = '';

  const methodSelect = document.getElementById('rest-method-select');
  const urlInput = document.getElementById('rest-url-input');
  const bodyArea = document.getElementById('rest-body-textarea');

  if (methodSelect) methodSelect.value = 'GET';
  if (urlInput) urlInput.value = '';
  if (bodyArea) bodyArea.value = '';

  renderParamsList();
  renderHeadersList();
}

/**
 * Handle saving the current request to a collection via prompt modal.
 */
async function handleSaveRequestPrompt() {
  const reqName = prompt('Nome para esta requisição:', composerState.url.split('?')[0] || 'Nova Requisição');
  if (!reqName || !reqName.trim()) return;

  // Fetch collections to let user assign collection or leave uncategorized
  let collections = [];
  try {
    const res = await fetch('/api/collections');
    if (res.ok) collections = await res.json();
  } catch (e) {
    console.error('Failed to fetch collections:', e);
  }

  let collectionId = null;
  if (collections.length > 0) {
    const colOptions = collections.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const choice = prompt(`Selecione a Coleção (ou deixe vazio para Avulsa):\n${colOptions}\nDigite o número:`);
    const num = parseInt(choice, 10);
    if (!isNaN(num) && num >= 1 && num <= collections.length) {
      collectionId = collections[num - 1].id;
    }
  }

  // Headers obj
  const headersObj = {};
  composerState.headers
    .filter(h => h.enabled && h.key.trim())
    .forEach(h => { headersObj[h.key.trim()] = h.value; });

  const payload = {
    name: reqName.trim(),
    method: composerState.method,
    url: composerState.url,
    collection_id: collectionId,
    headers: headersObj,
    body: composerState.bodyContent
  };

  try {
    const res = await fetch('/api/saved-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showToast('Requisição salva com sucesso!', 'success');
      window.dispatchEvent(new CustomEvent('aether:refresh-sidebar'));
    } else {
      showToast('Erro ao salvar requisição', 'error');
    }
  } catch (err) {
    showToast(`Erro de conexão: ${err.message}`, 'error');
  }
}
