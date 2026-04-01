# Phase 2: Collaborative Editor - Research

**Researched:** 2026-04-02
**Domain:** Y.js CRDT + CodeMirror 6 + custom WebSocket provider
**Confidence:** HIGH (stack verified against npm registry; API patterns verified against official Y.js docs)

## Summary

Phase 2 adds a shared, real-time code editor to the existing room. Four requirements must be
satisfied: Y.js CRDT sync across participants (EDIT-01), Python syntax highlighting (EDIT-02),
multi-cursor presence with per-participant colors (EDIT-03), and line numbers in the gutter (EDIT-04).

The stack is fully locked: Y.js 13.6.30 + y-codemirror.next 0.3.5 + CodeMirror 6. Version
verification confirms y-codemirror.next is actively maintained (last release June 2024, peer deps
match installed package versions). The custom WebSocket provider pattern — where Y.js binary
updates are base64-encoded into JSON frames — is the correct approach for this project because the
existing `ws.js` is JSON-only and the decision to avoid binary WebSocket frames was locked in
CONTEXT.md (D-04).

The critical backend change is adding a `yjs_updates: list[bytes]` accumulator to the `Room`
model and flushing all accumulated updates to late joiners before the `room_state` message. The
frontend change is mounting a CodeMirror editor instance in the `<main>` placeholder, wiring it
to a Y.js doc via `yCollab()`, and teaching `ws.js` to handle two new message types.

**Primary recommendation:** Build a thin custom Y.js provider class that wraps the existing
WebSocket from `createRoomWS()`. This avoids pulling in `y-websocket` (which ships its own WS
client and server protocol) and keeps the message bus unified.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use Y.js + y-codemirror.next for CRDT sync. Before starting, verify `npm info y-codemirror.next` to confirm active maintenance. If unmaintained, fall back to `@codemirror/collab`.
- **D-02:** CodeMirror 6 as the editor. Import only what's needed: `@codemirror/lang-python` for syntax highlighting, `@codemirror/view` for line numbers via `lineNumbers()` extension.
- **D-03:** New rooms start with a minimal Python starter comment: `# Write your solution here\n`.
- **D-04:** Y.js binary updates are base64-encoded and sent as JSON over the existing WebSocket. Message types: `yjs_update` (doc sync) and `awareness_update` (cursor/presence). Keeps `ws.js` JSON-only — no refactor to binary frames needed.
- **D-05:** Backend stores accumulated Y.js binary updates per room. Late joiners receive the full update log on connect so they get complete document state even if prior participants have disconnected.
- **D-06:** Editor fills the `<main>` area (replaces "Editor coming in Phase 2" placeholder). No Run button in this phase. Editor occupies full remaining height after the header.
- **D-07:** Remote cursors use y-codemirror.next's built-in awareness extensions. Cursor color comes from `participants` map (already assigned in Phase 1).

### Claude's Discretion
- Exact CodeMirror theme (dark, matching existing gray-900/gray-800 palette)
- Y.js document key name (e.g., `"python-code"`)
- Debounce timing for awareness updates
- Exact CSS for editor container height/overflow

