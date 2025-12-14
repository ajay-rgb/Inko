import {
  CHECKPOINT_INTERVAL,
  CURSOR_THROTTLE_INTERVAL,
  DRAW_MOVE_BATCH_INTERVAL,
  TOOLS,
} from './constants.js';
import {
  clearCheckpoints,
  getCheckpoint,
  getLocalUser,
  getState,
  onState,
  requestRebuild,
  saveCheckpoint,
  setIsDrawing,
} from './state.js';

/**
 * @typedef {Object} Point
 * @property {number} x - X coordinate
 * @property {number} y - Y coordinate
 */

/**
 * @typedef {Object} StrokeMeta
 * @property {string} clientOperationId - Unique stroke identifier
 * @property {string} color - Stroke color
 * @property {number} width - Stroke width
 * @property {string} tool - Tool type ('brush' | 'eraser')
 */

/**
 * @typedef {Object} CanvasDependencies
 * @property {Function} getCurrentColor - Get current color
 * @property {Function} getCurrentTool - Get current tool
 * @property {Function} getCurrentWidth - Get current width
 * @property {Function} sendDrawStart - Send draw start message
 * @property {Function} sendDrawMove - Send draw move message
 * @property {Function} sendDrawEnd - Send draw end message
 * @property {Function} sendCursorMove - Send cursor move message
 */

const devicePixelRatio = window.devicePixelRatio || 1;

let mainCanvas;
let tempCanvas;
let remoteCanvas;
let mainCtx;
let tempCtx;
let remoteCtx;
let container;
let cursorsLayer;
let resizeObserver;

let currentPath = [];
let batchedPoints = [];
let batchIntervalId = null;
let lastCursorSentAt = 0;
let pointerDown = false;
let lastRenderedPointer = -1;
let activeStroke = null;

const cursorElements = new Map();
const remoteStrokes = new Map();

const remoteStrokeKey = (userId, clientOperationId) => `${userId}:${clientOperationId}`;

/**
 * Clear the remote overlay canvas
 * @returns {void}
 */
const clearRemoteOverlay = () => {
  remoteStrokes.clear();
  if (!remoteCtx) return;
  remoteCtx.save();
  remoteCtx.setTransform(1, 0, 0, 1, 0, 0);
  remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
  remoteCtx.restore();
};

/**
 * Get canvas element references from DOM
 * @returns {void}
 * @throws {Error} If required elements are missing
 */
const getCanvasElements = () => {
  mainCanvas = document.getElementById('mainCanvas');
  tempCanvas = document.getElementById('tempCanvas');
  remoteCanvas = document.getElementById('remoteCanvas');

  container = document.querySelector('.canvas-container');
  cursorsLayer = document.getElementById('cursors');

  if (!mainCanvas || !tempCanvas || !remoteCanvas || !container || !cursorsLayer) {
    throw new Error('Canvas or overlay elements missing in DOM');
  }
  mainCtx = mainCanvas.getContext('2d');
  tempCtx = tempCanvas.getContext('2d');
  remoteCtx = remoteCanvas.getContext('2d');
};

/**
 * Clear all canvas layers
 * @returns {void}
 */
const clearAllCanvases = () => {
  [mainCtx, tempCtx, remoteCtx].forEach((ctx) => {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  });
};

/**
 * Resize all canvases and cancel active stroke
 * @returns {void}
 */
const resizeCanvases = () => {
  if (!container) return;
  
  // Cancel active stroke if drawing during resize
  if (pointerDown) {
    pointerDown = false;
    currentPath = [];
    batchedPoints = [];
    activeStroke = null;
    stopBatching(null);
    setIsDrawing(false);
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
  }
  
  const { width, height } = container.getBoundingClientRect();
  [mainCanvas, remoteCanvas, tempCanvas].forEach((canvas) => {
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  });
  mainCtx.scale(devicePixelRatio, devicePixelRatio);
  tempCtx.scale(devicePixelRatio, devicePixelRatio);
  remoteCtx.scale(devicePixelRatio, devicePixelRatio);

  clearAllCanvases();
  clearCheckpoints();
  lastRenderedPointer = -1;
  requestRebuild();
  renderRemoteCursors();
};

