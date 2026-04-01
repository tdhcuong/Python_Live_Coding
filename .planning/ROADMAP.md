# Roadmap: Python Live Coding

## Overview

Build in strict dependency order: WebSocket room infrastructure first, then the Y.js collaborative editor that rides on top of it, then the Python execution sandbox (which must be secured before any public URL is shared), then host controls (problem panel and timer), and finally polish and tunnel configuration. Each phase delivers a coherent, independently testable capability. Nothing is left half-built between phases.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Room Infrastructure** - WebSocket rooms, participant presence, and real-time join/leave events
- [ ] **Phase 2: Collaborative Editor** - Y.js CRDT sync, CodeMirror 6, multi-cursor presence, syntax highlighting
- [ ] **Phase 3: Code Execution** - Sandboxed Python subprocess, output broadcast to all participants, execution UX
- [ ] **Phase 4: Host Controls** - Problem description panel, countdown timer, host token gating, editor reset
- [ ] **Phase 5: Polish and Tunneling** - Dark theme, responsive layout, copy link, localtunnel + ngrok setup

## Phase Details

### Phase 1: Room Infrastructure
**Goal**: Participants can create and join rooms, see who else is present, and the server correctly scopes all events to the right room
**Depends on**: Nothing (first phase)
**Requirements**: ROOM-01, ROOM-02, ROOM-03, ROOM-04
**Success Criteria** (what must be TRUE):
  1. A host visits the app and receives a unique shareable room URL they can send to others
  2. A participant visits a room URL, enters a display name, and lands in the room
  3. Every participant in a room sees a live list of all current members that updates when someone joins or leaves
  4. Two browser tabs in different rooms receive zero cross-room events
**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md — Project scaffold: FastAPI backend + Vite/Tailwind v4 frontend
- [ ] 01-02-PLAN.md — Backend room server: HTTP endpoints + WebSocket + in-memory room state
- [ ] 01-03-PLAN.md — Frontend room UI: home page, name entry, live participant list

### Phase 2: Collaborative Editor
**Goal**: All participants share one code editor with real-time CRDT sync, visible multi-cursors, and Python syntax highlighting
**Depends on**: Phase 1
**Requirements**: EDIT-01, EDIT-02, EDIT-03, EDIT-04
**Success Criteria** (what must be TRUE):
  1. Edits made in one browser tab appear in all other tabs within the same room with no character drops or cursor jumps
  2. Each participant's cursor is visible in a distinct color with their name label in the shared editor
  3. A participant who joins after edits have been made sees the full current document state, not an empty editor
  4. Python keywords, strings, and syntax are visibly highlighted in the editor
  5. Line numbers are visible in the editor gutter
**Plans**: TBD
**UI hint**: yes

### Phase 3: Code Execution
**Goal**: Any participant can run the shared Python code and all participants simultaneously see the stdout/stderr output, with sandbox resource limits in place before any public URL is shared
**Depends on**: Phase 2
**Requirements**: EXEC-01, EXEC-02, EXEC-03, EXEC-04, UI-03
**Success Criteria** (what must be TRUE):
  1. Any participant clicks Run and the Python code in the shared editor executes and returns output
  2. stdout and stderr from execution appear in all participants' output panels simultaneously
  3. An infinite loop or fork bomb is automatically killed within the timeout window and does not freeze other rooms
  4. A "Running..." loading state with a disabled Run button is shown to all participants during execution
  5. Any participant can clear the output panel
**Plans**: TBD

### Phase 4: Host Controls
**Goal**: The host can set a problem description and start a countdown timer, both visible to all participants including those who join late
**Depends on**: Phase 3
**Requirements**: HOST-01, HOST-02, HOST-03, HOST-04
**Success Criteria** (what must be TRUE):
  1. The host can write a problem description that immediately appears for all participants in a dedicated panel
  2. The host can start a countdown timer; all participants see the same remaining time regardless of when they joined
  3. A visual and audio alert fires when the countdown reaches zero
  4. The host can reset the editor to a starting template, which updates the shared editor for all participants
**Plans**: TBD
**UI hint**: yes

### Phase 5: Polish and Tunneling
**Goal**: The app looks polished and professional, is accessible over the internet via localtunnel and ngrok, and all WebSocket connections work correctly through both tunnel providers
**Depends on**: Phase 4
**Requirements**: ROOM-05, UI-01, UI-02, UI-04, TUNA-01, TUNA-02, TUNA-03
**Success Criteria** (what must be TRUE):
  1. The app defaults to a dark theme and the layout is usable at common screen sizes without horizontal scrolling
  2. A host can copy the room link to the clipboard with a single button click
  3. The app is reachable at a public URL via localtunnel (`lt`) and the collaborative editor and code execution work correctly through the tunnel
  4. The app is reachable at a public URL via ngrok and WebSocket connections remain stable without falling back to polling
  5. The overall UI is elegant and professional — consistent typography, spacing, and color usage
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Room Infrastructure | 1/3 | In Progress|  |
| 2. Collaborative Editor | 0/TBD | Not started | - |
| 3. Code Execution | 0/TBD | Not started | - |
| 4. Host Controls | 0/TBD | Not started | - |
| 5. Polish and Tunneling | 0/TBD | Not started | - |
