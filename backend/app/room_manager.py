import uuid
import asyncio
from fastapi import WebSocket
from .models import Room, Participant, PARTICIPANT_COLORS


class RoomManager:
    def __init__(self):
        # All active rooms: room_id -> Room
        self.rooms: dict[str, Room] = {}

    # -------------------------------------------------------------------------
    # Room lifecycle
    # -------------------------------------------------------------------------

    def create_room(self) -> Room:
        """Create a new room with a unique ID and host token. Store in memory."""
        room_id = str(uuid.uuid4())
        host_token = str(uuid.uuid4())
        room = Room(id=room_id, host_token=host_token)
        self.rooms[room_id] = room
        return room

    def get_room(self, room_id: str) -> Room | None:
        return self.rooms.get(room_id)

    def remove_room(self, room_id: str) -> None:
        """Remove room from memory (called after session_ended broadcast)."""
        self.rooms.pop(room_id, None)

    # -------------------------------------------------------------------------
    # Participant management
    # -------------------------------------------------------------------------

    def _assign_color(self, room: Room) -> str:
        """Pick the next available color from PARTICIPANT_COLORS (cycles)."""
        used = {p.color for p in room.participants.values()}
        for color in PARTICIPANT_COLORS:
            if color not in used:
                return color
        # All colors used — cycle back to first
        return PARTICIPANT_COLORS[len(room.participants) % len(PARTICIPANT_COLORS)]

    async def connect(self, room_id: str, websocket: WebSocket, name: str) -> Participant:
        """Accept the WebSocket connection and add participant to the room.

        Returns the new Participant. Caller must handle WebSocketDisconnect
        and call disconnect() in a finally block.
        """
        await websocket.accept()
        room = self.rooms[room_id]
        participant_id = str(uuid.uuid4())
        color = self._assign_color(room)
        participant = Participant(
            id=participant_id,
            name=name,
            color=color,
            websocket=websocket,
        )
        room.participants[participant_id] = participant
        return participant

    def disconnect(self, room_id: str, participant_id: str) -> Participant | None:
        """Remove participant from room. Returns the removed participant or None."""
        room = self.rooms.get(room_id)
        if room is None:
            return None
        return room.participants.pop(participant_id, None)

    # -------------------------------------------------------------------------
    # Broadcasting (always room-scoped — never global, per pitfall M1)
    # -------------------------------------------------------------------------

    async def broadcast_to_room(
        self,
        room_id: str,
        message: dict,
        exclude_id: str | None = None,
    ) -> None:
        """Send a JSON message to all participants in the room.

        Silently skips disconnected sockets. Always room-scoped (pitfall M1).
        exclude_id: participant_id to skip (used for sender-excludes-self patterns).
        """
        room = self.rooms.get(room_id)
        if room is None:
            return
        dead: list[str] = []
        for pid, participant in list(room.participants.items()):
            if pid == exclude_id:
                continue
            try:
                await participant.websocket.send_json(message)
            except Exception:
                # Mark for cleanup — do not modify dict while iterating
                dead.append(pid)
        # Clean up dead connections (pitfall M7)
        for pid in dead:
            room.participants.pop(pid, None)

    async def send_personal(self, websocket: WebSocket, message: dict) -> None:
        """Send a JSON message to one specific WebSocket connection."""
        await websocket.send_json(message)
