<!-- GSD:project-start source:PROJECT.md -->
## Project

**Python Live Coding**

A real-time collaborative Python coding platform where a host creates a room, sets a problem, and multiple participants join to code together in a shared editor. Anyone can run the Python code and the output is visible to all participants simultaneously. The platform is designed to be elegant, beautiful, and professional — exposed to the internet via localtunnel.

**Core Value:** Multiple people can join a session, edit the same code together in real time, run Python, and see the output — all in a polished, professional UI.

### Constraints

- **Tech stack**: Python backend (Flask/FastAPI) + JavaScript frontend
- **Runtime**: Local server exposed via localtunnel
- **Python execution**: Server-side sandbox with stdout/stderr capture
- **Real-time**: WebSocket-based for editor sync and output broadcast
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

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
## Frontend
### Code Editor: CodeMirror 6 with Y.js CRDT
- CodeMirror 6 is fully modular and tree-shakeable — only bundle what you need
- Python syntax highlighting via `@codemirror/lang-python` is a single import
- The CodeMirror `Awareness` extension from Y.js handles multi-cursor display natively
- Monaco requires a build-tool-aware setup (webpack aliases or Vite worker config) that adds friction; CodeMirror 6 is ES-module-native and works cleanly with Vite out of the box
### UI Framework: Tailwind CSS v4 + Vanilla JS
- The app has three screens: lobby, coding room, results. No complex client-state tree that demands React.
- Vanilla JS with Tailwind keeps the dependency surface minimal. The real complexity lives in the WebSocket protocol and CRDT sync, not UI component trees.
- Tailwind v4 ships with zero-config setup, automatic content detection, and a first-party Vite plugin. Build setup is trivial.
- Adding React would require managing the boundary between React's virtual DOM and CodeMirror's imperative DOM model — a known friction point. Y.js handles its own state; React would add overhead without value.
## Backend
### Framework: FastAPI 0.135.x
### ASGI Server: Uvicorn
### Python Execution Sandbox
# Async wrapper — prevents blocking FastAPI's event loop
- `asyncio.to_thread()` (Python 3.9+) offloads the blocking subprocess call to a thread pool, keeping the async event loop free
- Code is written to a temp file in `/tmp` rather than passed via `-c` (safer for multiline code, avoids shell quoting issues)
- Output is capped at 50 KB stdout / 10 KB stderr before broadcast (prevents memory bombs and WebSocket payload limits)
- Stripped `env` removes access to secrets like `HOME`, virtual environment paths, etc.
## Installation
# Backend — Python
# Frontend tooling
# Tailwind CSS v4
# CodeMirror 6 + Y.js
# Localtunnel
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
## Version Verification Commands
# Python packages
# npm packages
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
