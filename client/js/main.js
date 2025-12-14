import { initCanvas } from './canvas.js';
import { initUI } from './ui.js';
import { initWebSocket } from './websocket.js';

import { getCurrentColor, getCurrentTool, getCurrentWidth } from './state.js';

const init = () => {
  let transport;

  const canvasApi = initCanvas({
    getCurrentColor,
    getCurrentTool,
    getCurrentWidth,
    sendDrawStart: (payload) => transport?.sendDrawStart?.(payload),
    sendDrawMove: (payload) => transport?.sendDrawMove?.(payload),
    sendDrawEnd: (payload) => transport?.sendDrawEnd?.(payload),
    sendCursorMove: (payload) => transport?.sendCursorMove?.(payload),
  });

  const ui = initUI({
    onUndo: () => transport?.sendUndo?.(),
    onRedo: () => transport?.sendRedo?.(),
    onClear: () => transport?.sendClear?.(),
    onNameChange: (name) => transport?.sendNameChange?.(name),
  });

  transport = initWebSocket({
    onStatusChange: ui.setStatus,
    onRemoteDrawStart: canvasApi.handleRemoteDrawStart,
    onRemoteDrawMove: canvasApi.handleRemoteDrawMove,
    onRemoteDrawEnd: canvasApi.handleRemoteDrawEnd,
    onRemoteClear: canvasApi.handleRemoteClear,
  });
};

init();
