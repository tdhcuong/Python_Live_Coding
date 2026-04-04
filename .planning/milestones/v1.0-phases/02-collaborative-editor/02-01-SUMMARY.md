---
phase: 02-collaborative-editor
plan: 01
subsystem: api
tags: [websocket, yjs, crdt, python, fastapi, pytest]

# Dependency graph
requires:
  - phase: 01-room-infrastructure
    provides: Room model, RoomManager, WebSocket relay loop, participant management
provides:
  - Room.yjs_updates accumulator for server-side CRDT state
  - yjs_update relay with echo prevention (exclude_id)
  - awareness_update relay without accumulation
  - Late-joiner flush (accumulated Y.js updates sent before room_state)
  - pytest integration test suite for WebSocket relay
affects:
  - 02-02-frontend-editor (frontend can now connect and sync Y.js state)
  - Phase 3 (execution sandbox wires into same WebSocket protocol)

# Tech tracking
tech-stack:
  added: [pytest, pytest-asyncio, httpx, starlette TestClient]
  patterns:
    - Y.js updates accumulated as bytes list on Room model
    - base64 encode/decode for binary over JSON WebSocket messages
    - Late-joiner flush before room_state for consistent CRDT state
    - awareness_update relay-only (never accumulated) per Y.js protocol

key-files:
  created:
    - backend/pyproject.toml
    - backend/tests/__init__.py
    - backend/tests/conftest.py
    - backend/tests/test_yjs_relay.py
  modified:
    - backend/app/models.py
    - backend/app/main.py

key-decisions:
  - "Y.js updates stored as raw bytes in room.yjs_updates list — base64 decode on receipt, re-encode on late-joiner flush"
  - "awareness_update never accumulated — cursor/selection state is transient (Pitfall 4 from RESEARCH.md)"
  - "Late-joiner flush happens before room_state send — ensures CRDT state is applied before participant list UI renders"
  - "Starlette synchronous TestClient used for WebSocket tests — avoids async complexity while still testing real ASGI app"

patterns-established:
  - "Pattern: Y.js binary over JSON — base64 encode bytes for transport, decode on accumulation"
  - "Pattern: Late-joiner flush order — yjs_updates first, then room_state"
  - "Pattern: echo prevention via exclude_id on broadcast_to_room for all CRDT messages"
  - "Pattern: conftest.py room_id fixture creates real rooms via HTTP POST /create-room"

requirements-completed: [EDIT-01]

# Metrics
duration: 15min
completed: 2026-04-02
---

# Phase 02 Plan 01: Y.js Backend Relay Summary

**Y.js CRDT backend relay with base64-over-JSON transport, room-level update accumulator for late-joiner state sync, and 4 passing WebSocket integration tests**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-02T01:29:16Z
- **Completed:** 2026-04-02
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Room model gains `yjs_updates: list[bytes]` accumulator for per-room CRDT state
- WebSocket relay loop handles `yjs_update` (accumulate + broadcast excluding sender) and `awareness_update` (broadcast only, no accumulation)
- Late-joining clients receive all accumulated Y.js updates before `room_state` for consistent CRDT state
- pytest test infrastructure created with async fixtures and Starlette TestClient WebSocket support
- 4 integration tests pass: relay, echo prevention, late-joiner state flush, awareness non-accumulation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Y.js relay and accumulator to backend** - `5b569b2` (feat)
2. **Task 2: Create test infrastructure and Y.js relay integration tests** - `bf6b0b8` (test)

## Files Created/Modified

- `backend/app/models.py` - Added `yjs_updates: list[bytes]` field to Room dataclass
- `backend/app/main.py` - Added `import base64`, late-joiner flush loop, yjs_update/awareness_update relay branches
- `backend/pyproject.toml` - pytest config with asyncio_mode=auto
- `backend/tests/__init__.py` - Package init
- `backend/tests/conftest.py` - Shared fixtures: async HTTP client, room_id creator
- `backend/tests/test_yjs_relay.py` - 4 integration tests for EDIT-01

## Decisions Made

- Y.js updates stored as raw bytes list on Room — base64 decoded on receipt for storage, re-encoded on flush. This keeps the in-memory representation compact without requiring JSON-safe encoding at rest.
- awareness_update never accumulated: cursor/selection state is ephemeral per Y.js protocol. Accumulating it would send stale cursor positions to late joiners.
- Late-joiner flush order: yjs_updates before room_state ensures the CRDT doc is reconstructed before the participant UI renders.
- Starlette synchronous TestClient for WebSocket tests: avoids async fixture complexity while exercising the real ASGI app with full WebSocket lifecycle.

## Deviations from Plan

None - plan executed exactly as written. The `5b569b2` commit had already implemented Task 1 (backend code) but left test files untracked. Task 2 commit `bf6b0b8` staged and committed all 4 test infrastructure files.

## Issues Encountered

None — the test file implementation required updating `_join_room` to handle the late-joiner flush (draining yjs_update messages before room_state), which was a necessary correctness fix already present in the committed code.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend Y.js relay protocol is complete and tested
- Frontend can now connect, join a room, and send/receive yjs_update messages
- The relay protocol (base64 JSON, late-joiner flush, echo prevention) is validated by integration tests
- Ready for 02-02: CodeMirror + Y.js frontend editor integration

---
*Phase: 02-collaborative-editor*
*Completed: 2026-04-02*
