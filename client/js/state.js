import { CHECKPOINT_INTERVAL, MAX_OPERATIONS, TOOLS } from './constants.js';

const state = {
  operations: [],
  pointer: -1,
  checkpoints: [],
  users: new Map(),
  localUser: null,
  currentTool: TOOLS.BRUSH,
  currentColor: '#000000',
  currentWidth: 3,
  isDrawing: false,
  optimisticOperations: new Map(),
};

const listeners = new Map();

const emit = (event, payload) => {
  const handlers = listeners.get(event);
  if (!handlers) return;
  handlers.forEach((handler) => handler(payload));
};

export const onState = (event, handler) => {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(handler);
  return () => offState(event, handler);
};

export const offState = (event, handler) => {
  const handlers = listeners.get(event);
  if (!handlers) return;
  handlers.delete(handler);
};

export const getState = () => state;

export const setLocalUser = (user) => {
  state.localUser = user;
  emit('localUser', user);
};

export const setTool = (tool) => {
  if (tool === state.currentTool) return;
  state.currentTool = tool;
  emit('toolChanged', tool);
};

export const setColor = (color) => {
  if (color === state.currentColor) return;
  state.currentColor = color;
  emit('colorChanged', color);
};

export const setWidth = (width) => {
  state.currentWidth = width;
  emit('widthChanged', width);
};

export const setIsDrawing = (value) => {
  state.isDrawing = value;
  emit('drawingChanged', value);
};

const clampPointer = (value) => Math.max(-1, Math.min(value, state.operations.length - 1));

export const setPointer = (value, { silent = false } = {}) => {
  const clamped = clampPointer(value);
  if (clamped === state.pointer && !silent) return;
  state.pointer = clamped;
  if (!silent) {
    emit('pointerChanged', clamped);
  }
};

export const resetHistory = () => {
  state.operations = [];
  state.pointer = -1;
  state.checkpoints = [];
  state.optimisticOperations.clear();
  emit('historyReset');
};

const trimHistoryIfNeeded = () => {
  if (state.operations.length <= MAX_OPERATIONS) return;
  const overflow = state.operations.length - MAX_OPERATIONS;
  state.operations.splice(0, overflow);
  state.pointer = Math.max(-1, state.pointer - overflow);
  state.checkpoints = state.checkpoints
    .map((checkpoint) => ({
      pointer: checkpoint.pointer - overflow,
      imageData: checkpoint.imageData,
    }))
    .filter((checkpoint) => checkpoint.pointer >= 0);
  emit('historyTrimmed', { overflow });
};

export const addOperation = (operation, { optimistic = false } = {}) => {
  if (!operation) return;
  const existingIndex = state.operations.findIndex((op) => op.id === operation.id);
  if (existingIndex >= 0) {
    state.operations[existingIndex] = operation;
    emit('operationUpdated', operation);
    return;
  }

  state.operations.push(operation);
  if (!optimistic) {
    setPointer(state.operations.length - 1, { silent: true });
  }

  if (optimistic && operation.clientOperationId) {
    state.optimisticOperations.set(operation.clientOperationId, operation);
  }

  emit('operationAdded', operation);
  trimHistoryIfNeeded();
};

export const confirmOperation = (serverOperation) => {
  if (!serverOperation) return;
  const { clientOperationId } = serverOperation;
  if (clientOperationId && state.optimisticOperations.has(clientOperationId)) {
    state.optimisticOperations.delete(clientOperationId);
  }
  const optimisticIndex = state.operations.findIndex(
    (op) => op.clientOperationId && op.clientOperationId === clientOperationId
  );
  if (optimisticIndex >= 0) {
    state.operations[optimisticIndex] = serverOperation;
  } else {
    state.operations.push(serverOperation);
  }
  setPointer(state.operations.length - 1, { silent: true });
  emit('operationConfirmed', serverOperation);
};

export const getOperationsUpToPointer = () => {
  if (state.pointer < 0) return [];
  return state.operations.slice(0, state.pointer + 1);
};

export const requestRebuild = () => {
  emit('rebuildRequested', { pointer: state.pointer });
};

export const saveCheckpoint = (pointer, imageData) => {
  if (typeof pointer !== 'number' || !imageData) return;
  state.checkpoints.push({ pointer, imageData });
  if (state.checkpoints.length > Math.ceil(MAX_OPERATIONS / CHECKPOINT_INTERVAL)) {
    state.checkpoints.shift();
  }
};

export const clearCheckpoints = () => {
  state.checkpoints = [];
};

export const getCheckpoint = (targetPointer) => {
  if (!state.checkpoints.length) return null;
  const clone = [...state.checkpoints];
  clone.sort((a, b) => b.pointer - a.pointer);
  return clone.find((checkpoint) => checkpoint.pointer <= targetPointer) || null;
};

export const setUsers = (users = []) => {
  state.users = new Map(users.map((user) => [user.id, user]));
  emit('usersUpdated', getUsers());
};

export const upsertUser = (user) => {
  if (!user?.id) return;
  state.users.set(user.id, { ...state.users.get(user.id), ...user });
  emit('usersUpdated', getUsers());
};

export const removeUser = (userId) => {
  if (!state.users.has(userId)) return;
  state.users.delete(userId);
  emit('usersUpdated', getUsers());
};

export const getUsers = () => Array.from(state.users.values());

export const getLocalUser = () => state.localUser;

export const getCurrentTool = () => state.currentTool;
export const getCurrentColor = () => state.currentColor;
export const getCurrentWidth = () => state.currentWidth;

export const setCursorForUser = (userId, cursor) => {
  if (!state.users.has(userId)) return;
  state.users.set(userId, { ...state.users.get(userId), cursor });
  emit('usersUpdated', getUsers());
};

export const getOptimisticOperation = (clientOperationId) => {
  if (!clientOperationId) return null;
  return state.optimisticOperations.get(clientOperationId) || null;
};
