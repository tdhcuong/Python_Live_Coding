# Phase 4: Host Controls - Context

**Gathered:** 2026-04-02 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

The host can set a problem description and start a countdown timer, both visible to all
participants including those who join late. Additionally, the host can reset the editor to a
starting template (updating the shared editor for all participants), and the Run button + output
panel (deferred from Phase 3 backend-only work) are added to the frontend.

Delivers requirements: HOST-01, HOST-02, HOST-03, HOST-04.
Also completes the Phase 3 frontend gap: EXEC-01, EXEC-02, EXEC-03, EXEC-04, UI-03.

</domain>

<decisions>
## Implementation Decisions

### Host Token Validation
- **D-01:** Validate `host_token` inline in the WebSocket relay loop — same `elif msg_type == ...` switch as existing handlers. Each host-action message carries `host_token` as a field: `{type: "set_problem", host_token: "...", problem: "..."}`. The frontend stores the token in sessionStorage (or a module-level variable) after receiving it from `POST /create-room`.
- **D-02:** If `host_token` is present but wrong, reply with a personal `{type: "error", message: "Unauthorized"}`. No disconnect — just reject the action silently from the other participants' perspective.
- **D-03:** Per-message token (not join-time auth). Join-time would require `is_host: bool` on `Participant` and `room_state` broadcast changes — per-message avoids touching those paths.

### Problem Description
- **D-04:** Backend adds `problem: str | None = None` to the `Room` dataclass (as pre-annotated in `models.py` line 37). Host sends `set_problem`; server validates token, updates `room.problem`, broadcasts `{type: "problem_update", problem: "..."}` to all participants.
- **D-05:** Problem description is plain text (no Markdown rendering in Phase 4 — keep it simple). Displayed in a collapsible panel above the editor.
- **D-06:** Late joiners receive `problem` in the `room_state` message (extend the existing `room_state` payload at `main.py` line 128-134). No separate flush message needed.

### Countdown Timer
- **D-07:** Backend adds `timer: dict | None = None` to the `Room` dataclass (as pre-annotated). Host sends `{type: "start_timer", host_token: "...", duration: <seconds>}`. Server records `{started_at: <ISO timestamp>, duration: <seconds>}` in `room.timer`, broadcasts `{type: "timer_start", started_at: "...", duration: <seconds>}` to all participants. Each client counts down independently from `started_at + duration`.
- **D-08:** Timer state (started_at + duration) included in `room_state` for late joiners. If `timer` is set, late joiner computes remaining time as `(started_at + duration) - now` and starts counting from there.
- **D-09:** Duration input on the frontend: preset options (5, 10, 15, 20, 30 minutes) via a dropdown or button group — no free-text entry. Reduces host friction and prevents nonsense values.
- **D-10:** Visual + audio alert at zero: CSS-animated flash/pulse on the timer display + a short Web Audio API beep (no sound file dependency). Timer display turns red/amber as it counts down (e.g., red when ≤ 60 seconds).
- **D-11:** No "stop timer" in Phase 4 — host can only start. Once at zero, timer stays at "00:00".

### Editor Reset
- **D-12:** Option A (client-side) — Server validates token, clears `room.yjs_updates` (so late joiners start fresh), broadcasts `{type: "reset_editor", content: "# Write your solution here\n"}` to ALL participants (including host). Each client on receiving `reset_editor` applies: `ydoc.transact(() => { ytext.delete(0, ytext.length); ytext.insert(0, content) })` and suppresses the outgoing `yjs_update` for this specific transaction (use a boolean flag). Avoids adding `pycrdt` as a Python dependency.
- **D-13:** The researcher should verify: can a Y.js `ydoc.transact()` call safely suppress outgoing provider updates using the RoomProvider's existing update listener? If the suppression approach is problematic, Option B (pycrdt binary) should be considered — flag this for the planner.

### Run Button + Output Panel (Phase 3 Frontend Deferred)
- **D-14:** Full-width output panel below the editor — the editor area becomes a vertical flex stack: editor on top (flex-1), output panel below (fixed ~35% height). Matches Phase 3 context decision D-07.
- **D-15:** Slim toolbar strip between editor and output: Run button (indigo) on the left, Clear button on the right. `execution_start` disables Run and shows "Running..." on ALL clients simultaneously. `execution_result` re-enables Run.
- **D-16:** Add `execution_start` and `execution_result` cases to the `createRoomWS` switch in `ws.js`. Add callbacks `onExecutionStart` and `onExecutionResult` to the handlers object.
- **D-17:** Output presentation: combined stdout+stderr in one panel. stderr lines rendered in `text-red-400`, timeout message in `text-yellow-400`, stdout in `text-gray-200`. Monospace font, auto-scroll to bottom on new output. `textContent` (never `innerHTML`) for all output text.
- **D-18:** `main.style.height = '100%'` (currently set in `room.js` line 129) must become `flex-grow` so the editor + output panel correctly share the available height.

### Host Controls UI
- **D-19:** Host-only controls (set problem textarea, start timer dropdown + button, reset editor button) are shown ONLY when the frontend knows the user is the host (i.e., `host_token` is present in local state). Non-host participants see the problem panel and timer display but no editing controls.
- **D-20:** Problem panel is collapsible — a chevron/toggle lets participants hide it to reclaim editor space. Collapsed by default if no problem is set; expanded automatically when host sets a problem.

