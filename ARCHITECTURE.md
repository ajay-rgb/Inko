# Architecture

## System overview

```text
┌────────────────────────────┐        WebSocket        ┌──────────────────────┐
│  Browser client (ESM)      │ <====================> │  Node.js server      │
│                            │                        │  Express + ws        │
│  - UI (`client/index.html`)│        static files    │  - Room state        │
│  - Canvas layer stack      │ <---------------------> │  - Operation log     │
│  - WebSocket manager       │        (GET /)         │  - Broadcast loop    │
└────────────────────────────┘                        └──────────────────────┘
```

The client bootstraps via `client/js/main.js`, wires the canvas engine (`canvas.js`), UI (`ui.js`), and WebSocket transport (`websocket.js`). The server (`server/server.js`) serves the static assets and hosts a single in-memory `Room` instance that validates, logs, and rebroadcasts every drawing operation.

## Data flow

1. **Input capture** – Pointer events from the active canvas are sampled and thinned (`canvas.js`). Local rendering happens immediately on a temporary layer for responsiveness.
2. **Client messaging** – Start/move/end events are serialized with tool metadata and streamed via the WebSocket manager. MOVE events are batched every 80 ms to reduce chatter.
3. **Server validation** – `Room` and `operations.js` ensure payloads include coordinates, tool, and widths in range. The server stamps sequence numbers and stores operations in an append-only log plus pointer position.
4. **Broadcast** – DRAW_START/MOVE events are fanned out to all peers (except the sender for START/MOVE to avoid duplicates), providing live remote previews. DRAW_END/CLEAR/UNDO/REDO responses include the committed operation and pointer pointer updates so every client can rebuild.
5. **Client reconciliation** – When a committed operation arrives, the canvas engine either applies it incrementally (when sequenceNumber == lastRenderedPointer + 1) or triggers a checkpoint-based rebuild.

## WebSocket protocol

| Type | Direction | Payload highlights |
|------|-----------|--------------------|
| `STATE_SYNC` | server → client | Full snapshot: operations array, pointer index, all users, local user metadata. Sent on connect/reconnect. |
| `DRAW_START` | bidirectional | `{point, clientOperationId, color, width, tool}`. Broadcast immediately for live previews. |
| `DRAW_MOVE` | bidirectional | `{points[], clientOperationId}` batched segments to continue the preview stroke. |
| `DRAW_END` | bidirectional | `{path[], strokeMeta, operation}`. Server appends to history and returns the authoritative operation to everyone. |
| `CLEAR` | bidirectional | Clears shared history. Server appends a special `clear` operation and instructs every client to reset canvases. |
| `CURSOR_MOVE` | bidirectional | `{cursor:{x,y}}` throttled updates for remote cursors. |
| `UNDO` / `REDO` | bidirectional | No body required from client. Server moves the shared pointer and returns `{pointer}` to all. |
| `USER_JOINED` / `USER_LEFT` | server → client | Announces user metadata so the UI can refresh the member list and cursor colors. |
| `ERROR` | server → client | Describes validation/format issues for debugging. |

## Undo/redo strategy

- The server stores every committed operation in order and tracks a shared pointer (`pointer`).
- Undo decrements the pointer (but never deletes history). Redo increments it as long as more operations exist.
- Clients rebuild canvases by replaying operations from the nearest stored checkpoint (every 20 ops) through the current pointer. Clear operations reset checkpoints and canvases.
- Because the pointer is global, undoing any user’s operation affects everyone; the UI surfaces this through instant redraw.

## Performance decisions

- **Batched DRAW_MOVE**: reduces per-point traffic during fast strokes without sacrificing fidelity.
- **DevicePixel-aware resize & checkpoints**: canvases scale to DPR for crisp lines while checkpoints avoid replaying the entire log on every undo.
- **Remote overlay canvas**: in-progress strokes from other users render on a dedicated layer, so main history draws stay untouched until the operation is committed.
- **Optimistic local rendering**: the active user sees strokes immediately on the temp canvas before confirmation for low latency.
- **In-memory color/cursor maps**: lightweight data structures keep updates O(1) per user.

## Conflict resolution

- The server is authoritative: timestamps/sequence numbers are assigned centrally, so later operations naturally overdraw earlier ones in the same region without extra coordination.
- If two users draw simultaneously, order is determined by arrival on the server event loop; both strokes remain in history, preserving intent.
- Local optimistic updates are reconciled when the confirmed operation arrives. If ordering gaps occur, the client triggers a rebuild to realign with server truth.
- State resync (`STATE_SYNC`) can be requested at any time (and is automatic on connect) to recover from drops or suspected divergence.
