# Pitfalls Research: Python Live Coding

**Domain:** Real-time collaborative Python coding platform
**Researched:** 2026-04-01
**Overall confidence:** HIGH (Python subprocess/resource module confirmed via official docs; WebSocket/editor/localtunnel patterns from authoritative domain knowledge with confidence labeled per claim)

---

## Critical Pitfalls

These mistakes can break the project, create security incidents, or force a rewrite.

---

### Pitfall C1: Unrestricted Python Execution (Code Injection / Host Takeover)

**What goes wrong:** Any participant can type `import os; os.system("rm -rf /")` or `import subprocess; subprocess.Popen(["bash"])` and execute it. Since code runs server-side with the server process's OS privileges, an attacker can read secrets, delete files, spawn reverse shells, or pivot to other network resources.

**Why it happens:** Developers test with trusted users and treat execution as "just running a script." The threat model of "anyone on the internet can join via localtunnel" is not internalized early enough.

**Consequences:** Full host compromise. No recovery path. This is not a theoretical risk — it is the default outcome of naive `subprocess.run(code)` over a public URL.

**Prevention:**
- Run execution in a subprocess with a fresh `python3 -c` invocation — never `eval()` or `exec()` in the server process itself.
- Set OS-level resource limits via the `resource` module in a `preexec_fn` before the child starts:
  - `RLIMIT_CPU`: hard cap at 5–10 seconds of CPU time
  - `RLIMIT_AS`: virtual address space cap at 128–256 MB
  - `RLIMIT_NOFILE`: max open file descriptors to ~32
- Do NOT use `shell=True` — this enables shell metacharacter injection even when passing seemingly safe strings (confirmed: Python subprocess docs).
- Pass the script as a temp file path argument, not as a shell string.
- Consider running the child process as a separate OS user with no write access to the project directory (simple: `sudo -u sandbox_user python3 /tmp/script.py`).
- Block network access from the sandbox if the OS supports it (Linux: seccomp/nsjail; macOS: limited options, use subprocess isolation as primary defense).

**Detection (warning signs):**
- No `preexec_fn` resource limits in execution code
- `subprocess.run(..., shell=True)` anywhere in execution path
- The server process user has write access to project source

**Phase to address:** Execution sandbox phase (earliest phase that implements run-code). Must be in from day one — retrofitting sandboxing after the feature works is almost never done correctly.

---

### Pitfall C2: Infinite Loop / Fork Bomb Freezes the Entire Server

**What goes wrong:** A participant submits `while True: pass` or `import os; os.fork()` in a loop. This consumes 100% CPU, eventually starving the event loop that drives WebSocket connections. All other participants lose their sessions. The server becomes unresponsive.

**Why it happens:** `subprocess.run()` without a `timeout` argument will block indefinitely. Even with async frameworks, a blocking subprocess call or a CPU-bound child that consumes all cores kills the event loop.

**Consequences:** Total service disruption for all connected rooms, not just the offending room. Requires manual server restart.

**Prevention:**
- Always pass `timeout=` to `subprocess.run()` (e.g., 10 seconds). Catch `subprocess.TimeoutExpired`, then call `process.kill()`.
- Also set `RLIMIT_CPU` via `preexec_fn` (OS-level enforcement independent of Python timeout — catches `signal.SIGXCPU`).
- For fork bombs: set `RLIMIT_NPROC` to limit child processes the execution user can spawn.
- Run execution in a background thread or async executor — never block the WebSocket event loop directly.
- Return a "Execution timed out after 10 seconds" message to all participants when timeout fires.

**Detection (warning signs):**
- `subprocess.run(...)` with no `timeout` argument
- Execution called synchronously in a Socket.IO event handler
- No `RLIMIT_NPROC` set in sandbox

**Phase to address:** Same as C1 — execution sandbox phase, day one.

---

### Pitfall C3: Enormous Output Floods Memory and Browser

**What goes wrong:** `print("x" * 10_000_000)` or a loop that prints millions of lines. The server captures all of stdout into memory before broadcasting. A 50 MB string sent over a WebSocket crashes browser tabs and can OOM the server.

**Why it happens:** `stdout=subprocess.PIPE` buffers all output in memory by default. There is no output size limit in naive implementations.

**Consequences:** Server OOM kill, browser tab crash, or WebSocket message size limit exceeded (Socket.IO default max is ~1 MB per message).

**Prevention:**
- Cap captured output: read at most N bytes (e.g., 64 KB) from stdout/stderr. Truncate with a visible warning: `"[Output truncated at 64KB]"`.
- Use `communicate(timeout=...)` rather than reading stdout incrementally without a limit.
- Set `RLIMIT_AS` to bound memory the child can allocate for string construction.
- On the frontend, cap what is rendered in the output panel (virtual scrolling or max line count).

