# Phase 3: Code Execution - Context

**Gathered:** 2026-04-02 (defaults — user skipped discussion)
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a Run button to the room view. Any participant can click it to execute the shared Python
code. The backend runs the code in a sandboxed subprocess with resource limits, then broadcasts
stdout/stderr to all participants simultaneously. A "Running..." state is shown to all
participants while execution is in progress. Any participant can clear the output panel.

No code execution in Phase 2 — Run button and output panel are introduced here.

Delivers requirements: EXEC-01, EXEC-02, EXEC-03, EXEC-04, UI-03.

</domain>

<decisions>
## Implementation Decisions

### Execution protocol
- **D-01:** WebSocket-only flow — no HTTP endpoint for execution. Client sends `run_code` message; server broadcasts `execution_start` to all participants (disables Run button everywhere), executes code, then broadcasts `execution_result` with stdout/stderr/exit_code. Keeps the protocol uniform with the existing WS-only design.
- **D-02:** Frontend sends `ytext.toString()` as the `code` payload in `run_code` — no backend Y.js reconstruction needed. The frontend already has the live document value via the Y.js text binding.

### Sandbox implementation
- **D-03:** `asyncio.to_thread()` wraps a blocking `subprocess.run()` call — offloads to thread pool, keeps FastAPI event loop free. Code is written to a tempfile in `/tmp` (not passed via `-c`), consistent with CLAUDE.md guidance.
- **D-04:** Resource limits via `resource` module in `preexec_fn`: `RLIMIT_CPU` (e.g. 5 seconds wall-clock), `RLIMIT_AS` (memory cap, behavior varies on macOS — note the STATE.md blocker). Hard timeout via `subprocess.run(timeout=10)` as backstop.
- **D-05:** stdout capped at 50 KB, stderr capped at 10 KB before broadcast (prevents memory bombs and WS payload limits) — per CLAUDE.md.
- **D-06:** Stripped `env` removes secrets/venv paths — pass a minimal `{"PATH": "/usr/bin:/bin"}`.

### Output panel layout
- **D-07:** Output panel sits **below the editor** — vertical split. The room layout becomes: header → (sidebar | editor-stack), where editor-stack is editor on top + output panel below with a fixed ~35% height. Clean horizontal divider between editor and output.
- **D-08:** Run button and a "Clear" button live in a slim **toolbar strip** between the editor and the output panel (part of the output panel header). Co-locating them with the output makes the cause-and-effect obvious.

### stdout/stderr presentation
- **D-09:** **Combined output** in a single panel — stdout in the normal text color (`text-gray-200`), stderr lines prefixed with `stderr:` and rendered in `text-red-400`. No tabs. Matches terminal behavior and keeps the output panel simple.
- **D-10:** Output panel is scrollable with a monospace font. New output appended at the bottom; panel auto-scrolls to bottom on new content.

### Execution state synchronization
- **D-11:** `execution_start` broadcast disables the Run button and shows "Running..." on ALL participants' screens simultaneously (not just the runner). `execution_result` re-enables the Run button for everyone. This is handled by the existing WS relay — `execution_start` is broadcast to all participants in the room.

### Timeout UX
- **D-12:** When code is killed by timeout, the server sends `execution_result` with a synthetic stderr line: `"Timed out — execution exceeded Xs"` rendered in `text-yellow-400`. Exit code is non-zero. No separate message type needed.

### Claude's Discretion
- Exact output panel height (suggest ~35% of the editor-stack)
- Exact Run button styling (suggest indigo, matching the Join button)
- Debounce / double-click protection on Run button
- Exact resource limit values (CPU seconds, memory bytes) tuned for macOS dev environment

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture constraints
- `CLAUDE.md` §"Backend / Python Execution Sandbox" — subprocess pattern, asyncio.to_thread, tempfile, output caps, stripped env
- `CLAUDE.md` §"What NOT to Use" — exec() in-process and shell=True subprocess are explicitly prohibited
- `CLAUDE.md` §"Backend / Framework: FastAPI" — async-native; blocking calls must be offloaded

### Requirements
- `.planning/REQUIREMENTS.md` EXEC-01 through EXEC-04 — all four execution requirements
- `.planning/REQUIREMENTS.md` UI-03 — "Running..." loading state shown during execution

### Existing integration points
- `backend/app/main.py` — WebSocket relay loop; Phase 3 adds `run_code` handler and broadcasts `execution_start` / `execution_result`
- `backend/app/models.py` — `Room` dataclass; Phase 3 may add `is_running: bool = False` guard to prevent concurrent runs
- `frontend/src/pages/room.js` — `renderRoomView()` and `connectToRoom()`; Phase 3 adds toolbar + output panel to the layout and handles `execution_start` / `execution_result` WS messages
- `frontend/src/ws.js` — existing WS client; Phase 3 adds `run_code` send helper and `onExecutionStart` / `onExecutionResult` callbacks

### State/blocker flags
- `.planning/STATE.md` §Blockers — "RLIMIT_AS behavior differs on macOS vs Linux — verify which resource limits take effect in the dev environment"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/ws.js` `createRoomWS()` — returns `ws.send()` and `ws` object; Phase 3 extends the message switch with `execution_start` and `execution_result` cases, and adds a `sendRunCode(code)` helper.
- `frontend/src/pages/room.js` `showToast()` — reusable for "Code submitted" or error toasts.
- `backend/app/main.py` `manager.broadcast_to_room()` — already used for `yjs_update`/`awareness_update`; Phase 3 reuses for `execution_start` and `execution_result`.

### Established Patterns
- All WebSocket messages: JSON `{type: "...", ...}` — no binary frames.
- `textContent` (not `innerHTML`) for all user-supplied content — execution output is user-supplied; must use `textContent` or equivalent safe rendering when appending to the output panel.
- Tailwind dark palette: `bg-gray-900`, `bg-gray-800`, `border-gray-800`, `text-gray-100`.
- The `room.participants` map is the source of truth for broadcast scoping — no changes needed for execution.

### Integration Points
- **Frontend layout change:** `renderRoomView()` needs a new output panel section below the editor `<main>`. The editor-stack div wraps both.
- **Backend new handler:** In the `while True` relay loop in `main.py`, add `elif msg_type == "run_code":` branch that guards against concurrent execution, spawns `asyncio.to_thread(run_python, code)`, and broadcasts results.
- **Concurrent run guard:** `Room` model needs `is_running: bool = False`. The `run_code` handler sets it True, broadcasts `execution_start`, awaits result, then sets it False and broadcasts `execution_result`. If `is_running` is True when `run_code` arrives, reply with an error personal message ("Execution already in progress").

</code_context>

<specifics>
## Specific Ideas

No specific requirements — user skipped discussion, open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

None — no discussion, no deferred items.

</deferred>

---

*Phase: 03-code-execution*
*Context gathered: 2026-04-02*