/**
 * Validate that a point has finite coordinates
 * @param {Object} point - Point to validate
 * @returns {boolean} True if point is valid
 */
const isValidPoint = (point) => {
  return point && 
         Number.isFinite(point.x) && 
         Number.isFinite(point.y) &&
         point.x >= -100 &&
         point.x <= 10000 &&
         point.y >= -100 &&
         point.y <= 10000;
};

/**
 * Convert event coordinates to canvas coordinates
 * @param {PointerEvent} event - Pointer event
 * @returns {Point|null} Canvas coordinates or null if invalid
 */
const getCanvasCoordinates = (event) => {
  const rect = mainCanvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) * (mainCanvas.width / rect.width)) / devicePixelRatio;
  const y = ((event.clientY - rect.top) * (mainCanvas.height / rect.height)) / devicePixelRatio;
  const point = { x, y };
  // Return null if coordinates are invalid
  return isValidPoint(point) ? point : null;
};

/**
 * Calculate Euclidean distance between two points
 * @param {Point} a - First point
 * @param {Point} b - Second point
 * @returns {number} Distance between points
 */
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Check if point should be added to path
 * @param {Point} point - Candidate point
 * @returns {boolean} True if point is far enough from last point
 */
const shouldAddPoint = (point) => {
  if (!currentPath.length) return true;
  const lastPoint = currentPath[currentPath.length - 1];
  return distance(point, lastPoint) >= 1.5;
};

/**
 * Draw a path on a canvas context
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Point[]} path - Array of points
 * @param {Object} options - Drawing options
 * @param {string} options.color - Stroke color
 * @param {number} options.width - Stroke width
 * @param {string} options.tool - Tool type ('brush' | 'eraser')
 * @returns {void}
 */
const drawPath = (ctx, path, { color, width, tool }) => {
  if (!path?.length) return;
  ctx.save();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = color;

  ctx.globalCompositeOperation = tool === TOOLS.ERASER ? 'destination-out' : 'source-over';

  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i += 1) {
    ctx.lineTo(path[i].x, path[i].y);
  }
  ctx.stroke();
  ctx.restore();
};

/**
 * Simplify path using distance-based tolerance
 * @param {Point[]} path - Path to simplify
 * @param {number} [tolerance=1.8] - Minimum distance between points
 * @returns {Point[]} Simplified path
 */
const simplifyPath = (path, tolerance = 1.8) => {
  if (path.length < 3) return path;
  const simplified = [path[0]];
  for (let i = 1; i < path.length - 1; i += 1) {
    if (distance(path[i], simplified[simplified.length - 1]) >= tolerance) {
      simplified.push(path[i]);
    }
  }
  simplified.push(path[path.length - 1]);
  return simplified;
};

/**
 * Flush batched points to server
 * @param {Function} sendDrawMove - Function to send draw move message
 * @returns {void}
 */
const flushBatchedPoints = (sendDrawMove) => {
  if (!batchedPoints.length || !activeStroke) return;
  sendDrawMove({
    clientOperationId: activeStroke.clientOperationId,
    points: [...batchedPoints],
    color: activeStroke.color,
    width: activeStroke.width,
    tool: activeStroke.tool,
  });
  batchedPoints = [];
};

/**
 * Start batching points for server transmission
 * @param {Function} sendDrawMove - Function to send draw move message
 * @returns {void}
 */
const startBatching = (sendDrawMove) => {
  if (batchIntervalId) return;
  batchIntervalId = window.setInterval(() => flushBatchedPoints(sendDrawMove), DRAW_MOVE_BATCH_INTERVAL);
};

/**
 * Stop batching and send remaining points
 * @param {Function|null} sendDrawMove - Function to send draw move message
 * @returns {void}
 */
const stopBatching = (sendDrawMove) => {
  if (batchIntervalId) {
    window.clearInterval(batchIntervalId);
    batchIntervalId = null;
  }
  flushBatchedPoints(sendDrawMove);
};

/**
 * Handle pointer down event to start drawing
 * @param {PointerEvent} event - Pointer down event
 * @param {CanvasDependencies} deps - Dependencies for drawing
 * @returns {void}
 */
