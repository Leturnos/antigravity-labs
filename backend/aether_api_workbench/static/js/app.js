/**
 * Main application entry point & SPA router for Aether API Workbench.
 */

import { showToast } from './utils/toast.js';
import { initSidebar } from './components/sidebar.js';
import { renderRestTester } from './components/rest_tester.js';
import { renderWsTester } from './components/ws_tester.js';
import { renderMockStudio } from './components/mock_studio.js';
import { renderLatencyAnalytics } from './components/latency_chart.js';

export const AppState = {
  activeTab: 'rest',
  serverOnline: false,
  selectedRequest: null,
  selectedMock: null
};

/**
 * Switch active workspace tab pane.
 * @param {string} tabId - Target tab identifier ('rest', 'ws', 'mock', 'latency').
 * @param {boolean} [updateHash=true] - Whether to update window location hash.
 */
export function switchTab(tabId, updateHash = true) {
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  const validTabs = ['rest', 'ws', 'mock', 'latency'];
  const target = validTabs.includes(tabId) ? tabId : 'rest';

  navTabs.forEach(t => {
    const isTarget = t.getAttribute('data-tab') === target;
    t.classList.toggle('active', isTarget);
    t.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  tabPanes.forEach(p => {
    p.classList.toggle('active', p.id === `pane-${target}`);
  });

  AppState.activeTab = target;

  if (updateHash) {
    history.replaceState(null, '', `#${target}`);
  }

  // Dispatch custom event for tab-specific lifecycle actions (e.g. chart resize)
  window.dispatchEvent(new CustomEvent('aether:tab-changed', { detail: { tab: target } }));
}

/**
 * Check backend API health and update UI status indicator.
 */
async function checkServerStatus() {
  const statusPill = document.getElementById('server-status-pill');
  if (!statusPill) return;

  const statusText = statusPill.querySelector('.status-text');

  try {
    const res = await fetch('/api/health', { method: 'GET' });
    if (res.ok) {
      AppState.serverOnline = true;
      statusPill.className = 'status-pill online';
      if (statusText) statusText.innerText = 'Server Active';
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch {
    AppState.serverOnline = false;
    statusPill.className = 'status-pill offline';
    if (statusText) statusText.innerText = 'Server Offline';
  }
}

/**
 * Initialize application listeners and all components.
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Setup tab navigation clicks
  const navTabs = document.querySelectorAll('.nav-tab');
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      if (targetTab) switchTab(targetTab);
    });
  });

  // Handle URL hash on initial load
  const initialHash = window.location.hash.replace('#', '').toLowerCase();
  if (['rest', 'ws', 'mock', 'latency'].includes(initialHash)) {
    switchTab(initialHash, false);
  }

  // Listen for hash change events
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '').toLowerCase();
    if (['rest', 'ws', 'mock', 'latency'].includes(hash) && hash !== AppState.activeTab) {
      switchTab(hash, false);
    }
  });

  // Initialize all UI components
  try {
    const sidebarContainer = document.getElementById('sidebar-container');
    if (sidebarContainer) {
      initSidebar(sidebarContainer);
    }

    const paneRest = document.getElementById('pane-rest');
    if (paneRest) {
      renderRestTester(paneRest);
    }

    const paneWs = document.getElementById('pane-ws');
    if (paneWs) {
      renderWsTester(paneWs);
    }

    const paneMock = document.getElementById('pane-mock');
    if (paneMock) {
      renderMockStudio(paneMock);
    }

    const paneLatency = document.getElementById('pane-latency');
    if (paneLatency) {
      renderLatencyAnalytics(paneLatency);
    }
  } catch (err) {
    console.error('Components initialization error:', err);
  }

  // Check server health
  await checkServerStatus();
  setInterval(checkServerStatus, 30000);

  showToast('Aether API Workbench Inicializado', 'success', 2500);
});
