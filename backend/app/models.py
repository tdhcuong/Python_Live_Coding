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
    yjs_updates: list[bytes] = field(default_factory=list)  # Phase 2: accumulated CRDT updates
    is_running: bool = False  # Phase 3: concurrent execution guard
    problem: str | None = None        # Phase 4: HOST-01 — set by host via set_problem
    timer: dict | None = None         # Phase 4: HOST-02 — {started_at: ISO str, duration: int seconds}
    host_participant_id: str | None = None  # Phase 5: participant_id of the host (set on join)
