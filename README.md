# Inko – Real-Time Collaborative Drawing
<img width="1920" height="937" alt="image" src="https://github.com/user-attachments/assets/27592805-0f62-489e-ba7c-9c764f883cf0" />

A lightweight vanilla-JS canvas client and Node.js WebSocket server for multi-user sketching with live cursor sharing, undo/redo, and remote stroke previews.

## Prerequisites

- Node.js 18+
- Modern browser (Chrome/Edge/Firefox) for the client UI

## Installation

```bash
npm install
```

## Running the app

1. Start the server (serves the static client and WebSocket endpoint):

   ```bash
   npm start
   ```

2. Open <http://localhost:3000> in multiple browser tabs to simulate different users.

## Testing with multiple users

1. Run `npm start` in one terminal and leave it open.
2. Launch two separate browser windows (or devices) that both navigate to <http://localhost:3000>.
3. Draw simultaneously in each window—you should see remote strokes appear in real time, plus live cursor indicators.
4. Use the toolbar buttons (Undo, Redo, Clear) in either window and verify that the other window mirrors the change instantly.
5. Optional: run `npm test` to execute the automated harness, which repeats a subset of these checks headlessly.

## Test harness

A minimal integration harness (`tests/harness.js`) boots the server, opens two WebSocket clients, exercises draw/clear flows, and asserts that operations are broadcast to every participant.

Run it with:
```bash
npm test
```

Expected output includes:

- Both clients synchronizing initial state
- Logs confirming draw events replicated across users
- Confirmation that clear operations propagate to everyone

## Project layout

```text
client/             # HTML/CSS/JS for the canvas UI
server/             # Express + ws server, room/state logic
tests/harness.js    # Automated WebSocket integration harness
```

## Troubleshooting

- **Port conflicts**: Set `PORT=4000 npm start` (and update `window.WS_URL`) if 3000 is busy.
- **Harness timeouts**: Ensure no other server instance is running and that firewall rules permit localhost WebSockets.

## Known limitations / future work

- In-memory state only—restarting the server wipes the canvas history.
- No authentication or room selection; every user shares a single collaborative space.
- The canvas isn’t touch-optimized yet, so mobile drawing is limited.
- Performance has been validated for a handful of users; large crowds would need load testing and persistence.

