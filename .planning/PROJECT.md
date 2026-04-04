# Python Live Coding

## What This Is

A real-time collaborative Python coding platform where a host creates a room, sets a problem, and multiple participants join to code together in a shared editor. Anyone can run the Python code and the output is visible to all participants simultaneously. The app runs as a single-port deployment (FastAPI serves built frontend) and is exposed to the internet via cloudflared tunnel.

## Core Value

Multiple people can join a session, edit the same code together in real time, run Python, and see the output — all in a polished, professional UI.

## Requirements

### Validated

- Host can create a room and get a shareable link — v1.0
- Host sets the Python problem (prompt/description) and starts a countdown timer — v1.0
- Multiple participants can join the room via link — v1.0
- All participants share one code editor — edits sync in real time for everyone — v1.0
- Any participant can run the Python code — v1.0
- Code execution output (stdout/stderr) is shown to all participants simultaneously — v1.0
- Countdown timer is visible to all participants (visual only — no hard cutoff) — v1.0
- UI is elegant, beautiful, and professional — v1.0
- Session is exposable to the internet via tunnel — v1.0 (cloudflared)

### Active

(No active requirements — plan next milestone via `/gsd:new-milestone`)

### Out of Scope

- Authentication/accounts — sessions are anonymous, link-based access
- Persistent storage of sessions — sessions are ephemeral by design
- Multiple problems per session — one problem per room
- Video/audio chat — text/code only
- Mobile-first layout — desktop/laptop primary device for coding
- In-browser Python (Pyodide) — real Python runtime required

## Context

- Shipped v1.0 with ~2,400 LOC (1,122 Python + 1,282 JS/CSS)
- Tech stack: FastAPI + Uvicorn + CodeMirror 6 + Y.js + Tailwind CSS v4 + Vite
- Single-port deployment: FastAPI serves built frontend on :8000
- Tunnel: cloudflared recommended over localtunnel for WebSocket reliability
- 5 phases, 10 plans, ~20 tasks delivered in 5 days

## Constraints

- **Tech stack**: Python backend (FastAPI) + JavaScript frontend (Vanilla JS + Tailwind CSS v4)
- **Runtime**: Local server exposed via cloudflared tunnel
- **Python execution**: Server-side subprocess sandbox with RLIMIT_CPU + RLIMIT_NPROC
- **Real-time**: WebSocket-based (Y.js CRDT for editor, broadcast for execution/timer)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| FastAPI over Flask | Async-native, no monkey-patching needed | Good — clean WebSocket handling |
| Y.js CRDT for editor sync | Zero server-side transform logic, first-party CodeMirror adapter | Good — no character drops or cursor jumps |
| CodeMirror 6 over Monaco | y-codemirror.next is first-party; Monaco lacks equivalent | Good — clean Vite integration |
| Vanilla JS + Tailwind over React | Three screens, no complex state tree; React adds impedance mismatch with CodeMirror | Good — minimal dependency surface |
| Tailwind CSS v4 | Zero-config Vite plugin, current stable | Good — no tailwind.config.js needed |
| subprocess sandbox (not Docker) | Lightweight isolation for trusted sessions | Good — RLIMIT_CPU + NPROC sufficient |
| cloudflared over localtunnel | More reliable WebSocket upgrade behavior | Good — stable through tunnel |
| IS_DEV sentinel (port 5173) | Runtime detection with zero build config | Good — clean dev/prod switching |
| Timer: server broadcasts started_at + duration | Client counts down independently, no clock sync needed | Good — works across tunnel latency |
| Host-gated UI via sessionStorage hostToken | No privilege broadcast, client-side gating | Good — tested, no token leakage |
| SPA catch-all via explicit FileResponse | Starlette StaticFiles(html=True) intercepts API routes | Good — full control over routing |
| host_token in join_room message | Backend identifies host on WebSocket disconnect | Good — clean session cleanup |

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
*Last updated: 2026-04-05 after v1.0 milestone*
