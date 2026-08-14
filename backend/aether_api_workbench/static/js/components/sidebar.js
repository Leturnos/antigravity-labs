/**
 * Sidebar Component for Aether API Workbench.
 * Renders Search, Collections tree, Mock endpoints list, and History logs.
 */

import { showToast, showConfirm } from '../utils/toast.js';
import { formatMs, escapeHtml } from '../utils/formatters.js';
import { switchTab } from '../app.js';

let sidebarContainer = null;
let currentSearchTerm = '';
let collectionsData = [];
let savedRequestsData = [];
let mockEndpointsData = [];
let historyLogsData = [];
let activeSection = 'collections'; // 'collections', 'mocks', 'history'
const expandedCollections = new Set();

/**
 * Initialize Sidebar inside target DOM element.
 * @param {HTMLElement} container - Sidebar container DOM element.
 */
export async function initSidebar(container) {
  sidebarContainer = container;
  renderSidebarSkeleton();
  attachSidebarEvents();
  await refreshSidebarData();
}

/**
 * Render initial sidebar layout structure.
 */
function renderSidebarSkeleton() {
  if (!sidebarContainer) return;

  sidebarContainer.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-search-box">
        <span class="search-icon">🔍</span>
        <input 
          type="text" 
          id="sidebar-search-input" 
          class="sidebar-search-input" 
          placeholder="Buscar requisições, mocks..." 
          aria-label="Buscar"
          autocomplete="off"
        />
        <button id="sidebar-clear-search" class="btn-clear-search hidden" title="Limpar busca">&times;</button>
      </div>

      <div class="sidebar-nav-sections">
        <button class="sidebar-section-tab active" data-section="collections" id="tab-sec-collections">
          <span class="sec-icon">📁</span> Coleções
        </button>
        <button class="sidebar-section-tab" data-section="mocks" id="tab-sec-mocks">
          <span class="sec-icon">🎭</span> Mocks
        </button>
        <button class="sidebar-section-tab" data-section="history" id="tab-sec-history">
          <span class="sec-icon">⏱️</span> Histórico
        </button>
      </div>
    </div>

    <div class="sidebar-content" id="sidebar-content-area">
      <!-- Injected dynamically -->
      <div class="sidebar-loading">
        <div class="loading-spinner"></div>
        <span>Carregando dados...</span>
      </div>
    </div>
  `;
}

/**
 * Attach global event listeners for sidebar interactions.
 */
function attachSidebarEvents() {
  const searchInput = document.getElementById('sidebar-search-input');
  const clearSearchBtn = document.getElementById('sidebar-clear-search');
  const sectionTabs = document.querySelectorAll('.sidebar-section-tab');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchTerm = (e.target.value || '').trim().toLowerCase();
      if (clearSearchBtn) {
        clearSearchBtn.classList.toggle('hidden', currentSearchTerm.length === 0);
      }
      renderActiveSection();
    });
  }

  if (clearSearchBtn && searchInput) {
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      currentSearchTerm = '';
      clearSearchBtn.classList.add('hidden');
      renderActiveSection();
    });
  }

  sectionTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      sectionTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeSection = tab.getAttribute('data-section');
      renderActiveSection();
    });
  });

  // Custom event listeners for cross-component sync
  window.addEventListener('aether:refresh-sidebar', () => {
    refreshSidebarData();
  });

  window.addEventListener('aether:request-executed', () => {
    fetchHistoryData().then(() => {
      if (activeSection === 'history') renderActiveSection();
    });
  });
}

/**
 * Fetch data for all sidebar sections from backend API.
 */
export async function refreshSidebarData() {
  try {
    const [colsRes, reqsRes, mocksRes, histRes] = await Promise.all([
      fetch('/api/collections').then(r => r.ok ? r.json() : []),
      fetch('/api/saved-requests').then(r => r.ok ? r.json() : []),
      fetch('/api/mock-endpoints').then(r => r.ok ? r.json() : []),
      fetch('/api/history?limit=40').then(r => r.ok ? r.json() : [])
    ]);

    collectionsData = Array.isArray(colsRes) ? colsRes : [];
    savedRequestsData = Array.isArray(reqsRes) ? reqsRes : [];
    mockEndpointsData = Array.isArray(mocksRes) ? mocksRes : [];
    historyLogsData = Array.isArray(histRes) ? histRes : [];

    renderActiveSection();
  } catch (err) {
    console.error('Failed to load sidebar data:', err);
  }
}

async function fetchHistoryData() {
  try {
    const res = await fetch('/api/history?limit=40');
    if (res.ok) {
      historyLogsData = await res.json();
    }
  } catch (e) {
    console.error('History fetch error:', e);
  }
}

/**
 * Render the currently selected sidebar section.
 */
function renderActiveSection() {
  const contentArea = document.getElementById('sidebar-content-area');
  if (!contentArea) return;

  if (activeSection === 'collections') {
    renderCollectionsSection(contentArea);
  } else if (activeSection === 'mocks') {
    renderMocksSection(contentArea);
  } else if (activeSection === 'history') {
    renderHistorySection(contentArea);
  }
}

/* ==========================================================================
   Collections & Saved Requests Section
   ========================================================================== */

function renderCollectionsSection(container) {
  let filteredRequests = savedRequestsData;
  let filteredCollections = collectionsData;

  if (currentSearchTerm) {
    filteredRequests = savedRequestsData.filter(r => 
      (r.name && r.name.toLowerCase().includes(currentSearchTerm)) ||
      (r.url && r.url.toLowerCase().includes(currentSearchTerm)) ||
      (r.method && r.method.toLowerCase().includes(currentSearchTerm))
    );

    const matchingColIds = new Set(filteredRequests.map(r => r.collection_id).filter(Boolean));
    filteredCollections = collectionsData.filter(c => 
      c.name.toLowerCase().includes(currentSearchTerm) || matchingColIds.has(c.id)
    );
  }

  let html = `
    <div class="sidebar-section-actions">
      <span class="section-title">Coleções (${collectionsData.length})</span>
      <button id="btn-add-collection" class="btn-icon-action" title="Nova Coleção">
        <span class="icon">+</span>
      </button>
    </div>
    <div class="collections-tree">
  `;

  if (filteredCollections.length === 0 && filteredRequests.length === 0) {
    html += `
      <div class="empty-state-sidebar">
        <span class="empty-icon">📂</span>
        <p>Nenhuma coleção encontrada.</p>
        <button id="btn-empty-add-col" class="btn btn-sm btn-primary">+ Criar Coleção</button>
      </div>
    `;
  } else {
    // Render Collections
    filteredCollections.forEach(col => {
      const isExpanded = expandedCollections.has(col.id) || currentSearchTerm.length > 0;
      const colRequests = filteredRequests.filter(r => r.collection_id === col.id);

      html += `
        <div class="collection-item" data-col-id="${col.id}">
          <div class="collection-header" data-toggle-col="${col.id}">
            <span class="arrow ${isExpanded ? 'open' : ''}">▸</span>
            <span class="col-icon">📁</span>
            <span class="col-name" title="${escapeHtml(col.name)}">${escapeHtml(col.name)}</span>
            <span class="col-count">${colRequests.length}</span>
            <div class="col-actions">
              <button class="btn-col-action btn-add-req-col" data-col-id="${col.id}" title="Adicionar Requisição">+</button>
              <button class="btn-col-action btn-del-col" data-col-id="${col.id}" data-col-name="${escapeHtml(col.name)}" title="Excluir Coleção">🗑️</button>
            </div>
          </div>
          <div class="collection-body ${isExpanded ? 'open' : ''}">
            ${colRequests.map(req => renderRequestItem(req)).join('')}
            ${colRequests.length === 0 ? '<div class="empty-col-hint">Vazia</div>' : ''}
          </div>
        </div>
      `;
    });

    // Render Uncategorized requests
    const uncategorized = filteredRequests.filter(r => !r.collection_id);
    if (uncategorized.length > 0) {
      html += `
        <div class="collection-item uncategorized">
          <div class="collection-header">
            <span class="col-icon">📄</span>
            <span class="col-name">Requisições Soltas</span>
            <span class="col-count">${uncategorized.length}</span>
          </div>
          <div class="collection-body open">
            ${uncategorized.map(req => renderRequestItem(req)).join('')}
          </div>
        </div>
      `;
    }
  }

  html += `</div>`;
  container.innerHTML = html;

  // Bind Collection Events
  const addColBtn = container.querySelector('#btn-add-collection');
  const emptyAddColBtn = container.querySelector('#btn-empty-add-col');
  if (addColBtn) addColBtn.onclick = handleCreateCollectionPrompt;
  if (emptyAddColBtn) emptyAddColBtn.onclick = handleCreateCollectionPrompt;

  container.querySelectorAll('[data-toggle-col]').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.col-actions')) return;
      const colId = parseInt(header.getAttribute('data-toggle-col'), 10);
      if (expandedCollections.has(colId)) {
        expandedCollections.delete(colId);
      } else {
        expandedCollections.add(colId);
      }
      renderActiveSection();
    });
  });

  container.querySelectorAll('.btn-add-req-col').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const colId = parseInt(btn.getAttribute('data-col-id'), 10);
      window.dispatchEvent(new CustomEvent('aether:new-request', { detail: { collection_id: colId } }));
      switchTab('rest');
    });
  });

  container.querySelectorAll('.btn-del-col').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const colId = parseInt(btn.getAttribute('data-col-id'), 10);
      const colName = btn.getAttribute('data-col-name');
      showConfirm(
        'Excluir Coleção',
        `Deseja realmente excluir a coleção "${colName}" e todas as requisições vinculadas?`,
        async () => {
          try {
            const res = await fetch(`/api/collections/${colId}`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
              showToast('Coleção excluída com sucesso', 'success');
              expandedCollections.delete(colId);
              await refreshSidebarData();
            } else {
              showToast('Erro ao excluir coleção', 'error');
            }
          } catch (err) {
            showToast(`Erro de conexão: ${err.message}`, 'error');
          }
        }
      );
    });
  });

  // Bind Request Item Clicks
  container.querySelectorAll('.request-tree-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-del-req')) return;
      const reqId = parseInt(item.getAttribute('data-req-id'), 10);
      const reqObj = savedRequestsData.find(r => r.id === reqId);
      if (reqObj) {
        window.dispatchEvent(new CustomEvent('aether:load-request', { detail: reqObj }));
        switchTab('rest');
      }
    });
  });

  container.querySelectorAll('.btn-del-req').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const reqId = parseInt(btn.getAttribute('data-req-id'), 10);
      const reqName = btn.getAttribute('data-req-name');
      showConfirm(
        'Excluir Requisição',
        `Deseja realmente excluir "${reqName}"?`,
        async () => {
          try {
            const res = await fetch(`/api/saved-requests/${reqId}`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
              showToast('Requisição removida', 'success');
              await refreshSidebarData();
            } else {
              showToast('Erro ao excluir requisição', 'error');
            }
          } catch (err) {
            showToast(`Erro: ${err.message}`, 'error');
          }
        }
      );
    });
  });
}

function renderRequestItem(req) {
  const method = (req.method || 'GET').toUpperCase();
  const methodClass = method.toLowerCase();
  return `
    <div class="request-tree-item" data-req-id="${req.id}" title="${escapeHtml(req.url || '')}">
      <span class="badge-method ${methodClass}">${method}</span>
      <span class="req-title">${escapeHtml(req.name || req.url || 'Sem título')}</span>
      <button class="btn-del-req" data-req-id="${req.id}" data-req-name="${escapeHtml(req.name || 'Requisição')}" title="Excluir">×</button>
    </div>
  `;
}

function handleCreateCollectionPrompt() {
  const name = prompt('Nome da nova coleção:');
  if (!name || !name.trim()) return;

  const desc = prompt('Descrição (opcional):') || '';

  fetch('/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim(), description: desc.trim() })
  })
  .then(res => {
    if (res.ok) {
      showToast('Coleção criada com sucesso!', 'success');
      return refreshSidebarData();
    } else {
      showToast('Erro ao criar coleção', 'error');
    }
  })
  .catch(err => showToast(`Erro: ${err.message}`, 'error'));
}

/* ==========================================================================
   Mock Endpoints Section
   ========================================================================== */

function renderMocksSection(container) {
  let filteredMocks = mockEndpointsData;
  if (currentSearchTerm) {
    filteredMocks = mockEndpointsData.filter(m =>
      (m.name && m.name.toLowerCase().includes(currentSearchTerm)) ||
      (m.path && m.path.toLowerCase().includes(currentSearchTerm)) ||
      (m.method && m.method.toLowerCase().includes(currentSearchTerm))
    );
  }

  let html = `
    <div class="sidebar-section-actions">
      <span class="section-title">Mocks Ativos (${mockEndpointsData.length})</span>
      <button id="btn-add-mock" class="btn-icon-action" title="Novo Mock Studio">
        <span class="icon">+</span>
      </button>
    </div>
    <div class="mocks-list">
  `;

  if (filteredMocks.length === 0) {
    html += `
      <div class="empty-state-sidebar">
        <span class="empty-icon">🎭</span>
        <p>Nenhum mock cadastrado.</p>
        <button id="btn-empty-add-mock" class="btn btn-sm btn-primary">+ Criar Mock</button>
      </div>
    `;
  } else {
    filteredMocks.forEach(m => {
      const method = (m.method || 'GET').toUpperCase();
      const methodClass = method.toLowerCase();
      const statusClass = `s${String(m.status_code || 200)[0]}xx`;

      html += `
        <div class="mock-sidebar-item ${m.is_active ? 'active' : 'inactive'}" data-mock-id="${m.id}">
          <div class="mock-item-main">
            <div class="mock-item-top">
              <span class="badge-method ${methodClass}">${method}</span>
              <span class="badge-status ${statusClass}">${m.status_code || 200}</span>
              <label class="switch-toggle" title="${m.is_active ? 'Desativar Mock' : 'Ativar Mock'}">
                <input type="checkbox" class="mock-toggle-input" data-mock-id="${m.id}" ${m.is_active ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>
            <div class="mock-item-path" title="${escapeHtml(m.path)}">${escapeHtml(m.path)}</div>
            ${m.name ? `<div class="mock-item-name">${escapeHtml(m.name)}</div>` : ''}
          </div>
          <div class="mock-item-actions">
            <button class="btn-mock-action btn-del-mock" data-mock-id="${m.id}" data-mock-path="${escapeHtml(m.path)}" title="Excluir Mock">🗑️</button>
          </div>
        </div>
      `;
    });
  }

  html += `</div>`;
  container.innerHTML = html;

  // Bind Mock Events
  const addMockBtn = container.querySelector('#btn-add-mock');
  const emptyAddMockBtn = container.querySelector('#btn-empty-add-mock');
  const openNewMock = () => {
    window.dispatchEvent(new CustomEvent('aether:new-mock'));
    switchTab('mock');
  };
  if (addMockBtn) addMockBtn.onclick = openNewMock;
  if (emptyAddMockBtn) emptyAddMockBtn.onclick = openNewMock;

  container.querySelectorAll('.mock-sidebar-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.switch-toggle') || e.target.closest('.btn-del-mock')) return;
      const mockId = parseInt(item.getAttribute('data-mock-id'), 10);
      const mockObj = mockEndpointsData.find(m => m.id === mockId);
      if (mockObj) {
        window.dispatchEvent(new CustomEvent('aether:load-mock', { detail: mockObj }));
        switchTab('mock');
      }
    });
  });

  // Active / Inactive Toggles
  container.querySelectorAll('.mock-toggle-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      e.stopPropagation();
      const mockId = parseInt(input.getAttribute('data-mock-id'), 10);
      const newActive = input.checked;
      try {
        const res = await fetch(`/api/mock-endpoints/${mockId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: newActive })
        });
        if (res.ok) {
          showToast(`Mock ${newActive ? 'ativado' : 'desativado'} com sucesso!`, 'info', 2000);
          await refreshSidebarData();
        } else {
          input.checked = !newActive;
          showToast('Erro ao atualizar status do mock', 'error');
        }
      } catch (err) {
        input.checked = !newActive;
        showToast(`Erro de conexão: ${err.message}`, 'error');
      }
    });
  });

  // Delete Mock
  container.querySelectorAll('.btn-del-mock').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mockId = parseInt(btn.getAttribute('data-mock-id'), 10);
      const mockPath = btn.getAttribute('data-mock-path');
      showConfirm(
        'Excluir Mock Endpoint',
        `Deseja realmente excluir o mock para "${mockPath}"?`,
        async () => {
          try {
            const res = await fetch(`/api/mock-endpoints/${mockId}`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
              showToast('Mock endpoint excluído', 'success');
              await refreshSidebarData();
            } else {
              showToast('Erro ao excluir mock', 'error');
            }
          } catch (err) {
            showToast(`Erro: ${err.message}`, 'error');
          }
        }
      );
    });
  });
}

