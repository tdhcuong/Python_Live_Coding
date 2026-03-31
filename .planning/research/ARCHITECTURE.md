# Architecture Research: Python Live Coding

**Domain:** Real-time collaborative coding platform
**Researched:** 2026-04-01
**Overall confidence:** MEDIUM-HIGH — subprocess/WebSocket patterns confirmed from official Python and FastAPI docs; editor sync strategy based on training knowledge of CodeMirror 6 and established OT/CRDT literature (web verification unavailable)

---

## Component Map

Five distinct components, each with a clear boundary and single responsibility.

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT (Browser)                                               │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Editor UI   │  │  Output UI   │  │  Room/Timer/Presence │  │
│  │ (CodeMirror) │  │  (console    │  │  UI (sidebar/header) │  │
│  │              │  │   panel)     │  │                      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│  ┌──────▼─────────────────▼──────────────────────▼───────────┐  │
│  │              WebSocket Client (Socket.IO)                  │  │
│  └──────────────────────────┬────────────────────────────────┘  │
└─────────────────────────────│───────────────────────────────────┘
                              │  WebSocket (persistent, bidirectional)
┌─────────────────────────────▼───────────────────────────────────┐
│  SERVER                                                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              WebSocket Server (Flask-SocketIO /         │    │
│  │               FastAPI + python-socketio)                │    │
│  │                                                         │    │
│  │   Event handlers: join_room, code_change, run_code,     │    │
│  │   timer_start, set_problem, participant events          │    │
│  └──────────┬──────────────────────────┬───────────────────┘    │
│             │                          │                        │
│  ┌──────────▼──────────┐  ┌────────────▼────────────────────┐   │
│  │  Room State Store   │  │    Python Execution Service      │   │
│  │  (in-memory dict)   │  │    (subprocess runner)           │   │
│  │                     │  │                                  │   │
│  │  room_id →          │  │  - spawns python3 subprocess     │   │
│  │    { code,          │  │  - captures stdout/stderr        │   │
│  │      problem,       │  │  - enforces timeout              │   │
│  │      timer,         │  │  - returns ExecutionResult       │   │
│  │      version,       │  │                                  │   │
│  │      participants } │  └──────────────────────────────────┘   │
│  └─────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Does NOT handle |
|-----------|---------------|-----------------|
| Editor UI (CodeMirror 6) | Render code, syntax highlight, show multi-cursors, emit change events | Sync conflict resolution (delegates to server) |
| Output UI | Display stdout/stderr with color coding, show execution state | Execution itself |
| Room/Timer/Presence UI | Show participant list, countdown, problem description, connection status | Timer logic (server owns the clock) |
| WebSocket Client | Serialize/deserialize events, reconnect, queue events during disconnect | Business logic |
| WebSocket Server | Route events to handlers, broadcast to rooms, own room lifecycle | Code execution |
| Room State Store | Single source of truth for all room data in memory | Persistence (ephemeral by design) |
| Python Execution Service | Spawn subprocess, capture output, enforce resource limits | Broadcasting (hands result back to WS server) |

---

## Data Flow

### 1. Room Creation (host)

```
Host browser                Server                    Room State
    │                          │                          │
    │── POST /create-room ─────►│                          │
    │                          │── generate room_id        │
    │                          │── create room entry ─────►│
    │                          │   { code: "", version: 0, │
    │                          │     problem: null,        │
    │                          │     timer: null,          │
    │                          │     participants: {} }    │
    │◄─ { room_id, host_token }─│                          │
    │                          │                          │
    │── WS connect /room/{id} ─►│                          │
    │                          │── socket.join(room_id) ──►│
    │                          │── emit "room_state" ─────►│ (read)
    │◄─ { state snapshot } ────│                          │
```

### 2. Participant Join

```
Participant browser         Server                    All room members
    │                          │                          │
    │── WS connect /room/{id} ─►│                          │
    │                          │── socket.join(room_id)    │
    │                          │── read room state         │
    │◄─ "room_state" snapshot ─│  (sends current code,    │
    │   (entire current state)  │   problem, timer, etc.)  │
    │                          │── emit "participant_joined"► (to room)
    │                          │   { id, name, color }    │
```

