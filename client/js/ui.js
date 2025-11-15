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

const queryElements = () => {
  elements.brushTool = document.getElementById('brushTool');
  elements.eraserTool = document.getElementById('eraserTool');
  elements.strokeWidth = document.getElementById('strokeWidth');
  elements.strokeValue = document.getElementById('strokeValue');
  elements.undoBtn = document.getElementById('undoBtn');
  elements.redoBtn = document.getElementById('redoBtn');
  elements.clearBtn = document.getElementById('clearBtn');
  elements.userCount = document.getElementById('userCount');
  elements.usersList = document.getElementById('usersList');
  elements.statusDot = document.getElementById('statusDot');
  elements.statusText = document.getElementById('statusText');
  elements.colorPalette = document.getElementById('colorPalette');
  elements.userName = document.getElementById('userName');
};

const setActiveTool = (tool) => {
  [elements.brushTool, elements.eraserTool].forEach((btn) => btn?.classList.remove('active'));
  if (tool === TOOLS.BRUSH) {
    elements.brushTool?.classList.add('active');
  } else {
    elements.eraserTool?.classList.add('active');
  }
};

const setActiveColor = (color) => {
  const buttons = elements.colorPalette?.querySelectorAll('.color-btn');
  buttons?.forEach((btn) => {
    if (btn.dataset.color === color) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
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
  elements.colorPalette.innerHTML = '';
  COLOR_PALETTE.forEach((color) => {
    const button = document.createElement('button');
    button.className = 'color-btn';
    button.dataset.color = color;
    button.style.backgroundColor = color;
    button.addEventListener('click', () => setColor(color));
    elements.colorPalette.appendChild(button);
  });
};

const bindEvents = ({ onUndo, onRedo, onClear, onNameChange }) => {
  elements.brushTool.addEventListener('click', () => setTool(TOOLS.BRUSH));
  elements.eraserTool.addEventListener('click', () => setTool(TOOLS.ERASER));
  elements.strokeWidth.addEventListener('input', (event) => {
    const value = Number(event.target.value);
    elements.strokeValue.textContent = `${value}px`;
    setWidth(value);
  });

  elements.undoBtn.addEventListener('click', onUndo);
  elements.redoBtn.addEventListener('click', onRedo);
  elements.clearBtn.addEventListener('click', () => {
    if (window.confirm('Clear canvas for everyone?')) {
      onClear();
    }
  });

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
      onUndo();
    }
    if (event.key === 'y') {
      event.preventDefault();
      onRedo();
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

  return {
    setStatus: updateStatus,
  };
};
