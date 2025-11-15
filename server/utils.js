import crypto from 'crypto';
import { MAX_COORDINATE, MIN_COORDINATE } from './constants.js';

/**
 * Generate unique ID
 * @returns {string} UUID
 */
export const generateId = () => crypto.randomUUID();

/**
 * Validate coordinate is a number within bounds
 * @param {*} value - Value to validate
 * @returns {boolean} True if valid coordinate
 */
export const validateCoordinate = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return false;
  return value >= MIN_COORDINATE && value <= MAX_COORDINATE;
};

/**
 * Validate hex color format
 * @param {string} color - Color string to validate
 * @returns {boolean} True if valid hex color
 */
export const validateColor = (color) => /^#([0-9a-f]{3}){1,2}$/i.test(color);

/**
 * Get current timestamp
 * @returns {number} Timestamp in milliseconds
 */
export const now = () => Date.now();

/**
 * Deep clone object via JSON serialization
 * @param {*} value - Value to clone
 * @returns {*} Deep cloned value
 */
export const deepClone = (value) => JSON.parse(JSON.stringify(value));

/**
 * Create WebSocket response message
 * @param {string} type - Message type
 * @param {Object} [data={}] - Message data
 * @returns {string} JSON stringified message
 */
export const createResponse = (type, data = {}) => JSON.stringify({ type, data });

/**
 * Build operation object
 * @param {Object} options - Operation options
 * @param {string} [options.id] - Operation ID (auto-generated if not provided)
 * @param {string} options.userId - User ID who created operation
 * @param {number} options.sequenceNumber - Sequence number in history
 * @param {string} [options.type='draw'] - Operation type
 * @param {Object} options.data - Operation data
 * @param {string} [options.clientOperationId] - Client-side operation ID
 * @returns {Object} Built operation
 */
export const buildOperation = ({
  id = generateId(),
  userId,
  sequenceNumber,
  type = 'draw',
  data,
  clientOperationId,
}) => ({
  id,
  userId,
  timestamp: now(),
  sequenceNumber,
  type,
  data,
  clientOperationId,
});
