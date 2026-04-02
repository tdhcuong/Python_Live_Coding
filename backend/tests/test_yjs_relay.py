"""Integration tests for Y.js WebSocket relay (EDIT-01)."""
import base64
import json
import pytest
from httpx import AsyncClient, ASGITransport
from starlette.testclient import TestClient
from app.main import app


@pytest.fixture
def sync_client():
    """Synchronous test client for WebSocket testing."""
    return TestClient(app)


def _join_room(ws, name):
    """Send join_room message and return room_state response.

    Drains any preceding yjs_update messages (late-joiner flush) before
    returning the room_state. Returns (room_state, pre_updates) tuple.
    """
    ws.send_json({"type": "join_room", "name": name})
    pre_updates = []
    while True:
        resp = ws.receive_json()
        if resp["type"] == "yjs_update":
            pre_updates.append(resp)
        elif resp["type"] == "room_state":
            return resp
        else:
            raise AssertionError(f"Unexpected message during join: {resp}")


def _make_fake_update(content: str = "hello") -> str:
    """Create a base64-encoded fake Y.js update (arbitrary bytes for relay testing)."""
    return base64.b64encode(content.encode()).decode()


class TestYjsUpdateRelay:
    """EDIT-01: yjs_update messages are relayed between participants."""

    def test_update_relayed(self, sync_client, room_id):
        """Client A sends yjs_update; Client B receives it."""
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws_a:
            _join_room(ws_a, "Alice")

            with sync_client.websocket_connect(f"/ws/{room_id}") as ws_b:
                state_b = _join_room(ws_b, "Bob")

                # Alice should receive participant_joined for Bob
                joined_msg = ws_a.receive_json()
                assert joined_msg["type"] == "participant_joined"

                # Alice sends a yjs_update
                fake_update = _make_fake_update("test-update-1")
                ws_a.send_json({"type": "yjs_update", "update": fake_update})

                # Bob should receive the yjs_update
                msg = ws_b.receive_json()
                assert msg["type"] == "yjs_update"
                assert msg["update"] == fake_update

    def test_no_echo(self, sync_client, room_id):
        """Client A sends yjs_update; Client A does NOT receive it back."""
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws_a:
            _join_room(ws_a, "Alice")

            with sync_client.websocket_connect(f"/ws/{room_id}") as ws_b:
                _join_room(ws_b, "Bob")

                # Drain Alice's participant_joined notification
                joined = ws_a.receive_json()
                assert joined["type"] == "participant_joined"

                # Alice sends yjs_update
                fake_update = _make_fake_update("echo-test")
                ws_a.send_json({"type": "yjs_update", "update": fake_update})

                # Bob receives it
                msg = ws_b.receive_json()
                assert msg["type"] == "yjs_update"

                # Alice should NOT receive her own update back
                # Send a second message from Bob to verify Alice's queue is clean
                fake_update_2 = _make_fake_update("from-bob")
                ws_b.send_json({"type": "yjs_update", "update": fake_update_2})

                next_msg = ws_a.receive_json()
                assert next_msg["type"] == "yjs_update"
                assert next_msg["update"] == fake_update_2  # From Bob, not echo

    def test_late_joiner_state(self, sync_client, room_id):
        """Client A sends updates while B is present, then C joins and receives state.

        Alice and Bob are connected. Alice sends 3 updates (Bob receives them,
        confirming server-side processing). Then Carol connects as a late joiner
        and should receive all 3 accumulated updates before room_state.
        """
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws_a:
            _join_room(ws_a, "Alice")

            with sync_client.websocket_connect(f"/ws/{room_id}") as ws_b:
                _join_room(ws_b, "Bob")

                # Alice drains Bob's participant_joined notification
                joined = ws_a.receive_json()
                assert joined["type"] == "participant_joined"

                # Alice sends 3 updates; Bob receives them, confirming server processed them
                updates = [_make_fake_update(f"update-{i}") for i in range(3)]
                for u in updates:
                    ws_a.send_json({"type": "yjs_update", "update": u})
                    # Synchronize: wait for Bob to receive each update (confirms processing)
                    bob_msg = ws_b.receive_json()
                    assert bob_msg["type"] == "yjs_update"
                    assert bob_msg["update"] == u

                # Carol joins late — should receive 3 accumulated updates before room_state
                with sync_client.websocket_connect(f"/ws/{room_id}") as ws_c:
                    ws_c.send_json({"type": "join_room", "name": "Carol"})
                    received_updates = []
                    while True:
                        msg = ws_c.receive_json()
                        if msg["type"] == "yjs_update":
                            received_updates.append(msg["update"])
                        elif msg["type"] == "room_state":
                            break

                    assert len(received_updates) == 3
                    assert received_updates == updates

    def test_awareness_not_accumulated(self, sync_client, room_id):
        """awareness_update messages are relayed but NOT stored on the server.

        Alice and Bob are connected. Alice sends awareness_update (Bob receives it,
        confirming server-side processing). Then Carol connects as a late joiner
        and should NOT receive the awareness_update — only room_state.
        """
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws_a:
            _join_room(ws_a, "Alice")

            with sync_client.websocket_connect(f"/ws/{room_id}") as ws_b:
                _join_room(ws_b, "Bob")

                # Alice drains Bob's participant_joined notification
                joined = ws_a.receive_json()
                assert joined["type"] == "participant_joined"

                # Alice sends an awareness_update; Bob receives it (confirms processing)
                fake_awareness = base64.b64encode(b"cursor-pos").decode()
                ws_a.send_json({"type": "awareness_update", "update": fake_awareness})
                bob_msg = ws_b.receive_json()
                assert bob_msg["type"] == "awareness_update"

                # Carol joins late — must NOT receive the awareness_update
                with sync_client.websocket_connect(f"/ws/{room_id}") as ws_c:
                    ws_c.send_json({"type": "join_room", "name": "Carol"})
                    # Carol should receive room_state directly (no accumulated awareness)
                    msg = ws_c.receive_json()
                    assert msg["type"] == "room_state"
