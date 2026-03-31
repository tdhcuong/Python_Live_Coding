# Features Research: Python Live Coding

**Domain:** Real-time collaborative coding platform (live coding sessions)
**Researched:** 2026-04-01
**Confidence:** MEDIUM — based on training knowledge of CoderPad, Replit, CodeSandbox, HackerRank, interviewing.io, and CodePen through Aug 2025. Web verification unavailable.

---

## Table Stakes

Features users expect as the baseline. Missing any of these and users assume the product is broken or unfinished.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Shareable room link | Entry point to collaboration; without it there is no session | Low | A short URL or room ID that anyone can paste into a browser |
| Real-time shared code editor | Core value prop — the entire reason to open the app | High | Multi-cursor OT/CRDT sync; any keystroke delay > ~200ms feels broken |
| Syntax highlighting for Python | Every code editor since 2005 has this; absence is jarring | Low | CodeMirror/Monaco both include Python highlighting out of the box |
| Run code button | Users expect to execute; if there is no run button the editor feels like a text box | Low-Med | Button must be visible and obvious, not buried in menus |
| Execution output panel | Where does the output go? Users expect a dedicated console/output area | Low-Med | stdout and stderr both must appear; stderr should be visually distinct (red/orange) |
| Output visible to all participants simultaneously | If one person runs code and others don't see output, it feels like a bug | Med | Requires broadcasting output over WebSocket to all room members |
| Participant presence — who is in the room | Users glance at "who else is here" constantly; absence creates confusion | Low-Med | A list of names/avatars with online status; even initials in circles suffices |
| Participant cursor/caret visibility | Multi-cursor is the visual proof that collaboration is real | Med | Each participant gets a distinct color; cursor label shows their name |
| Countdown timer display | Once a timer is part of the UX contract (host sets it), it must be visible to all | Low | A large readable number, synced across all clients via WebSocket |
| Problem/prompt display area | Participants need to read the challenge without switching windows | Low | A read-only panel or sidebar showing the problem statement |
| Host role distinction | Someone must be able to set the problem and start the timer; that person is the host | Low-Med | Host controls (set problem, start timer) gated behind a role flag |
| Connection status indicator | Users need to know if they are live or disconnected; silent reconnection is invisible | Low | A small status badge (green/red dot) in the UI corner |
| Graceful reconnection | WebSocket drops happen; auto-reconnect with state recovery is expected | Med | Socket.IO's built-in reconnect plus server-side room state replay |

---

## Differentiators

Features that go beyond the baseline and create competitive advantage or delight. Not expected, but valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Execution history / output log | Users can scroll back through prior runs without re-running | Low-Med | Keep a list of run results on the server, broadcast on join |
| "Running..." visual feedback with spinner | Makes async execution feel fast even when Python is slow | Low | A loading state on the Run button + console while subprocess runs |
| Keyboard shortcut for run (Ctrl+Enter / Cmd+Enter) | Power users reach for this immediately; adds pro feel | Low | Standard CodeMirror/Monaco keybind extension |
| Line numbers | Expected in any serious editor; but not present on all lightweight web editors | Low | Turn on in CodeMirror/Monaco config |
| Auto-indent and bracket matching | Reduces friction for Python (indentation is semantic) | Low | CodeMirror/Monaco built-in |
| Timer visual urgency (color change as time runs out) | Adds psychological pressure to a practice session without complexity | Low | CSS transition from neutral to amber to red |
| Participant join/leave notifications | "Alice joined" toast keeps everyone aware of session membership changes | Low | Broadcast join/leave events; show a transient toast |
| Code reset / clear editor | Host can reset the editor to a clean slate for a new attempt | Low | Broadcast "clear" event to all clients |
| Copy room link button | One-click share without having to copy from browser address bar | Low | Clipboard API call |
| Mobile-responsive layout | Not required for a coding session, but being non-broken on mobile is increasingly expected | Med | Primarily a CSS concern; touch keyboards make actual coding impractical |
| Dark mode | Expected in any developer-facing tool in 2026 | Low | Default to dark; most coding platforms ship dark-first |
| Execution time display | Shows how long the code took to run; useful for algorithmic challenges | Low | Capture subprocess wall time, include in output broadcast |

