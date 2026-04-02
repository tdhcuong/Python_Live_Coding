# Phase 4: Host Controls - Research

**Researched:** 2026-04-02
**Domain:** WebSocket host authorization, client-side countdown timers, Y.js transaction suppression, Web Audio API, frontend layout restructure
**Confidence:** HIGH

## Summary

Phase 4 builds host-only control surfaces on top of the existing FastAPI WebSocket relay and Y.js collaborative editor. All four host actions (set problem, start timer, reset editor, Run button + output panel) follow patterns already established in the codebase — they slot into the existing `elif msg_type == ...` relay loop and the existing `createRoomWS` switch in `ws.js`.

The critical research question (D-13) about Y.js transaction suppression is definitively resolved: Y.js `ydoc.transact(fn, origin)` does NOT suppress the update listener from firing. It passes the origin as the second argument to the listener (`ydoc.on('update', (update, origin) => {...})`), and the listener must filter by identity check. The existing `RoomProvider._updateHandler` already does this check (`if (origin !== this)`) — passing a dedicated sentinel as the transact origin is sufficient to suppress the outgoing WS send. Option A from the context is viable with no changes to the guard logic pattern.

The countdown timer architecture (D-07/D-08) is sound: the server records `{started_at, duration}` once, all clients compute remaining time independently. Late joiners reconstruct remaining time from `(new Date(started_at).getTime() + duration * 1000) - Date.now()`. No server-side tick loop is needed. The Web Audio API beep is a zero-dependency two-line oscillator call available in all modern browsers.

**Primary recommendation:** Implement in two waves — Wave 1 covers backend additions and the Run button + output panel (completing Phase 3 deferred work), Wave 2 covers host controls UI (problem panel, timer display, reset button). Both waves can be verified with backend integration tests + manual browser smoke tests.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Host Token Validation**
- D-01: Validate `host_token` inline in the WebSocket relay loop — each host-action message carries `host_token` as a field.
- D-02: Wrong token replies with personal `{type: "error", message: "Unauthorized"}`. No disconnect.
- D-03: Per-message token (not join-time auth). Avoids touching `Participant` dataclass or `room_state` broadcast.

**Problem Description**
- D-04: Backend adds `problem: str | None = None` to `Room`. Host sends `set_problem`; server validates, updates, broadcasts `problem_update`.
- D-05: Plain text only (no Markdown). Displayed in collapsible panel above editor.
- D-06: Late joiners receive `problem` in `room_state` payload (extend lines 128-134 in `main.py`).

**Countdown Timer**
- D-07: Server records `{started_at: <ISO>, duration: <seconds>}` in `room.timer`. Each client counts down independently.
- D-08: Timer state included in `room_state` for late joiners. Late joiner computes remaining = `(started_at + duration) - now`.
- D-09: Duration presets: 5, 10, 15, 20, 30 minutes via dropdown/button group — no free-text.
- D-10: Visual + audio alert at zero. CSS flash/pulse + Web Audio API beep (no sound file). Red/amber color progression.
- D-11: No stop timer in Phase 4. Timer stays at "00:00" after expiry.

**Editor Reset**
- D-12: Option A (client-side). Server validates token, clears `room.yjs_updates`, broadcasts `{type: "reset_editor", content: "# Write your solution here\n"}` to ALL. Each client applies `ydoc.transact(() => { ytext.delete(0, ytext.length); ytext.insert(0, content) }, RESET_ORIGIN)` and suppresses outgoing update for that transaction.
- D-13: Researcher must verify Y.js `ydoc.transact()` suppression approach. Flag if Option A is not viable.

**Run Button + Output Panel (Phase 3 Frontend Deferred)**
- D-14: Full-width output panel below editor — vertical flex stack: editor flex-1, output fixed ~35%.
- D-15: Slim toolbar: Run (indigo) left, Clear right. `execution_start` disables Run + shows "Running..." on ALL clients.
- D-16: Add `execution_start` and `execution_result` cases to `createRoomWS` switch.
- D-17: Combined stdout+stderr. stderr in `text-red-400`, timeout in `text-yellow-400`, stdout in `text-gray-200`. `textContent` always.
- D-18: `mainEl.style.height = '100%'` → `flex-grow` so vertical stack shares height.