const handlePointerDown = (event, deps) => {
  if (event.button !== 0) return;
  pointerDown = true;
  const point = getCanvasCoordinates(event);
  if (!point) return; // Ignore invalid coordinates
  currentPath = [point];
  batchedPoints = [point];
  const color = deps.getCurrentColor();
  const tool = deps.getCurrentTool();
  const width = deps.getCurrentWidth();
  const clientOperationId = crypto.randomUUID();
  activeStroke = { clientOperationId, color, width, tool };

  setIsDrawing(true);
  deps.sendDrawStart({ point, color, width, tool, clientOperationId });
  drawPath(tempCtx, currentPath, activeStroke);
  startBatching(deps.sendDrawMove);
};

/**
 * Handle pointer move event for drawing and cursor updates
 * @param {PointerEvent} event - Pointer move event
 * @param {CanvasDependencies} deps - Dependencies for drawing
 * @returns {void}
 */
const handlePointerMove = (event, deps) => {
  if (!mainCanvas) return;

  const point = getCanvasCoordinates(event);

  if (!point) return; // Ignore invalid coordinates
  const now = performance.now();
  
  if (now - lastCursorSentAt >= CURSOR_THROTTLE_INTERVAL) {
    deps.sendCursorMove(point);
    lastCursorSentAt = now;
  }
  if (!pointerDown) return;
  if (!shouldAddPoint(point)) return;
  currentPath.push(point);
  batchedPoints.push(point);
  drawPath(tempCtx, currentPath.slice(-2), activeStroke);
};

/**
 * Finalize current stroke and send to server
 * @param {CanvasDependencies} deps - Dependencies for drawing
 * @returns {void}
 */
const finalizeStroke = (deps) => {
  if (!pointerDown || !currentPath.length || !activeStroke) return;
  pointerDown = false;
  const simplifiedPath = simplifyPath(currentPath);
  drawPath(mainCtx, simplifiedPath, activeStroke);
  tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
  deps.sendDrawEnd({
    path: simplifiedPath,
    ...activeStroke,
  });
  stopBatching(deps.sendDrawMove);
  setIsDrawing(false);
  currentPath = [];
  batchedPoints = [];
  activeStroke = null;
};

/**
 * Handle clear operation from server
 * @returns {void}
 */
const handleClearOperation = () => {
  clearAllCanvases();
  clearCheckpoints();
  clearRemoteOverlay();
  lastRenderedPointer = -1;
};

/**
 * Handle committed operation from server
 * @param {Object} operation - Operation to commit
 * @param {string} operation.type - Operation type ('draw' | 'clear')
 * @param {number} [operation.sequenceNumber] - Sequence number in history
 * @param {Object} [operation.data] - Operation data
 * @returns {void}
 */
const handleOperationCommitted = (operation) => {
  if (!operation) return;
  if (operation.type === 'clear') {
    handleClearOperation();
    return;
  }
  if (!operation?.data?.path?.length) return;
  if (operation.sequenceNumber == null) {
    drawPath(mainCtx, operation.data.path, operation.data);
    return;
  }
  if (operation.sequenceNumber === lastRenderedPointer + 1) {
    drawPath(mainCtx, operation.data.path, operation.data);
    lastRenderedPointer = operation.sequenceNumber;
    if ((operation.sequenceNumber + 1) % CHECKPOINT_INTERVAL === 0) {
      try {
        const imageData = mainCtx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
        saveCheckpoint(operation.sequenceNumber, imageData);
      } catch (error) {
        console.error('Failed to save checkpoint', error);
      }
    }
    return;
  }
  rebuildCanvasFromHistory();
};

/**
 * Rebuild canvas from operation history
 * @returns {void}
 */
