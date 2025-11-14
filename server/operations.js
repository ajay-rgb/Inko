import { MESSAGE_TYPES } from './constants.js';
import { generateId, validateColor, validateCoordinate } from './utils.js';

const TOOLS = new Set(['brush', 'eraser']);

const ensurePoint = (point) => {
  if (!point) return false;
  return validateCoordinate(point.x) && validateCoordinate(point.y);
};

const validatePointsArray = (points = []) => Array.isArray(points) && points.length > 0 && points.every(ensurePoint);

const validateWidth = (width) => typeof width === 'number' && width >= 1 && width <= 20;

const validateTool = (tool) => TOOLS.has(tool);

export const validateOperationPayload = (type, data = {}) => {
  switch (type) {
    case MESSAGE_TYPES.DRAW_START:
      if (!data.clientOperationId) return { valid: false, error: 'Missing clientOperationId' };
      if (!ensurePoint(data.point)) return { valid: false, error: 'Invalid start point' };
      if (!validateColor(data.color)) return { valid: false, error: 'Invalid color' };
      if (!validateTool(data.tool)) return { valid: false, error: 'Invalid tool' };
      if (!validateWidth(data.width)) return { valid: false, error: 'Invalid stroke width' };
      return { valid: true };
    case MESSAGE_TYPES.DRAW_MOVE:
      if (!data.clientOperationId) return { valid: false, error: 'Missing clientOperationId' };
      if (!validatePointsArray(data.points)) return { valid: false, error: 'Invalid points batch' };
      return { valid: true };
    case MESSAGE_TYPES.DRAW_END:
      if (!data.clientOperationId) return { valid: false, error: 'Missing clientOperationId' };
      if (!validatePointsArray(data.path)) return { valid: false, error: 'Invalid path' };
      if (!validateColor(data.color)) return { valid: false, error: 'Invalid color' };
      if (!validateTool(data.tool)) return { valid: false, error: 'Invalid tool' };
      if (!validateWidth(data.width)) return { valid: false, error: 'Invalid stroke width' };
      return { valid: true };
    case MESSAGE_TYPES.CLEAR:
      return { valid: true };
    default:
      return { valid: false, error: 'Unsupported message type' };
  }
};

export const createClearOperation = ({ userId, sequenceNumber }) => ({
  id: generateId(),
  userId,
  timestamp: Date.now(),
  sequenceNumber,
  type: 'clear',
  data: {},
});