**Detection (warning signs):**
- `process.stdout.read()` with no size limit
- No output truncation before broadcast
- Frontend renders raw output string into DOM without any cap

**Phase to address:** Execution sandbox phase. Output truncation logic must be co-located with execution, not added later in a UI polish phase.

---

### Pitfall C4: Shared State Corruption from Concurrent Execution Runs

**What goes wrong:** Two participants click "Run" within milliseconds of each other. The server spawns two subprocesses. Both capture output. Results arrive out of order. The broadcast merges partial outputs into garbled text that no one can read.

**Why it happens:** No execution lock or execution-in-progress state. "Anyone can run" is interpreted as "run as many concurrent executions as you want."

**Consequences:** Confusing, nondeterministic output visible to all participants. Users lose trust in the platform.

**Prevention:**
- Maintain a per-room `execution_in_progress` flag.
- When a run is requested and the flag is set, either queue it (simpler: reject with a "Execution already running, please wait" toast) or debounce.
- Broadcast the execution state change (running / idle) so all clients can disable the Run button visually.
- Clear the flag after execution completes OR after the timeout fires — use `finally` blocks to guarantee cleanup.

**Detection (warning signs):**
- No per-room execution state tracked
- Run button not disabled during execution on client
- No `finally` cleanup after subprocess call

**Phase to address:** Execution feature phase. The run button and the execution state must be designed together.

---

### Pitfall C5: Editor Sync Using Naive Full-Document Replacement

**What goes wrong:** Every keypress sends the full document content to the server, which broadcasts it to all clients, which replace their editor content. Two users typing simultaneously: user A's keystroke triggers a broadcast that overwrites user B's cursor position. User B's next keystroke sends a now-stale document that overwrites user A's change. Net result: characters get dropped, last-writer-wins, typing is erratic.

**Why it happens:** It is the obvious first implementation. "Send the code on change, broadcast to others, set editor value on receive." This works for 1 user. It breaks for 2+.

**Consequences:** Collaborative editing feels broken. Users fight the editor. This requires an architectural rewrite — you cannot bolt OT/CRDT onto a full-document-replacement system without rewriting the sync logic.

**Prevention:**
- Use Y.js (CRDT library) with a provider (y-socket.io or y-websocket) from day one. Y.js handles conflict-free merges automatically. The editor integration is well-documented for CodeMirror 6 and Monaco.
- Alternatively: use CodeMirror 6's built-in collaborative extension which uses operational transforms.
- If you do use a simple approach for MVP: send operational deltas (insert/delete at position), not full documents. Implement a server-side document state as source of truth. This is hard to get right but avoids the full CRDT dependency if bundle size matters.
- Do NOT send the full document string on every change event.

**Detection (warning signs):**
- Sync code does `editor.setValue(received_code)` or equivalent on remote updates
- No concept of "operation" or "delta" in the sync protocol
- No CRDT or OT library in dependencies

**Phase to address:** Editor sync phase. This is a foundational architecture decision. Changing it later means rewriting the entire sync layer.

---

### Pitfall C6: localtunnel URL Changes on Every Restart

**What goes wrong:** localtunnel assigns a random subdomain by default (e.g., `https://fuzzy-bear-42.loca.lt`). Every time the server restarts, the URL changes. Participants who were given the old link can no longer join.

**Why it happens:** The `lt --port 5000` command without `--subdomain` generates a random slug.

**Consequences:** During a live coding session, a server crash means everyone loses their link. The host must regenerate and reshare a new URL mid-session.

**Prevention:**
- Always start localtunnel with a fixed subdomain: `lt --port 5000 --subdomain my-python-session`. Publish the fixed URL once at session start.
- Note: subdomain availability is not guaranteed on the public localtunnel service — another user may have claimed it. Use a distinctive, specific subdomain name.
- Build a "reconnect" flow on the frontend so that when the WebSocket drops and the URL is stable, clients automatically reconnect.

**Detection (warning signs):**
- `lt --port 5000` in start scripts with no `--subdomain`
- No reconnection logic in the WebSocket client

**Phase to address:** Infrastructure/deployment phase. Lock this in before doing any public testing.

---

### Pitfall C7: localtunnel Proxy Breaks WebSocket Upgrade

**What goes wrong:** localtunnel proxies HTTP traffic. Some WebSocket upgrade requests fail or are dropped at the proxy layer, causing Socket.IO to fall back to HTTP long-polling. Long-polling introduces 500ms–2s latency for every sync event, making collaborative editing feel laggy and broken.

**Why it happens:** localtunnel's server infrastructure does not always preserve the `Connection: Upgrade` header correctly. Socket.IO's polling fallback silently activates without any error.

**Consequences:** Editor sync lags by 1–3 seconds. Output broadcast feels broken. Users on different network paths may be on different transports (one WebSocket, one polling), causing desync.

