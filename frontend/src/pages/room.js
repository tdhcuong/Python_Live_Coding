import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { createEditor } from '../editor/setup.js'
import { RoomProvider, YTEXT_KEY } from '../editor/provider.js'
import { createRoomWS } from "../ws.js";

const API_BASE = "http://localhost:8000";

export async function renderRoom(container, roomId) {
  // Step 1: Verify room exists before showing the join form
  let roomInfo;
  try {
    const resp = await fetch(`${API_BASE}/room/${roomId}`);
    if (resp.status === 404) {
      renderRoomNotFound(container, roomId);
      return;
    }
    if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
    roomInfo = await resp.json();
  } catch (err) {
    renderRoomError(container, err.message);
    return;
  }

  // Step 2: Show name entry form
  renderNameForm(container, roomId);
}

function renderNameForm(container, roomId) {
  container.innerHTML = `
    <div class="flex items-center justify-center min-h-screen px-4">
      <div class="w-full max-w-sm">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-white mb-2">Join Session</h1>
          <p class="text-gray-400 text-sm font-mono">
            Room: <span class="text-indigo-400">${roomId.slice(0, 8)}...</span>
          </p>
        </div>

        <div class="bg-gray-900 rounded-2xl border border-gray-800 p-8 shadow-2xl">
          <label for="name-input" class="block text-sm font-medium text-gray-300 mb-2">
            Your display name
          </label>
          <input
            id="name-input"
            type="text"
            maxlength="32"
            placeholder="e.g. Alice"
            autocomplete="off"
            class="w-full bg-gray-800 border border-gray-700 text-gray-100
                   placeholder-gray-500 rounded-xl px-4 py-3 mb-4
                   focus:outline-none focus:ring-2 focus:ring-indigo-500
                   focus:border-transparent transition-colors"
          />
          <button
            id="join-btn"
            class="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700
                   text-white font-semibold py-3 px-6 rounded-xl
                   transition-colors duration-150 focus:outline-none
                   focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2
                   focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Enter Room
          </button>
          <p id="join-error" class="text-red-400 text-sm mt-3 hidden"></p>
        </div>
      </div>
    </div>
  `;

  const nameInput = container.querySelector("#name-input");
  const joinBtn = container.querySelector("#join-btn");
  const errorEl = container.querySelector("#join-error");

  nameInput.focus();

  function attemptJoin() {
    const name = nameInput.value.trim();
    if (!name) {
      errorEl.textContent = "Please enter a display name.";
      errorEl.classList.remove("hidden");
      return;
    }
    joinBtn.disabled = true;
    joinBtn.textContent = "Connecting...";
    errorEl.classList.add("hidden");
    connectToRoom(container, roomId, name);
  }

  joinBtn.addEventListener("click", attemptJoin);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attemptJoin();
  });
}

function connectToRoom(container, roomId, myName) {
  // Participant state: populated from room_state and updated on join/leave events
  let participants = {};  // id -> { id, name, color }
  let myId = null;

  // Y.js collaborative document setup
  const ydoc = new Y.Doc()
  const awareness = new Awareness(ydoc)
  const ytext = ydoc.getText(YTEXT_KEY)
  let provider = null

  const ws = createRoomWS(roomId, myName, {
    onRoomState: (msg) => {
      myId = msg.your_id;
      // Build participant map from room_state snapshot
      participants = {};
      for (const p of msg.participants) {
        participants[p.id] = p;
      }
      renderRoomView(container, roomId, myId, participants, ws);

      // Initialize Y.js provider AFTER ws.send is available
      provider = new RoomProvider(ydoc, awareness, ws.send.bind(ws))

      // D-03: Set initial content if this is a fresh room (ytext is empty after late-joiner flush)
      if (ytext.toString() === '') {
        ytext.insert(0, '# Write your solution here\n')
      }

      // Mount CodeMirror editor into the <main> element
      const mainEl = container.querySelector('main')
      // D-06: Editor fills main area — replace placeholder, set height
      mainEl.innerHTML = ''
      mainEl.className = 'flex-1 overflow-hidden'
      mainEl.style.height = '100%'

      const myUser = participants[myId]
      createEditor(mainEl, ytext, awareness, myUser)
    },

    onParticipantJoined: (msg) => {
      const p = msg.participant;
      participants[p.id] = p;
      updateParticipantList(container, myId, participants);
      showToast(container, `${safeText(p.name)} joined`);
    },

    onParticipantLeft: (msg) => {
      const name = participants[msg.participant_id]?.name ?? msg.name;
      delete participants[msg.participant_id];
      updateParticipantList(container, myId, participants);
      showToast(container, `${safeText(name)} left`);
    },

    onError: (msg) => {
      console.error("[room] Server error:", msg.message);
    },

    onYjsUpdate: (msg) => {
      if (provider) {
        provider.applyRemoteUpdate(msg.update)
      } else {
        // Late-joiner flush: updates arrive before room_state/provider init
        const bytes = Uint8Array.from(atob(msg.update), c => c.charCodeAt(0))
        Y.applyUpdate(ydoc, bytes)
      }
    },

    onAwarenessUpdate: (msg) => {
      if (provider) {
        provider.applyRemoteAwareness(msg.update)
      }
    },

    onClose: (event) => {
      if (provider) {
        provider.destroy()
        provider = null
      }
      awareness.destroy()
      ydoc.destroy()

      if (event.code === 4004) {
        renderRoomNotFound(container, roomId);
      } else if (event.code !== 1000) {
        // Unexpected close — show disconnection message
        const statusEl = container.querySelector("#connection-status");
        if (statusEl) {
          statusEl.textContent = "Disconnected";
          statusEl.className = "text-xs text-red-400";
        }
      }
    },
  });
}

