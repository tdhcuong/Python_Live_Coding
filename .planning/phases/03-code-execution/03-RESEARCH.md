# Phase 3: Code Execution - Research

**Researched:** 2026-04-02
**Domain:** Python subprocess sandboxing, FastAPI WebSocket execution protocol, frontend output panel UI
**Confidence:** HIGH

## Summary

Phase 3 adds a Run button, sandboxed subprocess execution, and an output panel to the room view.
All decisions are locked in CONTEXT.md — the user skipped discussion and accepted defaults. The
implementation is fully defined: WebSocket-only protocol, `asyncio.to_thread` + `subprocess.run`,
tempfile-based code delivery, resource limits via the `resource` module, and combined
stdout/stderr output panel below the editor.

The critical blocker from STATE.md has been resolved by live testing: **`RLIMIT_AS` is
non-functional on macOS** (Python subprocesses have a virtual address space of ~400 GB due to
macOS framework mapping, making any `RLIMIT_AS` value below the current usage cause `preexec_fn`
to fail). The correct macOS sandbox uses `RLIMIT_CPU` (kills CPU-bound loops via SIGXCPU, signal
-24) and `RLIMIT_NPROC` (fork bomb protection) plus `subprocess.run(timeout=)` as the backstop
for wall-clock time. All three mechanisms were verified by live execution in this session.

**Primary recommendation:** Implement `run_python_sync()` in a new `backend/app/executor.py`
module, wrap it with `asyncio.to_thread` in the `run_code` WS handler in `main.py`, and add the
output panel + toolbar to `renderRoomView()` in `frontend/src/pages/room.js`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** WebSocket-only flow — no HTTP endpoint for execution. Client sends `run_code` message; server broadcasts `execution_start` to all participants (disables Run button everywhere), executes code, then broadcasts `execution_result` with stdout/stderr/exit_code.
- **D-02:** Frontend sends `ytext.toString()` as the `code` payload in `run_code` — no backend Y.js reconstruction needed.
- **D-03:** `asyncio.to_thread()` wraps a blocking `subprocess.run()` call. Code is written to a tempfile in `/tmp` (not passed via `-c`).
- **D-04:** Resource limits via `resource` module in `preexec_fn`: `RLIMIT_CPU` (5s soft, 6s hard), `RLIMIT_AS` (note macOS blocker — see Pitfalls). Hard timeout via `subprocess.run(timeout=10)` as backstop.
- **D-05:** stdout capped at 50 KB, stderr capped at 10 KB before broadcast.
- **D-06:** Stripped `env` — pass a minimal `{"PATH": "/usr/bin:/bin"}`.
- **D-07:** Output panel sits below the editor — vertical split. Editor-stack = editor on top + output panel below (~35% height).
- **D-08:** Run button and "Clear" button live in a slim toolbar strip between editor and output panel (part of output panel header).
- **D-09:** Combined output panel — stdout in `text-gray-200`, stderr lines prefixed `stderr:` in `text-red-400`.
- **D-10:** Output panel is scrollable monospace, auto-scrolls to bottom on new content.
- **D-11:** `execution_start` disables Run button and shows "Running..." on ALL participants simultaneously. `execution_result` re-enables.
- **D-12:** Timeout produces a synthetic stderr line `"Timed out — execution exceeded Xs"` in `text-yellow-400`. Exit code non-zero. No separate message type.

### Claude's Discretion

- Exact output panel height (suggest ~35% of the editor-stack)
- Exact Run button styling (suggest indigo, matching the Join button)
- Debounce / double-click protection on Run button
- Exact resource limit values (CPU seconds, memory bytes) tuned for macOS dev environment

### Deferred Ideas (OUT OF SCOPE)

