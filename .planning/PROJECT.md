# Python Live Coding

## What This Is

A real-time collaborative Python coding platform where a host creates a room, sets a problem, and multiple participants join to code together in a shared editor. Anyone can run the Python code and the output is visible to all participants simultaneously. The platform is designed to be elegant, beautiful, and professional — exposed to the internet via localtunnel.

## Core Value

Multiple people can join a session, edit the same code together in real time, run Python, and see the output — all in a polished, professional UI.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Host can create a room and get a shareable link
- [ ] Host sets the Python problem (prompt/description) and starts a countdown timer
- [ ] Multiple participants can join the room via link
- [ ] All participants share one code editor — edits sync in real time for everyone
- [ ] Any participant can run the Python code
- [ ] Code execution output (stdout/stderr) is shown to all participants simultaneously
- [ ] Countdown timer is visible to all participants (visual only — no hard cutoff)
- [ ] UI is elegant, beautiful, and professional
- [ ] Session is exposable to the internet via localtunnel

### Out of Scope

- Authentication/accounts — sessions are anonymous, link-based access
- Persistent storage of sessions — sessions are ephemeral
- Multiple problems per session — one problem per room
- Video/audio chat — text/code only

## Context

- Target use case: live coding challenges or practice sessions with friends/colleagues
- Localtunnel (`lt`) is used to expose the local server to the internet
- Python runs server-side (real Python execution, not in-browser)
- Real-time sync requires WebSocket-based collaboration (e.g., Socket.IO or similar)
- UI quality is explicitly important — this is meant to look polished and professional

## Constraints

- **Tech stack**: Python backend (Flask/FastAPI) + JavaScript frontend
- **Runtime**: Local server exposed via localtunnel
- **Python execution**: Server-side sandbox with stdout/stderr capture
- **Real-time**: WebSocket-based for editor sync and output broadcast

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Shared editor (not separate) | All participants collaborate on the same code | — Pending |
| Timer is visual only | No hard cutoff — just pressure/pacing | — Pending |
| Anyone can run code | No privilege distinction for execution | — Pending |
| Server-side Python execution | Real Python needed, not browser-based | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-01 after initialization*
