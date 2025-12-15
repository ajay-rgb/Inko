import crypto from 'crypto';
import { MAX_COORDINATE, MIN_COORDINATE } from './constants.js';

export const generateId = () => crypto.randomUUID();

export const validateCoordinate = (value) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return false;
  return value >= MIN_COORDINATE && value <= MAX_COORDINATE;
};

export const validateColor = (color) => /^#([0-9a-f]{3}){1,2}$/i.test(color);

export const now = () => Date.now();

export const deepClone = (value) => JSON.parse(JSON.stringify(value));

export const createResponse = (type, data = {}) => JSON.stringify({ type, data });

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