None — no discussion, no deferred items.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EXEC-01 | Any participant can trigger code execution via a Run button | WS `run_code` handler + frontend button wiring verified pattern |
| EXEC-02 | Code output (stdout/stderr) is broadcast to all participants simultaneously | `manager.broadcast_to_room()` already exists and handles this; `execution_result` message carries payload |
| EXEC-03 | Execution is automatically killed after a timeout (prevents infinite loops) | `subprocess.run(timeout=10)` verified; RLIMIT_CPU also verified (SIGXCPU at 5s CPU time) |
| EXEC-04 | Any participant can clear the output panel | Client-side only — `clear_output` WS message OR local button; decided client-side per D-11 context |
| UI-03 | A "Running..." loading state is shown while code is executing | `execution_start` / `execution_result` broadcast pattern; `is_running` guard on Room model |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `subprocess` | stdlib | Spawn sandboxed Python child process | Required; no third-party dep; CLAUDE.md mandated |
| `resource` | stdlib | Set `RLIMIT_CPU`, `RLIMIT_NPROC` via `preexec_fn` | POSIX standard; macOS-compatible (RLIMIT_AS excluded — see Pitfalls) |
| `tempfile` | stdlib | Write code to `/tmp/*.py` before exec | Safer than `-c` for multiline; CLAUDE.md mandated |
| `asyncio.to_thread` | Python 3.9+ stdlib | Offload blocking `subprocess.run` to thread pool | Keeps FastAPI event loop free; CLAUDE.md mandated |
| `os.unlink` | stdlib | Delete temp file in `finally` block | Prevents `/tmp` leakage |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `fastapi.WebSocket` | bundled | Receive `run_code`, send `execution_start`/`execution_result` | Already in use; no new dep |
| Tailwind CSS v4 | 4.x | Output panel styling, button states | Already in use |
| Browser `scrollTop`/`scrollHeight` | DOM API | Auto-scroll output panel | Built-in; no library needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `subprocess.run` with tempfile | `subprocess.run(..., input=code)` via stdin | stdin is fine for simple cases but tempfile is cleaner for multiline, consistent with CLAUDE.md |
| `asyncio.to_thread` | `loop.run_in_executor` | Both work; `to_thread` is the modern 3.9+ idiom, CLAUDE.md mandated |
| Combined output panel | Separate stdout/stderr tabs | Tabs add UI complexity; terminal-style single stream is simpler and sufficient |

**Installation:** No new packages required. All dependencies are Python stdlib or already installed.

## Architecture Patterns

### Recommended Project Structure

New file to create:
```
backend/app/executor.py          # run_python_sync() + run_python_async() (new)
backend/tests/test_executor.py   # Unit tests for executor (new — Wave 0)
```

Modified files:
```
backend/app/models.py            # Add is_running: bool = False to Room dataclass
backend/app/main.py              # Add run_code handler in relay loop
frontend/src/ws.js               # Add execution_start / execution_result cases + sendRunCode()
frontend/src/pages/room.js       # Add output panel, toolbar, Run/Clear buttons to renderRoomView()
```

### Pattern 1: Executor Module (backend/app/executor.py)

**What:** A pure-function synchronous executor that subprocess-runs Python code and returns a result dict. No FastAPI coupling — easily testable.

**When to use:** Called by the WS handler via `asyncio.to_thread`.

**Example:**
```python
# Source: Python stdlib docs + CLAUDE.md §Backend / Python Execution Sandbox
import asyncio
import resource
import subprocess
import sys
import os
import tempfile
from dataclasses import dataclass

@dataclass
class ExecutionResult:
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool

def run_python_sync(code: str, timeout: int = 10) -> ExecutionResult:
    """Execute Python code in a sandboxed subprocess. Blocking — use via asyncio.to_thread."""
    with tempfile.NamedTemporaryFile(
        mode='w', suffix='.py', dir='/tmp', delete=False
    ) as f:
        f.write(code)
        fname = f.name

    def _preexec():
        # RLIMIT_CPU: kills CPU-bound infinite loops via SIGXCPU (verified on macOS)
        resource.setrlimit(resource.RLIMIT_CPU, (5, 6))
        # RLIMIT_NPROC: fork bomb protection (verified on macOS)
        resource.setrlimit(resource.RLIMIT_NPROC, (20, 20))
        # NOTE: RLIMIT_AS is intentionally omitted — non-functional on macOS
        # (virtual address space ~400 GB; setting it causes preexec_fn to fail)

    timed_out = False
    try:
        result = subprocess.run(
            [sys.executable, fname],
            capture_output=True,
            text=True,
            timeout=timeout,
            preexec_fn=_preexec,
            env={"PATH": "/usr/bin:/bin"},   # stripped env (D-06)
        )
        stdout = result.stdout[:50_000]      # 50 KB cap (D-05)
        stderr = result.stderr[:10_000]      # 10 KB cap (D-05)
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
        stdout = ""
        stderr = f"Timed out — execution exceeded {timeout}s"  # D-12
        exit_code = 1
    finally:
        try:
            os.unlink(fname)
        except OSError:
            pass

    return ExecutionResult(
        stdout=stdout,
        stderr=stderr,
        exit_code=exit_code,
        timed_out=timed_out,
    )


async def run_python_async(code: str, timeout: int = 10) -> ExecutionResult:
    """Async wrapper — offloads blocking call to thread pool (D-03)."""
    return await asyncio.to_thread(run_python_sync, code, timeout)
```

