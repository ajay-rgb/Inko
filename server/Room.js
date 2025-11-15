import { MAX_OPERATIONS } from './constants.js';
import { buildOperation } from './utils.js';

export class Room {
  constructor({ id = 'default-room' } = {}) {
    this.id = id;
    this.operations = [];
    this.pointer = -1;
    this.users = new Map();
    this.createdAt = Date.now();
    this.sequenceCounter = 0;
  }

  getNextSequence() {
    this.sequenceCounter += 1;
    return this.sequenceCounter - 1;
  }

  addUser(user) {
    this.users.set(user.id, user);
    return this.getUsers();
  }

  removeUser(userId) {
    this.users.delete(userId);
    return this.getUsers();
  }

  getUsers() {
    return Array.from(this.users.values());
  }

  trimHistoryIfNeeded() {
    if (this.operations.length <= MAX_OPERATIONS) return;
    const overflow = this.operations.length - MAX_OPERATIONS;
    this.operations.splice(0, overflow);
    this.pointer = Math.max(-1, this.pointer - overflow);
  }

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

  appendOperation(operation) {
    if (this.pointer < this.operations.length - 1) {
      this.truncateFutureOperations();
    }
    this.operations.push(operation);
    this.pointer = this.operations.length - 1;
    this.trimHistoryIfNeeded();
  }

  buildOperation(payload) {
    return buildOperation({
      ...payload,
      sequenceNumber: this.getNextSequence(),
    });
  }

  setPointer(value) {
    this.pointer = Math.max(-1, Math.min(value, this.operations.length - 1));
    return this.pointer;
  }

  undo() {
    return this.setPointer(this.pointer - 1);
  }

  redo() {
    return this.setPointer(this.pointer + 1);
  }

  getStateSnapshot() {
    return {
      operations: this.pointer < 0 ? [] : this.operations.slice(0, this.pointer + 1),
      pointer: this.pointer,
      users: this.getUsers(),
    };
  }
}
