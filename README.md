# Python Live Coding

A real-time collaborative Python coding platform. A host creates a room, sets a problem, and multiple participants join to code together in a shared editor. Anyone can run the Python code and the output is visible to all participants simultaneously. Exposed to the internet via a tunnel — no deployment needed.

- **Version:** 1.0.0
- **Author:** [Cuong Tran](https://github.com/tdhcuong)
- **Last Updated:** 2026-04-06

## Features

- **Room-based sessions** — Create a room, share the link, and start coding together
- **Real-time collaborative editing** — Y.js CRDT sync with multi-cursor awareness (see who's typing and where)
- **Python code execution** — Sandboxed server-side execution with stdout/stderr capture, broadcast to all participants
- **Host controls** — Set a problem statement (rich text), start a countdown timer, reset the editor, or end the session
- **Late-joiner support** — Full document state and room context restored for anyone who joins mid-session
- **Dark theme** — Professional, polished UI with CodeMirror 6 (One Dark theme)
- **Tunnel-ready** — Single-port architecture works behind cloudflared, ngrok, or localtunnel

## Screens

| Screen | Description |
|--------|-------------|
| **Home** | Landing page with "Create Room" button |
| **Room** | Main experience — editor, participants sidebar, problem panel, output, host controls |

## Architecture

```
Browser (CodeMirror 6 + Y.js)
    ↕ WebSocket
FastAPI (Python)
    ↕ asyncio.to_thread()
Sandboxed subprocess (resource limits)
```

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI app — HTTP endpoints, WebSocket handler, message routing |
| `app/room_manager.py` | Room/participant lifecycle, connection management, broadcast |
| `app/executor.py` | Sandboxed Python execution with `RLIMIT_CPU`, `RLIMIT_NPROC`, output caps |
| `app/models.py` | `Room` and `Participant` data classes |

### Frontend (`frontend/`)

| File | Purpose |
|------|---------|
| `src/main.js` | Client-side router — `/` for home, `/room/{id}` for room |
| `src/pages/home.js` | Landing page with room creation |
| `src/pages/room.js` | Main room view — editor, sidebar, problem panel, output, host controls |
| `src/editor/setup.js` | CodeMirror 6 editor setup with Python highlighting and Y.js binding |
| `src/editor/provider.js` | Y.js sync provider — sends/receives CRDT updates over WebSocket |
| `src/ws.js` | WebSocket abstraction with typed message handlers |
| `src/style.css` | Tailwind CSS v4 + custom scrollbar and theme variables |

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Python 3.9+, FastAPI, Uvicorn |
| Frontend | Vanilla JavaScript, Vite 5 |
| UI | Tailwind CSS v4 |
| Editor | CodeMirror 6 (One Dark theme, Python syntax) |
| Collaborative sync | Y.js + y-codemirror.next (CRDT) |
| Problem editor | TipTap (rich text, Markdown support) |
| Code execution | Python subprocess with resource limits |
| Tunnel | cloudflared (recommended), ngrok, or localtunnel |

## Getting Started

### Prerequisites

- Python 3.9+
- Node.js 18+
- npm

### Install

```bash
# Backend dependencies
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend dependencies
cd ../frontend
npm install
```

### Run in Development

Start the frontend dev server and backend in separate terminals:

```bash
# Terminal 1 — Frontend (hot reload on :5173)
cd frontend
npm run dev

# Terminal 2 — Backend (on :8000)
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Run in Production (Tunnel)

```bash
# Build frontend and start backend on :8000
./start-tunnel.sh
```

Then in a second terminal, expose it:

```bash
# Recommended — most reliable WebSocket support
cloudflared tunnel --url http://localhost:8000

# Alternatives
ngrok http 8000
npx localtunnel --port 8000
```

Share the public URL with participants.

## WebSocket Protocol

### Client → Server

| Message Type | Fields | Description |
|-------------|--------|-------------|
| `join_room` | `name`, `host_token?` | Join a room (host sends token) |
| `yjs_update` | `update` (base64) | CRDT document delta |
| `awareness_update` | `update` (base64) | Cursor/presence state |
| `run_code` | `code` | Execute Python code |
| `set_problem` | `host_token`, `problem` | Set problem statement (host only) |
| `start_timer` | `host_token`, `duration` | Start countdown timer (host only) |
| `reset_editor` | `host_token` | Clear editor content (host only) |
| `end_session` | `host_token` | End session for all (host only) |

### Server → Client

| Message Type | Fields | Description |
|-------------|--------|-------------|
| `room_state` | `participants`, `problem`, `timer`, `is_running` | Full state on join |
| `participant_joined` | `participant` | Someone joined |
| `participant_left` | `participant_id` | Someone left |
| `yjs_update` | `update` (base64) | Relayed CRDT delta |
| `awareness_update` | `update` (base64) | Relayed presence |
| `execution_start` | — | Code is running |
| `execution_result` | `stdout`, `stderr`, `exit_code`, `timed_out` | Execution output |
| `problem_update` | `problem` | Problem statement changed |
| `timer_start` | `started_at`, `duration` | Timer started |
| `reset_editor` | — | Editor cleared |
| `session_ended` | — | Host ended session |
| `error` | `message` | Something went wrong |

## Code Execution Sandbox

Code runs in a subprocess with these protections:

| Protection | Detail |
|-----------|--------|
| CPU time limit | 5s soft / 6s hard (`RLIMIT_CPU`) — kills infinite loops |
| Process limit | 20 (`RLIMIT_NPROC`) — prevents fork bombs |
| Wall-clock timeout | 10s via `subprocess.run(timeout=)` |
| Output caps | 50 KB stdout / 10 KB stderr |
| Stripped environment | `PATH=/usr/bin:/bin` only |
| Temp file execution | Code written to `/tmp`, not passed via `-c` |

## Testing

```bash
cd backend
pip install pytest pytest-asyncio httpx
pytest -v
```

8 tests covering executor unit tests, Y.js relay, code execution via WebSocket, and host controls.

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI app + WebSocket handler
│   │   ├── room_manager.py   # Room/participant management
│   │   ├── executor.py       # Sandboxed Python execution
│   │   └── models.py         # Room, Participant data classes
│   ├── tests/                # pytest test suite
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.js           # Entry point + router
│   │   ├── style.css         # Tailwind + custom styles
│   │   ├── ws.js             # WebSocket abstraction
│   │   ├── pages/
│   │   │   ├── home.js       # Landing page
│   │   │   └── room.js       # Room page
│   │   └── editor/
│   │       ├── setup.js      # CodeMirror 6 setup
│   │       └── provider.js   # Y.js sync provider
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── start-tunnel.sh           # Production startup script
└── CLAUDE.md                 # Project documentation (AI context)
```

## License

This project is licensed under the [Apache License 2.0](LICENSE).