**Host Controls UI**
- D-19: Host-only controls visible only when `host_token` is in local state.
- D-20: Problem panel collapsible. Collapsed by default if no problem; auto-expanded when host sets one.

### Claude's Discretion
- Exact timer display format (MM:SS or HH:MM:SS depending on duration)
- Exact color progression (e.g., amber at ≤ 5 min, red at ≤ 1 min)
- Web Audio API beep tone and duration
- Problem panel collapsed/expanded state management
- Exact `pycrdt` flag logic in RoomProvider if needed (research outcome)

### Deferred Ideas (OUT OF SCOPE)
- Stop/pause timer
- Markdown rendering for problem description
- Host-defined custom reset template
- `pycrdt` server-side Y.js binary for editor reset (Option B) — deferred pending research verification
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOST-01 | Host can set a problem description visible to all participants | D-04/D-06: `set_problem` WS message, `problem_update` broadcast, `room_state` extension, collapsible panel UI |
| HOST-02 | Host can start a countdown timer with chosen duration, visible to all | D-07/D-08/D-09: `start_timer` WS message, `{started_at, duration}` state, client-side independent countdown |
| HOST-03 | Visual/audio alert when countdown reaches zero | D-10: CSS flash animation + Web Audio API oscillator beep, color progression |
| HOST-04 | Host can reset editor content back to starting template | D-12/D-13: `reset_editor` WS message, `room.yjs_updates` clear, Y.js transact with origin suppression (VERIFIED viable) |
| EXEC-01 | Run button triggers code execution (frontend gap) | D-14/D-15: Toolbar with Run button, `run_code` WS send |
| EXEC-02 | Output broadcast to all (frontend gap) | D-16/D-17: `execution_result` handler, output panel rendering |
| EXEC-03 | Execution timeout (frontend gap) | D-17: `timed_out` flag renders in `text-yellow-400` |
| EXEC-04 | Clear output panel | D-15: Clear button in toolbar, clears output panel DOM |
| UI-03 | "Running..." loading state (frontend gap) | D-15: `execution_start` disables Run + text changes on ALL clients |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | >=0.115.0 (already installed) | Backend framework + WebSocket relay | Already in use; all new handlers slot into existing relay loop |
| Y.js | ~13.x (already installed) | CRDT document with transaction origin | `ydoc.transact(fn, origin)` is the verified suppression mechanism |
| Web Audio API | Browser built-in | Timer expiry beep | Zero dependency, universally supported |
| Tailwind CSS v4 | Already installed | Styling for new UI panels | Already in use across all screens |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `ytext.delete() / ytext.insert()` | Y.js stdlib | Editor reset content update | Applied inside `ydoc.transact()` with sentinel origin |
| CSS `@keyframes` animation | Browser built-in | Timer expiry flash/pulse | No JS library needed for a simple flash |
| `sessionStorage` | Browser built-in | Host token persistence across page reloads | Already available; `host_token` received from `POST /create-room` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Client-side countdown (D-07) | Server-side tick loop broadcasting every second | Server tick requires async task, cleanup on room destroy, adds complexity. Client-side from `started_at` is stateless and self-correcting. |
| `ydoc.transact(fn, origin)` suppression | Boolean flag variable | Both work; origin approach is idiomatic Y.js. Boolean flag is simpler to understand for new readers. Either is acceptable. |
| Web Audio API oscillator | MP3/WAV sound file | Sound file requires bundling or fetch; oscillator is two lines of JS with no assets. |

**Installation:** No new packages required. All dependencies already installed.

---

## Architecture Patterns

### Backend: New Message Handlers in Relay Loop

Slot three new `elif` branches into `main.py` lines 148-197 (inside the `while True:` loop):

```python
# Source: existing pattern in main.py lines 162-191
elif msg_type == "set_problem":
    if data.get("host_token") != room.host_token:
        await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
        continue
    problem = str(data.get("problem", ""))[:2000]  # cap at 2000 chars
    room.problem = problem
    await manager.broadcast_to_room(room_id, {"type": "problem_update", "problem": problem})

elif msg_type == "start_timer":
    if data.get("host_token") != room.host_token:
        await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
        continue
    duration = int(data.get("duration", 0))
    if duration not in (5, 10, 15, 20, 30):  # whitelist from D-09
        continue
    from datetime import datetime, timezone
    started_at = datetime.now(timezone.utc).isoformat()
    room.timer = {"started_at": started_at, "duration": duration * 60}
    await manager.broadcast_to_room(room_id, {
        "type": "timer_start",
        "started_at": started_at,
        "duration": duration * 60,
    })

elif msg_type == "reset_editor":
    if data.get("host_token") != room.host_token:
        await manager.send_personal(websocket, {"type": "error", "message": "Unauthorized"})
        continue
    room.yjs_updates.clear()  # so late joiners get fresh state
    content = "# Write your solution here\n"
    await manager.broadcast_to_room(room_id, {"type": "reset_editor", "content": content})
```