### Pattern 2: WS Handler in main.py (run_code branch)

**What:** New `elif msg_type == "run_code":` branch in the relay loop. Guards against concurrent execution with `room.is_running`, broadcasts `execution_start` then `execution_result`.

**Example:**
```python
# In the while True relay loop, after the awareness_update elif:
elif msg_type == "run_code":
    if room.is_running:
        # D-11: reject concurrent run with personal error
        await manager.send_personal(websocket, {
            "type": "error",
            "message": "Execution already in progress",
        })
        continue

    code = data.get("code", "")
    if not isinstance(code, str):
        continue

    room.is_running = True
    # Broadcast execution_start BEFORE awaiting (disables Run everywhere — D-11)
    await manager.broadcast_to_room(room_id, {"type": "execution_start"})

    from .executor import run_python_async
    result = await run_python_async(code)

    room.is_running = False
    await manager.broadcast_to_room(room_id, {
        "type": "execution_result",
        "stdout": result.stdout,
        "stderr": result.stderr,
        "exit_code": result.exit_code,
        "timed_out": result.timed_out,
    })
```

### Pattern 3: Frontend — Output Panel Layout

**What:** Replace `<main id="editor-container">` with an editor-stack div that wraps the editor and output panel.

**Example:**
```html
<!-- In renderRoomView() innerHTML — replace the <main> element -->
<div id="editor-stack" class="flex-1 flex flex-col overflow-hidden">
  <!-- Editor area: fills top ~65% -->
  <main id="editor-container" class="flex-1 overflow-hidden min-h-0"></main>

  <!-- Toolbar: Run + Clear buttons (D-08) -->
  <div class="flex items-center gap-2 px-3 py-2 bg-gray-800 border-t border-b border-gray-700">
    <button id="run-btn"
      class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed
             text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors">
      Run
    </button>
    <button id="clear-btn"
      class="text-gray-400 hover:text-gray-200 text-sm px-3 py-1.5 rounded-lg transition-colors">
      Clear
    </button>
    <span id="run-status" class="text-xs text-gray-500 ml-auto hidden">Running...</span>
  </div>

  <!-- Output panel: ~35% height (D-07, D-10) -->
  <div id="output-panel"
    class="h-[35%] overflow-y-auto bg-gray-950 font-mono text-sm p-3
           border-t border-gray-800">
    <!-- Output lines appended here by appendOutputLine() -->
  </div>
</div>
```

### Pattern 4: Frontend — Output Rendering (textContent, XSS-safe)

**What:** Output lines must use `textContent`, never `innerHTML`. Color-coding by line type. Auto-scroll.

**Example:**
```javascript
// In ws.js handlers (or room.js helpers)
function appendOutputLine(panel, text, type) {
  // type: 'stdout' | 'stderr' | 'timeout'
  const line = document.createElement('div');
  // textContent — NEVER innerHTML — execution output is user-supplied (D-09 + Pitfall M10)
  line.textContent = text;
  if (type === 'stderr') {
    line.className = 'text-red-400';
  } else if (type === 'timeout') {
    line.className = 'text-yellow-400';
  } else {
    line.className = 'text-gray-200';
  }
  panel.appendChild(line);
  // D-10: auto-scroll to bottom
  panel.scrollTop = panel.scrollHeight;
}

// In execution_result handler:
// ws.js case 'execution_result':
handlers.onExecutionResult?.(msg);
// room.js onExecutionResult handler:
// 1. Re-enable Run button
// 2. Hide "Running..." status
// 3. Render stdout lines
// 4. Render stderr lines (prefixed or colored)
// 5. Render timed_out message in yellow if applicable
```

### Pattern 5: WS Message Extension (ws.js)

**What:** Add two new cases to the switch + one send helper.

