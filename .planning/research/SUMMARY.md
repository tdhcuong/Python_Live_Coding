# Project Research Summary

**Project:** Python Live Coding
**Domain:** Real-time collaborative coding platform (ephemeral, small-group, Python-focused)
**Researched:** 2026-04-01
**Confidence:** MEDIUM-HIGH

---

## Executive Summary

This is an ephemeral, real-time collaborative Python coding platform designed for small private sessions (pair programming, technical interviews, or live practice). The expert approach is well-established: a thin Python WebSocket server acts as a relay, never owning sync logic; the browser editor handles document state via a CRDT library; and code execution runs in isolated subprocesses with hard OS-level resource limits. All four research files converge on the same architecture — FastAPI + Y.js + CodeMirror 6 + subprocess sandbox — with unusually strong consensus across stack, features, architecture, and pitfalls.

The recommended approach is to build in strict dependency order: room infrastructure first, collaborative editor second, code execution third, host controls fourth, polish last. Every table-stakes feature (shared editor, live output, participant presence, timer, problem panel) depends on a correct WebSocket room layer, which in turn depends on nothing. The two most time-consuming phases are the collaborative editor sync (CRDT integration with CodeMirror 6 and Y.js) and the execution sandbox (getting resource limits, async offloading, and output safety right simultaneously). Both must be built correctly from day one — neither tolerates a "fix it later" retrofit.

The key risk is security: because the server is exposed via localtunnel to the public internet, unrestricted code execution is a host-takeover vector, not a theoretical concern. The subprocess sandbox with `preexec_fn` resource limits (RLIMIT_CPU, RLIMIT_AS, RLIMIT_NPROC) and no `shell=True` must be in place before any run-code feature goes live. The secondary architectural risk is using full-document replacement instead of CRDT for editor sync — this pattern breaks with two simultaneous typists and requires a complete rewrite of the sync layer to fix, making it a must-avoid from day one rather than a future refactor.

---

## Key Findings

### Recommended Stack

FastAPI (async-native, ASGI) is the clear backend choice over Flask. Flask with flask-socketio requires eventlet/gevent monkey-patching that is brittle on Python 3.11+; FastAPI's native WebSocket support handles room broadcasting, Y.js binary relay, execution output distribution, and timer events without any third-party library. Uvicorn serves the ASGI app and must bind to `0.0.0.0` for localtunnel to reach it.

On the frontend, CodeMirror 6 is chosen over Monaco specifically because Y.js has a first-party, actively maintained adapter (`y-codemirror.next`) for CodeMirror 6 and no equivalent for Monaco. This is a load-bearing decision: CRDT sync is a day-one requirement, and the wrong editor choice means building a custom unstable shim. Vanilla JS + Tailwind CSS v4 keeps the dependency surface minimal and avoids the React/CodeMirror impedance mismatch (React's virtual DOM conflicts with CodeMirror's imperative DOM model).

**Core technologies:**
- **FastAPI ~0.135.x**: WebSocket server and HTTP API — async-native, no monkey-patching, native WebSocket support (HIGH confidence)
- **Uvicorn ~0.30.x**: ASGI server — standard pairing with FastAPI, must bind `0.0.0.0` (MEDIUM confidence)
- **CodeMirror 6**: browser code editor — chosen for first-party Y.js integration via `y-codemirror.next` (HIGH rationale, MEDIUM version)
- **Y.js ~13.x + y-codemirror.next**: CRDT collaborative sync — server becomes a thin relay with zero transform logic (MEDIUM confidence)
- **Tailwind CSS v4**: UI styling — zero-config, first-party Vite plugin, dark theme via CSS vars (HIGH confidence)
- **Vite ~5.x**: frontend build — ES-module-native, works cleanly with CodeMirror 6 (MEDIUM confidence)
- **subprocess + resource module**: Python execution sandbox — stdlib, no Docker required for this use case (HIGH confidence)
- **localtunnel (lt ~2.x)**: public URL for local server — always use `--subdomain` flag (MEDIUM confidence)

Run version verification commands before first install: `npm info yjs version`, `npm info y-codemirror.next version`, `pip index versions fastapi`.