const rebuildCanvasFromHistory = () => {
  const pointer = getState().pointer;
  clearAllCanvases();
  clearRemoteOverlay();
  if (pointer < 0) {
    lastRenderedPointer = -1;
    return;
  }
  const checkpoint = getCheckpoint(pointer);
  let startIndex = 0;
  if (checkpoint) {
    mainCtx.putImageData(checkpoint.imageData, 0, 0);
    startIndex = checkpoint.pointer + 1;
  }
  const operations = getState().operations;
  for (let i = startIndex; i <= pointer; i += 1) {
    const operation = operations[i];
    if (!operation) continue;
    if (operation.type === 'clear') {
      handleClearOperation();
      continue;
    }
    drawPath(mainCtx, operation.data.path, operation.data);
  }
  lastRenderedPointer = pointer;
};

/**
 * Ensure cursor element exists for user
 * @param {User} user - User object
 * @returns {HTMLElement} Cursor element
 */
const ensureCursorElement = (user) => {
  if (cursorElements.has(user.id)) {
    return cursorElements.get(user.id);
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'remote-cursor';
  const label = document.createElement('span');
  label.className = 'cursor-label';
  label.textContent = user.name || user.id;
  wrapper.appendChild(label);
  cursorsLayer.appendChild(wrapper);
  cursorElements.set(user.id, { wrapper, label });
  return { wrapper, label };
};

/**
 * Remove cursor element for user
 * @param {string} userId - User ID
 * @returns {void}
 */
const removeCursorElement = (userId) => {
  const entry = cursorElements.get(userId);
  if (entry) {
    entry.wrapper.remove();
    cursorElements.delete(userId);
  }
};

/**
 * Render all remote user cursors
 * @returns {void}
 */
const renderRemoteCursors = () => {
  if (!mainCanvas || !cursorsLayer) return;
  const { users } = getState();
  const localId = getLocalUser()?.id;
  const rect = mainCanvas.getBoundingClientRect();
  const width = rect?.width || 0;
  const height = rect?.height || 0;

  cursorElements.forEach((_entry, userId) => {
    if (!users.has(userId) || users.get(userId).cursor == null || userId === localId) {
      removeCursorElement(userId);
    }
  });

  users.forEach((user, userId) => {
    if (userId === localId) return;
    const cursor = user.cursor;
    if (!cursor) {
      removeCursorElement(userId);
      return;
    }
    if (cursor.x < 0 || cursor.y < 0 || cursor.x > width || cursor.y > height) {
      removeCursorElement(userId);
      return;
    }
    const entry = ensureCursorElement(user);
    entry.wrapper.style.left = `${cursor.x}px`;
    entry.wrapper.style.top = `${cursor.y}px`;
    entry.wrapper.style.backgroundColor = user.color || '#3498db';
    entry.label.textContent = user.name || userId;
  });
};

/**
 * Draw a stroke segment on remote canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Point} startPoint - Starting point
 * @param {Point[]} points - Additional points
 * @param {StrokeMeta} stroke - Stroke metadata
 * @returns {void}
 */
const drawStrokeSegment = (ctx, startPoint, points, stroke) => {
  if (!points?.length || !ctx) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke.width;
  ctx.strokeStyle = stroke.color;
  ctx.globalCompositeOperation = stroke.tool === TOOLS.ERASER ? 'destination-out' : 'source-over';
  ctx.beginPath();
  ctx.moveTo(startPoint.x, startPoint.y);
  points.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.stroke();
  ctx.restore();
};

/**
 * Draw individual points as circles
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Point[]} points - Points to draw
 * @param {StrokeMeta} stroke - Stroke metadata
 * @returns {void}
 */
const drawStrokePoints = (ctx, points, stroke) => {
  if (!points?.length) return;
  ctx.save();

  ctx.fillStyle = stroke.color;

  ctx.globalCompositeOperation = stroke.tool === TOOLS.ERASER ? 'destination-out' : 'source-over';

  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(stroke.width / 2, 1), 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  });

  ctx.restore();
};

/**
 * Redraw entire remote layer from cached strokes
 * @returns {void}
 */
const redrawRemoteLayer = () => {
  remoteCtx.save();
  remoteCtx.setTransform(1, 0, 0, 1, 0, 0);
  remoteCtx.clearRect(0, 0, remoteCanvas.width, remoteCanvas.height);
  remoteCtx.restore();
  remoteStrokes.forEach(({ stroke, points }) => {
    if (points.length === 1) {
      drawStrokePoints(remoteCtx, points, stroke);
      return;
    }
    const [first, ...rest] = points;
    drawStrokePoints(remoteCtx, [first], stroke);
    if (rest.length) {
      drawStrokeSegment(remoteCtx, first, rest, stroke);
    }
  });
};

