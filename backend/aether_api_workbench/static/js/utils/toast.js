/**
 * Toast and Modal UI notification system for Aether API Workbench.
 * Non-blocking, glassmorphic replacements for browser native alerts/confirms.
 */

const TOAST_ICONS = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️'
};

/**
 * Display a non-blocking toast notification.
 * @param {string} message - Text or description to display.
 * @param {'success'|'error'|'warning'|'info'} [type='info'] - Type of toast notification.
 * @param {number} [duration=3500] - Duration in ms before auto-dismissal.
 */
export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const validTypes = ['success', 'error', 'warning', 'info'];
  const toastType = validTypes.includes(type) ? type : 'info';
  const icon = TOAST_ICONS[toastType] || TOAST_ICONS.info;

  const toast = document.createElement('div');
  toast.className = `toast ${toastType}`;
  toast.setAttribute('role', 'alert');
  
  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  const removeTimer = setTimeout(() => {
    dismissToast(toast);
  }, duration);

  toast.addEventListener('click', () => {
    clearTimeout(removeTimer);
    dismissToast(toast);
  });
}

function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.style.opacity = '0';
  toast.style.transform = 'translateX(100%) scale(0.95)';
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}

/**
 * Display a custom Glassmorphism confirmation modal dialog.
 * @param {string} title - Modal heading.
 * @param {string} message - Confirmation message or question.
 * @param {Function} onConfirm - Callback executed when confirmed.
 * @param {Function} [onCancel] - Optional callback executed when cancelled.
 */
export function showConfirm(title, message, onConfirm, onCancel = null) {
  const modalContainer = document.getElementById('modal-container');
  if (!modalContainer) return;

  modalContainer.innerHTML = `
    <div class="modal-box" role="document">
      <div class="modal-header">
        <span class="modal-icon">⚠️</span>
        <h3 class="modal-title">${escapeHtml(title)}</h3>
      </div>
      <div class="modal-body">
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="modal-actions">
        <button id="modal-cancel-btn" class="btn btn-secondary">Cancelar</button>
        <button id="modal-confirm-btn" class="btn btn-danger">Confirmar</button>
      </div>
    </div>
  `;

  modalContainer.classList.remove('hidden');

  const cleanup = () => {
    modalContainer.classList.add('hidden');
    modalContainer.innerHTML = '';
    document.removeEventListener('keydown', handleKeydown);
  };

  const handleCancel = () => {
    cleanup();
    if (typeof onCancel === 'function') onCancel();
  };

  const handleConfirm = () => {
    cleanup();
    if (typeof onConfirm === 'function') onConfirm();
  };

  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter') {
      handleConfirm();
    }
  };

  document.addEventListener('keydown', handleKeydown);

  const cancelBtn = document.getElementById('modal-cancel-btn');
  const confirmBtn = document.getElementById('modal-confirm-btn');

  if (cancelBtn) cancelBtn.onclick = handleCancel;
  if (confirmBtn) confirmBtn.onclick = handleConfirm;

  // Backdrop click dismisses
  modalContainer.onclick = (e) => {
    if (e.target === modalContainer) {
      handleCancel();
    }
  };
}

/**
 * Display a custom Glassmorphism alert modal dialog.
 * @param {string} title - Alert heading.
 * @param {string} message - Message body.
 * @param {Function} [onClose] - Callback when dismissed.
 */
export function showAlert(title, message, onClose = null) {
  const modalContainer = document.getElementById('modal-container');
  if (!modalContainer) return;

  modalContainer.innerHTML = `
    <div class="modal-box" role="document">
      <div class="modal-header">
        <span class="modal-icon">ℹ️</span>
        <h3 class="modal-title">${escapeHtml(title)}</h3>
      </div>
      <div class="modal-body">
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="modal-actions">
        <button id="modal-ok-btn" class="btn btn-primary">Entendido</button>
      </div>
    </div>
  `;

  modalContainer.classList.remove('hidden');

  const cleanup = () => {
    modalContainer.classList.add('hidden');
    modalContainer.innerHTML = '';
    document.removeEventListener('keydown', handleKeydown);
    if (typeof onClose === 'function') onClose();
  };

  const handleKeydown = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      cleanup();
    }
  };

  document.addEventListener('keydown', handleKeydown);

  const okBtn = document.getElementById('modal-ok-btn');
  if (okBtn) okBtn.onclick = cleanup;

  modalContainer.onclick = (e) => {
    if (e.target === modalContainer) {
      cleanup();
    }
  };
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