### Expected Features

All research agrees on a tight MVP scope. The product is designed for ephemeral, anonymous, single-problem sessions. Every auth/persistence/multi-file feature is explicitly an anti-feature that adds complexity for zero user value in this context. The room link IS the access control; unguessable room IDs (UUID) serve as the credential.

**Must have (table stakes):**
- Shareable room link (UUID-based, no login required) — the session entry point
- Real-time shared code editor with multi-cursor — core value prop; keystroke lag >200ms feels broken
- Python syntax highlighting — absence is jarring; `@codemirror/lang-python` is one import
- Run button with execution output panel (stdout/stderr, all participants see it simultaneously)
- Participant presence list with colored cursors — visual proof that collaboration is live
- Countdown timer visible to all participants, correctly synced for late joiners
- Problem/prompt display panel (host sets it, all participants see it)
- Host role distinction (controls gated behind opaque token in URL)
- Connection status indicator and graceful reconnection with state replay

**Should have (differentiators, low effort):**
- "Running..." loading state with disabled Run button during execution
- Keyboard shortcut Ctrl+Enter / Cmd+Enter for run
- Timer urgency color transitions (CSS only, no server change)
- Participant join/leave toast notifications
- Execution time display (duration_ms already captured by sandbox)
- Copy room link button

**Defer to v2+:**
- Execution history / output scrollback
- Mobile-responsive layout (CSS-only, non-blocking for v1)
- Video/audio, chat, file tree, authentication, persistence, multi-file — all explicitly anti-features for this use case

### Architecture Approach

The server is intentionally thin: it owns room lifecycle (create, join, leave), relays Y.js binary update messages without interpreting them, fires off subprocess execution in an async thread pool, and broadcasts results to the room. It never implements OT transform logic and never persists state beyond the process lifetime. All collaborative sync intelligence lives in Y.js running in the browser. The entire system is single-process, in-memory, and explicitly designed not to scale beyond that — which is correct for a localhost tool exposed via localtunnel.

**Major components:**
1. **WebSocket Server (FastAPI)** — routes events to handlers, scopes all broadcasts to rooms, owns room lifecycle; does NOT interpret CRDT updates
2. **Room State Store (in-memory dict)** — source of truth for Y.js state vector, problem text, timer anchor, participant list; ephemeral by design, no DB
3. **Python Execution Service** — spawns subprocess in thread pool via `asyncio.to_thread()`, enforces resource limits via `preexec_fn`, caps output at 50KB/10KB, returns result to WebSocket server for broadcast
4. **Y.js CRDT layer (browser)** — owns collaborative merge; server is a pure relay for its binary update messages and Awareness protocol
5. **CodeMirror 6 (browser)** — renders editor, syntax highlights, surfaces multi-cursor positions from Y.js Awareness protocol

**Timer design (both ARCHITECTURE.md and PITFALLS.md agree):** Server broadcasts `{ duration_seconds, started_at: unix_timestamp }` once. Each client counts down independently from `(started_at + duration) - now`. No server tick loop required; acceptable drift <1 second.

### Critical Pitfalls

The research identified 7 critical pitfalls and 10 common mistakes. The five with the highest impact:

1. **Unrestricted code execution / host takeover (C1)** — localtunnel makes the server reachable by anyone with the link; `import os; os.system("rm -rf /")` is a realistic attack, not theoretical. Prevention: subprocess isolation + `preexec_fn` with RLIMIT_CPU, RLIMIT_AS, RLIMIT_NOFILE, RLIMIT_NPROC + no `shell=True` + stripped env + temp file instead of `-c`. Must be in place before any public URL is shared.

2. **Full-document editor replacement instead of CRDT (C5)** — `editor.setValue(received_code)` on every remote change breaks with two simultaneous typists: characters are dropped, cursor jumps, last-writer-wins. Cannot be retrofitted — requires rewriting the entire sync layer. Prevention: Y.js CRDT from day one.