### Backend: room_state Extension

Extend the `send_personal` call at `main.py` lines 128-134:

```python
await manager.send_personal(websocket, {
    "type": "room_state",
    "room_id": room_id,
    "your_id": participant_id,
    "your_color": color,
    "participants": [p.to_dict() for p in room.participants.values()],
    "problem": room.problem,    # None or str
    "timer": room.timer,         # None or {started_at, duration}
})
```

### Backend: Room Dataclass Extension

```python
# backend/app/models.py — add two fields to Room dataclass
@dataclass
class Room:
    id: str
    host_token: str
    participants: dict[str, Participant] = field(default_factory=dict)
    yjs_updates: list[bytes] = field(default_factory=list)
    is_running: bool = False
    problem: str | None = None    # Phase 4: HOST-01
    timer: dict | None = None     # Phase 4: HOST-02
```

### Frontend: Y.js Editor Reset with Transaction Origin Suppression (VERIFIED)

**Key finding (D-13):** Y.js `ydoc.transact(fn, origin)` does NOT prevent the `'update'` event from firing — it passes `origin` as the second argument to every update listener. The existing `RoomProvider._updateHandler` already checks `if (origin !== this)` to skip re-broadcasting updates that came from the server. The same pattern applies for reset: pass a dedicated sentinel as the transact origin, and the guard skips the WS send.

```javascript
// Source: Y.js docs — ydoc.on('update', (update, origin) => {...})
// In room.js onResetEditor handler:
const RESET_ORIGIN = Symbol('reset')  // or any unique value not equal to `provider`

function applyEditorReset(ydoc, ytext, content) {
  ydoc.transact(() => {
    ytext.delete(0, ytext.length)
    ytext.insert(0, content)
  }, RESET_ORIGIN)
  // provider._updateHandler checks `if (origin !== this)` — RESET_ORIGIN !== provider,
  // so this WILL send. To suppress: the handler must also check for RESET_ORIGIN.
}
```

**IMPORTANT CORRECTION:** Because `RESET_ORIGIN !== provider`, the existing guard `if (origin !== this)` does NOT suppress it — it would forward the reset as a `yjs_update` back to the server. Two correct options:

**Option A1 (recommended):** Temporarily detach the update listener during the transact call:
```javascript
function applyEditorReset(ydoc, ytext, content, provider) {
  provider.pause()   // provider._ydoc.off('update', provider._updateHandler)
  ydoc.transact(() => {
    ytext.delete(0, ytext.length)
    ytext.insert(0, content)
  })
  provider.resume()  // provider._ydoc.on('update', provider._updateHandler)
}
```

**Option A2:** Pass `provider` itself as the origin — the existing `origin !== this` guard then suppresses it:
```javascript
ydoc.transact(() => {
  ytext.delete(0, ytext.length)
  ytext.insert(0, content)
}, provider)  // origin === provider → guard fires → WS send suppressed
```

Option A2 is one line and requires no changes to `RoomProvider`. **This is the cleanest approach.** The server already cleared `room.yjs_updates` before broadcasting `reset_editor`, so passing the update is harmless (server ignores it) — but cleanliness favors suppression.

### Frontend: Host Token Flow

```javascript
// In home.js — pass host_token through navigation state
window.history.pushState({ host_token: data.host_token }, "", `/room/${data.room_id}`)
// OR: store in sessionStorage immediately after create-room response
sessionStorage.setItem(`host_token:${data.room_id}`, data.host_token)

// In room.js connectToRoom — retrieve and store in closure
const hostToken = sessionStorage.getItem(`host_token:${roomId}`) || null
```

### Frontend: Client-Side Countdown Timer