### Deferred Ideas (OUT OF SCOPE)
None — no discussion, no deferred items.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EDIT-01 | All participants share one code editor — edits sync in real time for everyone (Y.js CRDT) | Custom Y.js provider pattern, Y.applyUpdate/encodeStateAsUpdate API, base64 encoding protocol, backend accumulator for late joiners |
| EDIT-02 | Editor displays Python syntax highlighting | `@codemirror/lang-python` 6.2.1 — single import, confirmed available |
| EDIT-03 | Each participant's cursor is shown in a distinct color (multi-cursor presence) | `yCollab()` awareness parameter + `provider.awareness.setLocalStateField('user', {name, color, colorLight})` pattern |
| EDIT-04 | Editor displays line numbers in the gutter | `lineNumbers()` from `@codemirror/view` — included in `codemirror` meta-package |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| yjs | 13.6.30 | CRDT document model, update encoding/application | De-facto standard browser CRDT; Y.Text maps 1:1 to editor content |
| y-codemirror.next | 0.3.5 | `yCollab()` extension binding Y.Text to CodeMirror 6 | First-party adapter from Y.js authors; peer deps verified compatible |
| codemirror | 6.0.2 | Meta-package: pulls in view, state, basic-setup | Canonical entry point for CM6; tree-shakeable |
| @codemirror/lang-python | 6.2.1 | Python syntax highlighting | Single import, no config |
| @codemirror/view | 6.41.0 | `lineNumbers()` extension, `EditorView` | Core CM6 view module |
| @codemirror/state | 6.6.0 | `EditorState`, `StateEffect` | Core CM6 state module |
| @codemirror/theme-one-dark | 6.1.3 | Dark editor theme matching gray-900 palette | Official CM6 dark theme; no custom CSS needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lib0 | transitive | Binary encoding utilities (used by yjs internally) | Auto-installed as transitive dep |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| y-codemirror.next | @codemirror/collab (OT) | OT requires server-side transform logic; Y.js is zero server-side logic. D-01 locks Y.js. |
| Custom provider | y-websocket client | y-websocket ships its own binary WS protocol and server; incompatible with our JSON-only ws.js. |
| @codemirror/theme-one-dark | Custom CSS theme | Custom theme is Claude's discretion — one-dark saves time and matches dark palette well |

**Installation:**
```bash
npm install yjs y-codemirror.next codemirror @codemirror/lang-python @codemirror/view @codemirror/state @codemirror/theme-one-dark
```

**Version verification (confirmed 2026-04-02):**
- `yjs@13.6.30` — published recently, actively maintained
- `y-codemirror.next@0.3.5` — published 2024-06-18, maintainer is Y.js core author (dmonad). Last three releases: 0.3.3 (Mar 2024), 0.3.4 (May 2024), 0.3.5 (Jun 2024). Peer deps `@codemirror/state ^6.0.0`, `@codemirror/view ^6.0.0`, `yjs ^13.5.6` — all satisfied by stack above. **MAINTENANCE STATUS: ACTIVE** — D-01 fallback to `@codemirror/collab` is NOT needed.
- `codemirror@6.0.2` — stable meta-package
- `@codemirror/lang-python@6.2.1` — current stable
- `@codemirror/theme-one-dark@6.1.3` — current stable

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/
├── editor/
│   ├── setup.js          # createEditor(container, ytext, awareness, myUser) → EditorView
│   ├── provider.js       # YjsWebSocketProvider class (wraps ws from ws.js)
│   └── theme.js          # oneDark + custom overrides (optional)
├── pages/
│   └── room.js           # mounts editor, handles yjs_update/awareness_update messages
└── ws.js                 # extended: add yjs_update, awareness_update cases to switch

backend/app/
├── models.py             # Room gains yjs_updates: list[bytes]
├── main.py               # relay loop handles yjs_update/awareness_update; flush on join
└── room_manager.py       # unchanged
```

### Pattern 1: Y.js Custom Provider (wrapping existing WebSocket)

**What:** A lightweight class that listens to `ydoc.on('update')` and sends updates via the
existing room WebSocket as JSON. Incoming `yjs_update` messages call `Y.applyUpdate()`.

**When to use:** Always — this project does not use `y-websocket` (its binary protocol is
incompatible with our JSON-only ws.js). This is a ~50-line class.

**Example:**
```javascript
// frontend/src/editor/provider.js
// Source: https://docs.yjs.dev/api/document-updates + D-04 decision
import * as Y from 'yjs'

export class RoomProvider {
  constructor(ydoc, awareness, wsSend) {
    this._ydoc = ydoc
    this.awareness = awareness
    this._wsSend = wsSend

    // Forward local doc updates to the room
    this._updateHandler = (update, origin) => {
      if (origin !== this) {
        const b64 = btoa(String.fromCharCode(...update))
        wsSend({ type: 'yjs_update', update: b64 })
      }
    }
    ydoc.on('update', this._updateHandler)

    // Forward local awareness changes
    this._awarenessHandler = ({ changed }) => {
      const update = Y.encodeAwarenessUpdate(awareness, [awareness.clientID])
      const b64 = btoa(String.fromCharCode(...update))
      wsSend({ type: 'awareness_update', update: b64 })
    }
    awareness.on('change', this._awarenessHandler)
  }