State replay on join is critical. The participant receives full current code, problem, timer state, and participant list immediately after connecting. This avoids requiring participants to "catch up" manually.

### 3. Code Edit (collaborative sync)

```
Editor (User A)             Server                    Editor (User B)
    │                          │                          │
    │── "code_change" ─────────►│                          │
    │   { room_id,              │── update room_state.code │
    │     version: N,           │── update version: N+1    │
    │     content: "...",       │── emit "code_update" ───►│
    │     cursor_pos }          │   { content, version,    │
    │                           │     sender_id,           │
    │◄─ "code_update" ─────────│     cursors: {...} }     │
    │   (echo back to confirm   │                          │
    │    version accepted)      │                          │
```

### 4. Code Execution

```
Any participant             Server                    All participants
    │                          │                          │
    │── "run_code" ────────────►│                          │
    │                          │── set executing=true      │
    │◄─ "execution_started" ───│── emit "execution_started"►
    │   { runner_id }           │   { runner_id }          │
    │                          │                          │
    │                          │── subprocess.run(         │
    │                          │     ["python3", "-c",    │
    │                          │      room.code],          │
    │                          │     timeout=15,           │
    │                          │     capture_output=True,  │
    │                          │     env=restricted_env)   │
    │                          │                          │
    │                          │  (subprocess completes)   │
    │                          │── set executing=false     │
    │◄─ "execution_result" ────│── emit "execution_result"►│
    │   { stdout, stderr,       │   to entire room         │
    │     exit_code,            │                          │
    │     duration_ms,          │                          │
    │     runner_id }           │                          │
```

### 5. Timer Flow

```
Host                        Server                    All participants
    │                          │                          │
    │── "start_timer" ─────────►│                          │
    │   { duration_seconds }    │── store timer start time │
    │                          │── emit "timer_started" ──►│
    │                          │   { duration, started_at }│
    │                          │                          │
    │                          │  (each client owns its    │
    │                          │   own countdown locally;  │
    │                          │   started_at is the sync  │
    │                          │   anchor)                 │
```

Timer design: server broadcasts `{ duration_seconds, started_at: unix_timestamp }`. Each client independently counts down from `(started_at + duration) - now`. This avoids a server-side tick loop and keeps the server stateless for timer rendering.

### 6. Disconnect / Reconnect

```
Participant browser         Server                    All room members
    │                          │                          │
    │── (connection drops) ────►│ WebSocketDisconnect       │
    │                          │── remove from room        │
    │                          │── emit "participant_left"─►│
    │                          │                          │
    │  (Socket.IO auto-reconnect)                         │
    │── WS reconnect ──────────►│                          │
    │                          │── socket.join(room_id)    │
    │◄─ "room_state" snapshot ─│  (full state replay)     │
```

---

## Editor Sync Strategy

### The Three Options

**Option A: Operational Transform (OT)**
- Each edit is expressed as a minimal operation: `insert(pos, text)` or `delete(pos, len)`
- The server applies each operation, increments a version number, and rebroadcasts the transformed operation to all clients
- Clients that have pending unacknowledged operations must "transform" incoming remote operations against their local pending ops
- This is what Google Docs and CodeMirror 6's `@codemirror/collab` package implement
- Complexity: the transformation logic is non-trivial to implement from scratch; correct OT requires careful handling of concurrent operations at the same position

**Option B: CRDT (Y.js or Automerge)**
- Document is modeled as a CRDT data structure (typically a sequence CRDT like YATA or RGA)
- All operations are commutative and idempotent — no server-side ordering required
- Server can be a simple relay (broadcast to room), no transformation logic needed
- Y.js with `y-codemirror.next` provides a production-ready CodeMirror 6 binding
- Complexity: the CRDT library handles everything; integration is relatively small surface area

**Option C: Last-Write-Wins (LWW) — Full Document Replacement**
- Any keystroke sends the entire current document content to the server
- Server stores the latest version and broadcasts it to all other clients
- Clients overwrite their editor content with incoming documents (suppressing local cursor jump)
- Extreme simplicity: no transform logic, no conflict resolution
- Problem: at 10 participants typing simultaneously, every keypress triggers a full document broadcast; conflicts result in one user's typing being silently lost; cursor jumps are jarring