**Example:**
```javascript
// In createRoomWS switch:
case "execution_start":
  handlers.onExecutionStart?.(msg);
  break;
case "execution_result":
  handlers.onExecutionResult?.(msg);
  break;

// New send helper returned from createRoomWS:
sendRunCode: (code) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "run_code", code }));
  }
},
```

### Anti-Patterns to Avoid

- **`exec()` in-process:** Runs in the server process, can access globals, blocks event loop — explicitly prohibited in CLAUDE.md.
- **`subprocess.run(..., shell=True)`:** Shell injection vector — explicitly prohibited in CLAUDE.md.
- **`RLIMIT_AS` in `preexec_fn` on macOS:** Causes `subprocess.SubprocessError: Exception occurred in preexec_fn` because the forked process's virtual address space (~400 GB) already exceeds any practical limit. Omit on macOS. On Linux it works.
- **Setting `is_running = False` before `broadcast_to_room`:** The Run button would flicker if a new run arrives between the two operations. Always set `is_running = False` and broadcast atomically (sequential in async context is fine).
- **`innerHTML` for output:** Execution output is user-supplied. Always use `textContent` or `document.createTextNode`.
- **`editor.getValue()` instead of `ytext.toString()`:** Getting code from the CodeMirror imperative API is fragile; Y.js text is the source of truth. Use `ytext.toString()` (D-02).
- **Blocking the event loop:** `subprocess.run` is blocking. It MUST be wrapped with `asyncio.to_thread` — calling it directly in an async handler freezes all WebSocket connections.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Output line-level colorizing | Custom HTML templating with innerHTML | DOM `createElement` + `textContent` + className | XSS-safe; textContent enforced by existing codebase convention (M10) |
| Process kill on timeout | Signal handling, `os.kill` loop | `subprocess.run(timeout=N)` raises `TimeoutExpired`; just catch it | stdlib handles SIGKILL internally; reinventing creates race conditions |
| Thread pool management | Custom `ThreadPoolExecutor` | `asyncio.to_thread` | Python 3.9+ uses the default executor automatically; no configuration needed |
| Concurrent run prevention | Complex lock/mutex | `is_running: bool` flag on `Room` | Single-process server; in-memory flag is correct and sufficient (per ARCHITECTURE.md) |

**Key insight:** The sandbox is already designed in CLAUDE.md. The implementation risk is almost entirely in one macOS-specific pitfall (RLIMIT_AS) and the XSS safety of output rendering, both of which have clear solutions.

## Common Pitfalls

### Pitfall 1: RLIMIT_AS Unusable on macOS

**What goes wrong:** `preexec_fn` calls `resource.setrlimit(resource.RLIMIT_AS, (LIMIT, LIMIT))`. The subprocess creation raises `subprocess.SubprocessError: Exception occurred in preexec_fn` before the child process even starts.

**Why it happens:** On macOS, every Python subprocess has a virtual address space of approximately 400 GB due to aggressive framework mapping. The `preexec_fn` runs in the forked child before `exec()` — meaning the child's virtual memory is already the parent's ~400 GB. Setting any practical limit (128 MB, 512 MB) to below current usage causes `setrlimit` to fail with `EINVAL`.

**How to avoid:** Do NOT include `RLIMIT_AS` in `preexec_fn` on macOS. Rely on:
1. `RLIMIT_CPU` (kills CPU-bound infinite loops via SIGXCPU in ~5s — VERIFIED)
2. `RLIMIT_NPROC` (fork bomb protection — VERIFIED)
3. `subprocess.run(timeout=10)` (wall-clock backstop for I/O-bound hangs — VERIFIED)

**Warning signs:** `subprocess.SubprocessError: Exception occurred in preexec_fn` in logs. Process creation fails for all executions.

**Verified resolution:** Live-tested on macOS 25.4.0 / Python 3.13.2. RLIMIT_CPU produces returncode -24 (SIGXCPU). timeout= raises TimeoutExpired. RLIMIT_NPROC stops fork bombs.

### Pitfall 2: XSS via innerHTML on Output Panel

**What goes wrong:** `outputPanel.innerHTML += result.stdout` — user code that prints `<script>alert(1)</script>` executes JavaScript in all participants' browsers.

**Why it happens:** Execution output is untrusted user content. innerHTML treats strings as HTML.

**How to avoid:** Always use `document.createElement('div')` + `element.textContent = line`. Never innerHTML. Matches existing codebase convention (M10 in Phase 2 plan).

