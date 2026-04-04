# Phase 2: Collaborative Editor - Context

**Gathered:** 2026-04-02 (defaults — user skipped discussion)
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a shared Python code editor to the existing room view. All participants see and edit the same
document in real time via Y.js CRDT. Remote participants' cursors are visible in their assigned
colors. Editor has Python syntax highlighting and line numbers. No code execution in this phase —
Run button is Phase 3.

Delivers requirements: EDIT-01, EDIT-02, EDIT-03, EDIT-04.

</domain>

<decisions>
## Implementation Decisions

### Y.js + CodeMirror setup
- **D-01:** Use Y.js + y-codemirror.next for CRDT sync. Before starting, verify `npm info y-codemirror.next` to confirm active maintenance. If unmaintained, fall back to `@codemirror/collab`.
- **D-02:** CodeMirror 6 as the editor. Import only what's needed: `@codemirror/lang-python` for syntax highlighting, `@codemirror/view` for line numbers via `lineNumbers()` extension.

### Initial editor content
- **D-03:** New rooms start with a minimal Python starter comment: `# Write your solution here\n`. Single line — enough to orient participants without being prescriptive.

### WebSocket protocol for Y.js
- **D-04:** Y.js binary updates are base64-encoded and sent as JSON over the existing WebSocket. Message types: `yjs_update` (doc sync) and `awareness_update` (cursor/presence). Keeps `ws.js` JSON-only — no refactor to binary frames needed.
- **D-05:** Backend stores accumulated Y.js binary updates per room. Late joiners receive the full update log on connect so they get the complete document state even if prior participants have disconnected. (Locked by CLAUDE.md architecture note.)

### Editor layout
- **D-06:** Editor fills the `<main>` area of the existing room layout (replaces the "Editor coming in Phase 2" placeholder). No toolbar for Phase 2 — Run button and output panel are Phase 3. Editor occupies full remaining height after the header.

### Remote cursor presence
- **D-07:** Remote cursors use y-codemirror.next's built-in awareness extensions. Each remote participant's cursor caret and text selection are shown in their assigned color. A small floating name label appears above the cursor. Participant colors come from the existing `room_state` message (already assigned in Phase 1).

### Claude's Discretion
- Exact CodeMirror theme (dark, matching existing gray-900/gray-800 palette)
- Y.js document key name (e.g., `"python-code"`)
- Debounce timing for awareness updates
- Exact CSS for editor container height/overflow

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture constraints
- `CLAUDE.md` §"Frontend / Code Editor: CodeMirror 6 with Y.js CRDT" — editor choice rationale and y-codemirror.next recommendation
- `CLAUDE.md` §"Backend / Sync backup for late joiners" — server must accumulate Y.js update log, not just relay
- `CLAUDE.md` §"What NOT to Use" — full-document replacement (editor.setValue) is explicitly prohibited (C5 pitfall)

### Requirements
- `.planning/REQUIREMENTS.md` EDIT-01 through EDIT-04 — all four editor requirements belong to this phase

### Existing integration points
- `frontend/src/pages/room.js` — `renderRoomView()` has the `<main>` placeholder; editor mounts here
- `frontend/src/ws.js` — existing JSON WebSocket client; Phase 2 adds `yjs_update` and `awareness_update` message types
- `backend/app/main.py` — WebSocket relay loop (line ~90); Phase 2 adds relay for `yjs_update` and `awareness_update`

### State/blocker flags
- `.planning/STATE.md` §Blockers — "verify y-codemirror.next maintenance status before starting Phase 2"

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/ws.js` — `createRoomWS()` returns a `ws.send(data)` function. Phase 2 adds two new message types through this same interface. The `switch` in `socket.addEventListener("message")` already has a `default` branch logging unknown types — extend the switch.
- `participants` map in `room.js` — already holds `{ id, name, color }` per participant. The `color` field drives both sidebar dots and remote CodeMirror cursors.

### Established Patterns
- All WebSocket messages are JSON objects with a `type` field (string) and payload fields.
- `textContent` (not `innerHTML`) for all user-supplied text — maintain this in any editor-adjacent UI.
- Tailwind CSS v4 (no config file). Dark palette: `bg-gray-900`, `bg-gray-800`, `border-gray-800`, `text-gray-100`.

### Integration Points
- **Frontend mount point:** `<main class="flex-1 ...">` in `renderRoomView()` — replace the centered placeholder `<p>` with the CodeMirror editor DOM node.
- **Backend relay:** `main.py` WS loop currently sends an error for unrecognized `msg_type`. Replace that with relay logic: broadcast `yjs_update` and `awareness_update` to all other participants in the room.
- **Late joiner sync:** Backend needs a `yjs_updates: list[bytes]` accumulator on the `Room` model. On new participant join, send accumulated updates before broadcasting `participant_joined`.

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

*Phase: 02-collaborative-editor*
*Context gathered: 2026-04-02*
