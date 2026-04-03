/**
 * Creates a WebSocket connection to a room.
 * Caller provides event handlers via the `on` object.
 *
 * Usage:
 *   const ws = createRoomWS(roomId, name, {
 *     onRoomState: (msg) => { ... },
 *     onParticipantJoined: (msg) => { ... },
 *     onParticipantLeft: (msg) => { ... },
 *     onError: (msg) => { ... },
 *     onClose: (event) => { ... },
 *   });
 *   ws.send({ type: "some_event", data: "..." });
 *   ws.disconnect();
 */
export function createRoomWS(roomId, name, handlers = {}) {
  const url = `ws://localhost:8000/ws/${roomId}`;
  const socket = new WebSocket(url);

  socket.addEventListener("open", () => {
    // Protocol step 1: send join_room immediately after connection opens
    socket.send(JSON.stringify({ type: "join_room", name }));
  });

  socket.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.error("[ws] Failed to parse message:", event.data);
      return;
    }

    switch (msg.type) {
      case "room_state":
        handlers.onRoomState?.(msg);
        break;
      case "participant_joined":
        handlers.onParticipantJoined?.(msg);
        break;
      case "participant_left":
        handlers.onParticipantLeft?.(msg);
        break;
      case "error":
        handlers.onError?.(msg);
        break;
      case "yjs_update":
        handlers.onYjsUpdate?.(msg);
        break;
      case "awareness_update":
        handlers.onAwarenessUpdate?.(msg);
        break;
      case "execution_start":
        handlers.onExecutionStart?.(msg);
        break;
      case "execution_result":
        handlers.onExecutionResult?.(msg);
        break;
      case "problem_update":
        handlers.onProblemUpdate?.(msg);
        break;
      case "timer_start":
        handlers.onTimerStart?.(msg);
        break;
      case "reset_editor":
        handlers.onResetEditor?.(msg);
        break;
      default:
        // Unknown messages are logged but not thrown
        console.debug("[ws] Unhandled message type:", msg.type, msg);
    }
  });

  socket.addEventListener("close", (event) => {
    handlers.onClose?.(event);
  });

  socket.addEventListener("error", (event) => {
    console.error("[ws] WebSocket error:", event);
  });

  return {
    send: (data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
      }
    },
    disconnect: () => socket.close(),
    get readyState() {
      return socket.readyState;
    },
  };
}
