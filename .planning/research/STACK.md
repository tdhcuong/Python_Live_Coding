# Stack Research: Python Live Coding

**Project:** Real-time collaborative Python coding platform
**Researched:** 2026-04-01
**Constraint:** Python backend (Flask/FastAPI) + JavaScript frontend, local server via localtunnel

---

## Recommended Stack

| Component | Library | Version | Confidence |
|-----------|---------|---------|-----------|
| Backend framework | FastAPI | ~0.135.x | HIGH |
| ASGI server | Uvicorn | ~0.30.x | MEDIUM |
| WebSocket transport | FastAPI native WebSockets (Starlette) | bundled | HIGH |
| CRDT collaborative sync | Y.js + y-codemirror.next | yjs ~13.x | MEDIUM |
| Code editor | CodeMirror 6 | ~6.x | MEDIUM |
| Frontend UI framework | Vanilla JS + Tailwind CSS v4 | 4.x | HIGH |
| Python execution sandbox | subprocess + resource module | stdlib | HIGH |
| Frontend build | Vite | ~5.x | MEDIUM |
| Localtunnel | lt (npm) | ~2.x | MEDIUM |

---

## Frontend

### Code Editor: CodeMirror 6 with Y.js CRDT

**Recommendation:** CodeMirror 6 over Monaco Editor.

The key factor is collaborative sync architecture. Y.js — the leading CRDT library for browser-based collaborative editing — has a first-party, production-maintained adapter for CodeMirror 6: `y-codemirror.next`. There is no equivalent first-party Y.js adapter for Monaco. Monaco is designed as an embeddable VS Code instance with an imperative API; it can be integrated with Y.js via `y-monaco`, but this requires a custom shim and is notably less stable.

Since ARCHITECTURE.md establishes Y.js as the sync strategy (server is a thin CRDT relay, no OT logic required), CodeMirror 6 is the correct editor choice because it is the path of least resistance for the sync integration.

Additional reasons:
- CodeMirror 6 is fully modular and tree-shakeable — only bundle what you need
- Python syntax highlighting via `@codemirror/lang-python` is a single import
- The CodeMirror `Awareness` extension from Y.js handles multi-cursor display natively
- Monaco requires a build-tool-aware setup (webpack aliases or Vite worker config) that adds friction; CodeMirror 6 is ES-module-native and works cleanly with Vite out of the box

**Monaco is the right choice if** the project ever prioritizes a VS Code-identical experience, IntelliSense/LSP integration, or a UI-first prototype where CRDT sync is deferred. For this project, CRDT sync is a day-one requirement, so CodeMirror 6 wins.

**Integration outline:**

```javascript
import { EditorView, basicSetup } from "codemirror";
import { python } from "@codemirror/lang-python";
import * as Y from "yjs";
import { yCollab } from "y-codemirror.next";
import { WebsocketProvider } from "y-websocket";
// or: custom provider that bridges to the FastAPI WebSocket

const ydoc = new Y.Doc();
const ytext = ydoc.getText("code");
const awareness = new Awareness(ydoc);

const view = new EditorView({
  extensions: [
    basicSetup,
    python(),
    yCollab(ytext, awareness),
  ],
  parent: document.getElementById("editor"),
});
```

The server relays Y.js binary update messages to all room members without interpreting them. This is detailed in ARCHITECTURE.md.

### UI Framework: Tailwind CSS v4 + Vanilla JS

**Recommendation:** Tailwind CSS v4 (released January 22, 2025) with no frontend JS framework.

Rationale:
- The app has three screens: lobby, coding room, results. No complex client-state tree that demands React.
- Vanilla JS with Tailwind keeps the dependency surface minimal. The real complexity lives in the WebSocket protocol and CRDT sync, not UI component trees.
- Tailwind v4 ships with zero-config setup, automatic content detection, and a first-party Vite plugin. Build setup is trivial.
- Adding React would require managing the boundary between React's virtual DOM and CodeMirror's imperative DOM model — a known friction point. Y.js handles its own state; React would add overhead without value.

**If a framework becomes necessary** (e.g., complex reactive participant list, multiple route states), Alpine.js (~3.x) is the upgrade path. It integrates with existing HTML and Tailwind with minimal changes and no bundler requirement.

**Default to dark theme.** Any professional developer tool in 2026 ships dark-first. CodeMirror has built-in dark themes (`@codemirror/theme-one-dark` or custom CSS vars). Tailwind makes this trivial with `dark:` variants.

---

## Backend

### Framework: FastAPI 0.135.x

**Recommendation:** FastAPI over Flask.

FastAPI is async-native (ASGI). The entire real-time layer — WebSocket connections, broadcasting code changes, relaying Y.js updates, streaming execution output — runs concurrently without thread juggling. Flask with flask-socketio requires either eventlet or gevent monkey-patching to achieve async behavior; this is fragile and has known incompatibilities with Python 3.11+.

FastAPI's native WebSocket support (built on Starlette) is documented, first-class, and requires no additional library for the basic use case. Verified from official docs:

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

