import { CHECKPOINT_INTERVAL, MAX_OPERATIONS, TOOLS } from './constants.js';

/**
 * @typedef {Object} Point
 * @property {number} x - X coordinate in CSS pixels
 * @property {number} y - Y coordinate in CSS pixels
 */

/**
 * @typedef {Object} OperationData
 * @property {Point[]} [path] - Array of points for draw/erase operations
 * @property {string} [color] - Hex color code
 * @property {number} [width] - Stroke width (1-20)
 * @property {string} [tool] - Tool type ('brush' | 'eraser')
 */

/**
 * @typedef {Object} Operation
 * @property {string} id - Unique operation identifier
 * @property {string} userId - User who created the operation
 * @property {number} timestamp - Creation timestamp
 * @property {number} sequenceNumber - Global sequence order
 * @property {'draw'|'erase'|'clear'} type - Operation type
 * @property {OperationData} data - Operation-specific data
 */

/**
 * @typedef {Object} User
 * @property {string} id - Unique user identifier
 * @property {string} color - User's assigned color
 * @property {string} name - User's display name
 * @property {number} connectedAt - Connection timestamp
 * @property {Point} [cursor] - Current cursor position
 */

/**
 * @typedef {Object} Checkpoint
 * @property {number} pointer - Operation pointer at checkpoint
 * @property {ImageData} imageData - Canvas snapshot
 */

/**
 * Application state container
 */
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

/**
 * Emit an event to all registered listeners
 * @param {string} event - Event name
 * @param {*} payload - Event payload
 * @returns {void}
 */
const emit = (event, payload) => {
  const handlers = listeners.get(event);
  if (!handlers) return;
  handlers.forEach((handler) => handler(payload));
};

/**
 * Register an event listener
 * @param {string} event - Event name
 * @param {Function} handler - Callback function
 * @returns {Function} Unsubscribe function
 */
export const onState = (event, handler) => {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(handler);
  return () => offState(event, handler);
};

/**
 * Unregister an event listener
 * @param {string} event - Event name
 * @param {Function} handler - Callback function
 * @returns {void}
 */
export const offState = (event, handler) => {
  const handlers = listeners.get(event);
  if (!handlers) return;
  handlers.delete(handler);
};

/**
 * Get current application state
 * @returns {Object} Current state
 */
export const getState = () => state;

/**
 * Set the local user
 * @param {User} user - User object
 * @returns {void}
 */
export const setLocalUser = (user) => {
  state.localUser = user;
  emit('localUser', user);
};

/**
 * Set current drawing tool
 * @param {string} tool - Tool type ('brush' | 'eraser')
 * @returns {void}
 */
export const setTool = (tool) => {
  if (tool === state.currentTool) return;
  state.currentTool = tool;
  emit('toolChanged', tool);
};

/**
 * Set current drawing color
 * @param {string} color - Hex color code
 * @returns {void}
 */
export const setColor = (color) => {
  if (color === state.currentColor) return;
  state.currentColor = color;
  emit('colorChanged', color);
};

/**
 * Set current stroke width
 * @param {number} width - Stroke width (1-20)
 * @returns {void}
 */
export const setWidth = (width) => {
  state.currentWidth = width;
  emit('widthChanged', width);
};

/**
 * Set drawing state flag
 * @param {boolean} value - Whether currently drawing
 * @returns {void}
 */
export const setIsDrawing = (value) => {
  state.isDrawing = value;
  emit('drawingChanged', value);
};

/**
 * Clamp pointer value to valid range
 * @param {number} value - Pointer value
 * @returns {number} Clamped pointer value
 */
const clampPointer = (value) => Math.max(-1, Math.min(value, state.operations.length - 1));

/**
 * Remove operations beyond current pointer (truncate redo stack)
 * @returns {void}
 */
const truncateFutureHistory = () => {
  const cutoff = state.pointer + 1;
  if (cutoff <= 0 && state.pointer < 0) {
    if (!state.operations.length) return;
    state.operations = [];
  } else if (cutoff < state.operations.length) {
    state.operations.splice(cutoff);
  } else {
    return;
  }

  if (state.optimisticOperations.size) {
    const remaining = new Set(state.operations.map((op) => op?.clientOperationId).filter(Boolean));
    Array.from(state.optimisticOperations.keys()).forEach((key) => {
      if (!remaining.has(key)) {
        state.optimisticOperations.delete(key);
      }
    });
  }

  if (state.checkpoints.length) {
    state.checkpoints = state.checkpoints.filter((checkpoint) => checkpoint.pointer <= state.pointer);
  }
};

/**
 * Set the operation history pointer
 * @param {number} value - New pointer value
 * @param {Object} [options] - Options
 * @param {boolean} [options.silent=false] - Suppress event emission
 * @returns {void}
 */
export const setPointer = (value, { silent = false } = {}) => {
  const clamped = clampPointer(value);
  if (clamped === state.pointer && !silent) return;
  state.pointer = clamped;
  if (!silent) {
    emit('pointerChanged', clamped);
  }
};

/**
 * Reset entire operation history
 * @returns {void}
 */
export const resetHistory = () => {
  state.operations = [];
  state.pointer = -1;
  state.checkpoints = [];
  state.optimisticOperations.clear();
  emit('historyReset');
};

/**
 * Trim operation history if it exceeds MAX_OPERATIONS
 * @returns {void}
 */
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

/**
 * Add an operation to history
 * @param {Operation} operation - Operation to add
 * @param {Object} [options] - Options
 * @param {boolean} [options.optimistic=false] - Whether this is an optimistic operation
 * @returns {void}
 */
export const addOperation = (operation, { optimistic = false } = {}) => {
  if (!operation) return;
  const existingIndex = state.operations.findIndex((op) => op.id === operation.id);
  if (existingIndex >= 0) {
    state.operations[existingIndex] = operation;
    emit('operationUpdated', operation);
    return;
  }

  if (state.pointer < state.operations.length - 1) {
    truncateFutureHistory();
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

/**
 * Confirm an optimistic operation with server response
 * @param {Operation} serverOperation - Server-confirmed operation
 * @returns {void}
 */
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

/**
 * Get all operations up to current pointer
 * @returns {Operation[]} Array of operations
 */
export const getOperationsUpToPointer = () => {
  if (state.pointer < 0) return [];
  return state.operations.slice(0, state.pointer + 1);
};

/**
 * Request canvas rebuild
 * @returns {void}
 */
export const requestRebuild = () => {
  emit('rebuildRequested', { pointer: state.pointer });
};

/**
 * Save a canvas checkpoint
 * @param {number} pointer - Operation pointer at checkpoint
 * @param {ImageData} imageData - Canvas snapshot
 * @returns {void}
 */
export const saveCheckpoint = (pointer, imageData) => {
  if (typeof pointer !== 'number' || !imageData) return;
  state.checkpoints.push({ pointer, imageData });
  if (state.checkpoints.length > Math.ceil(MAX_OPERATIONS / CHECKPOINT_INTERVAL)) {
    state.checkpoints.shift();
  }
};

/**
 * Clear all checkpoints
 * @returns {void}
 */
export const clearCheckpoints = () => {
  state.checkpoints = [];
};

/**
 * Get nearest checkpoint before target pointer
 * @param {number} targetPointer - Target operation pointer
 * @returns {Checkpoint|null} Checkpoint or null
 */
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
