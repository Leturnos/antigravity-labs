/**
 * Mock Studio Component for Aether API Workbench.
 * Schema-driven dynamic mock server designer with real-time semantic fake JSON generator.
 */

import { showToast, showConfirm } from '../utils/toast.js';
import { highlightJson, escapeHtml } from '../utils/formatters.js';
import { generateFakeFromSchemaJS, SCHEMA_TEMPLATES } from '../utils/fake_generator.js';
import { switchTab } from '../app.js';

let editingMockId = null;

const mockState = {
  name: 'Users API Mock',
  path: '/api/v1/users',
  method: 'GET',
  statusCode: 200,
  delayMs: 150,
  isActive: true,
  schemaJson: JSON.stringify(SCHEMA_TEMPLATES.user_profile.schema, null, 2),
  fakePreview: null
};

/**
 * Render Mock Studio UI inside container.
 * @param {HTMLElement} container - Target tab pane element.
 */
export function renderMockStudio(container) {
  container.innerHTML = `
    <div class="mock-studio-container">
      <!-- Top Control Card -->
      <div class="glass-card mock-config-card">
        <div class="mock-config-header">
          <div class="mock-title-group">
            <span class="mock-icon">🎭</span>
            <div>
              <h3 id="mock-form-title">${editingMockId ? 'Editar Mock Endpoint' : 'Criar Novo Mock Endpoint'}</h3>
              <p class="sub-label">Configure endpoints simulados com resposta gerada semanticamente por JSON Schema.</p>
            </div>
          </div>

          <div class="mock-header-actions">
            <button id="btn-reset-mock" class="btn btn-secondary btn-sm" title="Criar Novo">Novo Mock</button>
            <button id="btn-save-mock" class="btn btn-primary">
              <span>💾</span> Salvar Endpoint
            </button>
            <button id="btn-test-mock" class="btn btn-success" title="Testar mock no REST Tester">
              <span>⚡</span> Testar no REST
            </button>
          </div>
        </div>

        <div class="mock-form-grid">
          <div class="form-group">
            <label class="form-label">Nome / Identificador:</label>
            <input type="text" id="mock-name-input" class="input-text" placeholder="Ex: Usuários Paginação" value="${escapeHtml(mockState.name)}" />
          </div>

          <div class="form-group">
            <label class="form-label">Método HTTP:</label>
            <select id="mock-method-select" class="input-select">
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Caminho da Rota (Path):</label>
            <input type="text" id="mock-path-input" class="input-text input-mono" placeholder="/api/v1/users" value="${escapeHtml(mockState.path)}" />
          </div>

          <div class="form-group">
            <label class="form-label">Status Code HTTP:</label>
            <select id="mock-status-select" class="input-select">
              <option value="200">200 OK</option>
              <option value="201">201 Created</option>
              <option value="204">204 No Content</option>
              <option value="400">400 Bad Request</option>
              <option value="401">401 Unauthorized</option>
              <option value="403">403 Forbidden</option>
              <option value="404">404 Not Found</option>
              <option value="422">422 Unprocessable Entity</option>
              <option value="500">500 Internal Server Error</option>
            </select>
          </div>

          <div class="form-group delay-slider-group">
            <div class="label-with-val">
              <label class="form-label">Latência Simulada (Delay):</label>
              <span class="slider-val-badge" id="mock-delay-badge">${mockState.delayMs} ms</span>
            </div>
            <input type="range" id="mock-delay-range" min="0" max="3000" step="50" value="${mockState.delayMs}" class="slider-input" />
          </div>

          <div class="form-group active-toggle-group">
            <label class="form-label">Status de Ativação:</label>
            <label class="switch-toggle-large">
              <input type="checkbox" id="mock-active-chk" ${mockState.isActive ? 'checked' : ''} />
              <span class="slider round"></span>
              <span class="active-label-text" id="mock-active-label">${mockState.isActive ? 'Mock Ativo' : 'Mock Desativado'}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- Split Schema Editor & Live Fake Data Preview -->
      <div class="mock-workspace-grid">
        <!-- Left: Schema Editor -->
        <div class="glass-card schema-editor-card">
          <div class="card-header-flex">
            <div class="schema-templates-box">
              <label class="sub-label">Templates Prontos:</label>
              <select id="mock-template-select" class="input-select input-sm">
                <option value="">-- Carregar Template --</option>
                <option value="user_profile">User Profile</option>
                <option value="paginated_list">Paginated List</option>
                <option value="product_item">Product Item</option>
                <option value="error_response">Error Object</option>
                <option value="auth_token">Auth Token</option>
              </select>
            </div>
            <div class="editor-actions">
              <button id="btn-mock-format-schema" class="btn btn-sm btn-ghost">✨ Prettify JSON</button>
            </div>
          </div>

          <div class="schema-editor-wrap">
            <textarea 
              id="mock-schema-textarea" 
              class="input-textarea input-mono schema-editor" 
              spellcheck="false" 
              rows="14" 
              placeholder="Defina o JSON Schema ou JSON estático aqui..."
            >${escapeHtml(mockState.schemaJson)}</textarea>
          </div>
        </div>

        <!-- Right: Live Generated Fake Preview -->
        <div class="glass-card live-preview-card">
          <div class="card-header-flex">
            <div class="preview-title-group">
              <h4>Live Fake Preview (Client-Side)</h4>
              <span class="badge-live-pulse">🟢 Tempo Real</span>
            </div>
            <button id="btn-mock-regen-preview" class="btn btn-sm btn-ghost" title="Regenerar dados aleatórios">🎲 Regenerar</button>
          </div>

          <div class="live-preview-content" id="mock-preview-content">
            <!-- Injected dynamically -->
          </div>
        </div>
      </div>
    </div>
  `;

  attachMockStudioEvents(container);
  updateFakePreview();
}