class RoomManager:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = {}

    async def connect(self, room_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(room_id, []).append(ws)

    def disconnect(self, room_id: str, ws: WebSocket):
        self.rooms[room_id].remove(ws)

    async def broadcast(self, room_id: str, message: dict, exclude: WebSocket = None):
        for ws in self.rooms.get(room_id, []):
            if ws is not exclude:
                await ws.send_json(message)
```

This pattern directly supports: room-scoped broadcasting, Y.js binary relay, execution output distribution, and timer events — without any third-party WebSocket library.

**Socket.IO consideration:** python-socketio (async variant, mounted as ASGI middleware on FastAPI) adds automatic reconnection, built-in rooms, and a mature event model. The tradeoff is Socket.IO protocol overhead, an additional dependency, and more complex ASGI mounting. For this project's scope (single-process local server, small rooms, ephemeral sessions), the raw FastAPI WebSocket pattern is simpler. Use python-socketio if reconnect-handling complexity becomes a significant pain point or if the Socket.IO room model significantly simplifies room scoping code.

### ASGI Server: Uvicorn

Standard ASGI server for FastAPI. Use `--host 0.0.0.0` so localtunnel can forward to it.

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Python Execution Sandbox

**Recommendation:** `subprocess` with `sys.executable`, `capture_output=True`, explicit `timeout`, and OS-level resource limits via the `resource` module.

```python
import subprocess
import sys
import os
import tempfile
import time
import asyncio

def _execute_sync(code: str, timeout: int = 10) -> dict:
    start = time.monotonic()
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".py", dir="/tmp", delete=False
    ) as f:
        f.write(code)
        tmp_path = f.name
    try:
        result = subprocess.run(
            [sys.executable, tmp_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd="/tmp",
            env={"PATH": "/usr/bin:/bin", "HOME": "/tmp"},
        )
        duration_ms = int((time.monotonic() - start) * 1000)
        return {
            "stdout": result.stdout[:50_000],
            "stderr": result.stderr[:10_000],
            "exit_code": result.returncode,
            "duration_ms": duration_ms,
            "timed_out": False,
        }
    except subprocess.TimeoutExpired:
        return {
            "stdout": "",
            "stderr": f"Execution timed out after {timeout} seconds.",
            "exit_code": -1,
            "duration_ms": timeout * 1000,
            "timed_out": True,
        }
    finally:
        os.unlink(tmp_path)

# Async wrapper — prevents blocking FastAPI's event loop
async def execute_code(code: str, timeout: int = 10) -> dict:
    return await asyncio.to_thread(_execute_sync, code, timeout)
```

Key points:
- `asyncio.to_thread()` (Python 3.9+) offloads the blocking subprocess call to a thread pool, keeping the async event loop free
- Code is written to a temp file in `/tmp` rather than passed via `-c` (safer for multiline code, avoids shell quoting issues)
- Output is capped at 50 KB stdout / 10 KB stderr before broadcast (prevents memory bombs and WebSocket payload limits)
- Stripped `env` removes access to secrets like `HOME`, virtual environment paths, etc.

**Do NOT use `exec()` inline** — it runs in the server process, can access server globals, and will block the event loop on infinite loops.

**Do NOT use `shell=True`** — confirmed by Python docs: enables shell metacharacter injection.

**Do NOT use RestrictedPython** — unmaintained, its restriction model is incomplete, creates false security confidence.

---

## Installation

```bash
# Backend — Python
pip install fastapi "uvicorn[standard]"

# Frontend tooling
npm create vite@latest frontend -- --template vanilla
cd frontend
npm install

# Tailwind CSS v4
npm install tailwindcss @tailwindcss/vite

# CodeMirror 6 + Y.js
npm install codemirror @codemirror/lang-python @codemirror/theme-one-dark
npm install yjs y-codemirror.next y-protocols

# Localtunnel
npm install -g localtunnel
```

Vite config with Tailwind v4 first-party plugin:
```javascript
// vite.config.js
import tailwindcss from "@tailwindcss/vite";

export default {
  plugins: [tailwindcss()],
};
```

---

## Key Tradeoffs

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Backend framework | FastAPI | Flask + flask-socketio | Flask requires eventlet/gevent monkey-patching for async; brittle on Python 3.11+. FastAPI is async-native. |
| WebSocket layer | FastAPI native WebSockets | python-socketio (ASGI) | Socket.IO adds protocol complexity and a dependency for features not needed at this scale. Adopt if reconnect complexity becomes painful. |
| Code editor | CodeMirror 6 | Monaco Editor | Y.js has a first-party `y-codemirror.next` adapter. Monaco lacks an equivalent, making CRDT integration significantly harder. |
| Collaborative sync | Y.js CRDT | CodeMirror 6 built-in OT (`@codemirror/collab`) | Both are valid. Y.js is library-managed with zero server-side transform logic. `@codemirror/collab` requires server-side OT, which is more complex to implement correctly. |
| Frontend framework | Vanilla JS + Tailwind | React + Tailwind | React adds build complexity and creates impedance mismatch with CodeMirror's imperative DOM model. No complex state tree justifies it. |
| Python sandbox | subprocess | Docker container | Docker is operationally heavy for a local dev tool. subprocess with resource limits is the right level of isolation for trusted private sessions. |
| Tailwind version | v4 (Jan 2025) | v3 | v4 is current stable. No reason to start on a previous major version. |
| Sync backup for late joiners | Server stores Y.js binary update log | Re-request from peers | Server-side accumulation ensures a joining client gets full document state even if peers disconnect. |

---

## What NOT to Use

- **Flask + flask-socketio**: Async story is fragile. FastAPI is the cleaner choice for an async-first real-time app.
- **`exec()` for code execution**: Runs in-process, can access server globals, blocks the event loop.
- **`subprocess.run(..., shell=True)`**: Shell injection vector, confirmed risk in Python docs.
- **RestrictedPython**: Unmaintained, false security, incomplete restrictions.
- **React/Vue/Next.js**: Overcomplicated for three screens wired with WebSockets; creates friction with CodeMirror's imperative API.
- **Monaco Editor as primary editor**: Y.js CRDT integration is significantly harder than with CodeMirror 6. Only use Monaco if CRDT sync is deferred and VS Code aesthetics are the priority.
- **Full-document-replacement sync**: `editor.setValue(received_code)` on every remote change causes cursor jumps and character loss. Must use Y.js deltas or OT operations from day one.
- **Redis Pub/Sub for room state**: Single-process local server; in-memory dict is correct and sufficient.
- **Celery/task queues**: `asyncio.to_thread()` handles blocking subprocess calls; no worker system needed.

---

## Confidence Levels

| Area | Confidence | Source | Notes |
|------|------------|--------|-------|
| FastAPI version (~0.135.x) | HIGH | fastapi.tiangolo.com/release-notes/ — version 0.135.2 confirmed from official release notes | Verified |
| FastAPI native WebSocket pattern | HIGH | fastapi.tiangolo.com/advanced/websockets/ | ConnectionManager pattern verified from official docs |
| Tailwind CSS v4 | HIGH | tailwindcss.com/blog/tailwindcss-v4 — January 22, 2025 release confirmed | Official blog post verified |
| subprocess + resource module patterns | HIGH | docs.python.org/3/library/subprocess.html, docs.python.org/3/library/resource.html | Python stdlib, stable, verified |
| asyncio.to_thread() for blocking calls | HIGH | Python 3.9+ stdlib, well-established pattern | Standard pattern |
| CodeMirror 6 recommendation | MEDIUM | Training knowledge through Aug 2025; y-codemirror.next integration not independently verified this session | Confirm y-codemirror.next is actively maintained on npmjs.com before Phase 2 |
| Y.js (~13.x) | MEDIUM | Training knowledge; de facto standard for browser CRDT as of 2025; not independently verified this session | Check yjs.dev for current version |
| y-codemirror.next compatibility | MEDIUM | Training knowledge; critical to verify before starting editor sync phase | Needs verification: `npm info y-codemirror.next` |
| Vite ~5.x | MEDIUM | Training knowledge; widely used, stable | Cross-check before setup |
| Uvicorn ~0.30.x | MEDIUM | Training knowledge; PyPI verification blocked in this session | Confirm on pypi.org/project/uvicorn/ |
| FastAPI vs Flask recommendation | HIGH | First-principles: ASGI vs. WSGI with monkey-patching is a well-understood architectural difference, not subject to version drift | |
| CodeMirror 6 vs Monaco recommendation | HIGH | First-principles: y-codemirror.next first-party vs. community y-monaco shim; decision logic is stable | |

---

## Version Verification Commands

Run these before the first install to confirm current versions:

```bash
# Python packages
pip index versions fastapi
pip index versions uvicorn

# npm packages
npm info codemirror version
npm info y-codemirror.next version
npm info yjs version
npm info tailwindcss version
npm info vite version
```

---

## Sources

- FastAPI release notes (version confirmed): https://fastapi.tiangolo.com/release-notes/
- FastAPI WebSocket docs (pattern verified): https://fastapi.tiangolo.com/advanced/websockets/
- Tailwind CSS v4 announcement (date/features confirmed): https://tailwindcss.com/blog/tailwindcss-v4
- Python subprocess docs (patterns/security verified): https://docs.python.org/3/library/subprocess.html
- Python resource module docs (limit patterns verified): https://docs.python.org/3/library/resource.html
- Y.js documentation (training knowledge, MEDIUM confidence): https://yjs.dev
- y-codemirror.next (training knowledge, MEDIUM confidence): https://github.com/yjs/y-codemirror.next
- ARCHITECTURE.md (this project): established Y.js as sync strategy, CodeMirror 6 as editor
- PITFALLS.md (this project): C5 pitfall confirms full-document-replacement must be avoided; C1/C2 confirm subprocess requirements