  // Called from ws.js message handler when type === 'yjs_update'
  applyRemoteUpdate(b64) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    Y.applyUpdate(this._ydoc, bytes, this)  // origin=this to avoid echo
  }

  // Called from ws.js message handler when type === 'awareness_update'
  applyRemoteAwareness(b64) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    applyAwarenessUpdate(this.awareness, bytes, this)
  }

  destroy() {
    this._ydoc.off('update', this._updateHandler)
    this.awareness.off('change', this._awarenessHandler)
  }
}
```

### Pattern 2: Editor Setup Function

**What:** A pure factory that creates an `EditorView` given a Y.Text and awareness. All
CodeMirror extension wiring lives here so `room.js` stays clean.

**Example:**
```javascript
// frontend/src/editor/setup.js
// Source: https://github.com/yjs/y-codemirror.next README
import { EditorView, lineNumbers } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'
import { yCollab } from 'y-codemirror.next'
import * as Y from 'yjs'

export function createEditor(container, ytext, awareness, myUser) {
  const undoManager = new Y.UndoManager(ytext)

  // Set awareness user info — drives cursor color/label in remote views
  awareness.setLocalStateField('user', {
    name: myUser.name,
    color: myUser.color,
    colorLight: myUser.color + '40',  // 25% opacity variant for selection highlight
  })

  const state = EditorState.create({
    doc: ytext.toString(),
    extensions: [
      lineNumbers(),
      oneDark,
      python(),
      yCollab(ytext, awareness, { undoManager }),
    ],
  })

  return new EditorView({ state, parent: container })
}
```

### Pattern 3: Backend Y.js Update Accumulator

**What:** Backend accumulates raw Y.js binary updates per room. On participant join, flush the
full update log before sending `room_state`. The list grows with each relay; no merge needed
(clients apply them sequentially via `Y.applyUpdate`).

**Example:**
```python
# backend/app/models.py — add field to Room
@dataclass
class Room:
    id: str
    host_token: str
    participants: dict[str, Participant] = field(default_factory=dict)
    yjs_updates: list[bytes] = field(default_factory=list)  # Phase 2: CRDT log

# backend/app/main.py — in the relay loop (Step 5)
elif msg_type == 'yjs_update':
    raw = base64.b64decode(data['update'])
    room.yjs_updates.append(raw)
    await manager.broadcast_to_room(room_id, data, exclude_id=participant_id)

elif msg_type == 'awareness_update':
    # Awareness is transient — relay only, do not accumulate
    await manager.broadcast_to_room(room_id, data, exclude_id=participant_id)

# In the join flow — BEFORE sending room_state, flush accumulated doc state
for update_bytes in room.yjs_updates:
    b64 = base64.b64encode(update_bytes).decode()
    await manager.send_personal(websocket, {'type': 'yjs_update', 'update': b64})
```

### Pattern 4: Extending ws.js for Y.js Messages

**What:** Add two new `case` branches to the existing message switch. Pass a reference to the
provider so message handlers can call into it.

**Example:**
```javascript
// frontend/src/ws.js extended switch (conceptual)
case 'yjs_update':
  handlers.onYjsUpdate?.(msg)
  break
case 'awareness_update':
  handlers.onAwarenessUpdate?.(msg)
  break
```

Then in `room.js`:
```javascript
onYjsUpdate: (msg) => provider.applyRemoteUpdate(msg.update),
onAwarenessUpdate: (msg) => provider.applyRemoteAwareness(msg.update),
```

### Pattern 5: Late Joiner — Flush Order

**Critical ordering:** Flush all accumulated Y.js updates BEFORE sending `room_state`. This
ensures the editor is fully populated before `renderRoomView()` mounts the CodeMirror instance.

```
client connects
  → server receives join_room
  → server flushes yjs_updates[] (one yjs_update message per stored update)
  → server sends room_state (triggers renderRoomView + editor mount on client)
  → server broadcasts participant_joined to others
