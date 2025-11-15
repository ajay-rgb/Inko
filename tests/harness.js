import { spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import process from 'process';
import { setTimeout as delay } from 'timers/promises';
import WebSocket from 'ws';
import { MESSAGE_TYPES } from '../server/constants.js';

const SERVER_PORT = process.env.PORT || 3000;
const SERVER_READY_TOKEN = 'Server listening on port';
const SERVER_START_TIMEOUT = 8000;
const MESSAGE_TIMEOUT = 3000;

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const waitForHealth = async (signal) => {
  const deadline = Date.now() + SERVER_START_TIMEOUT;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error('Server process exited before becoming ready');
    }
    try {
      const response = await fetch(`http://localhost:${SERVER_PORT}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      // swallow until timeout/abort
    }
    await delay(250);
  }
  throw new Error('Timed out waiting for server to start');
};

const startServer = async () => {
  const serverPath = path.join(process.cwd(), 'server', 'server.js');
  const child = spawn(process.execPath, [serverPath], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const abortController = new AbortController();

  const exitPromise = new Promise((_, reject) => {
    child.once('error', (error) => {
      abortController.abort();
      reject(error);
    });
    child.once('exit', (code, signal) => {
      abortController.abort();
      reject(new Error(`Server exited before ready (code ${code ?? 'n/a'}, signal ${signal ?? 'n/a'})`));
    });
  });

  await Promise.race([
    waitForHealth(abortController.signal),
    exitPromise,
  ]);

  return child;
};

const waitForMessage = (ws, type) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    ws.off('message', handler);
    reject(new Error(`Timed out waiting for ${type}`));
  }, MESSAGE_TIMEOUT);

  const handler = (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
        return;
      }
    } catch (error) {
      clearTimeout(timer);
      ws.off('message', handler);
      reject(new Error(`Failed to parse message: ${error.message}`));
    }
  };

  ws.on('message', handler);
});

const connectClient = async (label) => {
  const ws = new WebSocket(`ws://localhost:${SERVER_PORT}`);
  const stateSyncPromise = waitForMessage(ws, MESSAGE_TYPES.STATE_SYNC);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  await stateSyncPromise;
  console.log(`${label} connected and synchronized`);
  return ws;
};

const send = (ws, message) => ws.send(JSON.stringify(message));

const simulateDrawSequence = async (clientA, clientB) => {
  const stroke = {
    clientOperationId: crypto.randomUUID(),
    color: '#123456',
    width: 5,
    tool: 'brush',
  };
  const startPoint = { x: 50, y: 60 };
  const movePoints = [
    { x: 55, y: 70 },
    { x: 65, y: 80 },
  ];
  const fullPath = [startPoint, ...movePoints];

  send(clientA, { type: MESSAGE_TYPES.DRAW_START, data: { ...stroke, point: startPoint } });
  const startMsg = await waitForMessage(clientB, MESSAGE_TYPES.DRAW_START);
  assert(startMsg.data?.point?.x === startPoint.x, 'Remote start point mismatch');

  send(clientA, { type: MESSAGE_TYPES.DRAW_MOVE, data: { ...stroke, points: movePoints } });
  const moveMsg = await waitForMessage(clientB, MESSAGE_TYPES.DRAW_MOVE);
  assert(moveMsg.data?.points?.length === movePoints.length, 'Remote move points missing');

  send(clientA, { type: MESSAGE_TYPES.DRAW_END, data: { ...stroke, path: fullPath } });
  const [endA, endB] = await Promise.all([
    waitForMessage(clientA, MESSAGE_TYPES.DRAW_END),
    waitForMessage(clientB, MESSAGE_TYPES.DRAW_END),
  ]);

  [endA, endB].forEach((msg, idx) => {
    assert(msg.data?.operation, `Missing committed operation for client ${idx + 1}`);
    assert(msg.data.operation.data?.path?.length === fullPath.length, 'Committed path mismatch');
    assert(typeof msg.data.operation.sequenceNumber === 'number', 'Sequence number missing');
  });

  console.log('Draw sequence validated across both clients');
};

const simulateClear = async (sender, peers = []) => {
  send(sender, { type: MESSAGE_TYPES.CLEAR });
  const recipients = [sender, ...peers];
  const responses = await Promise.all(
    recipients.map((client) => waitForMessage(client, MESSAGE_TYPES.CLEAR))
  );
  responses.forEach((msg) => {
    assert(msg.data?.operation?.type === 'clear', 'Clear operation missing');
  });
  console.log('Clear broadcast acknowledged by all clients');
};

const drawStrokeForUndoTest = async (sender, receivers = [], offset = 0) => {
  const baseX = 40 + offset;
  const baseY = 50 + offset;
  const path = [
    { x: baseX, y: baseY },
    { x: baseX + 12, y: baseY + 8 },
    { x: baseX + 24, y: baseY + 16 },
  ];
  const [startPoint, ...movePoints] = path;
  const stroke = {
    clientOperationId: crypto.randomUUID(),
    color: '#55AAFF',
    width: 4,
    tool: 'brush',
  };

  send(sender, { type: MESSAGE_TYPES.DRAW_START, data: { ...stroke, point: startPoint } });
  await Promise.all(receivers.map((client) => waitForMessage(client, MESSAGE_TYPES.DRAW_START)));

  send(sender, { type: MESSAGE_TYPES.DRAW_MOVE, data: { ...stroke, points: movePoints } });
  if (receivers.length) {
    await Promise.all(receivers.map((client) => waitForMessage(client, MESSAGE_TYPES.DRAW_MOVE)));
  }

  send(sender, { type: MESSAGE_TYPES.DRAW_END, data: { ...stroke, path } });
  const endMessages = await Promise.all([
    waitForMessage(sender, MESSAGE_TYPES.DRAW_END),
    ...receivers.map((client) => waitForMessage(client, MESSAGE_TYPES.DRAW_END)),
  ]);

  endMessages.forEach((msg, idx) => {
    assert(msg.data?.operation, `Stroke commit missing for participant ${idx + 1}`);
  });

  return endMessages[0].data.operation;
};

const simulateUndoTruncatesRedoStack = async (clientA, clientB) => {
  send(clientA, { type: MESSAGE_TYPES.STATE_SYNC });
  const initialSync = await waitForMessage(clientA, MESSAGE_TYPES.STATE_SYNC);
  const initialOpCount = (initialSync.data?.operations || []).length;
  
  const op1 = await drawStrokeForUndoTest(clientA, [clientB], 0);
  const op2 = await drawStrokeForUndoTest(clientA, [clientB], 30);

  send(clientA, { type: MESSAGE_TYPES.UNDO });
  await Promise.all([
    waitForMessage(clientA, MESSAGE_TYPES.UNDO),
    waitForMessage(clientB, MESSAGE_TYPES.UNDO),
  ]);

  const op3 = await drawStrokeForUndoTest(clientA, [clientB], 60);

  send(clientA, { type: MESSAGE_TYPES.STATE_SYNC });
  const syncMsg = await waitForMessage(clientA, MESSAGE_TYPES.STATE_SYNC);
  const operationIds = (syncMsg.data?.operations || []).map((operation) => operation.id);

  assert(!operationIds.includes(op2.id), 'Undone stroke should not return after new draw');
  assert(operationIds.includes(op1.id), 'Original stroke missing after undo/draw sequence');
  assert(operationIds.includes(op3.id), 'Newest stroke missing after undo/draw sequence');
  assert(operationIds.length === initialOpCount + 2, `Expected ${initialOpCount + 2} ops but got ${operationIds.length}`);
  console.log('Undo truncation verified successfully');
};

const main = async () => {
  const server = await startServer();
  try {
    const [clientA, clientB] = await Promise.all([
      connectClient('Client A'),
      connectClient('Client B'),
    ]);

  await simulateDrawSequence(clientA, clientB);
  await simulateClear(clientB, [clientA]);
  await simulateUndoTruncatesRedoStack(clientA, clientB);

    clientA.close();
    clientB.close();
    await delay(100);
    console.log('Test harness completed successfully');
  } finally {
    server.kill();
  }
};

main().catch((error) => {
  console.error('Harness failed:', error);
  process.exitCode = 1;
});
