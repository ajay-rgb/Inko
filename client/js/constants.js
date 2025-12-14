export const MESSAGE_TYPES = Object.freeze({
  DRAW_START: 'DRAW_START',
  DRAW_MOVE: 'DRAW_MOVE',
  DRAW_END: 'DRAW_END',
  CLEAR: 'CLEAR',
  CURSOR_MOVE: 'CURSOR_MOVE',
  UNDO: 'UNDO',
  REDO: 'REDO',
  STATE_SYNC: 'STATE_SYNC',
  USER_JOINED: 'USER_JOINED',
  USER_LEFT: 'USER_LEFT',
  NAME_CHANGE: 'NAME_CHANGE',
  ERROR: 'ERROR'
});

export const TOOLS = Object.freeze({
  BRUSH: 'brush',
  ERASER: 'eraser',
  LINE: 'line',
  RECT: 'rect',
  ELLIPSE: 'ellipse',
});

export const COLOR_PALETTE = [
  '#000000',
  '#FF5733',
  '#FFC300',
  '#2ECC71',
  '#3498DB',
  '#9B59B6',
  '#E67E22',
  '#E74C3C',
  '#1ABC9C',
  '#F1C40F'
];

export const DRAW_MOVE_BATCH_INTERVAL = 80; // ms
export const CURSOR_THROTTLE_INTERVAL = 100; // ms
export const CHECKPOINT_INTERVAL = 20;
export const MAX_OPERATIONS = 5000;
