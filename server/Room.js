import { MAX_OPERATIONS } from './constants.js';
import { buildOperation } from './utils.js';

/**
 * Room class managing collaborative drawing session
 */
export class Room {
  /**
   * Create a new room
   * @param {Object} [options] - Room options
   * @param {string} [options.id='default-room'] - Room identifier
   */
  constructor({ id = 'default-room' } = {}) {
    this.id = id;
    this.operations = [];
    this.pointer = -1;
    this.users = new Map();
    this.createdAt = Date.now();
    this.sequenceCounter = 0;
  }

  /**
   * Get next sequence number
   * @returns {number} Sequence number
   */
  getNextSequence() {
    this.sequenceCounter += 1;
    return this.sequenceCounter - 1;
  }

  /**
   * Add user to room
   * @param {Object} user - User object
   * @param {string} user.id - User ID
   * @param {string} user.name - User name
   * @param {string} user.color - User color
   * @returns {Object[]} Updated users array
   */
  addUser(user) {
    this.users.set(user.id, user);
    return this.getUsers();
  }

  /**
   * Remove user from room
   * @param {string} userId - User ID to remove
   * @returns {Object[]} Updated users array
   */
  removeUser(userId) {
    this.users.delete(userId);
    return this.getUsers();
  }

  /**
   * Get all users in room
   * @returns {Object[]} Array of user objects
   */
  getUsers() {
    return Array.from(this.users.values());
  }

  /**
   * Trim history if exceeds MAX_OPERATIONS
   * @returns {void}
   */
  trimHistoryIfNeeded() {
    if (this.operations.length <= MAX_OPERATIONS) return;
    const overflow = this.operations.length - MAX_OPERATIONS;
    this.operations.splice(0, overflow);
    this.pointer = Math.max(-1, this.pointer - overflow);
  }

  /**
   * Remove all operations after pointer
   * @returns {void}
   */
  truncateFutureOperations() {
    const cutoff = this.pointer + 1;
    if (cutoff <= 0 && this.pointer < 0) {
      if (this.operations.length) {
        this.operations = [];
      }
      return;
    }
    if (cutoff >= this.operations.length) return;
    this.operations.splice(cutoff);
  }

  /**
   * Append operation to history
   * @param {Object} operation - Operation to append
   * @returns {void}
   */
  appendOperation(operation) {
    if (this.pointer < this.operations.length - 1) {
      this.truncateFutureOperations();
    }
    this.operations.push(operation);
    this.pointer = this.operations.length - 1;
    this.trimHistoryIfNeeded();
  }

  /**
   * Build operation with sequence number
   * @param {Object} payload - Operation payload
   * @returns {Object} Built operation
   */
  buildOperation(payload) {
    return buildOperation({
      ...payload,
      sequenceNumber: this.getNextSequence(),
    });
  }

  /**
   * Set pointer to specific index
   * @param {number} value - Target pointer value
   * @returns {number} Clamped pointer value
   */
  setPointer(value) {
    this.pointer = Math.max(-1, Math.min(value, this.operations.length - 1));
    return this.pointer;
  }

  /**
   * Undo last operation
   * @returns {number} New pointer value
   */
  undo() {
    return this.setPointer(this.pointer - 1);
  }

  /**
   * Redo next operation
   * @returns {number} New pointer value
   */
  redo() {
    return this.setPointer(this.pointer + 1);
  }

  /**
   * Get current room state snapshot
   * @returns {Object} State snapshot
   * @returns {Object[]} returns.operations - Operations up to pointer
   * @returns {number} returns.pointer - Current pointer
   * @returns {Object[]} returns.users - All users in room
   */
  getStateSnapshot() {
    return {
      operations: this.pointer < 0 ? [] : this.operations.slice(0, this.pointer + 1),
      pointer: this.pointer,
      users: this.getUsers(),
    };
  }
}
