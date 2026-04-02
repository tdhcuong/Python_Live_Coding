import base64
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .executor import run_python_async
from .room_manager import RoomManager

app = FastAPI(title="Python Live Coding")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Single global manager — correct for a single-process server (per ARCHITECTURE.md)
manager = RoomManager()


# ---------------------------------------------------------------------------
# HTTP endpoints
# ---------------------------------------------------------------------------

@app.get("/")
async def health_check():
    return {"status": "ok"}


@app.post("/create-room")
async def create_room():
    """Create a new room. Returns room_id, host_token, and the room URL."""
    room = manager.create_room()
    return {
        "room_id": room.id,
        "host_token": room.host_token,
        "room_url": f"/room/{room.id}",
    }


@app.get("/room/{room_id}")
async def get_room(room_id: str):
    """Return basic room info. 404 if room does not exist."""
    room = manager.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    return {
        "room_id": room.id,
        "participant_count": len(room.participants),
    }


# ---------------------------------------------------------------------------
# WebSocket endpoint
# ---------------------------------------------------------------------------

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    """
    WebSocket handler for room participation.

    Protocol:
      1. Client connects to /ws/{room_id}.
      2. Server immediately expects a "join_room" message with participant name.
      3. Server sends "room_state" to the new participant (current participant list).
      4. Server broadcasts "participant_joined" to the rest of the room.
      5. Loop: relay messages from this client to the room.
      6. On disconnect: broadcast "participant_left" to remaining participants.

    If the room does not exist, the WebSocket is closed with code 4004.
    """
    # Validate room exists before accepting the WebSocket
    room = manager.get_room(room_id)
    if room is None:
        await websocket.accept()
        await websocket.close(code=4004, reason="Room not found")
        return

    # Step 1: Accept but wait for join_room message to get the participant name
    # We must accept() here so the client can send its first message.
    # RoomManager.connect() will call accept() — but we need the name first.
    # So: accept manually here, read the join message, then register.
    await websocket.accept()

    try:
        join_msg = await websocket.receive_json()
    except Exception:
        await websocket.close(code=4000, reason="Expected join_room message")
        return

    if join_msg.get("type") != "join_room" or not join_msg.get("name", "").strip():
        await websocket.close(code=4001, reason="Invalid join_room message")
        return

    name = join_msg["name"].strip()[:32]  # cap display name at 32 chars

    # Step 2: Register participant (assigns UUID + color, stores websocket)
    # Re-read room because another connection could have removed it (unlikely but safe)
    room = manager.get_room(room_id)
    if room is None:
        await websocket.close(code=4004, reason="Room not found")
        return

    import uuid as _uuid
    from .models import Participant, PARTICIPANT_COLORS

    participant_id = str(_uuid.uuid4())
    used_colors = {p.color for p in room.participants.values()}
    color = next(
        (c for c in PARTICIPANT_COLORS if c not in used_colors),
        PARTICIPANT_COLORS[len(room.participants) % len(PARTICIPANT_COLORS)],
    )
    participant = Participant(
        id=participant_id,
        name=name,
        color=color,
        websocket=websocket,
    )
    room.participants[participant_id] = participant

    # Phase 2: Flush accumulated Y.js doc state to late joiner (D-05)
    for update_bytes in room.yjs_updates:
        b64 = base64.b64encode(update_bytes).decode('ascii')
        await manager.send_personal(websocket, {'type': 'yjs_update', 'update': b64})

    # Step 3: Send room_state to the new participant (personal, not broadcast)
    await manager.send_personal(websocket, {
        "type": "room_state",
        "room_id": room_id,
        "your_id": participant_id,
        "your_color": color,
        "participants": [p.to_dict() for p in room.participants.values()],
    })

    # Step 4: Broadcast participant_joined to everyone else in the room
    await manager.broadcast_to_room(
        room_id,
        {
            "type": "participant_joined",
            "participant": participant.to_dict(),
        },
        exclude_id=participant_id,
    )

    # Step 5: Message relay loop
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "yjs_update":
                # D-04/D-05: Accumulate raw bytes + relay to others (not sender)
                raw = base64.b64decode(data["update"])
                room.yjs_updates.append(raw)
                await manager.broadcast_to_room(room_id, data, exclude_id=participant_id)

            elif msg_type == "awareness_update":
                # Awareness is transient — relay only, never accumulate (Pitfall 4)
                await manager.broadcast_to_room(room_id, data, exclude_id=participant_id)

            elif msg_type == "run_code":
                # D-01: WebSocket-only execution flow
                if room.is_running:
                    # Reject concurrent run with personal error (Pitfall 4)
                    await manager.send_personal(websocket, {
                        "type": "error",
                        "message": "Execution already in progress",
                    })
                    continue

                code = data.get("code", "")
                if not isinstance(code, str):
                    continue

                room.is_running = True
                # D-11: Broadcast execution_start BEFORE awaiting (disables Run everywhere)
                await manager.broadcast_to_room(room_id, {"type": "execution_start"})

                try:
                    result = await run_python_async(code)
                finally:
                    room.is_running = False

                await manager.broadcast_to_room(room_id, {
                    "type": "execution_result",
                    "stdout": result.stdout,
                    "stderr": result.stderr,
                    "exit_code": result.exit_code,
                    "timed_out": result.timed_out,
                })

            else:
                await manager.send_personal(websocket, {
                    "type": "error",
                    "message": f"Unknown message type: {msg_type}",
                })

    except WebSocketDisconnect:
        pass  # Normal disconnect — handled in finally block

    finally:
        # Step 6: Remove participant and notify room (pitfall M4 + M7)
        removed = manager.disconnect(room_id, participant_id)
        if removed:
            await manager.broadcast_to_room(
                room_id,
                {
                    "type": "participant_left",
                    "participant_id": participant_id,
                    "name": name,
                },
            )