### Recommendation: CRDT via Y.js

**Use Y.js with `y-codemirror.next`.** Confidence: MEDIUM (training knowledge through Aug 2025; WebFetch unavailable to verify current Y.js version).

Rationale:
1. The server is a thin relay. It broadcasts `Y.js` update messages to room members without implementing any OT transform logic. This keeps the Python server simple and correct.
2. `y-codemirror.next` is the official Y.js adapter for CodeMirror 6. It handles cursor awareness, undo/redo, and document sync as a single integration.
3. CRDT convergence is mathematically guaranteed — no edge case where two simultaneous edits diverge permanently.
4. For this use case (small rooms, ≤ 10 participants, single file, ephemeral), Y.js CRDT state is tiny and never needs persistence.
5. OT is equally correct but requires implementing transform functions correctly, which is a significant source of bugs. Y.js eliminates this entirely.

**LWW is not acceptable** for this product because cursor jumps on every remote keystroke would make the editor feel broken, directly undermining the "elegant, professional UI" requirement.

### Server Role with Y.js

```
Client A (Y.js doc)         Server (relay only)       Client B (Y.js doc)
    │                          │                          │
    │── WS "yjs_update" ───────►│                          │
    │   Uint8Array (binary)     │── broadcast to room ─────►│
    │                          │   (no transform logic)   │── applyUpdate(bytes)
    │                          │── store update bytes      │   (CRDT merge)
    │                          │   in room.yjs_updates[]   │
    │                          │   (for late joiners)      │
```

On join: server sends the full `Y.Doc` state vector (all accumulated updates merged) so the new participant gets the current document in one message.

### Awareness (Cursors)

Y.js has a built-in `Awareness` protocol for ephemeral state like cursor positions and user names. Awareness updates are broadcast separately from document updates and are not persisted. The server relays them to the room like any other event.

---

## Python Execution Model

### Subprocess Design

Execution must be isolated from the server process. The server calls `subprocess.run()` (or `Popen` for streaming) with the user's code written to a temp file or passed via `-c`.

**Confirmed pattern (from official Python docs):**

```python
import subprocess
import tempfile
import os
import time

def execute_python(code: str, timeout: int = 15) -> dict:
    start = time.monotonic()

    # Write code to temp file (safer than -c for multiline)
    with tempfile.NamedTemporaryFile(
        mode='w',
        suffix='.py',
        dir='/tmp',
        delete=False
    ) as f:
        f.write(code)
        tmp_path = f.name

    try:
        result = subprocess.run(
            ['python3', tmp_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd='/tmp',
            env={
                'PATH': '/usr/bin:/bin',
                'HOME': '/tmp',
            }
        )
        duration_ms = int((time.monotonic() - start) * 1000)
        return {
            'stdout': result.stdout[:50_000],  # cap output size
            'stderr': result.stderr[:10_000],
            'exit_code': result.returncode,
            'duration_ms': duration_ms,
            'timed_out': False,
        }
    except subprocess.TimeoutExpired:
        return {
            'stdout': '',
            'stderr': f'Execution timed out after {timeout} seconds.',
            'exit_code': -1,
            'duration_ms': timeout * 1000,
            'timed_out': True,
        }
    finally:
        os.unlink(tmp_path)
```

### Resource Limits (confirmed from Python docs)

Set via `resource` module in a `preexec_fn` (Unix only — macOS and Linux):

```python
import resource

def set_limits():
    # Max CPU time: 15 seconds (SIGXCPU sent at soft limit)
    resource.setrlimit(resource.RLIMIT_CPU, (15, 15))
    # Max virtual memory: 128MB
    resource.setrlimit(resource.RLIMIT_AS, (128 * 1024 * 1024, 128 * 1024 * 1024))

result = subprocess.run(
    ['python3', tmp_path],
    capture_output=True,
    text=True,
    timeout=15,
    preexec_fn=set_limits,  # applied in child process before exec
    cwd='/tmp',
    env={'PATH': '/usr/bin:/bin', 'HOME': '/tmp'},
)
```

### Concurrency Gate

Only one execution per room at a time. Track `room.executing: bool` in the room state store. If a second `run_code` event arrives while `executing=True`, emit an error back to the requester only (do not broadcast).

