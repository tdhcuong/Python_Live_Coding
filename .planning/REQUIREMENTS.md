# Requirements: Python Live Coding

**Defined:** 2026-04-01
**Core Value:** Multiple people can join a session, edit the same code together in real time, run Python, and see the output — all in a polished, professional UI.

## v1 Requirements

### Room Management

- [x] **ROOM-01**: Host can create a new room and receive a unique shareable URL
- [x] **ROOM-02**: Participant can join a room by visiting the room URL
- [x] **ROOM-03**: Participant sets a display name/nickname when joining
- [x] **ROOM-04**: All participants can see a live list of who is currently in the room
- [ ] **ROOM-05**: Host can copy the room link with a single click

### Editor

- [x] **EDIT-01**: All participants share one code editor — edits sync in real time for everyone (Y.js CRDT)
- [x] **EDIT-02**: Editor displays Python syntax highlighting
- [x] **EDIT-03**: Each participant's cursor is shown in a distinct color (multi-cursor presence)
- [x] **EDIT-04**: Editor displays line numbers in the gutter

### Code Execution

- [x] **EXEC-01**: Any participant can trigger code execution via a Run button
- [x] **EXEC-02**: Code output (stdout/stderr) is broadcast to all participants simultaneously
- [x] **EXEC-03**: Execution is automatically killed after a timeout (prevents infinite loops)
- [ ] **EXEC-04**: Any participant can clear the output panel

### Host Controls

- [x] **HOST-01**: Host can set a problem description that is visible to all participants
- [x] **HOST-02**: Host can start a countdown timer with a chosen duration, visible to all
- [ ] **HOST-03**: A visual/audio alert fires when the countdown reaches zero
- [x] **HOST-04**: Host can reset the editor content back to a starting template

### UI & Polish

- [ ] **UI-01**: Interface defaults to a dark theme
- [ ] **UI-02**: Layout is responsive and usable at different screen sizes
- [x] **UI-03**: A "Running..." loading state is shown while code is executing
- [ ] **UI-04**: UI is elegant, beautiful, and professional in design

### Tunneling

- [ ] **TUNA-01**: App can be exposed to the internet using localtunnel (`lt`)
- [ ] **TUNA-02**: App can be exposed to the internet using ngrok
- [ ] **TUNA-03**: WebSocket connections work correctly through both tunnel providers

## v2 Requirements

### Collaboration Enhancements

- **COLLAB-01**: Session playback — replay coding session from start
- **COLLAB-02**: Chat panel alongside the editor
- **COLLAB-03**: Voting / reactions from participants

### Authentication

- **AUTH-01**: Password-protected rooms (host sets a PIN)
- **AUTH-02**: Persistent user accounts

### Execution Enhancements

- **EXEC-EXT-01**: Support for third-party packages (numpy, pandas, etc.)
- **EXEC-EXT-02**: Multiple test case runner
- **EXEC-EXT-03**: Diff view showing expected vs actual output

## Out of Scope

| Feature | Reason |
|---------|--------|
| User accounts / authentication | Anonymous link-based access is sufficient; accounts add signup friction |
| Persistent session storage | Sessions are ephemeral by design |
| Multi-file editing | Single-file Python problems are the use case |
| Video/audio chat | Scope creep; participants use their own communication tools |
| Mobile-first layout | Desktop/laptop primary device for coding |
| In-browser Python (Pyodide) | Real Python runtime required; server-side execution only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ROOM-01 | Phase 1 | Complete |
| ROOM-02 | Phase 1 | Complete |
| ROOM-03 | Phase 1 | Complete |
| ROOM-04 | Phase 1 | Complete |
| ROOM-05 | Phase 5 | Pending |
| EDIT-01 | Phase 2 | Complete |
| EDIT-02 | Phase 2 | Complete |
| EDIT-03 | Phase 2 | Complete |
| EDIT-04 | Phase 2 | Complete |
| EXEC-01 | Phase 3 | Complete |
| EXEC-02 | Phase 3 | Complete |
| EXEC-03 | Phase 3 | Complete |
| EXEC-04 | Phase 3 | Pending |
| HOST-01 | Phase 4 | Complete |
| HOST-02 | Phase 4 | Complete |
| HOST-03 | Phase 4 | Pending |
| HOST-04 | Phase 4 | Complete |
| UI-01 | Phase 5 | Pending |
| UI-02 | Phase 5 | Pending |
| UI-03 | Phase 3 | Complete |
| UI-04 | Phase 5 | Pending |
| TUNA-01 | Phase 5 | Pending |
| TUNA-02 | Phase 5 | Pending |
| TUNA-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-02 — EDIT-01 marked complete after Phase 2 verification*