3. **Infinite loop / fork bomb freezes the entire server (C2)** — `while True: pass` without a timeout blocks the event loop and kills all rooms, not just the offending one. Prevention: `timeout=` on subprocess.run() + RLIMIT_CPU + RLIMIT_NPROC + `asyncio.to_thread()` to keep the event loop free.

4. **Output flood crashes server and browser (C3)** — `print("x" * 10_000_000)` fills subprocess PIPE buffer, OOMs the server, and exceeds WebSocket message limits (~1MB default). Prevention: cap stdout at 50KB and stderr at 10KB before broadcast, truncate with a visible `[Output truncated]` message.

5. **localtunnel WebSocket falls back to HTTP polling (C7)** — localtunnel may silently degrade to long-polling, introducing 1–3 second latency that makes collaborative editing feel broken with no error shown. Prevention: force `transports: ['websocket']` on the client; test with `wscat` before any live session; consider ngrok as a more reliable alternative.

---

## Implications for Roadmap

The feature dependency graph from FEATURES.md and the build order from ARCHITECTURE.md are in tight agreement. The suggested phases below reflect strict dependency ordering — no phase should begin before the gate condition of the previous phase is met.

### Phase 1: WebSocket Room Infrastructure

**Rationale:** The absolute dependency root. Every other feature requires room-scoped WebSocket connections. Nothing else works without this.
**Delivers:** Room creation endpoint (`POST /room` returns UUID room_id), room join page, WebSocket server setup, in-memory room state store, core events (join_room / leave_room), participant tracking, room-scoped broadcast, connection status indicator, graceful disconnect messaging.
**Features addressed:** Shareable room link, participant presence list (foundation), connection status indicator.
**Pitfalls to avoid:** M1 (global broadcast — room-scoped emit from day one), M7 (dead connections — rely on disconnect events, not client-sent leave), M4 (state loss — graceful client-facing error on server restart).
**Gate:** Two browser tabs in the same room see each other's presence. Two tabs in different rooms receive no cross-room events.

### Phase 2: Collaborative Editor Sync

**Rationale:** Requires Phase 1's room infrastructure as its transport. Must use Y.js CRDT from day one — full-document replacement is not an acceptable temporary approach (C5 forces a complete rewrite if started wrong).
**Delivers:** CodeMirror 6 integration, Y.js CRDT binding via `y-codemirror.next`, server relay of binary Y.js update messages (no server-side transform logic), full Y.js state vector sent to late joiners on connect, multi-cursor awareness via Y.js Awareness protocol, Python syntax highlighting.
**Features addressed:** Real-time shared code editor, syntax highlighting, participant cursor/caret visibility.
**Stack elements used:** CodeMirror 6, Y.js, y-codemirror.next, y-protocols.
**Pitfalls to avoid:** C5 (full-document replacement — Y.js deltas only), M3 (late joiner sees empty editor — send accumulated Y.js state vector on join), M8 (editor CSS conflicts with Tailwind base layer — test immediately after CSS framework is added).
**Gate:** Two browser tabs show identical text; edits in one appear in the other with correct multi-cursor positions and no character drops.
**Research flag:** Verify `y-codemirror.next` is actively maintained (`npm info y-codemirror.next`) before starting. If abandoned, fall back to `@codemirror/collab` (built-in OT — shifts complexity server-side but is officially supported).

### Phase 3: Python Execution Sandbox

**Rationale:** Requires the collaborative editor (Phase 2) to have meaningful code to run. This is the highest-security-risk phase; the sandbox must be complete before any public URL is shared.
**Delivers:** subprocess execution service with `preexec_fn` resource limits (RLIMIT_CPU, RLIMIT_AS, RLIMIT_NPROC, RLIMIT_NOFILE), `asyncio.to_thread()` async offloading (keeps event loop free), output truncation (50KB stdout / 10KB stderr with visible truncation message), per-room execution lock (`room.executing` flag, cleared in `finally`), broadcast of execution results to all room participants, Run button UI with loading state and immediate disable-on-click, Ctrl+Enter / Cmd+Enter keyboard shortcut.
**Features addressed:** Run button, execution output panel (stdout + stderr visually distinct), "Running..." feedback, execution time display.
**Architecture component:** Python Execution Service.
**Pitfalls to avoid:** C1 (code injection — resource limits + no shell=True + stripped env), C2 (infinite loop — timeout + RLIMIT_CPU + asyncio.to_thread), C3 (output flood — 50KB cap before broadcast), C4 (concurrent runs — per-room executing flag with finally cleanup), M5 (stderr indistinguishable — separate capture, red color in UI), M6 (double-fire — disable button client-side immediately on click), M10 (XSS via output — always textContent not innerHTML).
**Gate:** Any participant clicks Run; Python code executes; stdout and stderr appear in all participants' output panels simultaneously within the timeout window.

