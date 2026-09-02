/**
 * LayoutManager handles responsive split view dragging,
 * mobile adaptive tab switching, Zen mode immersion, and error drawer toggling.
 */
export class LayoutManager {
  constructor(options = {}) {
    this.options = {
      workspaceSelector: '#workspace',
      editorPaneSelector: '#editor-pane',
      splitterSelector: '#splitter',
      canvasPaneSelector: '#canvas-pane',
      mobileTabsSelector: '.mobile-tabs',
      errorDrawerSelector: '#error-drawer',
      btnCloseErrorsSelector: '#btn-close-errors',
      btnZenSelector: '#btn-zen',
      zenExitHintSelector: '#zen-exit-hint',
      storageKey: 'aether_shader_studio_split_ratio',
      minSplitPercent: 15,
      maxSplitPercent: 85,
      defaultSplitPercent: 50,
      onResize: null,
      onTabChange: null,
      onZenToggle: null,
      ...options
    };

    this.isDragging = false;
    this.splitPercent = this.options.defaultSplitPercent;
    this.activeTab = 'editor';
    this.isZen = false;
    this.zenHintTimer = null;

    // DOM Elements
    this.workspaceEl = null;
    this.editorPaneEl = null;
    this.splitterEl = null;
    this.canvasPaneEl = null;
    this.mobileTabsEl = null;
    this.errorDrawerEl = null;
    this.btnCloseErrorsEl = null;
    this.btnZenEl = null;
    this.zenExitHintEl = null;

    // Bound listeners for clean attachment & detachment
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove = this._handleTouchMove.bind(this);
    this._onTouchEnd = this._handleTouchEnd.bind(this);
    this._onWindowResize = this._handleWindowResize.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onTabClick = this._handleTabClick.bind(this);
    this._onCloseErrors = () => this.closeErrorDrawer();
    this._onZenClick = () => this.toggleZen();

    this.init();
  }