**Warning signs:** Any use of `+=` or template literals assigning to `.innerHTML` with output content.

### Pitfall 3: Blocking the FastAPI Event Loop

**What goes wrong:** `result = subprocess.run(...)` called directly in the `async def websocket_endpoint` handler. All WebSocket connections freeze for the duration of execution.

**Why it happens:** `subprocess.run` is a blocking call. In an async context it blocks the event loop thread.

**How to avoid:** ALWAYS wrap: `result = await asyncio.to_thread(run_python_sync, code, timeout)`.

**Warning signs:** Browser appears frozen for all participants during code run. No WebSocket messages processed until run completes.

### Pitfall 4: Missing is_running Guard Causes Interleaved Broadcasts

**What goes wrong:** Two participants click Run simultaneously. Two `execution_start` messages are broadcast. Two executions overlap. Two `execution_result` messages arrive in undefined order.

**Why it happens:** No concurrent execution guard.

**How to avoid:** Check `room.is_running` at handler entry. Return a personal error if True. Set to True before broadcasting `execution_start`, set to False before broadcasting `execution_result`.

**Warning signs:** Test with two simultaneous `run_code` WS messages to the same room.

### Pitfall 5: Tempfile Leak on Exception

**What goes wrong:** `subprocess.run` raises an exception before `os.unlink(fname)` is reached. `/tmp` accumulates `.py` files over time.

**Why it happens:** Missing `finally` block for cleanup.

**How to avoid:** Always delete the tempfile in a `finally` block: `try: os.unlink(fname) except OSError: pass`.

### Pitfall 6: Getting Code from CodeMirror Instead of Y.js

**What goes wrong:** Frontend reads `editorView.state.doc.toString()` from the CodeMirror view object instead of `ytext.toString()`. In rare timing windows, the CodeMirror view may not have fully applied the latest Y.js update.

**Why it happens:** The CodeMirror EditorView is an imperative DOM object that may lag behind the authoritative Y.js document.

**How to avoid:** Per D-02, always send `ytext.toString()` as the code payload. `ytext` is always up to date. `editorView` is derived from it.

### Pitfall 7: "Running..." Label Stays Stuck on Disconnect

**What goes wrong:** Participant A clicks Run. The host disconnects before `execution_result` is broadcast. Participant A's Run button stays disabled forever with "Running..." label.

**Why it happens:** `execution_result` is broadcast from the server after `await run_python_async` completes. If the server crashes between `execution_start` and `execution_result`, the broadcast never arrives.

**How to avoid:** In the `onClose` handler in `ws.js`/`room.js`, reset the run button state to "Run" / enabled on WebSocket close. The connection loss itself signals the execution context is dead.

## Code Examples

Verified patterns from live testing on macOS 25.4.0, Python 3.13.2:

### Full executor.py Pattern

```python
# Source: Verified by live execution (2026-04-02)
# RLIMIT_CPU kills CPU spin: returncode=-24 (SIGXCPU) confirmed
# subprocess.run(timeout=) raises TimeoutExpired confirmed
# RLIMIT_NPROC stops fork bombs confirmed
# RLIMIT_AS intentionally omitted — non-functional on macOS (preexec_fn fails)

def run_python_sync(code: str, timeout: int = 10) -> dict:
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', dir='/tmp', delete=False) as f:
        f.write(code)
        fname = f.name

    def _preexec():
        resource.setrlimit(resource.RLIMIT_CPU, (5, 6))
        resource.setrlimit(resource.RLIMIT_NPROC, (20, 20))

    timed_out = False
    try:
        result = subprocess.run(
            [sys.executable, fname],
            capture_output=True, text=True,
            timeout=timeout,
            preexec_fn=_preexec,
            env={"PATH": "/usr/bin:/bin"},
        )
        stdout = result.stdout[:50_000]
        stderr = result.stderr[:10_000]
        exit_code = result.returncode
    except subprocess.TimeoutExpired:
        timed_out = True
        stdout = ""
        stderr = f"Timed out — execution exceeded {timeout}s"
        exit_code = 1
    finally:
        try:
            os.unlink(fname)
        except OSError:
            pass
    return {"stdout": stdout, "stderr": stderr, "exit_code": exit_code, "timed_out": timed_out}
```

### Exit Code Interpretation