### Phase 4: Host Controls

**Rationale:** Depends only on Phase 1 (room state store holds problem text and timer anchor), not on execution. Sequential after Phase 3 for simplicity; could parallel-track with Phases 2–3 if time pressure warrants.
**Delivers:** Host token verification (opaque token in URL query param, checked server-side on host-only events), problem/prompt panel (host sends `set_problem`; server stores in room state; broadcast to all; included in room state snapshot for late joiners), countdown timer (host sends `start_timer { duration_seconds }`; server stores `{ duration, started_at }`; client counts down from timestamp anchor), timer urgency color transitions (pure CSS, no server change).
**Features addressed:** Problem/prompt display area, countdown timer, host role distinction, timer urgency color transitions.
**Pitfalls to avoid:** M2 (timer wrong for late joiners — include `started_at` and `duration` in room state snapshot; client computes remaining time from anchor).
**Gate:** Host sets a problem description and starts a timer; a participant who joins after the timer starts sees both correctly with the correct time remaining.

### Phase 5: Polish and Reliability

**Rationale:** Final phase — all core features exist; this phase hardens reliability and completes the user experience. No new core features; everything is additive.
**Delivers:** Graceful reconnection (full room state replay on WebSocket reconnect), participant join/leave toast notifications, execution history (last N results stored in room state, sent in room state snapshot on join), copy room link button, dark theme finalization, localtunnel setup with fixed `--subdomain`, forced WebSocket transport (`transports: ['websocket']` on client), full session walkthrough testing on multiple devices and browsers.
**Features addressed:** Graceful reconnection, join/leave notifications, execution history, copy link button, dark mode finalization.
**Pitfalls to avoid:** C6 (localtunnel URL changes on restart — `--subdomain` flag), C7 (WebSocket polling fallback — force websocket transport, test with wscat), M9 (localtunnel interstitial — document for participants or evaluate ngrok).
**Gate:** Full session walkthrough with two or more participants on separate devices/browsers via the localtunnel URL, including a simulated reconnect, works correctly end-to-end.

### Phase Ordering Rationale

- **Infrastructure before features**: room-scoped WebSockets are the dependency root; building any feature before them means immediately rebuilding the transport layer.
- **CRDT before execution**: execution is meaningless without a shared document; the editor must be collaborative before users can usefully run code together as a group.
- **Sandbox correctness before public access**: localtunnel makes the server internet-accessible immediately; the execution sandbox is not a "v2 concern" — it gates public use of the tool.
- **Host features after execution**: the problem panel and timer enhance the session experience but are not on the critical path for the core collaboration loop.
- **Polish last**: reconnect hardening, toasts, and localtunnel configuration are worthless before the core session loop works end-to-end.

### Research Flags

Phases likely needing a verification spike before planning:
- **Phase 2 (Editor Sync):** `y-codemirror.next` maintenance status is the single highest-uncertainty dependency in the stack. Run `npm info y-codemirror.next` and check recent commits at https://github.com/yjs/y-codemirror.next before committing to this path. If unmaintained, the fallback path is `@codemirror/collab` (server-side OT, more complex but officially supported).
- **Phase 5 (localtunnel reliability):** WebSocket upgrade behavior over localtunnel cannot be verified without running the tunnel in the target environment. Test `wscat` against the live tunnel before planning the deployment phase. If unreliable, substitute ngrok.

