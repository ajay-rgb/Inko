import { COLOR_PALETTE, TOOLS } from './constants.js';
import {
  getCurrentColor,
  getCurrentTool,
  getCurrentWidth,
  getLocalUser,
  getState,
  onState,
  setColor,
  setTool,
  setWidth,
} from './state.js';

const elements = {};

// Theme handling
const THEME_KEY = 'inko_theme';
const applyTheme = (theme) => {
  document.body.classList.toggle('dark', theme === 'dark');
  const btn = elements.themeToggle;
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
};
const toggleTheme = () => {
  const isDark = document.body.classList.contains('dark');
  const theme = isDark ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
};

const queryElements = () => {
  elements.brushTool = document.getElementById('brushTool');
  elements.eraserTool = document.getElementById('eraserTool');
  elements.lineTool = document.getElementById('lineTool');
  elements.rectTool = document.getElementById('rectTool');
  elements.ellipseTool = document.getElementById('ellipseTool');
  elements.arrowTool = document.getElementById('arrowTool');
  elements.themeToggle = document.getElementById('themeToggle');
  elements.strokeWidth = document.getElementById('strokeWidth');
  elements.strokeValue = document.getElementById('strokeValue');
  elements.undoBtn = document.getElementById('undoBtn');
  elements.redoBtn = document.getElementById('redoBtn');
  elements.clearBtn = document.getElementById('clearBtn');
  elements.userCount = document.getElementById('userCount');
  elements.usersList = document.getElementById('usersList');
  elements.statusDot = document.getElementById('statusDot');
  elements.statusText = document.getElementById('statusText');
  elements.colorBtn = document.getElementById('colorBtn');
  elements.colorPicker = document.getElementById('colorPicker');
  elements.userName = document.getElementById('userName');
};

const setActiveTool = (tool) => {
  [elements.brushTool, elements.eraserTool, elements.lineTool, elements.rectTool, elements.ellipseTool, elements.arrowTool].forEach((btn) => btn?.classList.remove('active'));
  if (tool === TOOLS.BRUSH) {
    elements.brushTool?.classList.add('active');
  } else if (tool === TOOLS.ERASER) {
    elements.eraserTool?.classList.add('active');
  } else if (tool === TOOLS.LINE) {
    elements.lineTool?.classList.add('active');
  } else if (tool === TOOLS.RECT) {
    elements.rectTool?.classList.add('active');
  } else if (tool === TOOLS.ELLIPSE) {
    elements.ellipseTool?.classList.add('active');
  } else if (tool === TOOLS.ARROW) {
    elements.arrowTool?.classList.add('active');
  }
};

const setActiveColor = (color) => {
  if (elements.colorBtn) {
    elements.colorBtn.style.backgroundColor = color;
    if (elements.colorPicker) elements.colorPicker.value = color;
  }
};

const renderUsers = () => {
  const state = getState();
  const localUser = getLocalUser();
  const users = Array.from(state.users.values());
  elements.userCount.textContent = users.length;
  elements.usersList.innerHTML = '';
  users.forEach((user) => {
    const div = document.createElement('div');
    div.className = 'user-item';
    const displayName = user.id === localUser?.id ? 'you' : (user.name || user.id);
    div.innerHTML = `
      <span class="user-color" style="background-color: ${user.color}"></span>
      <span class="user-name">${displayName}</span>
    `;
    elements.usersList.appendChild(div);
  });
};

const createColorButtons = () => {
  // No longer needed - using color picker instead
};

const bindEvents = ({ onUndo, onRedo, onClear, onNameChange }) => {
  let undoDebounce = false;
  let redoDebounce = false;
  
  const debouncedUndo = () => {
    if (undoDebounce) return;
    undoDebounce = true;
    onUndo();
    setTimeout(() => undoDebounce = false, 100);
  };
  
  const debouncedRedo = () => {
    if (redoDebounce) return;
    redoDebounce = true;
    onRedo();
    setTimeout(() => redoDebounce = false, 100);
  };
  
  elements.brushTool.addEventListener('click', () => setTool(TOOLS.BRUSH));
  elements.eraserTool.addEventListener('click', () => setTool(TOOLS.ERASER));
  elements.lineTool?.addEventListener('click', () => setTool(TOOLS.LINE));
  elements.rectTool?.addEventListener('click', () => setTool(TOOLS.RECT));
  elements.ellipseTool?.addEventListener('click', () => setTool(TOOLS.ELLIPSE));
  elements.arrowTool?.addEventListener('click', () => setTool(TOOLS.ARROW));
  
  elements.colorBtn?.addEventListener('click', () => elements.colorPicker?.click());
  elements.colorPicker?.addEventListener('change', (event) => {
    setColor(event.target.value);
  });
  
  elements.strokeWidth.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    elements.strokeValue.textContent = `${value}px`;
    setWidth(value);
  });

  elements.undoBtn.addEventListener('click', debouncedUndo);
  elements.redoBtn.addEventListener('click', debouncedRedo);
  elements.clearBtn.addEventListener('click', () => {
    if (window.confirm('Clear canvas for everyone?')) {
      onClear();
    }
  });

  elements.themeToggle?.addEventListener('click', () => toggleTheme());

  elements.userName.addEventListener('input', (event) => {
    const name = event.target.value.trim();
    if (name && onNameChange) {
      onNameChange(name);
    }
  });

  window.addEventListener('keydown', (event) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const modifier = isMac ? event.metaKey : event.ctrlKey;
    if (!modifier) return;
    if (event.key === 'z') {
      event.preventDefault();
      debouncedUndo();
    }
    if (event.key === 'y') {
      event.preventDefault();
      debouncedRedo();
    }
  });
};

const updateStatus = (status) => {
  elements.statusDot.classList.remove('connected', 'disconnected');
  switch (status) {
    case 'connected':
      elements.statusDot.classList.add('connected');
      elements.statusText.textContent = 'Connected';
      break;
    case 'connecting':
      elements.statusText.textContent = 'Connecting...';
      break;
    default:
      elements.statusDot.classList.add('disconnected');
      elements.statusText.textContent = 'Disconnected';
  }
};

export const initUI = (handlers) => {
  queryElements();
  createColorButtons();
  bindEvents(handlers);

  setActiveTool(getCurrentTool());
  setActiveColor(getCurrentColor());
  elements.strokeWidth.value = getCurrentWidth();
  elements.strokeValue.textContent = `${getCurrentWidth()}px`;

  onState('toolChanged', setActiveTool);
  onState('colorChanged', setActiveColor);
  onState('widthChanged', (width) => {
    elements.strokeWidth.value = width;
    elements.strokeValue.textContent = `${width}px`;
  });
  onState('usersUpdated', renderUsers);
  onState('localUser', (user) => {
    if (user && user.name) {
      elements.userName.value = user.name;
    }
  });

  renderUsers();

  // Restore theme preference (or system preference)
  try {
    const saved = localStorage.getItem(THEME_KEY) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(saved);
  } catch (e) {
    // ignore
  }

  return {
    setStatus: updateStatus,
  };
};
