# Phase 5: Polish and Tunneling - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the app polished and publicly accessible. Delivers remaining UI requirements (dark theme
refinement, responsive layout, copy-link button) and exposes the app over the internet via
localtunnel and ngrok with WebSocket connections working correctly through both tunnel providers.

Delivers requirements: ROOM-05, UI-01, UI-02, UI-04, TUNA-01, TUNA-02, TUNA-03.

</domain>

<decisions>
## Implementation Decisions

### Tunnel Deployment Model
- **D-01:** FastAPI serves the built frontend as static files — `vite build` outputs to `frontend/dist`,
  FastAPI mounts that directory and serves it at `/`. A single port (8000) is tunneled, giving
  participants one URL for HTTP API, WS, and the app itself. Dev workflow unchanged (Vite still on :5173).
- **D-02:** CORS on the backend retains the existing `localhost:5173` / `127.0.0.1:5173` allowlist for
  dev mode. When served via FastAPI static files, all requests are same-origin so CORS headers are
  irrelevant for prod/tunnel use.
- **D-03:** FastAPI needs `aiofiles` (pip install) and `StaticFiles` from `starlette.staticfiles`.
  Mount after all API routes: `app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")`.
  This must be the LAST mount — route precedence matters.

### Frontend URL Detection
- **D-04:** Replace the hardcoded `const API_BASE = "http://localhost:8000"` in `room.js` and any
  other files with a dev-sentinel pattern:
  ```js
  const IS_DEV = window.location.port === '5173';
  const API_BASE = IS_DEV ? 'http://localhost:8000' : window.location.origin;
  ```
- **D-05:** WebSocket URL follows the same pattern — derive protocol from `location.protocol`:
  ```js
  const wsBase = IS_DEV
    ? 'ws://localhost:8000'
    : (location.protocol === 'https:' ? 'wss' : 'ws') + '://' + location.host;
  ```
  This handles both `lt` (HTTPS → WSS) and ngrok (HTTPS → WSS) automatically.
- **D-06:** Search for all occurrences of `localhost:8000` in frontend source and apply the same
  pattern. Check `home.js` (create-room fetch) and `room.js` (all API and WS calls).

### Tunnel Startup Workflow
- **D-07:** Add a `start-tunnel.sh` script at repo root. It should:
  1. Build the frontend (`cd frontend && npm run build`)
  2. Print the localtunnel command and ngrok equivalent
  3. Start the backend (`cd backend && uvicorn app.main:app ...`)
  The user then opens a second terminal for the tunnel command of their choice.
- **D-08:** localtunnel command: `npx lt --port 8000`. ngrok command: `ngrok http 8000`. Both work
  identically since both proxy to FastAPI on port 8000.
- **D-09:** STATE.md flag noted: localtunnel WebSocket upgrade behavior cannot be verified without
  running live. Researcher/planner should include a `wscat` test step in the plan (test WS through
  the tunnel before declaring TUNA-01 complete). If localtunnel proves unreliable for WS, ngrok is
  the fallback.

### Copy Link Button (ROOM-05)
- **D-10:** Copy link button lives in the room header, visible to ALL participants (not host-only).
  Any participant can share the link. Clicking copies `window.location.href` to clipboard.
- **D-11:** Button shows a brief "Copied!" label change (1.5s) as confirmation — no toast needed,
  the label change is sufficient feedback. Uses the Clipboard API (`navigator.clipboard.writeText`).
- **D-12:** Button label: a link/chain icon (SVG) or "Copy Link" text. Placed in the header near the
  room ID display. Style matches existing header elements (gray palette, small text).

### UI Polish (UI-04)
- **D-13:** Dark theme is already implemented (CSS variables, `--color-bg`, `--color-surface`, etc.).
  Polish pass focuses on completeness and consistency:
  - Home page: ensure it matches the room UI quality (typography, spacing, rounded corners)
  - Room view: verify all states look correct (problem panel expanded/collapsed, timer active/expired,
    output panel with content, disconnected state)
  - Hover states, focus rings, transitions — ensure they're consistent across all interactive elements
- **D-14:** No redesign — fix rough edges only. The established dark palette (`bg-gray-900`,
  `bg-gray-800`, `border-gray-800`, `text-gray-100`) stays. Inter font stays.

### Responsive Layout (UI-02)
- **D-15:** Mobile-first layout is explicitly out of scope (REQUIREMENTS.md). Target: laptop/desktop
  screens (1024px+). The layout should not break or produce horizontal scroll at typical laptop widths.
