# Milestones

## v1.0 MVP (Shipped: 2026-04-04)

**Phases completed:** 5 phases, 10 plans, 25 tasks

**Key accomplishments:**

- FastAPI backend on :8000 with CORS + health check, and Vite + Tailwind CSS v4 dark-theme frontend shell on :5173 — both runnable dev services from a clean project root.
- FastAPI room server with in-memory RoomManager, room-scoped WebSocket broadcast, and HTTP endpoints for room creation and lookup
- Vite SPA with client-side router, home page (Create Room), room page with name entry and live participant list wired to WebSocket backend
- Y.js CRDT backend relay with base64-over-JSON transport, room-level update accumulator for late-joiner state sync, and 4 passing WebSocket integration tests
- CodeMirror 6 editor with Y.js CRDT sync, Python syntax highlighting, multi-cursor presence, and line numbers wired into the room view — EDIT-01 through EDIT-04 complete
- Sandboxed Python subprocess executor with RLIMIT_CPU+NPROC, asyncio.to_thread offloading, run_code WebSocket handler broadcasting execution_start/execution_result to all participants
- FastAPI WebSocket handlers for set_problem, start_timer, and reset_editor with host_token auth guards, timer whitelist, and late-joiner state reconstruction via extended room_state payload
- Complete frontend for Phase 4: execution UI with Run/output panel, host controls (problem panel, timer countdown, editor reset), layout restructure to h-screen flex column, and ws.js/home.js wiring connecting all to the 04-01 backend protocol
- Copy link button with clipboard fallback, flexible output panel height, gradient titles, participant count badge, and custom scrollbars across home, room, and error pages
- FastAPI serves built frontend via static files on port 8000 with dynamic IS_DEV URL detection, SPA routing fix, and cloudflared-ready start-tunnel.sh

---
