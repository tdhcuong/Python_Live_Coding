---
phase: 03-code-execution
plan: 01
subsystem: api
tags: [python, subprocess, executor, resource-limits, websocket, fastapi, asyncio]

# Dependency graph
requires:
  - phase: 02-collaborative-editor
    provides: RoomManager.broadcast_to_room, Room dataclass, WebSocket relay loop in main.py
provides:
  - Sandboxed Python subprocess executor (executor.py) with RLIMIT_CPU, RLIMIT_NPROC, stripped env, output caps
  - run_code WebSocket handler with execution_start/execution_result broadcast
  - Room.is_running concurrent execution guard
  - 8 executor unit tests + 5 WS integration tests
affects: [04-host-controls, 05-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "asyncio.to_thread wraps blocking subprocess.run to keep event loop free"
    - "tempfile.NamedTemporaryFile in /tmp for code delivery (not -c flag)"
    - "preexec_fn sets RLIMIT_CPU + RLIMIT_NPROC — RLIMIT_AS omitted (macOS incompatible)"
    - "room.is_running bool flag guards against concurrent execution in single-process server"
    - "execution_start broadcast BEFORE awaiting run_python_async (disables Run button on all clients)"
    - "try/finally around run_python_async ensures is_running reset on exceptions"

key-files:
  created:
    - backend/app/executor.py
    - backend/tests/test_executor.py
    - backend/tests/test_execution_ws.py
  modified:
    - backend/app/models.py
    - backend/app/main.py

key-decisions:
  - "RLIMIT_AS omitted from preexec_fn on macOS — virtual address space ~400GB makes any practical limit fail with EINVAL; rely on RLIMIT_CPU + TimeoutExpired instead"
  - "test_timeout_produces_timed_out accepts SIGXCPU (exit=-24) OR TimeoutExpired as valid kill — RLIMIT_CPU fires at 5s before 10s wall-clock timeout on macOS"
  - "run_python_async import at top of main.py (not inline) — executor always needed when module loads"

patterns-established:
  - "Executor pattern: pure-function run_python_sync -> wrapped by run_python_async via asyncio.to_thread"
  - "WS handler pattern: guard (is_running), broadcast start, await async task, broadcast result, reset guard in finally"

requirements-completed: [EXEC-01, EXEC-02, EXEC-03, UI-03]

# Metrics
duration: 3min
completed: 2026-04-02
---

# Phase 03 Plan 01: Code Execution Backend Summary

**Sandboxed Python subprocess executor with RLIMIT_CPU+NPROC, asyncio.to_thread offloading, run_code WebSocket handler broadcasting execution_start/execution_result to all participants**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-02T16:12:52Z
- **Completed:** 2026-04-02T16:15:52Z
- **Tasks:** 3 (all complete)
- **Files modified:** 5

## Accomplishments
- Created `executor.py` with `ExecutionResult` dataclass, `run_python_sync` (subprocess with RLIMIT_CPU, RLIMIT_NPROC, stripped env, 50KB/10KB output caps, tempfile, timeout), and `run_python_async` wrapper via `asyncio.to_thread`
- Added `is_running: bool = False` to `Room` dataclass and wired `run_code` WS handler in `main.py` with execution_start/execution_result broadcast and concurrent-run rejection
- Created 8 executor unit tests and 5 WS integration tests — all 17 tests in the full suite pass

## Task Commits

1. **Task 1: Create executor module with TDD** - `3a63738` (feat + test)
2. **Task 2: Add is_running guard and run_code handler** - `a56ff2c` (feat)
3. **Task 3: Integration tests for execution WS protocol** - `1cd4a6d` (test)

## Files Created/Modified
- `backend/app/executor.py` - Sandboxed Python subprocess executor with ExecutionResult, run_python_sync, run_python_async
- `backend/tests/test_executor.py` - 8 unit tests covering print, syntax error, stderr, timeout, output caps, stripped env, async wrapper
- `backend/tests/test_execution_ws.py` - 5 integration tests for run_code WS protocol (result, broadcast, ordering, concurrent rejection, kill detection)
- `backend/app/models.py` - Added `is_running: bool = False` to Room dataclass
- `backend/app/main.py` - Added `from .executor import run_python_async` import and `elif msg_type == "run_code":` handler

## Decisions Made
- RLIMIT_AS intentionally omitted from `preexec_fn` on macOS: the forked child process inherits ~400GB virtual address space from macOS framework mapping, causing any practical limit to fail with EINVAL in `preexec_fn`. On macOS, rely on RLIMIT_CPU (SIGXCPU at 5s) + `subprocess.run(timeout=10)` wall-clock backstop instead.
- The `test_timeout_produces_timed_out` test accepts either SIGXCPU (exit_code=-24, timed_out=False) or TimeoutExpired (timed_out=True) as valid kill outcomes. On macOS, RLIMIT_CPU fires at 5 CPU seconds before the 10s wall-clock timeout.
- Import `run_python_async` at the top of `main.py` (not inline in the handler) since the executor is always available when the module loads.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test spec expected only timed_out=True for infinite loop, but RLIMIT_CPU fires first on macOS**
- **Found during:** Task 3 (integration test test_timeout_produces_timed_out)
- **Issue:** Plan specified `assert result["timed_out"] is True` but on macOS, `while True: pass` is killed by RLIMIT_CPU (SIGXCPU, exit=-24) before the 10s wall-clock timeout. The test failed: `assert False is True`.
- **Fix:** Updated assertion to accept either `killed_by_cpu` (exit_code=-24, timed_out=False) or `killed_by_timeout` (timed_out=True). Both satisfy the EXEC-03 requirement that infinite loops are killed.
- **Files modified:** `backend/tests/test_execution_ws.py`
- **Verification:** Test passes, correctly detects SIGXCPU kill on macOS
- **Committed in:** `1cd4a6d` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug in test assertion)
**Impact on plan:** Required fix — test assertion was incorrect for macOS execution environment. Core behavior (infinite loop killed) is satisfied by either mechanism. No scope creep.

## Issues Encountered
- pytest-timeout plugin not installed — `--timeout=30` CLI flag rejected. Removed the flag from verification commands. The `asyncio_mode=auto` and existing test config are sufficient.

## Known Stubs
None — all functions fully implemented, no hardcoded empty values or placeholders.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Backend execution is complete and tested. The run_code WS protocol is live: any client can send `{"type": "run_code", "code": "..."}` and all participants receive `execution_start` then `execution_result`.
- Phase 03 Plan 02 (if planned) or Phase 04 can now wire the frontend Run button, output panel, and execution state handling to this backend protocol.
- No blockers. RLIMIT_AS limitation is documented in executor.py.

---
*Phase: 03-code-execution*
*Completed: 2026-04-02*