- **D-16:** The w-56 sidebar is acceptable at laptop widths. No sidebar collapse needed. Ensure the
  editor + output column fills remaining width correctly using `flex-1`. Verify at ~1024px width.
- **D-17:** Output panel height (`style="height: 35%"`) should be a `min-h` + `flex-shrink` approach
  rather than a fixed percentage, so it doesn't overflow on short screens. Claude's discretion on
  exact implementation.

### Claude's Discretion
- Exact copy-link button icon vs text label
- Output panel height behavior on short screens (within constraint D-17)
- `start-tunnel.sh` exact command sequence and error handling
- Whether to add a `README.md` section documenting tunnel usage

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §ROOM-05 — Copy link requirement
- `.planning/REQUIREMENTS.md` §UI-01, UI-02, UI-04 — UI polish requirements
- `.planning/REQUIREMENTS.md` §TUNA-01, TUNA-02, TUNA-03 — Tunnel requirements
- `.planning/REQUIREMENTS.md` §Out of Scope — "Mobile-first layout" is explicitly excluded

### Architecture constraints
- `CLAUDE.md` §"What NOT to Use" — no innerHTML, no exec(), no shell=True
- `CLAUDE.md` §"Constraints" — localtunnel (`lt`) is the stated deployment method
- `CLAUDE.md` §"Frontend / UI Framework" — Vanilla JS + Tailwind v4, no React

### Existing integration points
- `frontend/src/pages/room.js` — All API_BASE and WS URL references; `renderRoomView()` header HTML
- `frontend/src/pages/home.js` — `POST /create-room` fetch; any hardcoded API_BASE references
- `frontend/vite.config.js` — Build config; add `build.outDir` if needed
- `backend/app/main.py` — Add StaticFiles mount; must be LAST route/mount
- `backend/requirements.txt` — Add `aiofiles`

### STATE.md flag
- `.planning/STATE.md` §Blockers/Concerns — "localtunnel WebSocket upgrade behavior cannot be
  verified without running the tunnel live. Test with `wscat` early. If unreliable, use ngrok."

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `showToast(container, message)` in `room.js` — available for copy-link confirmation if label-change
  is not sufficient (but D-11 prefers label change over toast)
- `renderRoomView()` header HTML — copy link button slots into the header `flex items-center gap-2` div
- CSS variables (`--color-bg`, `--color-surface`, etc.) in `style.css` — use these, not raw hex values
- Inter font already imported via body style rule — no font loading changes needed

### Established Patterns
- All user-visible text: `textContent` never `innerHTML`
- Dark palette: `bg-gray-900` surfaces, `bg-gray-800` inputs, `border-gray-800` dividers, `text-gray-100` body
- Button pattern: `bg-indigo-600 hover:bg-indigo-500` for primary, `bg-gray-700 hover:bg-gray-600` for secondary
- `transition-colors duration-150` on all interactive elements
- `focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-gray-900` for focus states

### Integration Points
- **FastAPI StaticFiles mount:** Must come after `@app.get(...)`, `@app.post(...)`, and `@app.websocket(...)` routes.
  `app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="static")` — `html=True` handles
  SPA fallback (serves `index.html` for unknown paths).
- **URL detection:** Replace `const API_BASE = "http://localhost:8000"` in `room.js` line 12 and any
  equivalent in `home.js`. Apply D-04 pattern.
- **WS URL:** Search `room.js` for `ws://` or `wss://` construction and apply D-05 pattern.

</code_context>

<specifics>
## Specific Ideas

- Tunnel model: user explicitly selected the "Build + FastAPI serves static" option — one URL,
  no proxy, `IS_DEV` sentinel for URL detection.
- `start-tunnel.sh` at repo root — builds frontend then guides user to run tunnel.
- Copy link: header placement, label-change confirmation ("Copied!" for 1.5s), all participants.

</specifics>

<deferred>
## Deferred Ideas

- Sidebar collapse on narrow screens — user did not select this as a gray area; Claude discretion
  on minor responsive fixes applies (D-15 through D-17).
- Comprehensive UI redesign — Phase 5 is a polish pass, not a redesign.
- WebSocket reconnection / auto-reconnect on tunnel disconnect — out of scope; phase only validates
  that WS works through tunnel, not that it reconnects.

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 05-polish-and-tunneling*
*Context gathered: 2026-04-04*
