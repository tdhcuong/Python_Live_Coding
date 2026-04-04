---
phase: 05-polish-and-tunneling
plan: 02
subsystem: infra
tags: [fastapi, staticfiles, vite, localtunnel, ngrok, cloudflared, spa-routing, websocket]

# Dependency graph
requires:
  - phase: 05-01-polish-and-tunneling
    provides: polished UI with dark theme, copy-link button, and responsive layout
  - phase: 04-host-controls
    provides: complete feature set (problem panel, timer, reset, run code)
provides:
  - FastAPI serves built frontend from frontend/dist on port 8000
  - Dynamic IS_DEV pattern for API and WebSocket URL detection
  - wss:// WebSocket upgrade detection for HTTPS tunnels
  - start-tunnel.sh one-command deployment script
  - SPA catch-all route for client-side routing through tunnel
  - Host disconnect ends session (host_token sent in join_room)
  - end_session relay loop fix (break after remove_room)
affects: [deployment, future phases using tunnel URLs]

# Tech tracking
tech-stack:
  added: [aiofiles>=24.0.0, cloudflared (recommended over localtunnel)]
  patterns:
    - IS_DEV sentinel based on window.location.port === '5173'
    - Dynamic wsProtocol using location.protocol === 'https:'
    - FastAPI StaticFiles guarded by if _frontend_dist.is_dir()
    - Explicit /assets mount + /{full_path:path} catch-all for SPA
    - GET /api/room/{room_id} prefix to avoid SPA routing collision

key-files:
  created:
    - start-tunnel.sh
  modified:
    - backend/app/main.py
    - backend/app/models.py
    - backend/requirements.txt
    - frontend/src/ws.js
    - frontend/src/pages/room.js
    - frontend/src/pages/home.js
    - frontend/vite.config.js

key-decisions:
  - "GET /room/{room_id} renamed to GET /api/room/{room_id} — plain /room/* path conflicts with SPA client-side routes served by FastAPI catch-all"
  - "StaticFiles html=True catch-all replaced with explicit /assets mount + /{full_path:path} FileResponse route — gives full control over SPA fallback behavior"
  - "host_token included in join_room message so backend can identify host disconnect and trigger session_ended"
  - "break added after remove_room in end_session handler — prevents relay loop crash when room no longer exists"
  - "start-tunnel.sh updated to recommend cloudflared over localtunnel — cloudflared has more reliable WebSocket upgrade behavior"
  - "IS_DEV = window.location.port === '5173' chosen as sentinel — simple, reliable, zero build-time config"

patterns-established:
  - "IS_DEV pattern: const IS_DEV = window.location.port === '5173'; const API_BASE = IS_DEV ? 'http://localhost:8000' : window.location.origin"
  - "wss detection: const wsProtocol = (!IS_DEV && location.protocol === 'https:') ? 'wss' : 'ws'"
  - "SPA routing in FastAPI: explicit static asset mount at /assets, then /{full_path:path} FileResponse returning index.html"
  - "API routes prefixed with /api/ to prevent collision with frontend SPA paths"

requirements-completed: [TUNA-01, TUNA-02, TUNA-03]

# Metrics
duration: 60min
completed: 2026-04-04
---

# Phase 5 Plan 02: Tunnel Setup Summary

**FastAPI serves built frontend via static files on port 8000 with dynamic IS_DEV URL detection, SPA routing fix, and cloudflared-ready start-tunnel.sh**

## Performance

- **Duration:** ~60 min
- **Started:** 2026-04-04
- **Completed:** 2026-04-04
- **Tasks:** 3 (2 auto + 1 human verify) + 4 post-checkpoint fixes
- **Files modified:** 8

## Accomplishments