```

### Anti-Patterns to Avoid
- **Full-document replacement:** Never call `editor.setValue(text)` or replace editor content
  wholesale on remote updates. Y.js deltas must drive all changes — this is CLAUDE.md C5 pitfall.
- **Importing y-websocket client:** y-websocket's client assumes binary WS frames and its own
  sync protocol. It is incompatible with our JSON-only `ws.js`. Do not install it.
- **Accumulating awareness updates:** Awareness is ephemeral presence data. Only accumulate
  `yjs_update` messages on the backend. Never store `awareness_update` — it is only relayed.
- **Mounting editor before Y.js doc is synced:** If editor mounts before the late-joiner flush
  completes, `ytext.toString()` returns `""` and the editor shows empty. Always flush first.
- **Setting awareness on every keypress:** Debounce awareness sends (100-250ms). Sending on every
  cursor move floods the WebSocket.
- **Using btoa() on arbitrary Uint8Array without fromCharCode conversion:** btoa expects a binary
  string. Use `btoa(String.fromCharCode(...update))` or a TextDecoder approach.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Conflict-free text merging | Custom OT or last-write-wins | Y.js CRDT (ydoc.getText) | OT requires server-side transform; CRDT is client-side-complete |
| Remote cursor rendering | DIY cursor overlay DOM | yCollab() with awareness | y-codemirror.next renders cursor carets, labels, and selection highlights |
| Undo/redo for shared doc | Standard browser undo | Y.UndoManager(ytext) | Browser undo doesn't know about CRDT operations — it would undo remote changes |
| Python highlighting | Regex tokenizer | @codemirror/lang-python | Full AST-aware highlighting, indentation, autocomplete hooks |
| Line numbers | CSS counter hack | lineNumbers() from @codemirror/view | First-class CM6 gutter extension |
| Dark editor theme | Custom CSS | @codemirror/theme-one-dark | Official theme, integrates with CM6 StyleModule system |

**Key insight:** y-codemirror.next's `yCollab()` extension handles the entire binding between
Y.Text and CodeMirror's internal document model — including cursor widgets, selection decorations,
and awareness diffing. There is no "awareness rendering" code to write.

## Common Pitfalls

### Pitfall 1: Mounting Editor Before Late-Joiner Flush Completes
**What goes wrong:** Editor mounts with `doc: ytext.toString()` = `""` because Y.js updates
haven't arrived yet. Room appears to start fresh for the late joiner.
**Why it happens:** If `renderRoomView()` triggers synchronously on `room_state`, and `room_state`
arrives before the flush messages are processed in order.
**How to avoid:** Send all accumulated `yjs_update` messages BEFORE sending `room_state`. Client
applies them eagerly in the `yjs_update` handler, then when `room_state` fires, `ytext.toString()`
returns the full document.
**Warning signs:** Late joiner sees empty editor; other participants see correct content.

### Pitfall 2: base64 Encode/Decode Mismatch
**What goes wrong:** `btoa(update)` where `update` is a Uint8Array throws or produces garbage
because btoa expects a binary string, not an array object.
**Why it happens:** JS `btoa()` calls `.toString()` on non-string input, yielding `"0,255,..."`.
**How to avoid:** Always convert `Uint8Array` to binary string first:
`btoa(String.fromCharCode(...update))` or use `Buffer.from(update).toString('base64')` (Node only).
On decode: `Uint8Array.from(atob(b64), c => c.charCodeAt(0))`.
**Warning signs:** Console errors "invalid character" in btoa, or `Y.applyUpdate` throws.

### Pitfall 3: Echo Loop (Applying Own Updates)
**What goes wrong:** Client A sends an update, server relays it back to A, A applies it again,
causing doubled text or infinite update loops.
**Why it happens:** Server broadcasts to all including sender if `exclude_id` is not used.
**How to avoid:** (a) Server uses `broadcast_to_room(..., exclude_id=participant_id)` for
`yjs_update` — already the established pattern from Phase 1. (b) Client-side provider passes
`origin=this` to `Y.applyUpdate()` so the update event handler recognizes its own origin and
skips re-sending.
**Warning signs:** Typed characters appear doubled; console shows rapid repeated `yjs_update` sends.

### Pitfall 4: Awareness Update Accumulation on Backend
**What goes wrong:** Backend accumulates `awareness_update` messages in addition to `yjs_update`.
Late joiners receive stale cursor positions from participants who have since moved or left.
**Why it happens:** Treating awareness the same as document updates.
**How to avoid:** Only accumulate `yjs_update` in `room.yjs_updates`. Relay `awareness_update`
immediately to others but never store it.
**Warning signs:** Late joiner sees ghost cursors that never move.

### Pitfall 5: Y.js Document Key Mismatch
**What goes wrong:** Two clients use different keys — e.g., `ydoc.getText('python-code')` on one
client and `ydoc.getText('code')` on the other. Updates are applied to different Y.Text objects.
Editor appears to sync for some clients but not others.
**Why it happens:** Key is not specified in CONTEXT.md; different implementations choose
different names.
**How to avoid:** Use a single constant, e.g., `const YTEXT_KEY = 'python-code'`. Define it once
in `provider.js` and import it wherever `ydoc.getText()` is called.
**Warning signs:** Edits from some clients don't appear; `ytext.toString()` returns empty on one client.

### Pitfall 6: CodeMirror Container Has No Height
**What goes wrong:** CodeMirror editor renders as 0px height — invisible. The `<main>` flex
container has `flex-1` but the editor's div needs explicit height propagation.
**Why it happens:** CodeMirror renders into a div that defaults to `height: auto` (content
height). With no content, height is 0.
**How to avoid:** Set `height: 100%` on the editor's parent container AND configure `EditorView`
with a height style: `EditorView.theme({'&': {height: '100%'}})`. The `<main>` element already
has `flex-1` and `overflow-hidden` from Phase 1 layout.
**Warning signs:** Editor container exists in DOM but is invisible; DevTools shows 0px height.

## Code Examples

Verified patterns from official sources:

### Y.js Update API
```javascript
// Source: https://docs.yjs.dev/api/document-updates