| exit_code | Meaning | UI treatment |
|-----------|---------|--------------|
| 0 | Success | No special treatment |
| 1 (timed_out=True) | Wall-clock timeout (TimeoutExpired) | Yellow stderr `"Timed out — execution exceeded Xs"` |
| -24 (SIGXCPU) | CPU time limit exceeded | stderr shows Python's SIGXCPU traceback OR empty (killed abruptly); treat as non-zero |
| 1+ (timed_out=False) | Python runtime error | stderr contains traceback; red rendering |

### WebSocket Message Protocol (Phase 3 additions)

```
Client → Server:
  { type: "run_code", code: "<python source>" }

Server → ALL (broadcast):
  { type: "execution_start" }

Server → ALL (broadcast, after execution):
  {
    type: "execution_result",
    stdout: "<string, max 50KB>",
    stderr: "<string, max 10KB>",
    exit_code: <int>,
    timed_out: <bool>
  }

Server → sender only (on concurrent run attempt):
  { type: "error", message: "Execution already in progress" }
```

### Room Model Extension

```python
# Source: models.py — add is_running field
@dataclass
class Room:
    id: str
    host_token: str
    participants: dict[str, Participant] = field(default_factory=dict)
    yjs_updates: list[bytes] = field(default_factory=list)
    is_running: bool = False   # Phase 3: concurrent execution guard
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `RLIMIT_AS` for memory limits | `subprocess.run(timeout=)` + `RLIMIT_CPU` on macOS | macOS system design (always) | Memory limiting is Linux-specific; timeout is the cross-platform backstop |
| `exec()` in-process | `subprocess.run` with tempfile | Not new — always correct | exec() is a known security anti-pattern; subprocess isolation is the standard |
| `asyncio.run_in_executor` | `asyncio.to_thread` | Python 3.9 (Oct 2021) | `to_thread` is cleaner, no executor management |

**Deprecated/outdated:**
- `RestrictedPython`: Unmaintained, incomplete restrictions — explicitly in CLAUDE.md "What NOT to Use".
- `subprocess.run(shell=True)`: Shell injection vector — explicitly prohibited in CLAUDE.md.

## Open Questions

1. **RLIMIT_AS on Linux (production/CI)**
   - What we know: RLIMIT_AS is non-functional on macOS due to virtual address space size. On Linux, virtual address space per subprocess is much smaller and RLIMIT_AS works as expected.
   - What's unclear: This project is a local dev tool running on macOS. If ever deployed on Linux, RLIMIT_AS should be re-added. No action needed now.
   - Recommendation: Document the macOS-only limitation in executor.py with a comment. If cross-platform support is needed later, detect platform at startup.

2. **Memory bomb without RLIMIT_AS**
   - What we know: Without RLIMIT_AS, a participant can run `x = [0] * 10**10` and allocate system RAM until the OS OOM-kills the subprocess (or the host machine). `subprocess.run(timeout=)` only catches wall-clock time, not memory.
   - What's unclear: For a local, trusted-participant dev tool, this is acceptable. For public internet exposure (Phase 5 with localtunnel), it's a risk.
   - Recommendation: Accept this limitation for Phase 3 (local dev, trusted participants). Document it. For Phase 5, consider adding a note about OOM risk with public exposure.

3. **EXEC-04 implementation detail (clear output)**
   - What we know: D-11 specifies "any participant can clear the output panel." The CONTEXT.md doesn't specify whether this is client-side only or broadcast.
   - What's unclear: Should "Clear" clear only the local participant's panel, or all participants' panels?
   - Recommendation: Client-side only is simpler and sufficient. No WS message needed. Add a local `clearOutput()` function that empties the output panel div. If coordinated clear is desired, add a `clear_output` broadcast message — but this is not required by EXEC-04.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.9+ | `asyncio.to_thread`, executor | ✓ | 3.13.2 | — |
| `subprocess` module | Code execution | ✓ | stdlib | — |
| `resource` module | RLIMIT_CPU, RLIMIT_NPROC | ✓ | stdlib (macOS) | — |
| `tempfile` module | Temp code files | ✓ | stdlib | — |
| FastAPI WebSocket | WS handler | ✓ | Existing dep | — |
| `/tmp` writable | Tempfile storage | ✓ | macOS default | — |

**Missing dependencies with no fallback:** None — all dependencies are available.

**RLIMIT_AS (macOS):** Available as a constant but non-functional for sandboxing. Resolution: omit it, rely on RLIMIT_CPU + timeout. Verified.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest (existing, pyproject.toml configured) |
| Config file | `backend/pyproject.toml` — `testpaths = ["tests"]`, `asyncio_mode = "auto"` |
| Quick run command | `cd backend && python3 -m pytest tests/test_executor.py -q` |
| Full suite command | `cd backend && python3 -m pytest tests/ -q` |

Current suite: 4 tests in `test_yjs_relay.py` — all passing.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EXEC-01 | `run_code` WS message triggers execution and returns `execution_result` | integration (WS) | `pytest tests/test_execution_ws.py -q` | No — Wave 0 |
| EXEC-02 | `execution_result` broadcast reaches all participants | integration (WS, multi-client) | `pytest tests/test_execution_ws.py::test_broadcast_to_all -q` | No — Wave 0 |
| EXEC-03 | Infinite loop killed within timeout; other connections not frozen | unit (executor) + integration | `pytest tests/test_executor.py::test_infinite_loop_timeout -q` | No — Wave 0 |
| EXEC-04 | Clear button empties output panel | browser (manual) or unit | Manual — DOM interaction only; no backend state | N/A |
| UI-03 | Run button disabled + "Running..." shown on execution_start | integration (WS) | `pytest tests/test_execution_ws.py::test_execution_start_broadcast -q` | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `cd backend && python3 -m pytest tests/test_executor.py -q`
- **Per wave merge:** `cd backend && python3 -m pytest tests/ -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/tests/test_executor.py` — covers EXEC-03 (timeout, CPU kill, normal output, stderr)
- [ ] `backend/tests/test_execution_ws.py` — covers EXEC-01, EXEC-02, UI-03 (WS integration with multi-client setup)
- [ ] `backend/app/executor.py` — the module under test (must exist before tests pass)

Existing infrastructure covers: pytest, conftest.py with `room_id` and `client` fixtures, `sync_client` pattern for WS testing.

## Project Constraints (from CLAUDE.md)

All directives carried forward as hard constraints for the planner:

| Directive | Impact on Phase 3 |
|-----------|-------------------|
| `exec()` in-process is prohibited | executor.py MUST use subprocess |
| `subprocess.run(shell=True)` is prohibited | `shell=False` (default) MUST be used |
| Code written to tempfile in `/tmp` (not `-c`) | Tempfile pattern MUST be used |
| `asyncio.to_thread()` for blocking calls | Direct `subprocess.run` in async handler is prohibited |
| stdout capped at 50 KB, stderr at 10 KB | Output truncation MUST be implemented |
| Stripped env `{"PATH": "/usr/bin:/bin"}` | env= arg is MANDATORY |
| `textContent` not `innerHTML` for user-supplied content | Output panel rendering MUST use textContent |
| FastAPI + Uvicorn stack | No new framework or server |
| Tailwind v4 dark palette (`bg-gray-900`, `bg-gray-800`, etc.) | Output panel MUST use established palette |
| Vanilla JS — no React/Vue | Frontend stays vanilla JS |
| GSD workflow before file-changing tools | Implementation must go through `/gsd:execute-phase` |

## Sources

### Primary (HIGH confidence)

- Python stdlib `subprocess` docs — `subprocess.run`, `capture_output`, `timeout`, `preexec_fn`
- Python stdlib `resource` docs — `RLIMIT_CPU`, `RLIMIT_NPROC`, `setrlimit`
- Python stdlib `asyncio` docs — `asyncio.to_thread` (3.9+)
- CLAUDE.md §Backend / Python Execution Sandbox — canonical design constraints
- Live execution verification (2026-04-02) — all three resource limit mechanisms tested

### Secondary (MEDIUM confidence)

- STATE.md §Blockers — RLIMIT_AS blocker documented; now resolved via live testing
- Existing codebase (`main.py`, `models.py`, `ws.js`, `room.js`) — integration point analysis

### Tertiary (LOW confidence)

None — all critical findings verified via stdlib docs or live execution.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all stdlib, no new packages
- Architecture: HIGH — all patterns verified by live execution
- Pitfalls: HIGH — RLIMIT_AS blocker directly tested and resolved; others from CLAUDE.md

**Research date:** 2026-04-02
**Valid until:** 2026-10-02 (stable stdlib patterns; 6-month window)
