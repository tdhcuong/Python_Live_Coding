"""Integration tests for the execution WebSocket protocol (EXEC-01, EXEC-02, EXEC-03, UI-03)."""
import threading
import time
import pytest
from starlette.testclient import TestClient
from app.main import app


@pytest.fixture
def sync_client():
    """Synchronous test client for WebSocket testing."""
    return TestClient(app)


def _join_room(ws, name):
    """Send join_room message and drain initial messages until room_state.

    Drains any preceding yjs_update and execution_* messages before returning
    the room_state message.
    """
    ws.send_json({"type": "join_room", "name": name})
    while True:
        resp = ws.receive_json()
        if resp["type"] == "room_state":
            return resp
        elif resp["type"] in ("yjs_update", "participant_joined"):
            continue  # drain late-joiner flush and join notifications
        else:
            raise AssertionError(f"Unexpected message during join: {resp}")


def _drain_until(ws, target_type, max_messages=10):
    """Read messages from ws until one matching target_type is found.

    Returns the matching message. Raises AssertionError if max_messages exceeded.
    """
    for _ in range(max_messages):
        msg = ws.receive_json()
        if msg["type"] == target_type:
            return msg
    raise AssertionError(f"Did not receive {target_type!r} within {max_messages} messages")


class TestExecutionWS:
    """Integration tests for run_code WebSocket protocol."""

    def test_run_code_returns_result(self, sync_client, room_id):
        """Client joins, sends run_code with print('hello'), receives execution_start then execution_result."""
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws:
            _join_room(ws, "Alice")

            ws.send_json({"type": "run_code", "code": 'print("hello")'})

            # First message must be execution_start
            start_msg = ws.receive_json()
            assert start_msg["type"] == "execution_start"

            # Second message must be execution_result
            result_msg = ws.receive_json()
            assert result_msg["type"] == "execution_result"
            assert result_msg["stdout"] == "hello\n"
            assert result_msg["exit_code"] == 0
            assert result_msg["timed_out"] is False

    def test_broadcast_to_all(self, sync_client, room_id):
        """Both Client A and Client B receive execution_start AND execution_result when A runs code."""
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws_a:
            _join_room(ws_a, "Alice")

            with sync_client.websocket_connect(f"/ws/{room_id}") as ws_b:
                _join_room(ws_b, "Bob")

                # Drain Alice's participant_joined notification for Bob
                joined = ws_a.receive_json()
                assert joined["type"] == "participant_joined"

                # Alice sends run_code
                ws_a.send_json({"type": "run_code", "code": 'print("broadcast")'})

                # Alice should receive execution_start
                start_a = ws_a.receive_json()
                assert start_a["type"] == "execution_start"

                # Bob should also receive execution_start
                start_b = ws_b.receive_json()
                assert start_b["type"] == "execution_start"

                # Alice should receive execution_result
                result_a = ws_a.receive_json()
                assert result_a["type"] == "execution_result"
                assert result_a["stdout"] == "broadcast\n"

                # Bob should also receive execution_result
                result_b = ws_b.receive_json()
                assert result_b["type"] == "execution_result"
                assert result_b["stdout"] == "broadcast\n"

    def test_execution_start_broadcast(self, sync_client, room_id):
        """execution_start is received BEFORE execution_result."""
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws:
            _join_room(ws, "Alice")

            ws.send_json({"type": "run_code", "code": 'print("order-check")'})

            first = ws.receive_json()
            assert first["type"] == "execution_start", (
                f"Expected execution_start first, got {first['type']!r}"
            )

            second = ws.receive_json()
            assert second["type"] == "execution_result"
            assert second["stdout"] == "order-check\n"

    def test_concurrent_run_rejected(self, sync_client, room_id):
        """A second run_code while execution is in progress returns an error message."""
        errors = []
        slow_code = "import time; time.sleep(3)"

        def run_slow_client():
            """Client A runs slow code (blocks for 3s)."""
            try:
                with sync_client.websocket_connect(f"/ws/{room_id}") as ws_a:
                    _join_room(ws_a, "SlowAlice")
                    ws_a.send_json({"type": "run_code", "code": slow_code})
                    # Wait for execution_start so we know the execution has begun
                    msg = ws_a.receive_json()
                    assert msg["type"] == "execution_start"
                    # Wait for the result (slow)
                    ws_a.receive_json()
            except Exception as e:
                errors.append(e)

        # Start slow client in background thread
        t = threading.Thread(target=run_slow_client, daemon=True)
        t.start()

        # Give enough time for slow client to connect, join, and start execution
        time.sleep(0.8)

        # Client B tries to run code while execution is already in progress
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws_b:
            _join_room(ws_b, "Bob")
            ws_b.send_json({"type": "run_code", "code": 'print("concurrent")'})

            # Bob should receive an error (personal, not broadcast)
            msg = ws_b.receive_json()
            assert msg["type"] == "error"
            assert "Execution already in progress" in msg["message"]

        t.join(timeout=10)
        assert not errors, f"Background thread raised: {errors}"

    def test_timeout_produces_timed_out(self, sync_client, room_id):
        """Infinite loop code is killed and produces a non-zero exit_code.

        On macOS, RLIMIT_CPU (5s soft limit) kills the process via SIGXCPU
        (exit_code=-24) before the wall-clock timeout fires. Both outcomes are
        valid: timed_out=True (TimeoutExpired path) OR exit_code=-24 (SIGXCPU path).
        The essential requirement is that infinite loops do NOT run forever and
        execution_result is received.

        NOTE: This test takes ~5-10 seconds due to RLIMIT_CPU or wall-clock timeout.
        """
        with sync_client.websocket_connect(f"/ws/{room_id}") as ws:
            _join_room(ws, "Alice")

            ws.send_json({"type": "run_code", "code": "while True: pass"})

            # Drain execution_start
            start = ws.receive_json()
            assert start["type"] == "execution_start"

            # Wait for execution_result (may take up to 10s)
            result = ws.receive_json()
            assert result["type"] == "execution_result"
            # Either killed by RLIMIT_CPU (SIGXCPU, exit=-24, timed_out=False)
            # or killed by wall-clock timeout (TimeoutExpired, timed_out=True)
            killed_by_cpu = result["exit_code"] == -24 and result["timed_out"] is False
            killed_by_timeout = result["timed_out"] is True
            assert killed_by_cpu or killed_by_timeout, (
                f"Expected infinite loop to be killed, got exit_code={result['exit_code']!r}, "
                f"timed_out={result['timed_out']!r}"
            )