```python
@socketio.on('run_code')
def handle_run_code(data):
    room = get_room(data['room_id'])
    if room.executing:
        emit('execution_error', {'message': 'Code is already running.'})
        return
    room.executing = True
    # ... spawn execution ...
```

### Async Execution (non-blocking server)

Running `subprocess.run()` synchronously will block the event loop in an async framework (FastAPI) or block a thread in Flask-SocketIO. Handle with:

- **Flask-SocketIO**: Use `socketio.start_background_task()` to run the subprocess in a background greenlet/thread, then `socketio.emit()` from that task when complete.
- **FastAPI**: Use `asyncio.get_event_loop().run_in_executor(None, execute_python, code)` to offload the blocking subprocess call to a thread pool, then `await` the result.

### Output Size and Safety

| Concern | Mitigation |
|---------|------------|
| Infinite output (`while True: print(...)`) | `timeout` kills process; truncate stdout to 50KB before broadcast |
| Memory bomb (`" " * 10**9`) | `RLIMIT_AS` limits virtual memory to 128MB |
| CPU bomb (`while True: pass`) | `RLIMIT_CPU` + `timeout` parameter |
| Fork bomb | `RLIMIT_NPROC` limits child processes (set in `preexec_fn`) |
| Network access | Stripped `env`; no outbound calls for stdlib use cases (full isolation would need network namespace) |
| File system writes | `cwd=/tmp`; stripped env; acceptable for this use case (not a multi-tenant cloud product) |

**Note:** This level of sandboxing is appropriate for a small private session among trusted friends/colleagues (per PROJECT.md use case). It is NOT production-grade isolation for anonymous public users. The constraint is acceptable given the product's stated scope.

---

## Suggested Build Order

Dependencies determine the order. Nothing in phase N should depend on something built in phase N+1.

### Phase 1: WebSocket Foundation

Build first because everything else depends on it.

- Room creation endpoint: `POST /room` → returns `room_id`
- Room join page: `GET /room/:id` → serves the HTML shell
- WebSocket server setup (Flask-SocketIO or FastAPI + python-socketio)
- Room state store (in-memory dict, keyed by `room_id`)
- Core events: `join_room`, `leave_room`, participant tracking
- Broadcast: `participant_joined`, `participant_left`, `room_state` snapshot on join
- Connection status indicator (client-side Socket.IO connect/disconnect events)

No editor, no execution, no UI polish. Just rooms with participants that can join and leave.

**Gate to next phase:** Two browser tabs can join the same room and see each other's presence.

### Phase 2: Shared Editor Sync

Depends on Phase 1 (WebSocket room infrastructure).

- Integrate CodeMirror 6 in the frontend
- Install Y.js, `y-codemirror.next`, `y-protocols` on the client
- Server: add `room.yjs_state` to room state store (accumulated update bytes)
- Server: relay `yjs_update` events to room members
- Server: send full Y.js state vector to new joiners (state replay)
- Client: initialize `Y.Doc`, bind to CodeMirror via `yCodemirror()`
- Cursor awareness via Y.js Awareness protocol (multi-cursor display)
- Python syntax highlighting (CodeMirror language-python extension)

**Gate to next phase:** Two browser tabs show the same text; edits in one appear in the other with correct cursor positions.

### Phase 3: Python Execution

Depends on Phase 2 (need editor to have code to run).

- Python execution service (subprocess runner with timeout and resource limits)
- `run_code` WebSocket event handler
- Concurrency gate (`room.executing` flag)
- Execution output broadcast (`execution_result` event to entire room)
- Output panel UI (stdout/stderr, color-coded)
- "Running..." loading state on Run button
- Keyboard shortcut (Ctrl+Enter / Cmd+Enter)

**Gate to next phase:** Any participant can click Run, the Python code executes, and stdout/stderr appears in all participants' output panels simultaneously.

### Phase 4: Host Features

Depends on Phase 1 (room state store for problem and timer data).

- Host token: a `host_token` query param returned at room creation; checked server-side for host-only events
- Problem/description panel: host sends `set_problem` event; server stores in `room.problem`; broadcast to all
- Countdown timer: host sends `start_timer { duration_seconds }`; server stores `{ duration, started_at }`; broadcast to all
- Timer display UI: client renders countdown from `(started_at + duration) - Date.now()`
- Timer urgency color transitions (CSS only, no server involvement)