- Backend serves the built frontend from `frontend/dist` via FastAPI StaticFiles — entire app runs on a single port (8000)
- All frontend URLs dynamically detect dev vs production mode using the IS_DEV sentinel (port 5173), switching to `wss://` for HTTPS tunnels automatically
- SPA routing conflict resolved: API route renamed to `/api/room/{id}`, and a `/{full_path:path}` catch-all serves `index.html` for client-side routes
- Host tab-close now correctly ends the session for all participants (host_token threaded through join_room message)
- Relay crash fixed: `break` added in end_session handler after `remove_room` prevents a crash when the relay loop tries to continue after the room is gone
- `start-tunnel.sh` provides a one-command build + launch, recommending cloudflared as the most reliable WebSocket-compatible tunnel

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend static file serving + frontend URL detection** - `2ad5305` (feat)
2. **Task 2: Create start-tunnel.sh script and verify build** - `8a52d5e` (feat)
3. **Task 3: Human tunnel verification** - checkpoint approved by user (no commit)
4. **Post-checkpoint fix: Rename /room/{id} to /api/room/{id}** - `61231af` (fix)
5. **Post-checkpoint fix: Replace StaticFiles catch-all with explicit SPA route** - `1e9bedd` (fix)
6. **Post-checkpoint fix: Host disconnect ends session** - `6d88bd4` (feat)
7. **Post-checkpoint fix: Fix end_session relay loop crash** - `7f7f1be` (fix)
8. **Post-checkpoint fix: Update start-tunnel.sh to recommend cloudflared** - `55eee98` (chore)

## Files Created/Modified

- `start-tunnel.sh` - One-command build + launch script; prints tunnel instructions; recommends cloudflared
- `backend/app/main.py` - Added StaticFiles mount, /assets explicit mount, /{full_path:path} SPA catch-all, renamed room endpoint to /api/room/{id}, host disconnect end_session trigger, break after remove_room
- `backend/app/models.py` - Added host_token field handling so backend can identify which participant is the host on disconnect
- `backend/requirements.txt` - Added aiofiles>=24.0.0 (required by FastAPI StaticFiles)
- `frontend/src/ws.js` - Replaced hardcoded ws://localhost:8000 with dynamic IS_DEV + wsProtocol detection
- `frontend/src/pages/room.js` - Replaced hardcoded API_BASE with IS_DEV sentinel pattern; updated room API path to /api/room/{id}
- `frontend/src/pages/home.js` - Replaced hardcoded API_BASE with IS_DEV sentinel pattern
- `frontend/vite.config.js` - Added explicit build.outDir: "dist"

## Decisions Made

- **GET /api/room/{room_id} prefix:** The plain `/room/{id}` path conflicted with the SPA catch-all route in FastAPI, causing the API request to return `index.html` instead of JSON. Moving it under `/api/` cleanly separates API routes from client-side routes.
- **Explicit SPA catch-all instead of StaticFiles html=True:** The Starlette `StaticFiles(html=True)` catch-all does not allow interleaving with other routes at the same mount point. Switching to an explicit `/assets` mount + `/{full_path:path}` FileResponse gives full control over which paths fall through to the SPA shell.
- **host_token in join_room:** The only way to identify the host on WebSocket disconnect is to have the client send the host_token during room join. This was threaded from sessionStorage through the join_room message to the backend Room model.
- **cloudflared over localtunnel:** localtunnel WebSocket upgrade behavior is unreliable (pre-existing concern noted in STATE.md). cloudflared uses the Cloudflare edge network and handles WebSocket upgrades reliably. Updated start-tunnel.sh instructions accordingly.
- **IS_DEV = window.location.port === '5173':** Chosen over Vite's `import.meta.env.DEV` because it works at runtime with zero build config. The port sentinel is reliable and requires no Vite environment variable setup.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SPA routing conflict: /room/{id} API route collided with FastAPI static file catch-all**
- **Found during:** Post-checkpoint verification (after Task 3 human approval)
- **Issue:** FastAPI's StaticFiles mount with `html=True` was intercepting GET requests to `/room/{room_id}` and returning index.html instead of room JSON. Frontend received HTML where it expected JSON, causing room join to fail.
- **Fix:** Renamed API route from `GET /room/{room_id}` to `GET /api/room/{room_id}`. Replaced `StaticFiles(html=True)` catch-all with an explicit `/assets` mount and a `/{full_path:path}` route that returns `index.html` as a FileResponse.
- **Files modified:** `backend/app/main.py`, `frontend/src/pages/room.js`
- **Verification:** Room creation and join work through the tunnel URL
- **Committed in:** `61231af`, `1e9bedd`