  init() {
    const doc = typeof document !== 'undefined' ? document : null;

    this.workspaceEl = this.options.workspaceEl || (doc ? doc.querySelector(this.options.workspaceSelector) : null);
    this.editorPaneEl = this.options.editorPaneEl || (doc ? doc.querySelector(this.options.editorPaneSelector) : null);
    this.splitterEl = this.options.splitterEl || (doc ? doc.querySelector(this.options.splitterSelector) : null);
    this.canvasPaneEl = this.options.canvasPaneEl || (doc ? doc.querySelector(this.options.canvasPaneSelector) : null);
    this.mobileTabsEl = this.options.mobileTabsEl || (doc ? doc.querySelector(this.options.mobileTabsSelector) : null);
    this.errorDrawerEl = this.options.errorDrawerEl || (doc ? doc.querySelector(this.options.errorDrawerSelector) : null);
    this.btnCloseErrorsEl = this.options.btnCloseErrorsEl || (doc ? doc.querySelector(this.options.btnCloseErrorsSelector) : null);
    this.btnZenEl = this.options.btnZenEl || (doc ? doc.querySelector(this.options.btnZenSelector) : null);
    this.zenExitHintEl = this.options.zenExitHintEl || (doc ? doc.querySelector(this.options.zenExitHintSelector) : null);

    // 1. Load saved splitter ratio from localStorage
    this._loadSavedSplit();

    // 2. Setup splitter drag listeners
    if (this.splitterEl && typeof this.splitterEl.addEventListener === 'function') {
      this.splitterEl.addEventListener('mousedown', this._onMouseDown);
      this.splitterEl.addEventListener('touchstart', this._onTouchStart, { passive: false });
    }

    const win = typeof window !== 'undefined' ? window : null;
    if (win && typeof win.addEventListener === 'function') {
      win.addEventListener('mousemove', this._onMouseMove);
      win.addEventListener('mouseup', this._onMouseUp);
      win.addEventListener('touchmove', this._onTouchMove, { passive: false });
      win.addEventListener('touchend', this._onTouchEnd);
      win.addEventListener('resize', this._onWindowResize);
      win.addEventListener('keydown', this._onKeyDown);
    }

    // 3. Setup mobile tabs
    if (this.mobileTabsEl) {
      if (typeof this.mobileTabsEl.addEventListener === 'function') {
        this.mobileTabsEl.addEventListener('click', this._onTabClick);
      }
      this.setActiveTab(this.activeTab);
    }

    // 4. Setup Zen button
    if (this.btnZenEl && typeof this.btnZenEl.addEventListener === 'function') {
      this.btnZenEl.addEventListener('click', this._onZenClick);
    }

    // 5. Setup Error drawer close button
    if (this.btnCloseErrorsEl && typeof this.btnCloseErrorsEl.addEventListener === 'function') {
      this.btnCloseErrorsEl.addEventListener('click', this._onCloseErrors);
    }

    // 6. Listen to Fullscreen changes
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this._onFullscreenChange = () => {
        if (!document.fullscreenElement && this.isZen) {
          this.toggleZen(false);
        }
      };
      document.addEventListener('fullscreenchange', this._onFullscreenChange);
    }
  }

  _loadSavedSplit() {
    let savedPercent = this.options.defaultSplitPercent;
    if (typeof localStorage !== 'undefined') {
      try {
        const stored = localStorage.getItem(this.options.storageKey);
        if (stored !== null) {
          const parsed = parseFloat(stored);
          if (!isNaN(parsed) && parsed >= this.options.minSplitPercent && parsed <= this.options.maxSplitPercent) {
            savedPercent = parsed;
          }
        }
      } catch {
        // Ignore localStorage access errors
      }
    }
    this.setSplitPercent(savedPercent, false);
  }

  setSplitPercent(percent, save = true) {
    const clamped = Math.max(
      this.options.minSplitPercent,
      Math.min(this.options.maxSplitPercent, percent)
    );
    this.splitPercent = clamped;

    if (this.editorPaneEl && this.editorPaneEl.style) {
      this.editorPaneEl.style.width = `${clamped}%`;
      this.editorPaneEl.style.flex = `0 0 ${clamped}%`;
    }
    if (this.canvasPaneEl && this.canvasPaneEl.style) {
      this.canvasPaneEl.style.width = `${100 - clamped}%`;
      this.canvasPaneEl.style.flex = `0 0 ${100 - clamped}%`;
    }

    if (save && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.options.storageKey, clamped.toString());
      } catch {
        // Ignore localStorage write errors
      }
    }

    if (typeof this.options.onResize === 'function') {
      this.options.onResize();
    }
  }

  getSplitPercent() {
    return this.splitPercent;
  }

  _handleMouseDown(e) {
    if (e && typeof e.button === 'number' && e.button !== 0) return;
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    this.isDragging = true;
    if (this.splitterEl && this.splitterEl.classList) {
      this.splitterEl.classList.add('is-dragging');
    }
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc && doc.body && doc.body.style) {
      doc.body.style.cursor = 'col-resize';
      doc.body.style.userSelect = 'none';
    }
  }

  _handleMouseMove(e) {
    if (!this.isDragging) return;
    this._updateDragPosition(e ? e.clientX : 0);
  }

  _handleMouseUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.splitterEl && this.splitterEl.classList) {
      this.splitterEl.classList.remove('is-dragging');
    }
    const doc = typeof document !== 'undefined' ? document : null;
    if (doc && doc.body && doc.body.style) {
      doc.body.style.cursor = '';
      doc.body.style.userSelect = '';
    }
  }

  _handleTouchStart(e) {
    if (!e || !e.touches || e.touches.length === 0) return;
    this.isDragging = true;
    if (this.splitterEl && this.splitterEl.classList) {
      this.splitterEl.classList.add('is-dragging');
    }
  }

  _handleTouchMove(e) {
    if (!this.isDragging || !e || !e.touches || e.touches.length === 0) return;
    if (typeof e.preventDefault === 'function') e.preventDefault();
    this._updateDragPosition(e.touches[0].clientX);
  }

  _handleTouchEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    if (this.splitterEl && this.splitterEl.classList) {
      this.splitterEl.classList.remove('is-dragging');
    }
  }

  _updateDragPosition(clientX) {
    if (!this.workspaceEl) return;
    const rect = typeof this.workspaceEl.getBoundingClientRect === 'function'
      ? this.workspaceEl.getBoundingClientRect()
      : { left: 0, width: typeof window !== 'undefined' ? window.innerWidth : 1000 };

    const totalWidth = (rect && rect.width) ? rect.width : 1;
    const leftOffset = (rect && typeof rect.left === 'number') ? rect.left : 0;
    const offsetX = clientX - leftOffset;
    const newPercent = (offsetX / totalWidth) * 100;
    this.setSplitPercent(newPercent, true);
  }

  _handleWindowResize() {
    if (typeof this.options.onResize === 'function') {
      this.options.onResize();
    }
  }

  _handleTabClick(e) {
    let button = null;
    if (e && e.target) {
      if (typeof e.target.closest === 'function') {
        button = e.target.closest('button[data-tab]');
      } else if (e.target.dataset && e.target.dataset.tab) {
        button = e.target;
      }
    }

    if (button && button.dataset && button.dataset.tab) {
      this.setActiveTab(button.dataset.tab);
    }
  }

  setActiveTab(tabName) {
    this.activeTab = tabName;

    // Update buttons active state in mobileTabsEl
    if (this.mobileTabsEl) {
      const buttons = typeof this.mobileTabsEl.querySelectorAll === 'function'
        ? this.mobileTabsEl.querySelectorAll('button[data-tab]')
        : (this.mobileTabsEl.children || []);

      for (const btn of buttons) {
        if (btn && btn.dataset && btn.classList) {
          if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        }
      }
    }

    // Toggle pane visibility classes
    const isEditorActive = tabName === 'editor';
    if (this.editorPaneEl && this.editorPaneEl.classList) {
      this.editorPaneEl.classList.toggle('tab-active', isEditorActive);
      this.editorPaneEl.classList.toggle('tab-hidden', !isEditorActive);
    }
    if (this.canvasPaneEl && this.canvasPaneEl.classList) {
      this.canvasPaneEl.classList.toggle('tab-active', !isEditorActive);
      this.canvasPaneEl.classList.toggle('tab-hidden', isEditorActive);
    }

    if (typeof this.options.onTabChange === 'function') {
      this.options.onTabChange(tabName);
    }
    if (typeof this.options.onResize === 'function') {
      this.options.onResize();
    }
  }

  getActiveTab() {
    return this.activeTab;
  }

  toggleZen(forceState) {
    const newState = typeof forceState === 'boolean' ? forceState : !this.isZen;
    this.isZen = newState;

    const root = this.options.bodyEl || (typeof document !== 'undefined' ? document.body : null);
    if (root && root.classList) {
      root.classList.toggle('zen-mode', this.isZen);
    }

    // Handle zen exit hint
    if (this.zenExitHintEl && this.zenExitHintEl.classList) {
      if (this.isZen) {
        this.zenExitHintEl.classList.add('visible');
        if (this.zenHintTimer) clearTimeout(this.zenHintTimer);
        this.zenHintTimer = setTimeout(() => {
          if (this.zenExitHintEl && this.zenExitHintEl.classList) {
            this.zenExitHintEl.classList.remove('visible');
          }
        }, 3500);
      } else {
        this.zenExitHintEl.classList.remove('visible');
        if (this.zenHintTimer) clearTimeout(this.zenHintTimer);
      }
    }

    // Request / exit browser Fullscreen if supported
    if (typeof document !== 'undefined') {
      try {
        if (this.isZen) {
          if (document.fullscreenEnabled && !document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
          }
        } else {
          if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
          }
        }
      } catch {
        // Fullscreen API may be blocked or restricted by browser policies
      }
    }

    if (this.btnZenEl) {
      if (this.btnZenEl.classList) this.btnZenEl.classList.toggle('active', this.isZen);
      this.btnZenEl.title = this.isZen ? 'Sair da Tela Cheia / Modo Zen (ESC ou H)' : 'Modo Zen Tela Cheia (Tecla H)';
    }

    if (typeof this.options.onZenToggle === 'function') {
      this.options.onZenToggle(this.isZen);
    }
    if (typeof this.options.onResize === 'function') {
      this.options.onResize();
    }

    return this.isZen;
  }

  isZenMode() {
    return this.isZen;
  }

  _handleKeyDown(e) {
    if (!this.isZen) return;
    if (e && (e.key === 'Escape' || e.key === 'h' || e.key === 'H')) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      this.toggleZen(false);
    }
  }

  openErrorDrawer() {
    if (!this.errorDrawerEl || !this.errorDrawerEl.classList) return;
    this.errorDrawerEl.classList.remove('collapsed');
    this.errorDrawerEl.classList.add('open');
  }

  closeErrorDrawer() {
    if (!this.errorDrawerEl || !this.errorDrawerEl.classList) return;
    this.errorDrawerEl.classList.add('collapsed');
    this.errorDrawerEl.classList.remove('open');
  }

  toggleErrorDrawer() {
    if (!this.errorDrawerEl || !this.errorDrawerEl.classList) return;
    if (this.errorDrawerEl.classList.contains('collapsed')) {
      this.openErrorDrawer();
    } else {
      this.closeErrorDrawer();
    }
  }

  isErrorDrawerOpen() {
    return this.errorDrawerEl && this.errorDrawerEl.classList
      ? !this.errorDrawerEl.classList.contains('collapsed')
      : false;
  }

  setErrorCount(count) {
    const badge = this.options.errorCountBadgeEl || (typeof document !== 'undefined' ? document.querySelector('#error-count-badge') : null);
    if (badge) {
      badge.textContent = String(count);
    }
  }

  dispose() {
    if (this.splitterEl && typeof this.splitterEl.removeEventListener === 'function') {
      this.splitterEl.removeEventListener('mousedown', this._onMouseDown);
      this.splitterEl.removeEventListener('touchstart', this._onTouchStart);
    }
    const win = typeof window !== 'undefined' ? window : null;
    if (win && typeof win.removeEventListener === 'function') {
      win.removeEventListener('mousemove', this._onMouseMove);
      win.removeEventListener('mouseup', this._onMouseUp);
      win.removeEventListener('touchmove', this._onTouchMove);
      win.removeEventListener('touchend', this._onTouchEnd);
      win.removeEventListener('resize', this._onWindowResize);
      win.removeEventListener('keydown', this._onKeyDown);
    }
    if (this.mobileTabsEl && typeof this.mobileTabsEl.removeEventListener === 'function') {
      this.mobileTabsEl.removeEventListener('click', this._onTabClick);
    }
    if (this.btnZenEl && typeof this.btnZenEl.removeEventListener === 'function') {
      this.btnZenEl.removeEventListener('click', this._onZenClick);
    }
    if (this.btnCloseErrorsEl && typeof this.btnCloseErrorsEl.removeEventListener === 'function') {
      this.btnCloseErrorsEl.removeEventListener('click', this._onCloseErrors);
    }
    if (this.zenHintTimer) {
      clearTimeout(this.zenHintTimer);
    }
  }
}

export default LayoutManager;