Phases with well-documented standard patterns (no research-phase needed):
- **Phase 1 (WebSocket Infrastructure):** FastAPI WebSocket + ConnectionManager is a first-class example in official FastAPI docs. No ambiguity.
- **Phase 3 (Execution Sandbox):** Python subprocess + resource module is stdlib, confirmed from official Python docs. No external library uncertainty.
- **Phase 4 (Host Controls):** Timestamp-anchored client countdown and opaque-token host auth are standard, low-ambiguity patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | FastAPI, Tailwind v4, subprocess/resource patterns are HIGH (official docs verified). Y.js, y-codemirror.next, Uvicorn version numbers are MEDIUM (training knowledge through Aug 2025 — run verification commands before install). |
| Features | MEDIUM | Based on training knowledge of CoderPad, Replit, HackerRank, interviewing.io, CodePen through Aug 2025. Core table-stakes categorization is stable domain knowledge. Anti-feature list is strongly supported by explicit project constraints. |
| Architecture | MEDIUM-HIGH | Subprocess and WebSocket patterns confirmed from official docs (HIGH). Y.js CRDT relay architecture and y-codemirror.next binding is MEDIUM (stable architectural concept; library API may have minor changes). |
| Pitfalls | HIGH | Security pitfalls (C1, C2, C3) confirmed from official Python subprocess and resource module docs. XSS prevention (M10) from OWASP. localtunnel and Socket.IO transport degradation from widely documented community knowledge (MEDIUM). |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **y-codemirror.next maintenance status**: The single highest-uncertainty dependency. Verify before Phase 2 begins. If unmaintained, use `@codemirror/collab` (server-side OT) instead.

- **Y.js custom WebSocket provider pattern**: The architecture assumes wiring Y.js into FastAPI's raw WebSocket endpoint (not the standard `y-websocket` server). The exact provider initialization pattern for this setup needs a brief implementation spike at the start of Phase 2.

- **RLIMIT_AS behavior on macOS**: The `resource.RLIMIT_AS` (virtual memory) limit behaves differently on macOS vs. Linux — macOS may not enforce it for virtual address space. If development is on macOS, verify which resource limits actually take effect. `RLIMIT_CPU` works consistently on both platforms.

- **localtunnel WebSocket reliability**: Cannot be confirmed without running the tunnel in the target environment. Test early and be prepared to substitute ngrok if WebSocket upgrade is unreliable.

---

## Sources

### Primary (HIGH confidence)
- FastAPI release notes: https://fastapi.tiangolo.com/release-notes/ — version 0.135.x confirmed
- FastAPI WebSocket docs: https://fastapi.tiangolo.com/advanced/websockets/ — ConnectionManager pattern verified
- Tailwind CSS v4 announcement: https://tailwindcss.com/blog/tailwindcss-v4 — January 22, 2025 release confirmed
- Python subprocess docs: https://docs.python.org/3/library/subprocess.html — shell=True risks, timeout patterns, capture_output
- Python resource module docs: https://docs.python.org/3/library/resource.html — RLIMIT_CPU, RLIMIT_AS, RLIMIT_NOFILE, RLIMIT_NPROC
- OWASP XSS — textContent vs innerHTML prevention (M10)

### Secondary (MEDIUM confidence)
- Y.js documentation (training knowledge through Aug 2025): https://yjs.dev — CRDT relay architecture, Awareness protocol
- y-codemirror.next (training knowledge): https://github.com/yjs/y-codemirror.next — CodeMirror 6 binding
- CodeMirror 6 `@codemirror/collab` — OT fallback if y-codemirror.next is unavailable
- Socket.IO transport / polling fallback behavior — domain knowledge from Socket.IO architecture documentation
- localtunnel subdomain and interstitial behavior — widely documented community knowledge
- CoderPad, Replit, HackerRank, interviewing.io feature patterns (training knowledge) — table stakes and anti-features

### Tertiary (LOW confidence — verify before use)
- Uvicorn ~0.30.x: confirm at https://pypi.org/project/uvicorn/
- Vite ~5.x: confirm at https://www.npmjs.com/package/vite
- Y.js ~13.x: confirm at https://www.npmjs.com/package/yjs

---

*Research completed: 2026-04-01*
*Ready for roadmap: yes*
