import { MESSAGE_TYPES } from './constants.js';
import {
  addOperation,
  removeUser,
  requestRebuild,
  resetHistory,
  setCursorForUser,
  setLocalUser,
  setPointer,
  setUsers,
  upsertUser,
} from './state.js';
import { showToast, dismissAllToasts } from './toast.js';

/**
 * @typedef {Object} WebSocketMessage
 * @property {string} type - Message type from MESSAGE_TYPES
 * @property {Object} data - Message payload
 */

/**
 * @typedef {Object} WebSocketHandlers
 * @property {Function} [onStatusChange] - Connection status callback
 * @property {Function} [onRemoteDrawStart] - Remote draw start handler
 * @property {Function} [onRemoteDrawMove] - Remote draw move handler
 * @property {Function} [onRemoteDrawEnd] - Remote draw end handler
 * @property {Function} [onRemoteClear] - Remote clear handler
 */

/**
 * Resolve WebSocket URL based on environment
 * @returns {string} WebSocket URL
 */
const resolveWebSocketUrl = () => {
  if (window.WS_URL) return window.WS_URL;
  if (window.location) {
    const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${window.location.host}`;
  }
  return 'ws://localhost:3000';
};

const DEFAULT_WS_URL = resolveWebSocketUrl();
const BACKOFF_STEPS = [1000, 2000, 4000, 8000, 16000, 30000];

let socket;
let reconnectAttempt = 0;
let isConnecting = false;
let outboundQueue = [];
let cursorQueue = new Map();
let sendCursorIntervalId;
let statusListener;
let remoteHandlers = {};
let reconnectToastId = null;
let isFirstConnection = true;

/**
 * Notify status listener of connection state change
 * @param {string} status - Connection status ('connected' | 'connecting' | 'disconnected')
 * @returns {void}
 */
const notifyStatus = (status) => {
  if (typeof statusListener === 'function') {
    statusListener(status);
  }
  
  // Show toast notifications for connection state changes
  if (status === 'connected') {
    if (reconnectToastId) {
      dismissAllToasts();
      reconnectToastId = null;
    }
    if (!isFirstConnection) {
      showToast('Reconnected successfully!', 'success', { duration: 2000 });
    }
    isFirstConnection = false;
  } else if (status === 'disconnected') {
    if (!reconnectToastId) {
      reconnectToastId = showToast('Connection lost. Reconnecting...', 'warning', { duration: 0 });
    }
  }
};

/**
 * Send a message via WebSocket or queue if disconnected
 * @param {WebSocketMessage} message - Message to send
 * @returns {void}
 */
const send = (message) => {
  if (!message?.type) return;
  const payload = JSON.stringify(message);
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(payload);
    return;
  }
  // Queue message for retry when reconnected
  outboundQueue.push(payload);
  if (outboundQueue.length === 1) {
    // Only show toast for first queued message
    showToast('Queued for retry when connection restores', 'info', { duration: 2000 });
  }
};

/**
 * Flush queued messages when connection is restored
 * @returns {void}
 */
const flushQueue = () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const queueLength = outboundQueue.length;
  while (outboundQueue.length) {
    socket.send(outboundQueue.shift());
  }
  if (queueLength > 0) {
    showToast(`${queueLength} queued message${queueLength > 1 ? 's' : ''} sent`, 'success', { duration: 2000 });
  }
};

/**
 * Schedule reconnection with exponential backoff
 * @returns {void}
 */
const scheduleReconnect = () => {
  const wait = BACKOFF_STEPS[Math.min(reconnectAttempt, BACKOFF_STEPS.length - 1)];
  setTimeout(() => connect(), wait);
  reconnectAttempt += 1;
};

const handleMessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    switch (data.type) {
      case MESSAGE_TYPES.STATE_SYNC:
        resetHistory();
        setLocalUser(data.data.localUser);
        setUsers(data.data.users || []);
        requestRebuild();
        (data.data.operations || []).forEach((operation) => addOperation(operation));
        setPointer(data.data.pointer ?? -1);
        break;
      case MESSAGE_TYPES.DRAW_START:
        remoteHandlers.onRemoteDrawStart?.(data.data);
        break;
      case MESSAGE_TYPES.DRAW_MOVE:
        remoteHandlers.onRemoteDrawMove?.(data.data);
        break;
      case MESSAGE_TYPES.DRAW_END:
        remoteHandlers.onRemoteDrawEnd?.(data.data);
        if (data.data?.operation) {
          addOperation(data.data.operation);
        }
        break;
      case MESSAGE_TYPES.CLEAR:
        remoteHandlers.onRemoteClear?.(data.data);
        if (data.data?.operation) {
          addOperation(data.data.operation);
        }
        break;
      case MESSAGE_TYPES.UNDO:
      case MESSAGE_TYPES.REDO:
        if (typeof data.data?.pointer === 'number') {
          setPointer(data.data.pointer);
        }
        break;
      case MESSAGE_TYPES.USER_JOINED:
      case MESSAGE_TYPES.USER_LEFT:
        if (data.data?.user) {
          if (data.type === MESSAGE_TYPES.USER_LEFT) {
            removeUser(data.data.user.id);
          } else {
            upsertUser(data.data.user);
          }
        }
        break;
      case MESSAGE_TYPES.NAME_CHANGE:
        if (data.data?.userId && data.data?.name !== undefined) {
          upsertUser({ id: data.data.userId, name: data.data.name });
        }
        break;
      case MESSAGE_TYPES.CURSOR_MOVE:
        if (data.data?.userId && data.data.cursor) {
          setCursorForUser(data.data.userId, data.data.cursor);
        }
        break;
      case MESSAGE_TYPES.ERROR:
        console.error('Server error:', data.data?.message);
        break;
      default:
        console.warn('Unknown message type', data.type);
    }
  } catch (error) {
    console.error('Failed to parse message', error);
  }
};

const sendCursorMove = (cursor) => {
  cursorQueue.set('cursor', cursor);
  if (!sendCursorIntervalId) {
    sendCursorIntervalId = setInterval(() => {
      const latest = cursorQueue.get('cursor');
      if (latest) {
        send({ type: MESSAGE_TYPES.CURSOR_MOVE, data: { cursor: latest } });
        cursorQueue.clear();
      }
    }, 100);
  }
};

const sendDrawStart = (payload) => send({ type: MESSAGE_TYPES.DRAW_START, data: payload });
const sendDrawMove = (payload) => send({ type: MESSAGE_TYPES.DRAW_MOVE, data: payload });
const sendDrawEnd = (payload) => send({ type: MESSAGE_TYPES.DRAW_END, data: payload });
const sendClear = () => send({ type: MESSAGE_TYPES.CLEAR });
const sendUndo = () => send({ type: MESSAGE_TYPES.UNDO });
const sendRedo = () => send({ type: MESSAGE_TYPES.REDO });
const sendNameChange = (name) => send({ type: MESSAGE_TYPES.NAME_CHANGE, data: { name } });
const requestStateSync = () => send({ type: MESSAGE_TYPES.STATE_SYNC });

const connect = () => {
  if (isConnecting) return;
  isConnecting = true;
  notifyStatus('connecting');
  socket = new WebSocket(DEFAULT_WS_URL);

  socket.addEventListener('open', () => {
    reconnectAttempt = 0;
    isConnecting = false;
    notifyStatus('connected');
    flushQueue();
    requestStateSync();
  });

  socket.addEventListener('message', (event) => handleMessage(event));

  socket.addEventListener('close', () => {
    notifyStatus('disconnected');
    isConnecting = false;
    scheduleReconnect();
  });

  socket.addEventListener('error', (error) => {
    console.error('WebSocket error', error);
  });
};

export const initWebSocket = ({
  onStatusChange,
  onRemoteDrawStart,
  onRemoteDrawMove,
  onRemoteDrawEnd,
  onRemoteClear,
} = {}) => {
  statusListener = onStatusChange;
  remoteHandlers = {
    onRemoteDrawStart,
    onRemoteDrawMove,
    onRemoteDrawEnd,
    onRemoteClear,
  };
  connect();
  return {
    sendDrawStart,
    sendDrawMove,
    sendDrawEnd,
    sendClear,
    sendCursorMove,
    sendUndo,
    sendRedo,
    sendNameChange,
    requestStateSync,
  };
};