**Prevention:**
- Force Socket.IO to use WebSocket transport only: `io({ transports: ['websocket'] })` on the client side. This will fail fast if WebSocket is broken rather than silently degrading.
- Test the localtunnel URL explicitly for WebSocket support before any live session: `wscat -c wss://your-tunnel.loca.lt/socket.io/?EIO=4&transport=websocket`
- If WebSocket over localtunnel is unreliable, consider `ngrok` as an alternative (more reliable WebSocket proxy, free tier supports it).

**Detection (warning signs):**
- Socket.IO client using default transports (includes polling)
- No explicit transport test during setup
- High latency on remote participants vs. local participants

**Phase to address:** Infrastructure/deployment phase. Test WebSocket transport explicitly before any public demo.

---

## Common Mistakes

These are easy to fall into and create significant friction, but are recoverable if caught before release.

---

### Pitfall M1: No Room Isolation — All Clients Share One Namespace

**What goes wrong:** Code execution output is broadcast to all connected clients globally, not scoped to a room. Room A's output appears in Room B.

**Why it happens:** Socket.IO's `emit` broadcasts to all by default. Room-scoped `emit_to_room` requires explicit use of Socket.IO rooms.

**Prevention:** Use Socket.IO rooms from the start. Every `join room` event should call `join_room(room_id)`. All broadcasts use `emit('event', data, to=room_id)`. Never use a global broadcast for execution output or code changes.

**Detection:** Test with two browser tabs in different rooms — if one room's code output appears in the other, this bug is present.

**Phase:** Room creation phase. Must be correct from the moment rooms exist.

---

### Mitfall M2: Timer State Lives Only on the Server

**What goes wrong:** The countdown timer is calculated server-side and not synchronized to clients on join. A participant who joins mid-session sees the timer start from the beginning, not from the current remaining time.

**Prevention:** Store `start_time` and `duration` in the room state. On join, compute `elapsed = now - start_time` and send `remaining = duration - elapsed` to the joining client. Never send a "start timer" event to late joiners.

**Phase:** Timer + room join flow phase.

---

### Pitfall M3: Code State Not Sent to Late Joiners

**What goes wrong:** A participant joins 5 minutes into a session. The shared editor is empty for them even though other participants have written 50 lines of code. This is because the room's current code state was never sent on join.

**Prevention:** Maintain the canonical code document in server-side room state. On `join_room`, immediately emit the current code to the joining client.

**Phase:** Room join flow phase.

---

### Pitfall M4: WebSocket Disconnect Kills All Room State

**What goes wrong:** The server process restarts (e.g., due to a crash or localtunnel reconnect). All in-memory room state — code, participants, timer — is lost. All participants see a blank editor and a broken connection.

**Why it happens:** Everything is stored in Python dicts in process memory. No persistence layer.

**Prevention:** For ephemeral sessions, this is acceptable — but the failure must be graceful. The frontend should detect disconnection and show a clear "Session lost — please rejoin" message rather than hanging silently. Do not silently drop participants. Consider storing room state in a simple dict that survives within the process lifetime and implement `reconnect` handling to restore state for clients that briefly disconnect.

**Phase:** Resilience / connection handling phase. Basic disconnect handling should be in the initial WebSocket implementation.

---

### Pitfall M5: stderr Mixed Into stdout Without Distinction

**What goes wrong:** A Python `SyntaxError` looks identical to normal print output in the execution panel. Users cannot tell if their code ran successfully or crashed.

**Prevention:** Capture stdout and stderr separately. Broadcast them as separate event fields or with a visual flag. Display stderr in a different color (red) in the output panel.

**Phase:** Execution output display phase.

---

### Pitfall M6: Run Button Double-Fires on Slow Networks

**What goes wrong:** A user clicks "Run." The UI shows no feedback for 300ms (network latency to send the event). The user clicks again. Two executions are queued. Output arrives twice, interleaved.

**Prevention:** Disable the Run button immediately on click, client-side, before the server acknowledgment arrives. Re-enable when execution_complete event is received. This is a client-side UX fix independent of server-side execution locking (C4 above).

**Phase:** Execution UI phase.

---

### Pitfall M7: No Heartbeat — Dead Connections Accumulate

**What goes wrong:** A participant closes their laptop without disconnecting. The WebSocket connection appears alive to the server but is actually dead. The participants list shows ghost users. The server may broadcast to dead connections indefinitely.

**Prevention:** Socket.IO has built-in ping/pong (heartbeat). Ensure the server does not set `ping_timeout` too high. Use the `disconnect` event reliably to remove participants from room state. Do not rely solely on explicit "leave room" client events — network drops will not fire them.

**Phase:** WebSocket connection management phase.

---

### Pitfall M8: CSS Conflicts Between Editor Library and Global Styles

