# Inko Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Data Flow Diagram](#data-flow-diagram)
3. [WebSocket Protocol](#websocket-protocol)
4. [Undo/Redo Strategy](#undoredo-strategy)
5. [Performance Decisions](#performance-decisions)
6. [Conflict Resolution](#conflict-resolution)
7. [Technical Design Decisions](#technical-design-decisions)

---

## System Overview

Inko is a real-time collaborative drawing application built with vanilla JavaScript on the client and Node.js with native WebSockets on the server. The architecture prioritizes low-latency synchronization, operational consistency, and efficient canvas rendering.

### Core Components

**Client Side:**
- `canvas.js`: Canvas rendering engine with multi-layer strategy (main, temp, remote)
- `state.js`: Client-side state management with operation history and pointer tracking
- `websocket.js`: WebSocket client with automatic reconnection and message routing
- `ui.js`: UI controls and event handling
- `main.js`: Application initialization and dependency injection

**Server Side:**
- `server.js`: WebSocket server with message handlers and broadcast logic
- `Room.js`: Room state container with operation log and pointer management
- `operations.js`: Operation validation and construction utilities
- `utils.js`: Shared utilities (ID generation, validation)
- `constants.js`: Shared constants and message type definitions

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT (Browser)                            │
│                                                                   │
│  ┌─────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  canvas.js  │◄──►│   state.js   │◄──►│ websocket.js │       │
│  │  (Render)   │    │ (Operations) │    │  (Transport) │       │
│  └─────────────┘    └──────────────┘    └──────┬───────┘       │
│        │                   │                     │               │
│        │                   │                     │               │
└────────┼───────────────────┼─────────────────────┼───────────────┘
         │                   │                     │
         │                   │                     │ WebSocket
         │                   │                     │ (JSON Messages)
         │                   │                     │
         │                   │                     ▼
┌────────┼───────────────────┼─────────────────────────────────────┐
│        │                   │         SERVER                       │
│        │                   │                                      │
│  ┌─────▼────────┐    ┌────▼─────┐    ┌──────────────┐           │
│  │ Validation   │───►│ Room.js  │◄──►│  Broadcast   │           │
│  │ (operations) │    │ (State)  │    │  (All Peers) │           │
│  └──────────────┘    └──────────┘    └──────────────┘           │
│                           │                                       │
│                           │ Operations History                   │
│                           │ Pointer Management                   │
│                           │ User Registry                        │
└───────────────────────────────────────────────────────────────────┘
         │                                            │
         │                                            │
         ▼                                            ▼
┌─────────────────┐                          ┌─────────────────┐
│  Client A       │                          │  Client B       │
│  (Remote User)  │                          │  (Remote User)  │
└─────────────────┘                          └─────────────────┘
```

### Drawing Event Flow

```
1. User draws on canvas
   │
   ├─► DRAW_START (point, color, width, tool, clientOperationId)
   │   ├─► Draw on local temp canvas (instant feedback)
   │   ├─► Send to server via WebSocket
   │   └─► Server broadcasts to all other clients
   │
   ├─► DRAW_MOVE (points[], clientOperationId) [batched every 80ms]
   │   ├─► Draw on local temp canvas (smooth preview)
   │   ├─► Send batched points to server
   │   └─► Server broadcasts to all other clients
   │
   └─► DRAW_END (path[], color, width, tool, clientOperationId)
       ├─► Simplify path (reduce point count)
       ├─► Draw final stroke on main canvas
       ├─► Clear temp canvas
       ├─► Send to server
       └─► Server:
           ├─► Creates operation with sequenceNumber
           ├─► Appends to operations array
           ├─► Broadcasts operation to all clients
           └─► Clients add to local operation history
```

---

## WebSocket Protocol

### Message Types

All messages follow this structure:
```json
{
  "type": "MESSAGE_TYPE",
  "data": { /* type-specific payload */ }
}
```

### Client → Server Messages

#### 1. DRAW_START
```json
{
  "type": "DRAW_START",
  "data": {
    "point": { "x": 123.45, "y": 67.89 },
    "color": "#FF5733",
    "width": 3,
    "tool": "brush",
    "clientOperationId": "uuid-v4"
  }
}
```
**Purpose**: Initiates a new drawing stroke  
**Validation**: Color (hex format), width (1-20), tool (brush/eraser), valid coordinates  
**Server Response**: Broadcasts to all other clients (excluding sender)

#### 2. DRAW_MOVE
```json
{
  "type": "DRAW_MOVE",
  "data": {
    "clientOperationId": "uuid-v4",
    "points": [
      { "x": 124.0, "y": 68.0 },
      { "x": 125.5, "y": 69.2 }
    ]
  }
}
```
**Purpose**: Streams drawing points during active stroke  
**Batching**: Client batches points every 80ms before sending  
**Server Response**: Broadcasts to all other clients

#### 3. DRAW_END
```json
{
  "type": "DRAW_END",
  "data": {
    "clientOperationId": "uuid-v4",
    "path": [
      { "x": 123.45, "y": 67.89 },
      { "x": 124.0, "y": 68.0 }
    ],
    "color": "#FF5733",
    "width": 3,
    "tool": "brush"
  }
}
```
**Purpose**: Completes stroke and commits to operation history  
**Server Response**: Creates operation with sequenceNumber, broadcasts to all clients

#### 4. CURSOR_MOVE
```json
{
  "type": "CURSOR_MOVE",
  "data": {
    "cursor": { "x": 200, "y": 150 }
  }
}
```
**Purpose**: Shares cursor position for remote cursor indicators  
**Throttling**: Client throttles to 100ms intervals  
**Server Response**: Broadcasts to all other clients with userId

#### 5. UNDO / REDO
```json
{
  "type": "UNDO",
  "data": {}
}
```
**Purpose**: Global undo/redo operations  
**Server Response**: Updates pointer, broadcasts new pointer to all clients

#### 6. CLEAR
```json
{
  "type": "CLEAR",
  "data": {}
}
```
**Purpose**: Clears entire canvas for all users  
**Server Response**: Creates clear operation, broadcasts to all

#### 7. STATE_SYNC
```json
{
  "type": "STATE_SYNC",
  "data": {}
}
```
**Purpose**: Request full state synchronization (on connect/reconnect)  
**Server Response**: Sends complete state snapshot

#### 8. NAME_CHANGE
```json
{
  "type": "NAME_CHANGE",
  "data": {
    "name": "Alice"
  }
}
```
**Purpose**: Updates user's display name  
**Validation**: Max 20 characters, trimmed  
**Server Response**: Broadcasts name change to all other clients

### Server → Client Messages

#### 1. STATE_SYNC Response
```json
{
  "type": "STATE_SYNC",
  "data": {
    "localUser": {
      "id": "user-123",
      "color": "#FF5733",
      "name": "User 1",
      "connectedAt": 1700000000000
    },
    "operations": [
      {
        "id": "op-1",
        "userId": "user-456",
        "timestamp": 1700000001000,
        "sequenceNumber": 0,
        "type": "draw",
        "data": {
          "path": [...],
          "color": "#3498DB",
          "width": 5,
          "tool": "brush"
        }
      }
    ],
    "pointer": 0,
    "users": [
      { "id": "user-123", "color": "#FF5733", "name": "User 1" }
    ]
  }
}
```
**Purpose**: Full state synchronization on connection

#### 2. USER_JOINED / USER_LEFT
```json
{
  "type": "USER_JOINED",
  "data": {
    "user": {
      "id": "user-789",
      "color": "#2ECC71",
      "name": "User 3",
      "connectedAt": 1700000002000
    }
  }
}
```
**Purpose**: Notify clients of user presence changes

#### 3. Broadcast DRAW_END (with operation)
```json
{
  "type": "DRAW_END",
  "data": {
    "userId": "user-456",
    "stroke": {
      "clientOperationId": "uuid",
      "color": "#3498DB",
      "width": 5,
      "tool": "brush"
    },
    "operation": {
      "id": "op-2",
      "userId": "user-456",
      "timestamp": 1700000003000,
      "sequenceNumber": 1,
      "type": "draw",
      "data": {...}
    }
  }
}
```
**Purpose**: Commits operation to all clients' history

#### 4. ERROR
```json
{
  "type": "ERROR",
  "data": {
    "message": "Invalid stroke width"
  }
}
```
**Purpose**: Communicates validation or processing errors

---

## Undo/Redo Strategy

### Core Principle: Global Operation History with Pointer

The undo/redo system maintains a **single source of truth** on the server with a pointer-based navigation system that all clients synchronize with.

### Architecture

```
Server State:
┌─────────────────────────────────────────────────┐
│ operations: [op0, op1, op2, op3, op4]           │
│                          ↑                       │
│                       pointer: 2                 │
│                                                  │
│ Visible operations: [op0, op1, op2]             │
│ Undone operations: [op3, op4]                   │
└─────────────────────────────────────────────────┘
```

### Operation Structure

```javascript
{
  id: "unique-id",           // UUID
  userId: "user-123",        // Creator
  timestamp: 1700000000000,  // Creation time
  sequenceNumber: 5,         // Global order
  type: "draw" | "erase" | "clear",
  data: {
    path: [{ x, y }, ...],   // For draw/erase
    color: "#FF5733",
    width: 5,
    tool: "brush"
  }
}
```

### Undo Flow

```
1. User clicks Undo
   │
   ├─► Client sends UNDO message
   │
   └─► Server:
       ├─► Decrements pointer: pointer = pointer - 1
       ├─► Validates: pointer = max(-1, min(pointer, operations.length - 1))
       ├─► Broadcasts new pointer to ALL clients
       │
       └─► All Clients:
           ├─► Update local pointer
           ├─► Trigger canvas rebuild
           └─► Render only operations[0...pointer]
```

### Redo Flow

```
1. User clicks Redo
   │
   ├─► Client sends REDO message
   │
   └─► Server:
       ├─► Increments pointer: pointer = pointer + 1
       ├─► Validates bounds
       ├─► Broadcasts new pointer to ALL clients
       │
       └─► All Clients:
           ├─► Update local pointer
           ├─► Trigger canvas rebuild
           └─► Render operations[0...pointer]
```

### Critical: Truncation on New Operation

When a new operation arrives while the pointer is not at the end:

```
Before: operations = [op0, op1, op2, op3], pointer = 1
User draws new operation (op4)

Server:
1. Detects pointer < operations.length - 1
2. Truncates: operations = [op0, op1]
3. Appends: operations = [op0, op1, op4]
4. Sets pointer = 2

Result: op2 and op3 are permanently discarded
```

**Implementation:**
```javascript
// server/Room.js
appendOperation(operation) {
  if (this.pointer < this.operations.length - 1) {
    this.truncateFutureOperations();
  }
  this.operations.push(operation);
  this.pointer = this.operations.length - 1;
}
```

### Client-Side State Management

```javascript
// client/js/state.js
state = {
  operations: [],        // Local mirror of server operations
  pointer: -1,           // Current position in history
  checkpoints: new Map() // Canvas snapshots for performance
}

// When pointer changes:
setPointer(value) {
  state.pointer = value;
  emit('pointerChanged', value);  // Triggers canvas rebuild
}
```

### Performance Optimization: Checkpoints

To avoid redrawing thousands of operations on every undo/redo:

```javascript
// Save canvas snapshot every 20 operations
if ((sequenceNumber + 1) % 20 === 0) {
  const imageData = ctx.getImageData(...);
  saveCheckpoint(sequenceNumber, imageData);
}

// On rebuild:
1. Find nearest checkpoint before pointer
2. Restore checkpoint image
3. Replay only operations from checkpoint to pointer
```

**Example:**
```
Operations: [0...199], pointer = 195
Checkpoints: [19, 39, 59, 79, 99, 119, 139, 159, 179, 199]

Rebuild:
1. Load checkpoint at operation 179
2. Replay operations [180...195]
3. Total: 1 image restore + 16 draws (vs 196 draws)
```

---

## Performance Decisions

### 1. Multi-Layer Canvas Architecture

**Decision**: Use three separate canvases instead of one
```
- mainCanvas: Committed operations (from history)
- tempCanvas: Current local drawing (optimistic UI)
- remoteCanvas: Remote users' in-progress strokes
```

**Rationale**:
- Separates concerns: history vs. real-time vs. local feedback
- Enables clearing temp/remote without touching committed state
- Allows different composite operations per layer
- Improves performance by reducing full redraws

**Trade-offs**:
- Additional memory overhead (~3x canvas data)
- Worth it: Much better performance for active drawing

### 2. Point Batching Strategy

**Decision**: Batch DRAW_MOVE points every 80ms
```javascript
// Instead of sending every mousemove event:
// 60 FPS = ~16ms/frame → ~375 messages/second ❌

// Batch every 80ms:
batchIntervalId = setInterval(() => {
  sendDrawMove({ points: batchedPoints });
  batchedPoints = [];
}, 80);
// ~12.5 messages/second ✅
```

**Rationale**:
- Reduces WebSocket message count by ~97%
- Network bandwidth savings
- Server processing reduction
- Still smooth (80ms is imperceptible)

### 3. Path Simplification

**Decision**: Simplify paths using distance-based algorithm
```javascript
simplifyPath(path, tolerance = 1.8) {
  // Removes points closer than 1.8px to previous point
  // Typical 100-point path → 30-40 points
}
```

**Rationale**:
- Reduces operation payload size by ~60-70%
- Faster rendering (fewer line segments)
- Smaller operation history in memory
- Visually identical at normal zoom

### 4. Cursor Position Throttling

**Decision**: Throttle cursor updates to 100ms
```javascript
const CURSOR_THROTTLE_INTERVAL = 100;

if (now - lastCursorSentAt >= 100) {
  sendCursorMove(point);
  lastCursorSentAt = now;
}
```

**Rationale**:
- Cursor position less critical than stroke data
- Reduces message traffic by ~84%
- 10 updates/second still feels real-time

### 5. Checkpoint-Based Rendering

**Decision**: Save canvas snapshots every 20 operations
```javascript
const CHECKPOINT_INTERVAL = 20;

if ((sequenceNumber + 1) % 20 === 0) {
  saveCheckpoint(sequenceNumber, imageData);
}
```

**Rationale**:
- Undo/redo on 1000-operation canvas: 1000 draws → ~50 draws
- Massive performance improvement for large canvases
- Memory trade-off: ~2-5MB per checkpoint (acceptable)

### 6. Operation History Limits

**Decision**: Cap operations at 5000, trim oldest
```javascript
const MAX_OPERATIONS = 5000;

trimHistoryIfNeeded() {
  if (this.operations.length > MAX_OPERATIONS) {
    const overflow = this.operations.length - MAX_OPERATIONS;
    this.operations.splice(0, overflow);
    this.pointer -= overflow;
  }
}
```

**Rationale**:
- Prevents unbounded memory growth
- 5000 operations ≈ 30-60 minutes of active drawing
- Keeps server memory predictable

### 7. Optimistic UI Updates

**Decision**: Draw locally before server confirmation
```javascript
// On DRAW_START:
1. Draw to local tempCanvas immediately
2. Send to server
3. Don't wait for confirmation
```

**Rationale**:
- Zero-latency local feedback
- Better UX (feels instant)
- Server broadcast handles sync

### 8. Device Pixel Ratio Scaling

**Decision**: Scale canvas by devicePixelRatio
```javascript
canvas.width = containerWidth * devicePixelRatio;
canvas.height = containerHeight * devicePixelRatio;
ctx.scale(devicePixelRatio, devicePixelRatio);
```

**Rationale**:
- Sharp rendering on HiDPI displays (Retina, 4K)
- Prevents blurry strokes
- Standard practice for canvas applications

---

## Conflict Resolution

### Problem Statement

In a real-time collaborative environment, conflicts arise when:
1. Multiple users draw simultaneously
2. Users undo/redo operations created by others
3. Network latency causes out-of-order operation arrival
4. User disconnects/reconnects mid-drawing

### Strategy: Server-Authoritative Sequential Consistency

**Core Principle**: The server maintains the canonical operation sequence and all clients eventually converge to this state.

### 1. Simultaneous Drawing

**Scenario**: User A and User B draw overlapping strokes simultaneously

```
User A                  Server                  User B
  │                       │                       │
  ├─ DRAW_START ─────────►│                       │
  │                       ├─ Assign seq=0         │
  │                       ├─────────────────────► │ (broadcast)
  │                       │◄─── DRAW_START ─────┤
  │                       ├─ Assign seq=1         │
  │◄──────────────────────┤                       │ (broadcast)
```

**Resolution**:
- Each operation gets unique `sequenceNumber` from server
- Both strokes exist in history: `[seq=0 (User A), seq=1 (User B)]`
- Render order determined by sequence, not arrival time
- Visual result: Strokes layer based on sequence order
- **No conflict**: Both operations are valid and preserved

### 2. Cross-User Undo/Redo

**Scenario**: User A undoes User B's operation

```
History: [op0 (User B), op1 (User A), op2 (User B)]
Pointer: 2

User A clicks Undo:
  ├─ Server: pointer = 1
  ├─ All clients rebuild canvas with [op0, op1]
  └─ op2 (User B's stroke) disappears for EVERYONE
```

**Resolution Philosophy**: **Global undo affects all users**

**Rationale**:
- **Consistency**: All users see identical canvas at all times
- **Simplicity**: No per-user undo stacks
- **Predictability**: Clear behavior
- **Collaboration**: Undo is a collaborative action

### 3. Out-of-Order Message Arrival

**Scenario**: Network delays cause operations to arrive out of sequence

**Resolution**: Sequence-based rendering
- Operations stored in arrival order
- Rendering uses `sequenceNumber` for ordering
- Out-of-order causes temporary visual inconsistency
- Resolved on next rebuild

### 4. Mid-Stroke Disconnection

**Scenario**: User disconnects while drawing

**Server Handling**:
```javascript
ws.on('close', () => {
  room.removeUser(user.id);
  // activeStrokes cleaned up automatically
});
```

**Client Handling**:
- Remote users: Orphaned stroke stays on remoteCanvas
- Not committed to history (DRAW_END never received)
- Cleared on next page load or manual clear

**Design Decision**: **Don't auto-complete interrupted strokes**

### 5. State Sync on Reconnection

**Scenario**: User refreshes page or reconnects

```
1. Client connects
   ├─ Server assigns new userId
   ├─ Client sends STATE_SYNC request
   └─ Server responds with full state

2. Client rebuilds canvas
   ├─ Clears all local state
   ├─ Replays operations[0...pointer]
   └─ Renders remote cursors
```

**Conflict Resolution**: **Server state is always truth**

---

## Technical Design Decisions

### 1. Why Vanilla JavaScript?

**Decision**: No frontend frameworks (React, Vue, Svelte)

**Reasoning**:
- Direct control over Canvas operations
- No virtual DOM overhead
- Simpler architecture
- Smaller bundle size
- Demonstrates understanding of core web APIs

### 2. Why Native WebSockets over Socket.io?

**Decision**: Use native `ws` library on server, native `WebSocket` on client

**Reasoning**:
- Lightweight (no Socket.io client bundle ~200KB)
- Full control over message format
- Manual reconnection logic
- Understanding of raw WebSocket protocol

### 3. State Management Pattern

**Decision**: Event-based reactive system with centralized state

```javascript
const state = { /* ... */ };
const listeners = new Map();

export const onState = (event, callback) => {
  listeners.get(event).add(callback);
};

const emit = (event, data) => {
  listeners.get(event).forEach(fn => fn(data));
};
```

**Reasoning**:
- Decoupling of components
- Automatic UI updates on state changes
- Testability
- Simple custom implementation

### 4. Operation vs. Message Distinction

**Messages** (not stored):
- DRAW_START, DRAW_MOVE, CURSOR_MOVE
- Real-time streaming, discarded after processing

**Operations** (stored in history):
- DRAW_END, CLEAR
- Have sequenceNumber, persisted, affect undo/redo

**Reasoning**:
- Efficiency: Don't store every point
- Only complete strokes matter for replay
- Only complete operations can be undone

### 5. Three-Canvas Rendering Architecture

**Responsibilities**:
```
mainCanvas: Committed operations from history
tempCanvas: Local user's current in-progress stroke
remoteCanvas: All remote users' in-progress strokes
```

**Reasoning**:
- Performance: Only redraw affected layer
- Isolation: Clear temp without affecting history
- Different composite operations per layer

### 6. Error Handling Strategy

**Client**:
- WebSocket errors: Auto-reconnect with exponential backoff
- Rendering errors: Try-catch, log and continue
- Minimal validation (trust server)

**Server**:
- Strict validation on all operations
- Send ERROR message type to client
- Invalid messages logged, connection stays open

**Philosophy**: **Fail gracefully, maintain availability**

### 7. Coordinate System

**Decision**: Store absolute CSS pixel coordinates

```javascript
point: { x: 123.45, y: 67.89 }  // CSS pixels
```

**Reasoning**:
- Simplicity: Direct mapping to canvas
- No transformation on every render
- Consistency regardless of device pixel ratio

---

## Conclusion

This architecture prioritizes:
1. **Real-time consistency**: All users see identical state
2. **Performance**: Optimized rendering and network usage
3. **Simplicity**: Clear data flow, minimal abstractions
4. **Reliability**: Graceful error handling, automatic recovery

The design choices balance functionality, performance, and maintainability for a real-time collaborative drawing application suitable for small to medium-sized teams (2-20 concurrent users).