function renderRoomView(container, roomId, myId, participants, ws) {
  container.innerHTML = `
    <div class="flex flex-col min-h-screen">
      <!-- Header -->
      <header class="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-white font-semibold">Python Live Coding</span>
          <span class="text-gray-500 text-sm">·</span>
          <span class="text-gray-400 text-sm font-mono">${roomId.slice(0, 8)}...</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>
          <span id="connection-status" class="text-xs text-green-400">Connected</span>
        </div>
      </header>

      <!-- Main content -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Sidebar: participant list -->
        <aside class="w-56 border-r border-gray-800 bg-gray-900 p-4 flex flex-col gap-3 shrink-0">
          <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Participants
          </h2>
          <ul id="participant-list" class="flex flex-col gap-2">
            <!-- Populated by updateParticipantList() -->
          </ul>
        </aside>

        <!-- Editor area: CodeMirror mounted here by onRoomState handler -->
        <main id="editor-container" class="flex-1 overflow-hidden">
          <!-- CodeMirror editor mounted here -->
        </main>
      </div>

      <!-- Toast container -->
      <div id="toast-container" class="fixed bottom-6 right-6 flex flex-col gap-2 z-50"></div>
    </div>
  `;

  updateParticipantList(container, myId, participants);
}

function updateParticipantList(container, myId, participants) {
  const list = container.querySelector("#participant-list");
  if (!list) return;

  // Clear and repopulate — safe because textContent is used for names (pitfall M10)
  list.innerHTML = "";
  for (const p of Object.values(participants)) {
    const li = document.createElement("li");
    li.className = "flex items-center gap-2";

    // Color dot
    const dot = document.createElement("span");
    dot.className = "inline-block w-3 h-3 rounded-full shrink-0";
    dot.style.backgroundColor = p.color;

    // Name (textContent prevents XSS — pitfall M10)
    const name = document.createElement("span");
    name.className = "text-sm text-gray-200 truncate";
    name.textContent = p.name;  // textContent, never innerHTML

    // "You" badge
    if (p.id === myId) {
      const badge = document.createElement("span");
      badge.className = "text-xs text-indigo-400 ml-auto shrink-0";
      badge.textContent = "you";
      li.append(dot, name, badge);
    } else {
      li.append(dot, name);
    }

    list.appendChild(li);
  }
}

function showToast(container, message) {
  const toastContainer = container.querySelector("#toast-container");
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `
    bg-gray-800 border border-gray-700 text-gray-200 text-sm
    px-4 py-2 rounded-lg shadow-lg
    transition-opacity duration-300 opacity-100
  `.trim();
  // textContent for user-supplied data (pitfall M10)
  toast.textContent = message;

  toastContainer.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function renderRoomNotFound(container, roomId) {
  container.innerHTML = `
    <div class="flex items-center justify-center min-h-screen px-4">
      <div class="text-center">
        <h1 class="text-2xl font-bold text-white mb-3">Room Not Found</h1>
        <p class="text-gray-400 mb-6">
          Room <span class="font-mono text-indigo-400">${roomId.slice(0, 8)}...</span>
          does not exist or has ended.
        </p>
        <a href="/"
           onclick="event.preventDefault(); window.history.pushState({},'','/'); window.dispatchEvent(new PopStateEvent('popstate'))"
           class="text-indigo-400 hover:text-indigo-300 underline">
          Create a new room
        </a>
      </div>
    </div>
  `;
}

function renderRoomError(container, message) {
  container.innerHTML = `
    <div class="flex items-center justify-center min-h-screen px-4">
      <div class="text-center">
        <h1 class="text-2xl font-bold text-white mb-3">Connection Error</h1>
        <p class="text-gray-400 mb-2">Could not connect to the server.</p>
        <p class="text-red-400 text-sm font-mono">${message}</p>
      </div>
    </div>
  `;
}

/** Returns plain text safe for display. Only for non-DOM paths (e.g., toast). */
function safeText(str) {
  return String(str).slice(0, 64);
}