**2. [Rule 1 - Bug] Host tab-close did not trigger session_ended for participants**
- **Found during:** Post-checkpoint tunnel testing
- **Issue:** When the host closed their browser tab, the WebSocket disconnect fired but the backend could not identify which disconnected participant was the host. Participants' sessions continued indefinitely with no session_ended event.
- **Fix:** Frontend now sends `host_token` in the `join_room` message. Backend stores it on the Room model. On WebSocket disconnect, if the disconnected participant's stored host_token matches, `session_ended` is broadcast and the room is removed.
- **Files modified:** `backend/app/main.py`, `backend/app/models.py`, `frontend/src/pages/room.js`
- **Verification:** Host closing tab correctly ends session for all participants
- **Committed in:** `6d88bd4`

**3. [Rule 1 - Bug] end_session handler crashed relay loop after remove_room**
- **Found during:** Testing host disconnect fix
- **Issue:** After broadcasting `session_ended` and calling `remove_room`, the relay loop in the WebSocket endpoint continued iterating and called `receive_json` on a connection whose room no longer existed. This raised an unhandled exception crashing the connection handler.
- **Fix:** Added `break` statement immediately after `remove_room` in the end_session path to exit the relay loop.
- **Files modified:** `backend/app/main.py`
- **Verification:** Host disconnect cleanly closes the connection handler without exceptions
- **Committed in:** `7f7f1be`

**4. [Rule 2 - Missing Critical] Recommend cloudflared instead of localtunnel in start-tunnel.sh**
- **Found during:** Tunnel testing (STATE.md had pre-existing concern about localtunnel WebSocket reliability)
- **Issue:** localtunnel WebSocket upgrade behavior is unreliable for persistent connections. The original script listed `npx lt --port 8000` as the primary option.
- **Fix:** Updated `start-tunnel.sh` to recommend cloudflared as primary option with clear install instructions, listing localtunnel as secondary fallback.
- **Files modified:** `start-tunnel.sh`
- **Verification:** Script clearly documents cloudflared install and tunnel command
- **Committed in:** `55eee98`

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 bug + crash fix, 1 missing critical recommendation)
**Impact on plan:** All fixes were necessary for the plan's goal. The SPA routing fix and host disconnect fix were blocking correctness issues; the relay crash fix was a stability requirement; the cloudflared recommendation addresses a pre-known WebSocket reliability concern.

## Issues Encountered

- The Starlette StaticFiles `html=True` option is documented as serving index.html for directory requests, but its catch-all behavior also intercepts API routes at overlapping paths. This is a known limitation requiring explicit route prefixing or a custom SPA fallback handler rather than relying on the StaticFiles `html=True` flag alone.
- localtunnel's WebSocket upgrade reliability was flagged as a concern in STATE.md before Phase 5 began. Real-world testing confirmed the concern — cloudflared handles WebSocket connections more reliably through the tunnel edge.

## User Setup Required

None — no external service configuration required beyond running `./start-tunnel.sh` and following the printed tunnel instructions.

## Next Phase Readiness

Phase 5 is now complete. All planned phases (1 through 5) are done. The app is:
- Fully functional end-to-end (room creation, collaborative editing, code execution, host controls)
- Deployable over a public tunnel URL via a single `./start-tunnel.sh` command
- WebSocket-compatible through HTTPS tunnels (wss:// auto-detected)
- Stable under host disconnect scenarios

No remaining blockers. The project has reached its v1.0 milestone.

---
*Phase: 05-polish-and-tunneling*
*Completed: 2026-04-04*
