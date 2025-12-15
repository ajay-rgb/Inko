let toastContainer = null;
let toastId = 0;

const getToastContainer = () => {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
};

const getIcon = (type) => {
  switch (type) {
    case 'success': return '✓';
    case 'error': return '✕';
    case 'warning': return '⚠';
    case 'info': return 'ℹ';
    default: return 'ℹ';
  }
};

const removeToast = (toastElement) => {
  toastElement.classList.add('closing');
  setTimeout(() => {
    toastElement.remove();
    if (toastContainer && toastContainer.children.length === 0) {
      toastContainer.remove();
      toastContainer = null;
    }
  }, 300);
};

export const showToast = (message, type = 'info', options = {}) => {
  const { duration = 3000, closable = true } = options;
  const container = getToastContainer();
  const id = ++toastId;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('data-toast-id', id);

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = getIcon(type);

  const messageEl = document.createElement('span');
  messageEl.className = 'toast-message';
  messageEl.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(messageEl);

  if (closable) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'toast-close';
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', () => removeToast(toast));
    toast.appendChild(closeBtn);
  }

  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentElement) {
        removeToast(toast);
      }
    }, duration);
  }

  return id;
};

export const dismissToast = (id) => {
  if (!toastContainer) return;
  const toast = toastContainer.querySelector(`[data-toast-id="${id}"]`);
  if (toast) {
    removeToast(toast);
  }
};

export const dismissAllToasts = () => {
  if (!toastContainer) return;
  Array.from(toastContainer.children).forEach(toast => {
    removeToast(toast);
  });
};