---

## Anti-Features (skip for v1)

Things that add complexity without proportional value for this specific use case (ephemeral, anonymous, single-problem sessions).

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Authentication / accounts | Adds entire auth layer for zero user value in anonymous sessions | Anonymous link-based access; no login |
| Persistent session storage | Sessions are ephemeral by design; storing them requires a DB schema, migration, cleanup jobs | Let sessions expire when the server restarts or all participants leave |
| Multiple problems per room | Increases host UI complexity; this is a focused single-problem format | One problem per room; host sets it once |
| Video/audio chat | WebRTC complexity, browser permissions, UX surface area; users can use Discord/Zoom side-by-side | Out of scope; text + code is sufficient |
| Chat / messaging | Adds a text panel, message history, and scroll management; users on a live call don't need it | Out of scope for v1 |
| File tree / multiple files | Python problems fit in one file; multi-file adds tab management, import resolution complexity | Single file editor only |
| Package installation (pip install) | Sandboxing arbitrary package installs is a security and reliability problem | Stdlib + pre-installed packages only |
| Code diffing / playback | Valuable for post-session review but requires storing snapshots; out of scope for ephemeral sessions | Defer entirely |
| Per-participant separate editors | Diverges from the core value prop of shared collaboration | One shared editor for all |
| Configurable execution timeout UI | Expose as a server-side constant; no user-facing control needed | Hard-code a sensible default (10–30 seconds) |
| Themes/customization panel | Adds settings UI complexity; ship one great default dark theme | Single opinionated theme |
| Room passwords | Adds friction; the link IS the access control | Unguessable room IDs (UUID or similar) serve as the access token |

---

## Feature Dependencies

Features that cannot be built without other features being in place first.

```
Room creation (host) → Shareable link
Shareable link → Participant join flow
Participant join flow → WebSocket room membership
WebSocket room membership → Participant presence list
WebSocket room membership → Real-time editor sync
WebSocket room membership → Output broadcast to all

Host role → Problem/prompt display (host must set it before others see it)
Host role → Timer start (host must start it)

Timer display → WebSocket room membership (timer ticks must be broadcast)
Timer display → Timer urgency color (urgency is a pure presentation layer on top of timer)

Code execution → Run button
Code execution → Output panel
Output broadcast to all → Output panel (the panel is the consumer)
Output broadcast to all → WebSocket room membership

Participant cursor visibility → Real-time editor sync (cursors ride on the same OT/CRDT channel)
Participant cursor visibility → Participant presence list (need to know who has which color)

Connection status indicator → WebSocket room membership (connection is to the room)
Graceful reconnection → WebSocket room membership (reconnect re-joins the room)
```

**Critical path (nothing works without these):**
1. WebSocket room infrastructure (create room, join room, broadcast events)
2. Shared editor sync (OT or last-write-wins depending on approach)
3. Code execution subprocess + output capture
4. Output broadcast

Everything else — presence, timer, problem panel, styling — is additive on top of this critical path.

---

## MVP Recommendation

Prioritize for v1 (all table stakes + high-value differentiators at low complexity):

1. Room creation with shareable link
2. Real-time shared editor with syntax highlighting and multi-cursor
3. Run button + output panel (stdout/stderr, all participants see it)
4. Participant presence list (names/initials, online indicator)
5. Problem/prompt display panel (host sets it)
6. Countdown timer visible to all
7. Dark mode default (low-effort, high polish perception)
8. Keyboard shortcut for run (Ctrl+Enter)
9. "Running..." loading state on execution
10. Connection status indicator

Defer to v2:
- Execution history / log scrollback
- Timer urgency color transitions
- Participant join/leave toasts (nice but not critical)
- Execution time display
- Copy link button (browser URL bar works as fallback)

---

## Sources

- Training knowledge of CoderPad, Replit, CodeSandbox, HackerRank, interviewing.io, CodePen (through Aug 2025) — MEDIUM confidence
- Project constraints from `.planning/PROJECT.md` inform anti-feature decisions
- Web verification unavailable (WebSearch and WebFetch permissions denied)
- Note: Core feature categories (table stakes vs differentiators) are stable domain knowledge unlikely to have changed materially since cutoff