/* ==========================================================================
   History Logs Section
   ========================================================================== */

function renderHistorySection(container) {
  let filteredHistory = historyLogsData;
  if (currentSearchTerm) {
    filteredHistory = historyLogsData.filter(h =>
      (h.request_url && h.request_url.toLowerCase().includes(currentSearchTerm)) ||
      (h.request_method && h.request_method.toLowerCase().includes(currentSearchTerm)) ||
      (String(h.response_status).includes(currentSearchTerm))
    );
  }

  let html = `
    <div class="sidebar-section-actions">
      <span class="section-title">Histórico Recente (${historyLogsData.length})</span>
      <button id="btn-clear-history" class="btn-text-action" title="Limpar Todo o Histórico">Limpar</button>
    </div>
    <div class="history-list">
  `;

  if (filteredHistory.length === 0) {
    html += `
      <div class="empty-state-sidebar">
        <span class="empty-icon">⏱️</span>
        <p>Nenhuma requisição no histórico.</p>
      </div>
    `;
  } else {
    filteredHistory.forEach(log => {
      const method = (log.request_method || 'GET').toUpperCase();
      const methodClass = method.toLowerCase();
      const statusClass = log.response_status ? `s${String(log.response_status)[0]}xx` : 's5xx';

      html += `
        <div class="history-sidebar-item" data-history-id="${log.id}">
          <div class="history-item-top">
            <span class="badge-method ${methodClass}">${method}</span>
            <span class="badge-status ${statusClass}">${log.response_status || 'ERR'}</span>
            <span class="history-time-ms">${formatMs(log.execution_time_ms || 0)}</span>
          </div>
          <div class="history-item-url" title="${escapeHtml(log.request_url || '')}">${escapeHtml(log.request_url || '')}</div>
        </div>
      `;
    });
  }

  html += `</div>`;
  container.innerHTML = html;

  // Bind History Events
  const clearBtn = container.querySelector('#btn-clear-history');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      showConfirm(
        'Limpar Histórico',
        'Tem certeza que deseja apagar todo o histórico de execuções?',
        async () => {
          try {
            const res = await fetch('/api/history', { method: 'DELETE' });
            if (res.ok || res.status === 204) {
              showToast('Histórico limpo com sucesso!', 'success');
              historyLogsData = [];
              renderActiveSection();
              window.dispatchEvent(new CustomEvent('aether:history-cleared'));
            } else {
              showToast('Erro ao limpar histórico', 'error');
            }
          } catch (err) {
            showToast(`Erro: ${err.message}`, 'error');
          }
        }
      );
    });
  }

  container.querySelectorAll('.history-sidebar-item').forEach(item => {
    item.addEventListener('click', () => {
      const logId = parseInt(item.getAttribute('data-history-id'), 10);
      const logObj = historyLogsData.find(h => h.id === logId);
      if (logObj) {
        window.dispatchEvent(new CustomEvent('aether:load-history', { detail: logObj }));
        switchTab('rest');
      }
    });
  });
}
