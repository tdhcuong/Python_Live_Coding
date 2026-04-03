"""Integration tests for host-control WebSocket protocol (HOST-01, HOST-02, HOST-04)."""
import pytest
from starlette.testclient import TestClient
from app.main import app


@pytest.fixture
def sync_client():
    return TestClient(app)


@pytest.fixture
def host_room(sync_client):
    """Create a room and return (room_id, host_token) tuple."""
    resp = sync_client.post("/create-room")
    assert resp.status_code == 200
    data = resp.json()
    return data["room_id"], data["host_token"]


def _join_room(ws, name):
    """Send join_room and drain until room_state."""
    ws.send_json({"type": "join_room", "name": name})
    while True:
        resp = ws.receive_json()
        if resp["type"] == "room_state":
            return resp
        elif resp["type"] in ("yjs_update", "participant_joined"):
            continue
        else:
            raise AssertionError(f"Unexpected during join: {resp}")


def _drain_until(ws, target_type, max_messages=10):
    """Read messages until target_type is found."""
    for _ in range(max_messages):
        msg = ws.receive_json()
        if msg["type"] == target_type:
            return msg
    raise AssertionError(f"Did not receive {target_type!r} within {max_messages} messages")


class TestHostControls:
    def test_set_problem_broadcasts(self, sync_client, host_room):
        """Host sends set_problem with valid token; receives problem_update broadcast."""
        room_id, token = host_room
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws:
            _join_room(ws, "Alice")
            ws.send_json({"type": "set_problem", "host_token": token, "problem": "Find the bug"})
            msg = _drain_until(ws, "problem_update")
            assert msg["problem"] == "Find the bug"

    def test_set_problem_unauthorized(self, sync_client, host_room):
        """Wrong host_token returns personal error; no broadcast."""
        room_id, _token = host_room
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws:
            _join_room(ws, "Alice")
            ws.send_json({"type": "set_problem", "host_token": "wrong-token", "problem": "Hack me"})
            msg = ws.receive_json()
            assert msg["type"] == "error"
            assert msg["message"] == "Unauthorized"

    def test_late_joiner_receives_problem(self, sync_client, host_room):
        """After set_problem, a new joiner's room_state includes the problem field."""
        room_id, token = host_room
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws1:
            _join_room(ws1, "Alice")
            ws1.send_json({"type": "set_problem", "host_token": token, "problem": "Find the bug"})
            _drain_until(ws1, "problem_update")

            with sync_client.websocket_connect(f"/ws/{room_id}") as ws2:
                state = _join_room(ws2, "Bob")
                assert state["problem"] == "Find the bug"

    def test_start_timer_broadcasts(self, sync_client, host_room):
        """Host sends start_timer with valid token and duration=5; receives timer_start with 300s."""
        room_id, token = host_room
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws:
            _join_room(ws, "Alice")
            ws.send_json({"type": "start_timer", "host_token": token, "duration": 5})
            msg = _drain_until(ws, "timer_start")
            assert msg["duration"] == 300
            assert "started_at" in msg
            assert isinstance(msg["started_at"], str)

    def test_start_timer_invalid_duration(self, sync_client, host_room):
        """Invalid duration=7 is silently ignored — loop continues normally."""
        room_id, token = host_room
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws:
            _join_room(ws, "Alice")
            # Send invalid duration — should be silently ignored
            ws.send_json({"type": "start_timer", "host_token": token, "duration": 7})
            # Now send a valid known-good message to confirm loop continued without error
            ws.send_json({"type": "set_problem", "host_token": token, "problem": "Loop continued"})
            msg = _drain_until(ws, "problem_update")
            assert msg["problem"] == "Loop continued"

    def test_late_joiner_receives_timer(self, sync_client, host_room):
        """After start_timer, new joiner's room_state includes timer dict."""
        room_id, token = host_room
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws1:
            _join_room(ws1, "Alice")
            ws1.send_json({"type": "start_timer", "host_token": token, "duration": 5})
            _drain_until(ws1, "timer_start")

            with sync_client.websocket_connect(f"/ws/{room_id}") as ws2:
                state = _join_room(ws2, "Bob")
                assert isinstance(state["timer"], dict)
                assert "started_at" in state["timer"]
                assert state["timer"]["duration"] == 300

    def test_reset_editor_broadcasts(self, sync_client, host_room):
        """Host sends reset_editor with valid token; receives reset_editor with default content."""
        room_id, token = host_room
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws:
            _join_room(ws, "Alice")
            ws.send_json({"type": "reset_editor", "host_token": token})
            msg = _drain_until(ws, "reset_editor")
            assert msg["content"] == "# Write your solution here\n"

    def test_late_joiner_after_reset_gets_clean_state(self, sync_client, host_room):
        """After reset_editor, yjs_updates are cleared — new joiner receives no yjs_update flush."""
        room_id, token = host_room
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws1:
            _join_room(ws1, "Alice")
            # Simulate some yjs state by sending a yjs_update
            import base64
            ws1.send_json({"type": "yjs_update", "update": base64.b64encode(b"fake-yjs-data").decode()})

            # Now reset the editor — this should clear yjs_updates
            ws1.send_json({"type": "reset_editor", "host_token": token})
            _drain_until(ws1, "reset_editor")

            # Late joiner should not receive any yjs_update before room_state
            with sync_client.websocket_connect(f"/ws/{room_id}") as ws2:
                ws2.send_json({"type": "join_room", "name": "Bob"})
                pre_state_types = []
                while True:
                    msg = ws2.receive_json()
                    if msg["type"] == "room_state":
                        break
                    pre_state_types.append(msg["type"])
                assert "yjs_update" not in pre_state_types, (
                    f"Expected no yjs_update before room_state after reset, got: {pre_state_types}"
                )

    def test_host_token_not_in_room_state(self, sync_client, host_room):
        """room_state payload must NOT contain host_token (Pitfall 3 guard)."""
        room_id, _token = host_room
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws:
            state = _join_room(ws, "Alice")
            assert "host_token" not in state, (
                f"host_token must never be sent in room_state, but found it: {state}"
            )