### Claude's Discretion
- Exact timer display format (suggest `MM:SS` or `HH:MM:SS` depending on duration)
- Exact color progression as timer winds down (e.g., amber at ≤ 5 min, red at ≤ 1 min)
- Web Audio API beep tone and duration
- Problem panel collapsed/expanded state management
- Exact `pycrdt` flag logic in RoomProvider if needed (research outcome)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` HOST-01 through HOST-04 — all four host control requirements
- `.planning/REQUIREMENTS.md` EXEC-01 through EXEC-04, UI-03 — Phase 3 frontend requirements now being built

### Architecture constraints
- `CLAUDE.md` §"What NOT to Use" — full-document replacement (`editor.setValue`) is explicitly prohibited; Y.js transactions must be used for editor reset
- `CLAUDE.md` §"Backend / Sync backup for late joiners" — `room.yjs_updates` accumulator must be cleared on reset so late joiners don't get pre-reset state
- `CLAUDE.md` §"Frontend / Code Editor: CodeMirror 6 with Y.js CRDT" — editor manipulation must go through Y.js

### Existing integration points
- `backend/app/models.py` — `Room` dataclass; add `problem: str | None = None` and `timer: dict | None = None` (pre-annotated at line 37)
- `backend/app/main.py` — WS relay loop (lines 148-197); add `set_problem`, `start_timer`, `reset_editor` handlers with host_token checks; extend `room_state` payload (lines 128-134) with `problem` and `timer`
- `frontend/src/ws.js` — `createRoomWS()` switch (lines 34-56); add `execution_start`, `execution_result`, `problem_update`, `timer_start`, `reset_editor` cases
- `frontend/src/pages/room.js` — `renderRoomView()` HTML template; `connectToRoom()` WS handlers; add output panel, toolbar, problem panel, timer display, host controls
- `frontend/src/editor/provider.js` — `RoomProvider`; update listener sends `yjs_update` on doc changes; must support suppression flag for editor reset (D-12/D-13)

### Phase 3 backend artifacts (already built)
- `backend/app/executor.py` — sandboxed Python executor; `run_python_async()` is the entry point
- `backend/tests/test_execution_ws.py` — integration tests for execution protocol

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `manager.broadcast_to_room(room_id, msg)` — already used for all broadcasts; reuse for `problem_update`, `timer_start`, `reset_editor`, `execution_start`, `execution_result`
- `manager.send_personal(websocket, msg)` — reuse for `Unauthorized` error and existing `Execution already in progress` error
- `showToast(container, message)` in `room.js` — reuse for "Editor reset" confirmation toast
- `PARTICIPANT_COLORS` and existing color assignment logic — no changes needed for Phase 4
- Run button styling: use indigo (`bg-indigo-600 hover:bg-indigo-500`) matching existing Join button pattern

### Established Patterns
- All WS messages: JSON `{type: "...", ...}` — no binary frames, no exceptions for Phase 4
- `textContent` (never `innerHTML`) for all user-supplied content — applies to problem text and code output
- Tailwind dark palette: `bg-gray-900`, `bg-gray-800`, `border-gray-800`, `text-gray-100`
- `preexec_fn` resource limits are macOS-compatible as verified in Phase 3 (RLIMIT_CPU + RLIMIT_NPROC, no RLIMIT_AS)
- `asyncio.to_thread()` for blocking executor call — pattern established in `main.py` line 181

### Integration Points
- **`room_state` extension:** `main.py` lines 128-134 must include `"problem": room.problem` and `"timer": room.timer` in the existing dict. Backward-compatible (None values are safe).
- **`renderRoomView()` layout change:** Current outer structure is `flex flex-col min-h-screen` → header → `flex flex-1 overflow-hidden` (sidebar + main). Phase 4 inserts a problem panel between header and the sidebar/editor row (conditionally), and an output panel+toolbar row after the editor row within the main content area.
- **Editor `<main>` height fix:** `onRoomState` sets `mainEl.style.height = '100%'` (line 129). With the output panel added as a sibling below, the editor's `<main>` must use `flex-1` (flex-grow) instead of a fixed 100% height so the vertical stack shares space correctly.
- **Host token storage:** `POST /create-room` returns `host_token` in `home.js`. Must pass it to `connectToRoom()` and store in a closure variable for use in host-action messages.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — user confirmed default assumptions. Open to standard approaches within the decisions above.

</specifics>

<deferred>
## Deferred Ideas

- Stop/pause timer — Host can only start in Phase 4. Stop/restart is a future enhancement.
- Markdown rendering for problem description — Plain text only in Phase 4.
- Host-defined custom reset template (beyond the fixed starter comment) — Phase 5 or backlog.
- `pycrdt` server-side Y.js binary for editor reset (Option B) — deferred pending researcher verification of Y.js transaction suppression (Option A). Researcher should flag if Option A is not viable.

</deferred>

---

*Phase: 04-host-controls*
*Context gathered: 2026-04-02*
