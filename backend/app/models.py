from dataclasses import dataclass, field
from fastapi import WebSocket


# Predefined colors for participant cursors/avatars (reused in Phase 2 for multi-cursor)
PARTICIPANT_COLORS = [
    "#6366f1",  # indigo
    "#22c55e",  # green
    "#f59e0b",  # amber
    "#ec4899",  # pink
    "#14b8a6",  # teal
    "#f97316",  # orange
    "#8b5cf6",  # violet
    "#06b6d4",  # cyan
]


@dataclass
class Participant:
    id: str           # UUID string, unique per connection
    name: str         # display name chosen by user
    color: str        # hex color from PARTICIPANT_COLORS
    websocket: WebSocket

    def to_dict(self) -> dict:
        """Serializable representation (excludes websocket object)."""
        return {"id": self.id, "name": self.name, "color": self.color}


@dataclass
class Room:
    id: str                                   # UUID string
    host_token: str                           # opaque UUID token — required for host-only actions (Phase 4)
    participants: dict[str, Participant] = field(default_factory=dict)
    # Phase 2 will add: yjs_updates: list[bytes] = field(default_factory=list)
    # Phase 4 will add: problem: str | None = None, timer: dict | None = None