/**
 * Handle remote user starting a stroke
 * @param {Object} payload - Draw start payload
 * @param {string} payload.userId - User ID
 * @param {StrokeMeta} payload.stroke - Stroke metadata
 * @param {Point} payload.point - Starting point
 * @returns {void}
 */
const handleRemoteDrawStart = ({ userId, stroke, point }) => {
  if (!userId || !stroke?.clientOperationId || !point) return;
  const key = remoteStrokeKey(userId, stroke.clientOperationId);
  remoteStrokes.set(key, {
    stroke,
    points: [point],
  });
  drawStrokePoints(remoteCtx, [point], stroke);
};

/**
 * Handle remote user adding points to stroke
 * @param {Object} payload - Draw move payload
 * @param {string} payload.userId - User ID
 * @param {StrokeMeta} payload.stroke - Stroke metadata
 * @param {Point[]} payload.points - New points
 * @returns {void}
 */
const handleRemoteDrawMove = ({ userId, stroke, points }) => {
  if (!userId || !stroke?.clientOperationId || !points?.length) return;
  const key = remoteStrokeKey(userId, stroke.clientOperationId);
  const entry = remoteStrokes.get(key);
  if (!entry) return;
  const start = entry.points[entry.points.length - 1];
  drawStrokeSegment(remoteCtx, start, points, entry.stroke);
  entry.points.push(...points);
};

/**
 * Handle remote user finishing a stroke
 * @param {Object} payload - Draw end payload
 * @param {string} payload.userId - User ID
 * @param {StrokeMeta} payload.stroke - Stroke metadata
 * @returns {void}
 */
const handleRemoteDrawEnd = ({ userId, stroke }) => {
  if (!userId || !stroke?.clientOperationId) return;
  const key = remoteStrokeKey(userId, stroke.clientOperationId);
  if (!remoteStrokes.has(key)) return;
  remoteStrokes.delete(key);
  redrawRemoteLayer();
};

/**
 * Initialize canvas with event listeners
 * @param {CanvasDependencies} deps - Dependencies for canvas
 * @returns {void}
 */
export const initCanvas = (deps) => {
  getCanvasElements();
  resizeCanvases();

  const pointerDeps = {
    getCurrentColor: deps.getCurrentColor,
    getCurrentTool: deps.getCurrentTool,
    getCurrentWidth: deps.getCurrentWidth,
    sendDrawStart: deps.sendDrawStart,
    sendDrawMove: deps.sendDrawMove,
    sendDrawEnd: deps.sendDrawEnd,
    sendCursorMove: deps.sendCursorMove,
  };

  mainCanvas.addEventListener('mousedown', (event) => handlePointerDown(event, pointerDeps));
  window.addEventListener('mousemove', (event) => handlePointerMove(event, pointerDeps));

  window.addEventListener('mouseup', () => finalizeStroke(pointerDeps));
  mainCanvas.addEventListener('mouseleave', () => finalizeStroke(pointerDeps));

  window.addEventListener('resize', resizeCanvases);
  resizeObserver = new ResizeObserver(() => resizeCanvases());
  resizeObserver.observe(container);

  onState('operationAdded', handleOperationCommitted);
  onState('operationConfirmed', handleOperationCommitted);
  onState('pointerChanged', rebuildCanvasFromHistory);
  onState('historyReset', clearAllCanvases);
  onState('rebuildRequested', rebuildCanvasFromHistory);
  onState('usersUpdated', renderRemoteCursors);
  onState('localUser', renderRemoteCursors);

  return {
    rebuildCanvas: rebuildCanvasFromHistory,
    handleRemoteDrawStart,
    handleRemoteDrawMove,
    handleRemoteDrawEnd,
    handleRemoteClear: clearRemoteOverlay,
    dispose: () => resizeObserver?.disconnect(),
  };
};