**Gate to next phase:** Host can set a problem description and start a timer; all participants see both.

### Phase 5: Polish and Reliability

Depends on Phases 1-4 (polishing what exists).

- Graceful reconnect: on reconnect, server sends full `room_state` snapshot; client restores editor from Y.js state
- Join/leave toast notifications
- Participant list with colored initials
- Execution history (store last N results in `room.execution_history`; send in `room_state` snapshot)
- Execution time display
- Copy room link button
- Dark theme finalization, responsive layout
- localtunnel integration and test

**Gate:** Full feature walkthrough with two+ participants on different devices/browsers.

---

## WebSocket Event Catalog

| Event Name | Direction | Payload | Room Broadcast? |
|------------|-----------|---------|-----------------|
| `join_room` | client → server | `{ room_id, name }` | No (triggers `room_state` + `participant_joined`) |
| `room_state` | server → client | `{ code_yjs_state, problem, timer, participants, history }` | No (personal) |
| `participant_joined` | server → room | `{ id, name, color }` | Yes |
| `participant_left` | server → room | `{ id, name }` | Yes |
| `yjs_update` | client → server | `Uint8Array` (binary) | Yes (relay to room) |
| `awareness_update` | client → server | `Uint8Array` (binary) | Yes (relay to room) |
| `run_code` | client → server | `{ room_id }` | No (triggers below) |
| `execution_started` | server → room | `{ runner_id, runner_name }` | Yes |
| `execution_result` | server → room | `{ stdout, stderr, exit_code, duration_ms, timed_out, runner_id }` | Yes |
| `execution_error` | server → client | `{ message }` | No (personal error) |
| `set_problem` | client → server | `{ room_id, problem, host_token }` | No (triggers below) |
| `problem_updated` | server → room | `{ problem }` | Yes |
| `start_timer` | client → server | `{ room_id, duration_seconds, host_token }` | No (triggers below) |
| `timer_started` | server → room | `{ duration_seconds, started_at }` | Yes |

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Editor sync algorithm | Y.js CRDT | Server becomes a thin relay; no OT transform logic to implement or debug |
| Room state storage | In-memory Python dict | Ephemeral sessions by design; no DB dependency |
| Execution isolation | subprocess + resource limits | No Docker required; appropriate for private trusted sessions |
| Timer sync | Timestamp anchor, client countdown | Eliminates server tick loop; clients drift by <1s which is acceptable |
| Concurrency gate | Per-room boolean flag | One execution at a time per room; simplest correct approach |
| Host auth | Opaque token in URL | Zero auth stack; URL-as-credential fits the anonymous, private session model |
| Output truncation | 50KB stdout, 10KB stderr | Prevents WebSocket message bombs; users rarely need more from a coding challenge |

---

## Scalability Note

This architecture is designed for a single-process local server (per PROJECT.md constraints: runs on localhost, exposed via localtunnel). All room state is in-memory in one process. This is correct for the stated use case and must NOT be over-engineered. The FastAPI docs explicitly note that the `ConnectionManager` pattern only works correctly with a single process — that is exactly the constraint this product operates under.

If the product ever needed multi-process deployment, the state store would need to move to Redis and the WebSocket layer would need a pub/sub broker. That is out of scope.

---

## Sources

- Official Python `subprocess` documentation (docs.python.org/3/library/subprocess.html) — HIGH confidence, verified 2026-04-01
- Official Python `resource` module documentation (docs.python.org/3/library/resource.html) — HIGH confidence, verified 2026-04-01
- FastAPI WebSocket documentation (fastapi.tiangolo.com/advanced/websockets/) — HIGH confidence, verified 2026-04-01
- Y.js collaborative editing library (yjs.dev), `y-codemirror.next` package — MEDIUM confidence (training knowledge through Aug 2025; WebFetch unavailable)
- CodeMirror 6 `@codemirror/collab` package — MEDIUM confidence (training knowledge)
- `FEATURES.md` feature dependency graph — cross-referenced for build order consistency
- OT vs CRDT literature — MEDIUM confidence (well-established academic and engineering knowledge, stable domain)