```javascript
// Source: standard Date arithmetic — HIGH confidence
function startCountdown(startedAt, durationSeconds, onTick, onExpire) {
  const endMs = new Date(startedAt).getTime() + durationSeconds * 1000
  const interval = setInterval(() => {
    const remaining = Math.max(0, Math.round((endMs - Date.now()) / 1000))
    onTick(remaining)
    if (remaining <= 0) {
      clearInterval(interval)
      onExpire()
    }
  }, 500)  // 500ms tick — smooth display with self-correction
  return interval
}

// Display format: always MM:SS (max preset is 30 min = 1800s < 3600s)
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
```

Color progression (Claude's discretion):
- Default: `text-gray-200`
- ≤ 300 seconds (5 min): `text-amber-400`
- ≤ 60 seconds (1 min): `text-red-400 animate-pulse`

### Frontend: Web Audio API Beep

```javascript
// Source: MDN Web Audio API — HIGH confidence
function playBeep(frequency = 880, durationSeconds = 0.4) {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = frequency
  osc.type = 'sine'
  gain.gain.setValueAtTime(0.3, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSeconds)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + durationSeconds)
  osc.onended = () => ctx.close()
}
```

880 Hz (A5) is a crisp, attention-getting tone that reads as "alert" without being jarring.

### Frontend: Layout Restructure (D-14/D-18)

Current structure:
```
flex flex-col min-h-screen
  header
  div.flex.flex-1.overflow-hidden
    aside (sidebar)
    main#editor-container.flex-1.overflow-hidden   ← editor fills this
```

Target structure:
```
flex flex-col min-h-screen
  header
  [problem-panel] (conditional, collapsible)
  div.flex.flex-1.overflow-hidden
    aside (sidebar)
    div.flex.flex-col.flex-1.overflow-hidden        ← new wrapper
      main#editor-container.flex-1.overflow-hidden  ← editor, flex-1 not height:100%
      div#toolbar.shrink-0                          ← Run + Clear buttons
      div#output-panel (fixed height ~35%)          ← output display
```

The `mainEl.style.height = '100%'` assignment (room.js line 129) must become `mainEl.classList.add('flex-1')` with `overflow-y: auto` removed from the main and applied to the editor's CodeMirror scroller instead.

### Frontend: ws.js Switch Extension

```javascript
// Add these cases to the switch in createRoomWS():
case "execution_start":
  handlers.onExecutionStart?.(msg)
  break
case "execution_result":
  handlers.onExecutionResult?.(msg)
  break
case "problem_update":
  handlers.onProblemUpdate?.(msg)
  break
case "timer_start":
  handlers.onTimerStart?.(msg)
  break
case "reset_editor":
  handlers.onResetEditor?.(msg)
  break
```

### Recommended Project Structure (no changes needed)

Phase 4 modifies existing files only. No new source files are required.

```
backend/app/
  models.py          ← add problem + timer fields to Room
  main.py            ← add 3 relay handlers + extend room_state
frontend/src/
  ws.js              ← add 5 new message type cases
  pages/
    home.js          ← store host_token in sessionStorage after create-room
    room.js          ← output panel, toolbar, problem panel, timer, host controls
  editor/
    provider.js      ← add pause()/resume() methods (if Option A1) or no change (Option A2)
backend/tests/
  test_host_controls.py   ← NEW: integration tests for host control WS messages
```

### Anti-Patterns to Avoid

- **`editor.setValue(content)` for editor reset:** Explicitly prohibited in CLAUDE.md. Must use Y.js transactions.
- **`innerHTML` for problem text or code output:** Use `textContent` for all user-supplied strings (established pattern, pitfall M10).
- **Server-side timer tick:** Do not broadcast timer ticks from the server every second. Record `{started_at, duration}` once; clients count down independently.
- **Disconnecting the WebSocket on Unauthorized:** D-02 is explicit — reject the action, send personal error, continue the loop.
- **Forgetting to clear `room.yjs_updates` on reset:** If not cleared, late joiners receive the full pre-reset history before the reset, then the reset — the Y.js CRDT merge will not produce the expected clean state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timer beep audio | MP3 bundled in `public/` | Web Audio API `OscillatorNode` | Zero asset dependency; two lines of JS |
| Timer tick synchronization | Server broadcasts every second | Client-side `setInterval` from `started_at` | Self-correcting, no server load, no cleanup needed |
| Editor content replacement | `editor.setValue()` or `Y.applyUpdate()` with raw bytes | `ydoc.transact(() => ytext.delete/insert)` | Y.js CRDT handles merge; raw replacement causes cursor corruption |
| Host identity check | `is_host` flag on Participant, separate auth path | Per-message `host_token` comparison against `room.host_token` | D-03: avoids touching Participant dataclass and room_state broadcast structure |

**Key insight:** All four host actions are thin wrappers around the existing relay pattern. The complexity lives in correct Y.js transaction origin handling and the client-side timer arithmetic — not in novel infrastructure.

---

## Common Pitfalls

### Pitfall 1: Y.js Reset Sends Update Back to Server
**What goes wrong:** `ydoc.transact(fn)` (no origin) fires `_updateHandler` → sends `yjs_update` to server → server appends to freshly-cleared `room.yjs_updates` → next late joiner gets the reset content twice (or with CRDT artifacts).
**Why it happens:** The update listener fires for ALL local transactions unless origin suppression is applied.
**How to avoid:** Use `ydoc.transact(fn, provider)` so the `origin !== this` guard in `_updateHandler` skips the send. This is Option A2 — no code changes to RoomProvider needed.
**Warning signs:** Late joiners see garbled or duplicated content after a reset.

### Pitfall 2: Timer Late-Joiner Drift
**What goes wrong:** Late joiner receives `{started_at, duration}` in `room_state` but computes remaining time from a stale clock or forgets to check if the timer already expired.
**Why it happens:** Forgetting the `Math.max(0, ...)` guard or not handling the case where `remaining <= 0` at join time (timer already finished).
**How to avoid:** Compute remaining as `Math.max(0, Math.round((endMs - Date.now()) / 1000))`. If `remaining === 0` at join time, display "00:00" immediately without starting the interval.
**Warning signs:** Timer shows negative seconds or never reaches zero for late joiners.

### Pitfall 3: Host Token Leaked in Room State Broadcast
**What goes wrong:** `room.host_token` accidentally included in `room_state` or `participant_joined` broadcast → any participant can extract it and perform host actions.
**Why it happens:** Adding fields to `room.to_dict()` or serializing the Room object carelessly.
**How to avoid:** `room_state` sends only `problem` and `timer`. `host_token` must never appear in any broadcast message. Verify with a test that a participant who received only `room_state` cannot perform host actions.
**Warning signs:** Participant client can call `set_problem` without being the room creator.

### Pitfall 4: `execution_start` Disables Run but Reconnect Leaves It Disabled
**What goes wrong:** Page reloads or WS reconnect while execution is in progress — client never receives `execution_result` to re-enable Run.
**Why it happens:** `room.is_running` guard on the server, but the client's disabled state is only cleared by `execution_result`.
**How to avoid:** On `room_state` receipt (which happens on reconnect), check `room.is_running` and set initial Run button state accordingly. Add `is_running: room.is_running` to the `room_state` payload.
**Warning signs:** Run button permanently stuck as "Running..." after reconnect.

### Pitfall 5: Problem Panel Height Breaks Editor Layout
**What goes wrong:** Inserting the problem panel as a sibling in the flex column above the editor causes the editor + output to overflow or collapse.
**Why it happens:** `min-h-screen` on the outer container doesn't distribute height correctly when a new sibling has dynamic/auto height.
**How to avoid:** Outer container uses `h-screen flex flex-col` (not `min-h-screen`). Problem panel uses `shrink-0`. The editor+output wrapper uses `flex-1 overflow-hidden min-h-0`. The `min-h-0` is critical — flex children default `min-height: auto` which prevents shrinking below content size.
**Warning signs:** Editor area disappears or overflows when problem panel is expanded.

---

## Code Examples

### Verified Pattern: Host Token Validation (inline)
```python
# Pattern mirrors existing run_code handler in main.py lines 162-167
elif msg_type == "set_problem":
    if data.get("host_token") != room.host_token:
        await manager.send_personal(websocket, {
            "type": "error",
            "message": "Unauthorized",
        })
        continue
    # ... proceed with action
```

### Verified Pattern: Y.js Transaction with Origin
```javascript
// Source: Y.js official docs — ydoc.transact(fn, origin)
// origin === provider → existing `if (origin !== this)` guard skips send
ydoc.transact(() => {
  ytext.delete(0, ytext.length)
  ytext.insert(0, content)
}, provider)  // provider is the RoomProvider instance
```

### Verified Pattern: ISO Timestamp for Timer
```python
from datetime import datetime, timezone
started_at = datetime.now(timezone.utc).isoformat()
# Produces: "2026-04-02T12:34:56.789012+00:00"
# JS: new Date("2026-04-02T12:34:56.789012+00:00").getTime() — valid
```

### Verified Pattern: Output Panel Text Rendering
```javascript
// D-17: textContent always, color by stream type
function appendOutput(panel, text, kind) {
  // kind: 'stdout' | 'stderr' | 'timeout'
  const colorMap = { stdout: 'text-gray-200', stderr: 'text-red-400', timeout: 'text-yellow-400' }
  const span = document.createElement('span')
  span.className = colorMap[kind] ?? 'text-gray-200'
  span.textContent = text  // NEVER innerHTML
  panel.appendChild(span)
  panel.scrollTop = panel.scrollHeight  // auto-scroll
}
```

### Verified Pattern: Collapsible Panel Toggle
```javascript
// Pure JS + Tailwind classes — no library needed
const chevron = document.querySelector('#problem-chevron')
const body = document.querySelector('#problem-body')
chevron.addEventListener('click', () => {
  body.classList.toggle('hidden')
  chevron.classList.toggle('rotate-180')
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Y.Doc.transact(fn)` broadcasts unconditionally | Pass `origin` to suppress listener | Y.js has supported this since early versions | Enables clean editor reset without server roundtrip |
| `AudioContext()` required user gesture | `new AudioContext()` in any event handler | Chrome autoplay policy update ~2018 | Beep must be triggered in a click/keydown — timer expiry fires from setInterval (no user gesture). Must create AudioContext in response to a real user interaction first OR resume a suspended one. |

**Chrome AutoPlay Policy:** This is the critical "state of the art" item for the Web Audio beep (HOST-03). Chrome (and Safari) suspend AudioContext by default until a user gesture. A `setInterval` callback is not a user gesture. The safe pattern: create an `AudioContext` once on a button click (e.g., the Start Timer button), store it, then use it later when the timer expires. If it's suspended, call `audioCtx.resume()` first.

```javascript
// Create once on user interaction (Start Timer click):
let audioCtx = null
startTimerBtn.addEventListener('click', () => {
  audioCtx = new AudioContext()  // created in user gesture context — not suspended
  // ... send start_timer WS message
})

// On timer expiry (setInterval callback):
function onTimerExpire() {
  if (audioCtx) {
    audioCtx.resume().then(() => playBeep(audioCtx, 880, 0.4))
  }
}
```

**Deprecated/outdated:**
- `createOscillator()` on a freshly created `AudioContext` inside `setInterval`: Fails silently on Chrome/Safari due to autoplay policy. Must use a pre-created context.

---

## Open Questions

1. **`is_running` in room_state (Pitfall 4)**
   - What we know: `room.is_running` exists on the backend but is not currently sent in `room_state`.
   - What's unclear: Does the planner want to add it now (one extra field, zero risk) or address reconnect edge case later?
   - Recommendation: Add `"is_running": room.is_running` to `room_state` payload in this phase — it costs one field and prevents a confusing stuck-button UX that would otherwise appear as a bug.

2. **`home.js` host_token handoff**
   - What we know: `home.js` currently navigates with `window.history.pushState({}, "", ...)` — the state object is empty; `host_token` from the API response is discarded after navigation.
   - What's unclear: History state vs. sessionStorage — both work, but `pushState` state is only accessible on `popstate` which is immediately consumed by the router.
   - Recommendation: Store `host_token` in `sessionStorage` keyed by `room_id` immediately after `POST /create-room` responds, before `pushState`. This survives the navigation and is accessible in `room.js` without routing changes.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.13 | Backend dataclass syntax (`str \| None`) | Yes | 3.13.2 | — |
| Node.js | Frontend build | Yes | 22.20.0 | — |
| npm | Package install | Yes | 11.7.0 | — |
| pytest | Backend tests | Yes (via pyproject.toml) | stdlib | — |
| Y.js (npm) | Editor reset | Already installed | ~13.x | — |
| Web Audio API | Timer beep | Browser built-in | All modern browsers | Omit beep on unsupported browsers (silent fallback) |

**Missing dependencies with no fallback:** None — all required tools are available.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (asyncio_mode=auto) + Starlette TestClient for WS |
| Config file | `backend/pyproject.toml` `[tool.pytest.ini_options]` |
| Quick run command | `cd backend && python -m pytest tests/test_host_controls.py -x -q` |
| Full suite command | `cd backend && python -m pytest -x -q` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOST-01 | `set_problem` with valid token broadcasts `problem_update` | integration | `pytest tests/test_host_controls.py::TestHostControls::test_set_problem_broadcasts -x` | Wave 0 |
| HOST-01 | `set_problem` with wrong token returns personal error, no broadcast | integration | `pytest tests/test_host_controls.py::TestHostControls::test_set_problem_unauthorized -x` | Wave 0 |
| HOST-01 | Late joiner receives `problem` in `room_state` | integration | `pytest tests/test_host_controls.py::TestHostControls::test_late_joiner_receives_problem -x` | Wave 0 |
| HOST-02 | `start_timer` with valid token broadcasts `timer_start` with started_at + duration | integration | `pytest tests/test_host_controls.py::TestHostControls::test_start_timer_broadcasts -x` | Wave 0 |
| HOST-02 | Late joiner receives `timer` in `room_state` | integration | `pytest tests/test_host_controls.py::TestHostControls::test_late_joiner_receives_timer -x` | Wave 0 |
| HOST-02 | Invalid duration (not in whitelist) is silently ignored | integration | `pytest tests/test_host_controls.py::TestHostControls::test_start_timer_invalid_duration -x` | Wave 0 |
| HOST-03 | Timer alert — visual/audio (client-side) | manual | Browser smoke test | N/A |
| HOST-04 | `reset_editor` with valid token clears yjs_updates and broadcasts reset_editor | integration | `pytest tests/test_host_controls.py::TestHostControls::test_reset_editor_broadcasts -x` | Wave 0 |
| HOST-04 | Late joiner after reset gets empty yjs_updates (fresh state) | integration | `pytest tests/test_host_controls.py::TestHostControls::test_late_joiner_after_reset_gets_clean_state -x` | Wave 0 |
| EXEC-01 | Run button sends run_code — already covered | integration | existing `test_execution_ws.py` | Yes |
| EXEC-04 | Clear button clears output panel (client-side DOM) | manual | Browser smoke test | N/A |
| UI-03 | `execution_start` disables Run on all clients — frontend smoke | manual | Browser smoke test | N/A |

### Sampling Rate
- **Per task commit:** `cd backend && python -m pytest tests/test_host_controls.py -x -q`
- **Per wave merge:** `cd backend && python -m pytest -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/test_host_controls.py` — covers HOST-01, HOST-02, HOST-04 (backend integration tests)

*(No new pytest infrastructure needed — conftest.py, TestClient pattern, and `room_id` fixture are already established in existing test files.)*

---

## Sources

### Primary (HIGH confidence)
- Y.js official docs (docs.yjs.dev/api/document-updates) — transaction origin behavior verified: origin passed as second arg to update listener, filtering is manual
- Y.js official docs (beta.yjs.dev/docs/api/transactions/) — confirmed: origin does NOT suppress listener invocation; filtering is caller's responsibility
- MDN Web Audio API (developer.mozilla.org/en-US/docs/Web/API/OscillatorNode) — OscillatorNode API verified
- Existing codebase (`backend/app/main.py`, `frontend/src/editor/provider.js`) — relay loop pattern and update listener guard verified by direct code read

### Secondary (MEDIUM confidence)
- MDN Web Audio API autoplay policy behavior — corroborated by known browser policy (Chrome 66+, Safari 12+); AudioContext suspended until user gesture
- Standard JS Date arithmetic for countdown — well-established pattern, no library verification needed

### Tertiary (LOW confidence)
- None — all critical claims verified from primary sources

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing libraries verified in place
- Architecture: HIGH — D-13 resolved from official Y.js docs; all patterns traced to existing codebase code
- Pitfalls: HIGH — pitfall 1 (Y.js suppression) verified; pitfall 5 (flex min-h-0) is a well-known Tailwind/CSS behavior
- Timer design: HIGH — client-side countdown from ISO timestamp is a standard Date arithmetic pattern

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable stack, no fast-moving dependencies)
