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

function _formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function _startCountdown(timerEl, startedAt, durationSeconds, skipAudio) {
  const endMs = new Date(startedAt).getTime() + durationSeconds * 1000
  timerEl.classList.remove('hidden')

  // Check if already expired at join time (Pitfall 2 — late-joiner drift)
  const initialRemaining = Math.max(0, Math.round((endMs - Date.now()) / 1000))
  if (initialRemaining === 0) {
    timerEl.textContent = '00:00'
    timerEl.className = 'font-mono text-sm text-red-400'
    return  // don't start interval
  }

  const interval = setInterval(() => {
    const remaining = Math.max(0, Math.round((endMs - Date.now()) / 1000))
    timerEl.textContent = _formatTime(remaining)

    // Color progression: amber ≤5min, red+pulse ≤1min
    if (remaining <= 60) {
      timerEl.className = 'font-mono text-sm text-red-400 animate-pulse'
    } else if (remaining <= 300) {
      timerEl.className = 'font-mono text-sm text-amber-400'
    } else {
      timerEl.className = 'font-mono text-sm text-gray-200'
    }

    if (remaining <= 0) {
      clearInterval(interval)
      timerEl.textContent = '00:00'
      timerEl.className = 'font-mono text-sm text-red-400'
      // Audio beep at expiry — uses pre-created AudioContext from Start Timer click
      if (!skipAudio) {
        const startBtn = document.querySelector('#start-timer-btn')
        const audioCtx = startBtn?._getAudioCtx?.()
        if (audioCtx) {
          audioCtx.resume().then(() => {
            const osc = audioCtx.createOscillator()
            const gain = audioCtx.createGain()
            osc.connect(gain)
            gain.connect(audioCtx.destination)
            osc.frequency.value = 880  // A5 — crisp alert tone
            osc.type = 'sine'
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4)
            osc.start(audioCtx.currentTime)
            osc.stop(audioCtx.currentTime + 0.4)
          })
        }
      }
    }
  }, 500)  // 500ms tick — smooth display with self-correction
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

  // Read host token from sessionStorage — set by home.js on room creation
  const hostToken = sessionStorage.getItem(`host_token:${roomId}`) || null

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
      // D-06: Editor fills main area — replace placeholder, use flex-1 class (no inline height)
      mainEl.innerHTML = ''
      mainEl.className = 'flex-1 overflow-hidden'

      const myUser = participants[myId]
      createEditor(mainEl, ytext, awareness, myUser)

      // Wire execution UI buttons
      const runBtn = container.querySelector('#run-btn')
      const clearBtn = container.querySelector('#clear-btn')
      const outputPanel = container.querySelector('#output-panel')

      // Restore disabled state if reconnecting mid-execution (Pitfall 4 fix)
      if (msg.is_running) {
        runBtn.disabled = true
        runBtn.textContent = 'Running...'
      }

      runBtn.addEventListener('click', () => {
        const code = ytext.toString()
        ws.send({ type: 'run_code', code })
      })

      clearBtn.addEventListener('click', () => {
        outputPanel.innerHTML = ''
      })

      // Problem panel elements
      const problemPanel = container.querySelector('#problem-panel')
      const problemText = container.querySelector('#problem-text')
      const problemToggle = container.querySelector('#problem-toggle')
      const problemBody = container.querySelector('#problem-body')
      const problemChevron = container.querySelector('#problem-chevron')

      // Collapse/expand toggle
      problemToggle.addEventListener('click', () => {
        problemBody.classList.toggle('hidden')
        problemChevron.classList.toggle('rotate-180')
      })

      // Host-only: inject textarea and Set Problem button (D-19)
      if (hostToken) {
        const hostControls = document.createElement('div')
        hostControls.className = 'mt-3 flex flex-col gap-2'

        const textarea = document.createElement('textarea')
        textarea.id = 'problem-input'
        textarea.rows = 3
        textarea.placeholder = 'Enter problem description...'
        textarea.className = 'w-full bg-gray-800 border border-gray-700 text-gray-100 placeholder-gray-500 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500'

        const setProblemBtn = document.createElement('button')
        setProblemBtn.id = 'set-problem-btn'
        setProblemBtn.className = 'self-start bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors'
        setProblemBtn.textContent = 'Set Problem'

        hostControls.append(textarea, setProblemBtn)
        problemBody.appendChild(hostControls)

        setProblemBtn.addEventListener('click', () => {
          const problem = textarea.value.trim()
          ws.send({ type: 'set_problem', host_token: hostToken, problem })
        })
      }

      // Restore problem from room_state (late-joiner state, D-06)
      if (msg.problem) {
        problemText.textContent = msg.problem  // textContent — never innerHTML (D-17)
        problemPanel.classList.remove('hidden')
      }

      // Timer: restore from room_state for late joiners (D-08)
      const timerDisplay = container.querySelector('#timer-display')
      if (msg.timer) {
        _startCountdown(timerDisplay, msg.timer.started_at, msg.timer.duration, hostToken === null)
      }

      // Host-only: timer controls (D-09, D-19)
      if (hostToken) {
        // Inject timer controls into header area — append before timerDisplay
        const timerControls = document.createElement('div')
        timerControls.className = 'flex items-center gap-2 ml-4'

        const durationSelect = document.createElement('select')
        durationSelect.id = 'duration-select'
        durationSelect.className = 'bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg px-2 py-1'
        ;[5, 10, 15, 20, 30].forEach(min => {
          const opt = document.createElement('option')
          opt.value = String(min)
          opt.textContent = `${min} min`
          durationSelect.appendChild(opt)
        })

        const startTimerBtn = document.createElement('button')
        startTimerBtn.id = 'start-timer-btn'
        startTimerBtn.className = 'bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-3 py-1 rounded-lg transition-colors'
        startTimerBtn.textContent = 'Start Timer'

        // AudioContext created HERE (user gesture) per Chrome autoplay policy
        let audioCtx = null
        startTimerBtn.addEventListener('click', () => {
          audioCtx = new AudioContext()  // must be in user gesture handler
          const duration = parseInt(durationSelect.value, 10)
          ws.send({ type: 'start_timer', host_token: hostToken, duration })
        })
        // Store audioCtx getter on button for onTimerExpire to use
        startTimerBtn._getAudioCtx = () => audioCtx

        timerControls.append(durationSelect, startTimerBtn)
        timerDisplay.parentElement.insertBefore(timerControls, timerDisplay)

        // Reset Editor button (HOST-04, D-19)
        const resetBtn = document.createElement('button')
        resetBtn.id = 'reset-editor-btn'
        resetBtn.className = 'bg-red-700 hover:bg-red-600 text-white text-sm font-semibold px-3 py-1 rounded-lg transition-colors'
        resetBtn.textContent = 'Reset Editor'
        resetBtn.addEventListener('click', () => {
          ws.send({ type: 'reset_editor', host_token: hostToken })
        })
        timerDisplay.parentElement.appendChild(resetBtn)
      }
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

    onExecutionStart: () => {
      const runBtn = container.querySelector('#run-btn')
      if (runBtn) {
        runBtn.disabled = true
        runBtn.textContent = 'Running...'
      }
    },

    onExecutionResult: (msg) => {
      const runBtn = container.querySelector('#run-btn')
      const outputPanel = container.querySelector('#output-panel')
      if (runBtn) {
        runBtn.disabled = false
        runBtn.textContent = 'Run'
      }
      if (outputPanel) {
        // Render stdout
        if (msg.stdout) {
          const span = document.createElement('span')
          span.className = 'text-gray-200'
          span.textContent = msg.stdout  // NEVER innerHTML (D-17)
          outputPanel.appendChild(span)
        }
        // Render stderr
        if (msg.stderr) {
          const span = document.createElement('span')
          span.className = 'text-red-400'
          span.textContent = msg.stderr
          outputPanel.appendChild(span)
        }
        // Render timeout message
        if (msg.timed_out) {
          const span = document.createElement('span')
          span.className = 'text-yellow-400'
          span.textContent = '\n[Execution timed out]\n'
          outputPanel.appendChild(span)
        }
        outputPanel.scrollTop = outputPanel.scrollHeight  // auto-scroll
      }
    },

    onProblemUpdate: (msg) => {
      const problemPanel = container.querySelector('#problem-panel')
      const problemText = container.querySelector('#problem-text')
      if (problemText) {
        problemText.textContent = msg.problem  // textContent — D-17
      }
      if (problemPanel) {
        problemPanel.classList.remove('hidden')  // auto-expand (D-20)
        // Ensure body is visible when problem is set
        const problemBody = container.querySelector('#problem-body')
        if (problemBody) problemBody.classList.remove('hidden')
      }
    },

    onTimerStart: (msg) => {
      const timerDisplay = container.querySelector('#timer-display')
      if (timerDisplay) {
        _startCountdown(timerDisplay, msg.started_at, msg.duration, false)
      }
    },

    onResetEditor: (msg) => {
      // Apply via Y.js transaction with provider as origin — suppresses outgoing yjs_update
      // provider as origin → existing `if (origin !== this)` guard in RoomProvider skips the WS send
      ydoc.transact(() => {
        ytext.delete(0, ytext.length)
        ytext.insert(0, msg.content)
      }, provider)  // Option A2 — no RoomProvider changes needed
      showToast(container, 'Editor reset')
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
    <div class="flex flex-col h-screen">
      <!-- Header -->
      <header class="shrink-0 border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-white font-semibold">Python Live Coding</span>
          <span class="text-gray-500 text-sm">·</span>
          <span class="text-gray-400 text-sm font-mono">${roomId.slice(0, 8)}...</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="inline-block w-2 h-2 rounded-full bg-green-500"></span>
          <span id="connection-status" class="text-xs text-green-400">Connected</span>
          <span id="timer-display" class="font-mono text-sm text-gray-200 hidden"></span>
        </div>
      </header>

      <!-- Problem panel (hidden by default; shown when problem is set) -->
      <div id="problem-panel" class="shrink-0 border-b border-gray-800 bg-gray-900 hidden">
        <div class="flex items-center gap-2 px-6 py-2 border-b border-gray-800">
          <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Problem</span>
          <button id="problem-toggle"
            class="ml-auto text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Toggle problem panel"
          >
            <svg id="problem-chevron" class="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
        </div>
        <div id="problem-body" class="px-6 py-3">
          <p id="problem-text" class="text-gray-200 text-sm whitespace-pre-wrap"></p>
        </div>
      </div>

      <!-- Main content: sidebar + editor column -->
      <div class="flex flex-1 overflow-hidden min-h-0">
        <!-- Sidebar: participant list -->
        <aside class="w-56 border-r border-gray-800 bg-gray-900 p-4 flex flex-col gap-3 shrink-0">
          <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Participants
          </h2>
          <ul id="participant-list" class="flex flex-col gap-2">
            <!-- Populated by updateParticipantList() -->
          </ul>
        </aside>

        <!-- Editor + toolbar + output column -->
        <div class="flex flex-col flex-1 overflow-hidden min-h-0">
          <!-- CodeMirror editor mounted here by onRoomState handler -->
          <main id="editor-container" class="flex-1 overflow-hidden">
            <!-- CodeMirror editor mounted here -->
          </main>

          <!-- Toolbar: Run + Clear buttons -->
          <div id="toolbar" class="shrink-0 flex items-center gap-2 px-3 py-2 bg-gray-900 border-t border-gray-800">
            <button
              id="run-btn"
              class="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-semibold
                     px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >Run</button>
            <button
              id="clear-btn"
              class="ml-auto text-gray-400 hover:text-gray-200 text-sm px-3 py-1.5 rounded-lg
                     border border-gray-700 hover:border-gray-500 transition-colors"
            >Clear</button>
          </div>

          <!-- Output panel: stdout/stderr/timeout rendered here -->
          <div
            id="output-panel"
            class="shrink-0 overflow-y-auto font-mono text-sm p-3 bg-gray-950 border-t border-gray-800"
            style="height: 35%"
          ></div>
        </div>
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
