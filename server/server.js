import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { MESSAGE_TYPES, COLOR_POOL } from './constants.js';
import { Room } from './Room.js';
import { generateId, now, validateCoordinate } from './utils.js';
import { validateOperationPayload } from './operations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', users: room.users.size, uptime: process.uptime() });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const room = new Room();
const colorPool = [...COLOR_POOL];

const broadcast = (message, { exclude } = {}) => {
  const payload = typeof message === 'string' ? message : JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState !== client.OPEN) return;
    if (exclude && client === exclude) return;
    client.send(payload);
  });
};

const sendMessage = (ws, message) => {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
};

const assignColor = () => (colorPool.length ? colorPool.shift() : '#000000');

const releaseColor = (color) => {
  if (!color) return;
  if (!colorPool.includes(color)) {
    colorPool.push(color);
  }
};

const sendError = (ws, error) => {
  sendMessage(ws, { type: MESSAGE_TYPES.ERROR, data: { message: error } });
};

const sendStateSync = (ws, user) => {
  const snapshot = room.getStateSnapshot();
  sendMessage(ws, {
    type: MESSAGE_TYPES.STATE_SYNC,
    data: {
      localUser: user,
      operations: snapshot.operations,
      pointer: snapshot.pointer,
      users: snapshot.users,
    },
  });
};

const buildStrokeMeta = (messageData, fallback = {}) => ({
  clientOperationId: messageData.clientOperationId || fallback.clientOperationId,
  color: messageData.color || fallback.color,
  width: messageData.width || fallback.width,
  tool: messageData.tool || fallback.tool || 'brush',
});

const broadcastStroke = (type, user, data, ws, options = {}) => {
  const payload = {
    type,
    data: {
      userId: user.id,
      stroke: data.stroke,
      point: data.point,
      points: data.points,
      operation: data.operation,
    },
  };
  if (!options.skipSender) {
    sendMessage(ws, payload);
  }
  broadcast(payload, { exclude: ws });
};

const handleDrawStart = (ws, user, message, strokes) => {
  const validation = validateOperationPayload(MESSAGE_TYPES.DRAW_START, message.data);
  if (!validation.valid) {
    sendError(ws, validation.error);
    return;
  }
  const stroke = buildStrokeMeta(message.data);
  strokes.set(stroke.clientOperationId, stroke);
  broadcast({
    type: MESSAGE_TYPES.DRAW_START,
    data: {
      userId: user.id,
      stroke,
      point: message.data.point,
    },
  }, { exclude: ws });
};

const handleDrawMove = (ws, user, message, strokes) => {
  const validation = validateOperationPayload(MESSAGE_TYPES.DRAW_MOVE, message.data);
  if (!validation.valid) {
    sendError(ws, validation.error);
    return;
  }
  let stroke = strokes.get(message.data.clientOperationId);
  if (!stroke) {
    const canRehydrate = message.data.color && message.data.width && message.data.tool;
    if (canRehydrate) {
      stroke = buildStrokeMeta(message.data);
      strokes.set(stroke.clientOperationId, stroke);
    } else {
      sendError(ws, 'Unknown stroke reference');
      return;
    }
  }
  broadcast({
    type: MESSAGE_TYPES.DRAW_MOVE,
    data: {
      userId: user.id,
      stroke,
      points: message.data.points,
    },
  }, { exclude: ws });
};

const handleDrawEnd = (ws, user, message, strokes) => {
  const validation = validateOperationPayload(MESSAGE_TYPES.DRAW_END, message.data);
  if (!validation.valid) {
    sendError(ws, validation.error);
    return;
  }
  const cachedStroke = strokes.get(message.data.clientOperationId);
  const stroke = buildStrokeMeta(message.data, cachedStroke);
  strokes.delete(message.data.clientOperationId);

  const operation = room.buildOperation({
    userId: user.id,
    type: stroke.tool === 'eraser' ? 'erase' : 'draw',
    data: {
      path: message.data.path,
      color: stroke.color,
      width: stroke.width,
      tool: stroke.tool,
    },
    clientOperationId: stroke.clientOperationId,
  });

  room.appendOperation(operation);

  broadcastStroke(
    MESSAGE_TYPES.DRAW_END,
    user,
    { stroke, operation },
    ws,
    { skipSender: false }
  );
};

const handleClear = (ws, user) => {
  const validation = validateOperationPayload(MESSAGE_TYPES.CLEAR, {});
  if (!validation.valid) {
    sendError(ws, validation.error);
    return;
  }
  const operation = room.buildOperation({
    userId: user.id,
    type: 'clear',
    data: {},
  });
  room.appendOperation(operation);
  const payload = {
    type: MESSAGE_TYPES.CLEAR,
    data: { userId: user.id, operation },
  };
  sendMessage(ws, payload);
  broadcast(payload, { exclude: ws });
};

const handleCursorMove = (ws, user, message) => {
  const cursor = message.data?.cursor;
  if (!cursor || !validateCoordinate(cursor.x) || !validateCoordinate(cursor.y)) {
    return;
  }
  broadcast({
    type: MESSAGE_TYPES.CURSOR_MOVE,
    data: {
      userId: user.id,
      cursor,
    },
  }, { exclude: ws });
};

const handleUndoRedo = (ws, message) => {
  const pointer = message.type === MESSAGE_TYPES.UNDO ? room.undo() : room.redo();
  const payload = { type: message.type, data: { pointer } };
  sendMessage(ws, payload);
  broadcast(payload, { exclude: ws });
};

wss.on('connection', (ws) => {
  const user = {
    id: generateId(),
    color: assignColor(),
    name: `User ${room.users.size + 1}`,
    connectedAt: now(),
  };
  const activeStrokes = new Map();

  room.addUser(user);

  sendStateSync(ws, user);
  broadcast({ type: MESSAGE_TYPES.USER_JOINED, data: { user } }, { exclude: ws });

  ws.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      switch (message.type) {
        case MESSAGE_TYPES.DRAW_START:
          handleDrawStart(ws, user, message, activeStrokes);
          break;
        case MESSAGE_TYPES.DRAW_MOVE:
          handleDrawMove(ws, user, message, activeStrokes);
          break;
        case MESSAGE_TYPES.DRAW_END:
          handleDrawEnd(ws, user, message, activeStrokes);
          break;
        case MESSAGE_TYPES.CLEAR:
          handleClear(ws, user);
          break;
        case MESSAGE_TYPES.CURSOR_MOVE:
          handleCursorMove(ws, user, message);
          break;
        case MESSAGE_TYPES.UNDO:
        case MESSAGE_TYPES.REDO:
          handleUndoRedo(ws, message);
          break;
        case MESSAGE_TYPES.STATE_SYNC:
          sendStateSync(ws, user);
          break;
        default:
          sendError(ws, 'Unknown message type');
      }
    } catch (error) {
      sendError(ws, 'Invalid message format');
    }
  });

  ws.on('close', () => {
    room.removeUser(user.id);
    releaseColor(user.color);
    broadcast({ type: MESSAGE_TYPES.USER_LEFT, data: { user } });
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