**What goes wrong:** A CSS reset or Tailwind base layer strips styles from CodeMirror or Monaco Editor. The editor renders as an unstyled box with invisible text. This is a common "works in dev, breaks in production" issue when build tools process and merge CSS.

**Prevention:** Import editor CSS after your global CSS, or use CSS modules/scoping. Verify the editor renders correctly after any CSS framework is added. Test in a clean build, not just the dev server.

**Phase:** UI integration phase. Always test editor rendering immediately after adding any CSS framework.

---

### Pitfall M9: localtunnel Interstitial Page Breaks First-Time Access

**What goes wrong:** First-time visitors to a `loca.lt` URL are shown a warning/interstitial page asking them to confirm they understand the tunnel is a user-hosted service. This blocks participants from reaching the app without the host telling them to click through manually.

**Prevention:** The localtunnel client can sometimes bypass this with custom headers. Alternatively, document this in the "how to join" instructions the host shares. Consider using ngrok (no interstitial) for a more polished experience.

**Phase:** Public demo / external access phase. Test the full join flow from a fresh browser before any live session.

---

### Pitfall M10: Output Panel Renders Raw HTML / Script Tags

**What goes wrong:** A user's Python code prints `<script>alert('xss')</script>`. If the frontend inserts execution output via `innerHTML`, this executes in every participant's browser.

**Prevention:** Always insert output text using `textContent` (not `innerHTML`) or equivalent text-only DOM APIs. In React/Vue, use text interpolation (`{output}`) not `dangerouslySetInnerHTML`. This is a mandatory rule for any user-generated content display.

**Phase:** Output display phase. Must be correct from the first implementation.

---

## Phase-Specific Warnings

| Phase Topic | Pitfall | Mitigation |
|-------------|---------|------------|
| Execution sandbox (first run-code implementation) | C1: Code injection / host takeover | subprocess isolation + `preexec_fn` resource limits + no `shell=True` |
| Execution sandbox | C2: Infinite loop freezes server | `timeout=` on subprocess + `RLIMIT_CPU` + async execution |
| Execution sandbox | C3: Output flood / OOM | Capture at most 64KB stdout/stderr, truncate with message |
| Execution sandbox | C4: Concurrent run collision | Per-room execution lock + broadcast execution state |
| Editor sync (first collaborative edit) | C5: Full-document replacement | Use Y.js CRDT or OT deltas from day one — no full-doc replace |
| Room creation / join flow | M1: Global broadcast (no room isolation) | Socket.IO rooms from the start |
| Room join flow | M3: Late joiner sees empty editor | Server maintains canonical code, sends on join |
| Room join flow | M2: Timer wrong for late joiners | Send `remaining` computed server-side on join |
| Output display | M5: stderr indistinguishable from stdout | Separate capture, visual distinction |
| Output display | M10: XSS via output innerHTML | Always use textContent / text-safe rendering |
| WebSocket connection management | M7: Ghost participants / dead connections | Rely on Socket.IO disconnect events, not client-sent leave |
| WebSocket connection management | M4: State lost on server restart | Graceful disconnect message to clients |
| Execution UI | M6: Double-fire on slow network | Disable Run button client-side immediately on click |
| UI integration | M8: Editor CSS conflicts | Test editor rendering immediately after adding CSS framework |
| Infrastructure / localtunnel setup | C6: URL changes on restart | `--subdomain` flag in localtunnel start command |
| Infrastructure / localtunnel setup | C7: WebSocket falls back to polling | Force `transports: ['websocket']` on client; test explicitly |
| External access / public demo | M9: localtunnel interstitial blocks joiners | Test full join flow from fresh browser before any demo |

---

## Sources

- Python `subprocess` module docs (official): https://docs.python.org/3/library/subprocess.html — shell injection warning, `shell=True` risks. **Confidence: HIGH**
- Python `resource` module docs (official): https://docs.python.org/3/library/resource.html — `RLIMIT_CPU`, `RLIMIT_AS`, `RLIMIT_NOFILE`, `RLIMIT_NPROC`. **Confidence: HIGH**
- Python `multiprocessing` docs (official): https://docs.python.org/3/library/multiprocessing.html — queue deadlock, terminate + lock corruption, pickle security. **Confidence: HIGH**
- Socket.IO WebSocket transport / polling fallback: authoritative domain knowledge from Socket.IO architecture documentation patterns. **Confidence: MEDIUM**
- Y.js CRDT architecture: authoritative domain knowledge (Y.js is the de facto standard for browser-based CRDT collaborative editing as of 2025). **Confidence: MEDIUM** (library not verified via Context7 due to tool restrictions in this session)
- localtunnel interstitial / subdomain behavior: widely documented community knowledge. **Confidence: MEDIUM**
- XSS via innerHTML: OWASP standard. **Confidence: HIGH**
