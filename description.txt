# Real-Time Collaborative Drawing Canvas

## 📋 Assignment Overview

Build a multi-user drawing application where multiple people can draw simultaneously on the same canvas with real-time synchronization.

## 🎯 Core Requirements

### **Frontend Features**

- **Drawing Tools**: Brush, eraser, different colors, stroke width adjustment
- **Real-time Sync**: See other users' drawings as they draw (not after they finish)
- **User Indicators**: Show where other users are currently drawing (cursor positions)
- **Conflict Resolution**: Handle when multiple users draw in overlapping areas
- **Undo/Redo**: Works globally across all users (tricky part!)
- **User Management**: Show who's online, assign colors to users

### **Technical Stack**

- **Frontend**: Vanilla JavaScript/TypeScript + HTML5 Canvas
- **Backend**: Node.js + WebSockets (Socket.io or native WebSockets)
- **No frontend frameworks** (React/Vue) - we want to see raw DOM/Canvas skills
- **No drawing libraries** - implement canvas operations yourself

## 🔧 Technical Challenges (What We're Really Testing)

### **1. Canvas Mastery**

javascript

`*// We expect to see efficient canvas operations like:*
- Path optimization for smooth drawing
- Layer management for undo/redo
- Efficient redrawing strategies
- Handle high-frequency mouse events`

### **2. Real-time Architecture**

javascript

`*// Event streaming strategy:*
- How do you serialize drawing data?
- Batching vs. individual stroke events
- Handling network latency
- Client-side prediction`

### **3. State Synchronization**

javascript

`*// The hard part - global undo/redo:*
- How do you maintain operation history across users?
- Conflict resolution when User A undoes User B's action
- Maintaining canvas state consistency
```

## 📁 Submission Structure (example for node js + html + css

### **Required Files**
```
collaborative-canvas/
├── client/
│   ├── index.html
│   ├── style.css
│   ├── canvas.js/ts          # Canvas drawing logic
│   ├── websocket.js/ts       # WebSocket client
│   └── main.js/ts           # App initialization
├── server/
│   ├── server.js/ts         # Express + WebSocket server
│   ├── rooms.js/ts          # Room management
│   └── drawing-state.js/ts  # Canvas state management
├── package.json
├── README.md
└── ARCHITECTURE.md          # Required!`

### **Documentation Requirements**

### **README.md Must Include:**

- Setup instructions (should work with `npm install && npm start`)
- How to test with multiple users
- Known limitations/bugs
- Time spent on the project

### **ARCHITECTURE.md Must Include:**

- **Data Flow Diagram**: How drawing events flow from user to canvas
- **WebSocket Protocol**: What messages you send/receive
- **Undo/Redo Strategy**: How you handle global operations
- **Performance Decisions**: Why you chose specific optimizations
- **Conflict Resolution**: How you handle simultaneous drawing

## 🎯 Evaluation Criteria (Weighted)

### **Technical Implementation (40%)**

- Canvas operations efficiency
- WebSocket implementation quality
- Code organization and TypeScript usage
- Error handling and edge cases

### **Real-time Features (30%)**

- Smoothness of real-time drawing
- Accuracy of synchronization
- Handling of network issues
- User experience during high activity

### **Advanced Features (20%)**

- Global undo/redo implementation
- Conflict resolution strategy
- Performance under load (multiple users)
- Creative problem-solving approaches

### **Code Quality (10%)**

- Clean, readable code
- Proper separation of concerns
- Documentation and comments
- Git history (meaningful commits)

## 🚫 What We DON'T Want to See

- **Copy-paste from tutorials** - we'll know
- **AI-generated boilerplate** - explain every line you write
- **Over-engineered solutions** - focus on core functionality first
- **Framework dependencies** - this tests vanilla skills
- **No error handling** - real apps break, handle it gracefully

## ⏰ Timeline & Submission

### **Time Limit**: 3-5 days

### **Submission Method**:

- GitHub repository (public or private with access)
- Include a deployed demo link (Heroku, Vercel, etc.)
- Email with repo link + demo link

### **Demo Requirements**:

- Should work immediately without setup
- Include test instructions for multiple users
- Works on modern browsers (Chrome, Firefox, Safari)

## 🎪 Bonus Points (Optional)

- **Mobile touch support** for drawing
- **Room system** (multiple isolated canvases)
- **Drawing persistence** (save/load sessions)
- **Performance metrics** (FPS counter, latency display)
- **Creative features** (shapes, text, images)

## 🔍 Live Interview Expectations

If your submission passes initial review, be prepared to:

1. **Demo your solution** (5 minutes)
2. **Code walkthrough** - explain key architectural decisions
3. **Live debugging** - we'll introduce a bug, you fix it
4. **Feature extension** - add a new tool (rectangle drawing)
5. **Scaling discussion** - "How would you handle 1000 concurrent users?"

## ❓ FAQ

**Q: Can I use Socket.io?**
A: Yes, but be prepared to explain why over native WebSockets.

**Q: What about user authentication?**
A: Not required - focus on the drawing functionality.

**Q: Should I handle canvas persistence?**
A: Nice to have, but real-time sync is the priority.

**Q: Can I use any Canvas libraries?**
A: No - we want to see your raw Canvas API skills.

---

**Final Note**: This assignment is designed to be challenging. We're not expecting perfection, but we want to see how you approach complex problems, structure your code, and handle real-world technical challenges. Focus on getting the core functionality working well rather than adding many features poorly.