// Encode entire doc state as a binary update
const stateUpdate = Y.encodeStateAsUpdate(ydoc)  // → Uint8Array

// Apply an incoming update
Y.applyUpdate(ydoc, updateBytes, origin)          // origin used to filter echo

// Merge multiple accumulated updates into one (optional optimization)
const merged = Y.mergeUpdates([update1, update2]) // → Uint8Array

// Listen for local changes
ydoc.on('update', (update, origin) => {
  if (origin !== myProvider) {
    // send to peers
  }
})
```

### yCollab Extension Wiring
```javascript
// Source: https://github.com/yjs/y-codemirror.next README
import { yCollab } from 'y-codemirror.next'
import * as Y from 'yjs'

const ydoc = new Y.Doc()
const ytext = ydoc.getText('python-code')
const undoManager = new Y.UndoManager(ytext)

// awareness user state drives cursor color/name label
awareness.setLocalStateField('user', {
  name: 'Alice',
  color: '#6366f1',
  colorLight: '#6366f140',
})

const extensions = [
  yCollab(ytext, awareness, { undoManager }),
  // ... other extensions
]
```

### Awareness Encoding (for sending over custom WS)
```javascript
// Source: y-protocols (peer dep of yjs)
import { encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness'

// Send local awareness state
const update = encodeAwarenessUpdate(awareness, [awareness.clientID])
ws.send({ type: 'awareness_update', update: btoa(String.fromCharCode(...update)) })

// Receive remote awareness state
const bytes = Uint8Array.from(atob(msg.update), c => c.charCodeAt(0))
applyAwarenessUpdate(awareness, bytes, origin)
```

### Backend Relay (Python)
```python
# Source: D-04/D-05 decisions + Y.js docs pattern
import base64

# In relay loop:
elif msg_type == 'yjs_update':
    raw = base64.b64decode(data['update'])
    room.yjs_updates.append(raw)
    await manager.broadcast_to_room(room_id, data, exclude_id=participant_id)

elif msg_type == 'awareness_update':
    await manager.broadcast_to_room(room_id, data, exclude_id=participant_id)

# Late joiner flush (before room_state):
for update_bytes in room.yjs_updates:
    b64 = base64.b64encode(update_bytes).decode('ascii')
    await manager.send_personal(websocket, {'type': 'yjs_update', 'update': b64})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| y-codemirror (CM5 binding) | y-codemirror.next (CM6 binding) | 2022 | Must use the `.next` package for CM6 |
| @codemirror/basic-setup | codemirror (renamed meta-package) | CM6 v6.0 | `@codemirror/basic-setup` is deprecated; use `codemirror` |
| Manual binary WebSocket frames | JSON with base64 payload | Project decision D-04 | Simpler server; no binary frame handling in FastAPI |

**Deprecated/outdated:**
- `@codemirror/basic-setup`: Renamed to `codemirror`. Package still exists but shows deprecation warning.
- `y-codemirror` (without `.next`): This is the CM5 binding, incompatible with CM6.

## Open Questions

1. **Awareness import path for encodeAwarenessUpdate**
   - What we know: `y-codemirror.next` uses `y-protocols/awareness` internally; `y-protocols` is a peer dep of yjs
   - What's unclear: Whether `y-protocols` needs explicit installation or is importable as a transitive dep
   - Recommendation: Run `npm info y-protocols` and `npm ls y-protocols` after installing to verify; if not auto-hoisted, add `y-protocols` to devDependencies explicitly

2. **Large update log memory growth**
   - What we know: Backend accumulates all `yjs_update` binary payloads in `room.yjs_updates`
   - What's unclear: In long sessions, this list could grow significantly
   - Recommendation: `Y.mergeUpdates()` can compress the list; acceptable optimization for Phase 2 or deferred. For now, append-only is correct and simple.

3. **colorLight value for awareness selection highlight**
   - What we know: `yCollab` uses `colorLight` for selection background in awareness state
   - What's unclear: Exact format — hex with alpha (`#6366f140`) vs rgba string
   - Recommendation: Use hex+alpha format `color + '40'` (25% opacity). Verify visually during implementation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install, Vite dev | ✓ | v22.20.0 | — |
| npm | Package install | ✓ | 11.7.0 | — |
| Python 3 | Backend | ✓ | 3.13.2 | — |
| Vite | Frontend build/dev | ✓ (in devDeps) | ^5.0.0 | — |
| y-codemirror.next | CRDT binding | not yet installed | 0.3.5 available | — |
| yjs | CRDT doc model | not yet installed | 13.6.30 available | — |
| codemirror | Editor | not yet installed | 6.0.2 available | — |
| @codemirror/lang-python | Syntax highlight | not yet installed | 6.2.1 available | — |
| @codemirror/theme-one-dark | Dark theme | not yet installed | 6.1.3 available | — |

**Missing dependencies with no fallback:** None — all packages are available on npm registry.

**Missing dependencies with fallback:** None — all required packages can be installed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio (backend) / manual browser tests (frontend CRDT) |
| Config file | none — Wave 0 must create `backend/pytest.ini` or `backend/pyproject.toml` |
| Quick run command | `cd /Users/tdhcuong/Desktop/Personal_Projects/Python_Live_Coding/backend && python -m pytest tests/ -x -q` |
| Full suite command | `cd /Users/tdhcuong/Desktop/Personal_Projects/Python_Live_Coding/backend && python -m pytest tests/ -v` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDIT-01 | Y.js updates relay between two WebSocket clients | integration | `pytest tests/test_yjs_relay.py::test_update_relayed -x` | Wave 0 |
| EDIT-01 | Late joiner receives accumulated doc state | integration | `pytest tests/test_yjs_relay.py::test_late_joiner_state -x` | Wave 0 |
| EDIT-01 | Sender does not receive echo of own update | integration | `pytest tests/test_yjs_relay.py::test_no_echo -x` | Wave 0 |
| EDIT-02 | Python syntax highlighting renders | manual | Open browser, verify keyword colors | — |
| EDIT-03 | Remote cursor visible with correct color/name | manual | Two-tab test in browser | — |
| EDIT-04 | Line numbers visible in gutter | manual | Open browser, verify gutter | — |

**CRDT sync correctness (EDIT-01) is the only requirement fully automatable with pytest-asyncio.**
EDIT-02, EDIT-03, and EDIT-04 are visual/browser requirements — they require a human or Playwright.
The plan should include explicit manual verification steps for these three.

### Sampling Rate
- **Per task commit:** `pytest tests/test_yjs_relay.py -x -q`
- **Per wave merge:** `pytest tests/ -v`
- **Phase gate:** Full suite green + manual browser check of multi-cursor + syntax highlight before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/__init__.py` — package init
- [ ] `backend/tests/conftest.py` — shared fixtures: async test client, room creation helper
- [ ] `backend/tests/test_yjs_relay.py` — covers EDIT-01 (relay, late joiner, no-echo)
- [ ] `backend/pytest.ini` or `backend/pyproject.toml [tool.pytest.ini_options]` — asyncio_mode = "auto"
- [ ] Framework install: `pip install pytest pytest-asyncio httpx websockets` (httpx needed for TestClient, websockets for raw WS in tests)

### Integration Test Design Notes

The three EDIT-01 test cases require connecting two WebSocket clients to the same room and
verifying message flow. Use `httpx.AsyncClient` + `websockets` or FastAPI's built-in
`TestClient` with `WebSocketTestSession`. pytest-asyncio with `asyncio_mode="auto"` removes
boilerplate.

**test_update_relayed:** Client A sends `yjs_update`, verify Client B receives identical message.

**test_late_joiner_state:** Client A sends N updates. Client B connects after. Verify B receives
all N updates before `room_state`, in order.

**test_no_echo:** Client A sends `yjs_update`. Verify Client A does NOT receive the message back
(server uses `exclude_id`).

## Sources

### Primary (HIGH confidence)
- npm registry (verified 2026-04-02): y-codemirror.next@0.3.5, yjs@13.6.30, @codemirror/lang-python@6.2.1, @codemirror/view@6.41.0, @codemirror/state@6.6.0, @codemirror/theme-one-dark@6.1.3
- https://docs.yjs.dev/api/document-updates — Y.applyUpdate, encodeStateAsUpdate, mergeUpdates API
- https://github.com/yjs/y-codemirror.next — yCollab() usage, awareness.setLocalStateField pattern, peer dependency list
- Project codebase: `backend/app/models.py`, `backend/app/main.py`, `frontend/src/ws.js`, `frontend/src/pages/room.js` — integration points verified directly

### Secondary (MEDIUM confidence)
- y-codemirror.next npm publish history (2024-06-18 latest) — confirms active maintenance
- y-codemirror.next peer deps confirmed against installed CM6 versions — compatibility verified

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified against npm registry 2026-04-02
- Architecture: HIGH — custom provider pattern derived from Y.js official docs + locked decisions
- Pitfalls: HIGH — pitfall 1 (flush order), 2 (btoa), 3 (echo), 6 (height) are direct derivations from the architecture; pitfalls 4-5 are from clear design rules
- Validation: MEDIUM — pytest integration tests are the standard approach but no test infrastructure exists yet; Wave 0 work is clearly defined

**Research date:** 2026-04-02
**Valid until:** 2026-07-02 (90 days — stable ecosystem; y-codemirror.next version unlikely to change)