/**
 * Attach Mock Studio events.
 */
function attachMockStudioEvents(container) {
  const nameInput = container.querySelector('#mock-name-input');
  const methodSelect = container.querySelector('#mock-method-select');
  const pathInput = container.querySelector('#mock-path-input');
  const statusSelect = container.querySelector('#mock-status-select');
  const delayRange = container.querySelector('#mock-delay-range');
  const delayBadge = container.querySelector('#mock-delay-badge');
  const activeChk = container.querySelector('#mock-active-chk');
  const activeLabel = container.querySelector('#mock-active-label');
  const templateSelect = container.querySelector('#mock-template-select');
  const schemaArea = container.querySelector('#mock-schema-textarea');
  const formatBtn = container.querySelector('#btn-mock-format-schema');
  const regenBtn = container.querySelector('#btn-mock-regen-preview');
  const saveBtn = container.querySelector('#btn-save-mock');
  const testBtn = container.querySelector('#btn-test-mock');
  const resetBtn = container.querySelector('#btn-reset-mock');

  if (nameInput) {
    nameInput.addEventListener('input', (e) => { mockState.name = e.target.value; });
  }

  if (methodSelect) {
    methodSelect.value = mockState.method;
    methodSelect.addEventListener('change', (e) => { mockState.method = e.target.value; });
  }

  if (pathInput) {
    pathInput.addEventListener('input', (e) => { mockState.path = e.target.value; });
  }

  if (statusSelect) {
    statusSelect.value = String(mockState.statusCode);
    statusSelect.addEventListener('change', (e) => { mockState.statusCode = parseInt(e.target.value, 10); });
  }

  if (delayRange && delayBadge) {
    delayRange.addEventListener('input', (e) => {
      mockState.delayMs = parseInt(e.target.value, 10);
      delayBadge.innerText = `${mockState.delayMs} ms`;
    });
  }

  if (activeChk && activeLabel) {
    activeChk.addEventListener('change', (e) => {
      mockState.isActive = e.target.checked;
      activeLabel.innerText = mockState.isActive ? 'Mock Ativo' : 'Mock Desativado';
    });
  }

  if (templateSelect && schemaArea) {
    templateSelect.addEventListener('change', (e) => {
      const selected = e.target.value;
      if (selected && SCHEMA_TEMPLATES[selected]) {
        schemaArea.value = JSON.stringify(SCHEMA_TEMPLATES[selected].schema, null, 2);
        mockState.schemaJson = schemaArea.value;
        updateFakePreview();
        showToast(`Template "${SCHEMA_TEMPLATES[selected].name}" carregado!`, 'info', 1500);
      }
    });
  }

  if (schemaArea) {
    schemaArea.addEventListener('input', (e) => {
      mockState.schemaJson = e.target.value;
      updateFakePreview();
    });
  }

  if (formatBtn && schemaArea) {
    formatBtn.addEventListener('click', () => {
      try {
        const parsed = JSON.parse(schemaArea.value);
        schemaArea.value = JSON.stringify(parsed, null, 2);
        mockState.schemaJson = schemaArea.value;
        showToast('JSON Schema formatado!', 'success', 1500);
      } catch {
        showToast('JSON inválido para formatação', 'warning');
      }
    });
  }

  if (regenBtn) {
    regenBtn.addEventListener('click', () => {
      updateFakePreview();
      showToast('Preview regenerado!', 'info', 1000);
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', handleSaveMockEndpoint);
  }

  if (testBtn) {
    testBtn.addEventListener('click', () => {
      let routePath = mockState.path.trim();
      if (!routePath.startsWith('/')) routePath = `/${routePath}`;
      const mockTestUrl = `${window.location.origin}/mock${routePath}`;
      
      window.dispatchEvent(new CustomEvent('aether:load-request', {
        detail: {
          name: `Teste Mock: ${mockState.name || routePath}`,
          method: mockState.method,
          url: mockTestUrl,
          headers: { 'Accept': 'application/json' },
          body: ''
        }
      }));
      switchTab('rest');
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', resetMockForm);
  }

  // Cross-component listeners
  window.addEventListener('aether:load-mock', (e) => {
    if (e.detail) loadMockIntoStudio(e.detail);
  });

  window.addEventListener('aether:new-mock', () => {
    resetMockForm();
  });
}

/**
 * Regenerate live client-side fake preview using generateFakeFromSchemaJS.
 */
function updateFakePreview() {
  const previewContainer = document.getElementById('mock-preview-content');
  if (!previewContainer) return;

  try {
    const raw = mockState.schemaJson.trim();
    if (!raw) {
      previewContainer.innerHTML = `<div class="empty-col-hint">Defina um schema para ver o preview.</div>`;
      return;
    }

    const parsed = JSON.parse(raw);
    let fakeData = null;

    // Check if it looks like a schema or plain JSON object
    if (typeof parsed === 'object' && parsed !== null) {
      const isSchema = ('$schema' in parsed) || ('properties' in parsed) || ('type' in parsed);
      if (isSchema) {
        fakeData = generateFakeFromSchemaJS(parsed);
      } else {
        fakeData = parsed;
      }
    } else {
      fakeData = parsed;
    }

    mockState.fakePreview = fakeData;
    previewContainer.innerHTML = `<pre class="code-block code-pretty">${highlightJson(fakeData)}</pre>`;

  } catch (err) {
    previewContainer.innerHTML = `
      <div class="schema-syntax-error">
        <span class="err-icon">⚠️</span>
        <span>Erro de sintaxe JSON no Schema: ${escapeHtml(err.message)}</span>
      </div>
    `;
  }
}

/**
 * Save or update Mock Endpoint via backend API.
 */
async function handleSaveMockEndpoint() {
  let path = mockState.path.trim();
  if (!path) {
    showToast('Informe o caminho (path) para o Mock Endpoint.', 'warning');
    return;
  }
  if (!path.startsWith('/')) path = `/${path}`;

  const payload = {
    name: mockState.name.trim() || path,
    path: path,
    method: mockState.method.toUpperCase(),
    status_code: mockState.statusCode,
    response_headers: { 'Content-Type': 'application/json' },
    response_body: mockState.schemaJson,
    delay_ms: mockState.delayMs,
    is_active: mockState.isActive
  };

  try {
    let res;
    if (editingMockId) {
      res = await fetch(`/api/mock-endpoints/${editingMockId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/mock-endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    if (res.ok) {
      const savedObj = await res.json();
      editingMockId = savedObj.id;
      showToast(`Mock endpoint "${path}" salvo com sucesso!`, 'success');
      window.dispatchEvent(new CustomEvent('aether:refresh-sidebar'));
      
      const formTitle = document.getElementById('mock-form-title');
      if (formTitle) formTitle.innerText = 'Editar Mock Endpoint';
    } else {
      const err = await res.json().catch(() => ({}));
      showToast(`Erro ao salvar mock: ${err.detail || res.statusText}`, 'error');
    }
  } catch (err) {
    showToast(`Erro de conexão: ${err.message}`, 'error');
  }
}

/**
 * Load mock endpoint data into form for editing.
 */
function loadMockIntoStudio(mockObj) {
  editingMockId = mockObj.id;
  mockState.name = mockObj.name || '';
  mockState.path = mockObj.path || '';
  mockState.method = mockObj.method || 'GET';
  mockState.statusCode = mockObj.status_code || 200;
  mockState.delayMs = mockObj.delay_ms || 0;
  mockState.isActive = mockObj.is_active ?? true;
  mockState.schemaJson = mockObj.response_body || '{}';

  // Format if valid JSON
  try {
    const parsed = JSON.parse(mockState.schemaJson);
    mockState.schemaJson = JSON.stringify(parsed, null, 2);
  } catch {}

  const container = document.getElementById('pane-mock');
  if (container) {
    renderMockStudio(container);
  }

  showToast(`Mock "${mockObj.path}" carregado para edição`, 'info', 2000);
}

function resetMockForm() {
  editingMockId = null;
  mockState.name = 'Novo Mock Endpoint';
  mockState.path = '/api/v1/sample';
  mockState.method = 'GET';
  mockState.statusCode = 200;
  mockState.delayMs = 100;
  mockState.isActive = true;
  mockState.schemaJson = JSON.stringify(SCHEMA_TEMPLATES.user_profile.schema, null, 2);

  const container = document.getElementById('pane-mock');
  if (container) {
    renderMockStudio(container);
  }
  showToast('Formulário do Mock Studio reinicializado', 'info', 1500);
}
