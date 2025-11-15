import { MESSAGE_TYPES } from './constants.js';
import { generateId, validateColor, validateCoordinate } from './utils.js';

const TOOLS = new Set(['brush', 'eraser']);

/**
 * Validate a single point
 * @param {Object} point - Point to validate
 * @returns {boolean} True if point is valid
 */
const ensurePoint = (point) => {
  if (!point) return false;
  return validateCoordinate(point.x) && validateCoordinate(point.y);
};

/**
 * Validate array of points
 * @param {Object[]} [points=[]] - Points array
 * @returns {boolean} True if all points are valid
 */
const validatePointsArray = (points = []) => Array.isArray(points) && points.length > 0 && points.every(ensurePoint);

/**
 * Validate stroke width
 * @param {number} width - Stroke width
 * @returns {boolean} True if width is valid
 */
const validateWidth = (width) => typeof width === 'number' && width >= 1 && width <= 20;

/**
 * Validate tool type
 * @param {string} tool - Tool type
 * @returns {boolean} True if tool is valid
 */
const validateTool = (tool) => TOOLS.has(tool);

/**
 * Validate operation payload
 * @param {string} type - Message type
 * @param {Object} [data={}] - Operation data
 * @returns {Object} Validation result
 * @returns {boolean} returns.valid - Whether payload is valid
 * @returns {string} [returns.error] - Error message if invalid
 */
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

/**
 * Create clear operation
 * @param {Object} options - Clear operation options
 * @param {string} options.userId - User ID who triggered clear
 * @param {number} options.sequenceNumber - Sequence number in history
 * @returns {Object} Clear operation
 */
export const createClearOperation = ({ userId, sequenceNumber }) => ({
  id: generateId(),
  userId,
  timestamp: Date.now(),
  sequenceNumber,
  type: 'clear',
  data: {},
});
