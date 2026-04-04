import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { createEditor } from '../editor/setup.js'
import { RoomProvider, YTEXT_KEY } from '../editor/provider.js'
import { createRoomWS } from "../ws.js";
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ListKeymap } from '@tiptap/extension-list-keymap';
import { Markdown } from 'tiptap-markdown';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';

const IS_DEV = window.location.port === '5173';
const API_BASE = IS_DEV ? 'http://localhost:8000' : window.location.origin;

export async function renderRoom(container, roomId) {
  // Step 1: Verify room exists before showing the join form
  let roomInfo;
  try {
    const resp = await fetch(`${API_BASE}/api/room/${roomId}`);
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
          <h1 class="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-2">Join Session</h1>
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

          <div class="flex items-center gap-3 mt-5">
            <div class="flex-1 h-px bg-gray-700"></div>
            <span class="text-gray-500 text-xs">or</span>
            <div class="flex-1 h-px bg-gray-700"></div>
          </div>
          <button
            id="create-room-btn"
            class="w-full mt-4 bg-transparent border border-gray-700 hover:border-gray-500
                   text-gray-400 hover:text-gray-200 font-semibold py-3 px-6 rounded-xl
                   transition-colors duration-150 focus:outline-none"
          >
            Create New Room
          </button>
        </div>
      </div>
    </div>
  `;

  const nameInput = container.querySelector("#name-input");
  const joinBtn = container.querySelector("#join-btn");
  const errorEl = container.querySelector("#join-error");

  nameInput.focus();

  // Auto-join if coming from "Create New Room" with a pre-filled name
  const pendingName = sessionStorage.getItem(`pending_name:${roomId}`);
  if (pendingName) {
    sessionStorage.removeItem(`pending_name:${roomId}`);
    nameInput.value = pendingName;
    joinBtn.disabled = true;
    joinBtn.textContent = "Connecting...";
    connectToRoom(container, roomId, pendingName);
    return;
  }

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

  const createRoomBtn = container.querySelector("#create-room-btn");
  createRoomBtn.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    if (!name) {
      errorEl.textContent = "Please enter a display name first.";
      errorEl.classList.remove("hidden");
      nameInput.focus();
      return;
    }
    createRoomBtn.disabled = true;
    createRoomBtn.textContent = "Creating…";
    errorEl.classList.add("hidden");
    try {
      const res = await fetch(`${API_BASE}/create-room`, { method: "POST" });
      const data = await res.json();
      sessionStorage.setItem(`host_token:${data.room_id}`, data.host_token);
      sessionStorage.setItem(`pending_name:${data.room_id}`, name);
      window.history.pushState({}, "", `/room/${data.room_id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {
      createRoomBtn.disabled = false;
      createRoomBtn.textContent = "Create New Room";
    }
  });
}

function _formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

let _activeCountdownInterval = null

function _startCountdown(timerEl, startedAt, durationSeconds, skipAudio) {
  if (_activeCountdownInterval) {
    clearInterval(_activeCountdownInterval)
    _activeCountdownInterval = null
  }
  const endMs = new Date(startedAt).getTime() + durationSeconds * 1000
  timerEl.classList.remove('hidden')

  // Check if already expired at join time (Pitfall 2 — late-joiner drift)
  const initialRemaining = Math.max(0, Math.round((endMs - Date.now()) / 1000))
  if (initialRemaining === 0) {
    timerEl.textContent = '00:00'
    timerEl.className = 'font-mono text-sm text-red-400'
    return  // don't start interval
  }

  _activeCountdownInterval = setInterval(() => {
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
      clearInterval(_activeCountdownInterval)
      _activeCountdownInterval = null
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

  // Problem received before room view is rendered (race: problem_update before room_state)
  let pendingProblem = null
  let viewer = null  // read-only TipTap instance for the problem display
  let intentionalLeave = false

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

      // Host-only: click-to-edit inline flow
      if (hostToken) {
        const hostControls = document.createElement('div')
        hostControls.className = 'flex flex-col gap-2'

        // Editor wrapper (hidden until host clicks to edit)
        const editorWrapper = document.createElement('div')
        editorWrapper.className = 'flex flex-col gap-2 hidden'

        // ── Editor frame: toolbar + content in one bordered container ──────
        const editorFrame = document.createElement('div')
        editorFrame.className = 'rounded-xl border border-gray-700 overflow-hidden shadow-lg ring-0 focus-within:ring-1 focus-within:ring-indigo-500 transition-all duration-150'

        // ── Toolbar ────────────────────────────────────────────────────────
        const toolbar = document.createElement('div')
        toolbar.className = 'flex items-center gap-0.5 flex-wrap px-2 py-1.5 bg-gray-800/80 border-b border-gray-700/80 select-none'

        const toolbarBtns = []   // { btn, activeCheck } — for syncToolbar

        function mkBtn(icon, title, cmd, activeCheck) {
          const btn = document.createElement('button')
          btn.type = 'button'
          btn.title = title
          btn.innerHTML = icon
          btn.className = [
            'inline-flex items-center justify-center w-7 h-7 rounded-md',
            'text-gray-400 hover:text-gray-100 hover:bg-gray-700/80',
            'transition-colors duration-100',
          ].join(' ')
          btn.addEventListener('mousedown', (e) => { e.preventDefault(); cmd() })
          if (activeCheck) toolbarBtns.push({ btn, activeCheck })
          return btn
        }

        function mkSep() {
          const s = document.createElement('div')
          s.className = 'w-px h-5 bg-gray-700 mx-1 shrink-0'
          return s
        }

        // ── SVG icon set ───────────────────────────────────────────────────
        const I = {
          bold:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6V4zm0 8h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6v-8z"/></svg>`,
          italic:      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>`,
          underline:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" y1="20" x2="20" y2="20"/></svg>`,
          strike:      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 4H9a3 3 0 0 0-3 3 3 3 0 0 0 3 3h6a3 3 0 0 1 3 3 3 3 0 0 1-3 3H7"/><line x1="4" y1="12" x2="20" y2="12"/></svg>`,
          code:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
          h1:          `<span style="font-size:11px;font-weight:700;letter-spacing:-.02em;line-height:1">H1</span>`,
          h2:          `<span style="font-size:11px;font-weight:700;letter-spacing:-.02em;line-height:1">H2</span>`,
          h3:          `<span style="font-size:11px;font-weight:700;letter-spacing:-.02em;line-height:1">H3</span>`,
          bulletList:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none"/></svg>`,
          orderedList: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4M4 10h2" stroke-linejoin="round"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>`,
          blockquote:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z"/></svg>`,
          codeBlock:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
          undo:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>`,
          redo:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>`,
        }

        // ── Editor mount ───────────────────────────────────────────────────
        const editorMount = document.createElement('div')
        editorMount.className = 'bg-gray-900'

        editorFrame.append(toolbar, editorMount)

        const editorActions = document.createElement('div')
        editorActions.className = 'flex items-center gap-2'
        const saveBtn = document.createElement('button')
        saveBtn.className = 'bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors'
        saveBtn.textContent = 'Save'
        const cancelBtn = document.createElement('button')
        cancelBtn.className = 'bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors'
        cancelBtn.textContent = 'Cancel'
        const kbHint = document.createElement('span')
        kbHint.className = 'ml-auto text-xs text-gray-500'
        kbHint.textContent = 'Tab / Shift+Tab indents lists'

        editorActions.append(saveBtn, cancelBtn, kbHint)
        editorWrapper.append(editorFrame, editorActions)
        hostControls.append(editorWrapper)
        problemBody.appendChild(hostControls)

        // ── Instantiate TipTap ─────────────────────────────────────────────
        let currentMarkdown = ''

        const tiptap = new Editor({
          element: editorMount,
          extensions: [
            StarterKit,
            Underline,
            ListKeymap,
            Placeholder.configure({ placeholder: 'Describe the problem…' }),
            Markdown.configure({ html: false, transformPastedText: true }),
          ],
          editorProps: {
            attributes: {
              class: 'prose prose-invert prose-sm max-w-none focus:outline-none px-4 py-3 min-h-[9rem] max-h-[16rem] overflow-y-auto',
            },
          },
          onSelectionUpdate: syncToolbar,
          onTransaction: syncToolbar,
        })

        // ── Populate toolbar now that editor exists ────────────────────────
        const E = () => tiptap.chain().focus()

        toolbar.append(
          mkBtn(I.bold,        'Bold (Ctrl+B)',           () => E().toggleBold().run(),                       () => tiptap.isActive('bold')),
          mkBtn(I.italic,      'Italic (Ctrl+I)',         () => E().toggleItalic().run(),                     () => tiptap.isActive('italic')),
          mkBtn(I.underline,   'Underline (Ctrl+U)',      () => E().toggleUnderline().run(),                  () => tiptap.isActive('underline')),
          mkBtn(I.strike,      'Strikethrough',           () => E().toggleStrike().run(),                     () => tiptap.isActive('strike')),
          mkBtn(I.code,        'Inline code',             () => E().toggleCode().run(),                       () => tiptap.isActive('code')),
          mkSep(),
          mkBtn(I.h1,          'Heading 1',               () => E().toggleHeading({ level: 1 }).run(),        () => tiptap.isActive('heading', { level: 1 })),
          mkBtn(I.h2,          'Heading 2',               () => E().toggleHeading({ level: 2 }).run(),        () => tiptap.isActive('heading', { level: 2 })),
          mkBtn(I.h3,          'Heading 3',               () => E().toggleHeading({ level: 3 }).run(),        () => tiptap.isActive('heading', { level: 3 })),
          mkSep(),
          mkBtn(I.bulletList,  'Bullet list',             () => E().toggleBulletList().run(),                 () => tiptap.isActive('bulletList')),
          mkBtn(I.orderedList, 'Ordered list',            () => E().toggleOrderedList().run(),                () => tiptap.isActive('orderedList')),
          mkSep(),
          mkBtn(I.blockquote,  'Blockquote',              () => E().toggleBlockquote().run(),                 () => tiptap.isActive('blockquote')),
          mkBtn(I.codeBlock,   'Code block',              () => E().toggleCodeBlock().run(),                  () => tiptap.isActive('codeBlock')),
          mkSep(),
          mkBtn(I.undo,        'Undo (Ctrl+Z)',           () => E().undo().run(),                             null),
          mkBtn(I.redo,        'Redo (Ctrl+Shift+Z)',     () => E().redo().run(),                             null),
        )

        function syncToolbar() {
          toolbarBtns.forEach(({ btn, activeCheck }) => {
            const on = activeCheck()
            btn.classList.toggle('text-indigo-400', on)
            btn.classList.toggle('bg-gray-700/60',  on)
            btn.classList.toggle('text-gray-400',   !on)
          })
        }

        // ── Open / close ───────────────────────────────────────────────────
        function openEditor() {
          tiptap.commands.setContent(currentMarkdown)
          problemText.classList.add('hidden')
          editorWrapper.classList.remove('hidden')
          tiptap.commands.focus('end')
        }

        function closeEditor(save) {
          if (save) {
            currentMarkdown = tiptap.storage.markdown.getMarkdown()
            ws.send({ type: 'set_problem', host_token: hostToken, problem: currentMarkdown })
          }
          editorWrapper.classList.add('hidden')
          problemText.classList.remove('hidden')
        }

        problemText.style.cursor = 'text'
        problemText.addEventListener('click', openEditor)

        const placeholder = document.createElement('p')
        placeholder.className = 'text-gray-500 text-sm italic cursor-text'
        placeholder.textContent = 'Click here to set a problem…'
        placeholder.addEventListener('click', openEditor)
        problemBody.insertBefore(placeholder, hostControls)
        problemPanel._placeholder = placeholder

        saveBtn.addEventListener('click', () => closeEditor(true))
        cancelBtn.addEventListener('click', () => closeEditor(false))

        problemPanel.classList.remove('hidden')
        problemPanel._setMarkdown = (md) => { currentMarkdown = md }
        problemPanel._hidePlaceholder = () => placeholder.classList.add('hidden')
      }

      // Create read-only TipTap viewer for the problem display
      viewer = new Editor({
        element: problemText,
        extensions: [
          StarterKit,
          Markdown.configure({ html: false }),
        ],
        editable: false,
        editorProps: {
          attributes: {
            class: 'prose prose-invert prose-sm max-w-none focus:outline-none',
          },
        },
      })

      // Restore problem: use room_state value, fall back to any update received before render
      const problemToShow = msg.problem || pendingProblem
      if (problemToShow) {
        viewer.commands.setContent(problemToShow)
        problemPanel._setMarkdown?.(problemToShow)
        problemPanel.classList.remove('hidden')
        problemPanel._hidePlaceholder?.()
      }
      pendingProblem = null

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

      // Wire Leave / End Session button
      const leaveBtn = container.querySelector('#leave-btn')
      if (leaveBtn) {
        if (hostToken) {
          leaveBtn.textContent = 'End Session'
          leaveBtn.className = leaveBtn.className.replace('bg-gray-700 hover:bg-gray-600', 'bg-red-700 hover:bg-red-600')
          leaveBtn.addEventListener('click', () => {
            ws.send({ type: 'end_session', host_token: hostToken })
            intentionalLeave = true
            ws.disconnect()
          })
        } else {
          leaveBtn.addEventListener('click', () => {
            intentionalLeave = true
            ws.disconnect()
          })
        }
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
      const outputPanel = container.querySelector('#output-panel')
      if (outputPanel) outputPanel.innerHTML = ''
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
      if (!problemPanel) {
        // Room view not rendered yet — stash for onRoomState to apply
        pendingProblem = msg.problem
        return
      }
      if (viewer) {
        viewer.commands.setContent(msg.problem || '')
        problemPanel._setMarkdown?.(msg.problem || '')
      }
      problemPanel.classList.remove('hidden')
      const problemBody = container.querySelector('#problem-body')
      if (problemBody) problemBody.classList.remove('hidden')
      problemPanel._hidePlaceholder?.()
    },

    onTimerStart: (msg) => {
      const timerDisplay = container.querySelector('#timer-display')
      if (timerDisplay) {
        _startCountdown(timerDisplay, msg.started_at, msg.duration, false)
      }
    },

    onSessionEnded: () => {
      // Freeze all interaction — inert blocks pointer + keyboard on entire room
      container.inert = true

      // Full-screen overlay on top of frozen room
      const overlay = document.createElement('div')
      overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-gray-950/90 backdrop-blur-sm'
      overlay.innerHTML = `
        <div class="text-center space-y-3">
          <p class="text-white text-xl font-semibold">Session ended</p>
          <p class="text-gray-400 text-sm">The host has ended this session. Returning to home…</p>
        </div>
      `
      document.body.appendChild(overlay)
      setTimeout(() => {
        overlay.remove()
        window.history.pushState({}, '', '/')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }, 3000)
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

      if (intentionalLeave) {
        // Participant clicked Leave — go home
        window.history.pushState({}, '', '/')
        window.dispatchEvent(new PopStateEvent('popstate'))
      } else if (event.code === 4002) {
        // Name taken — re-show name form with error
        const errEl = container.querySelector("#join-error")
        const btn = container.querySelector("#join-btn")
        if (errEl) { errEl.textContent = "That name is already taken. Choose another."; errEl.classList.remove("hidden") }
        if (btn) { btn.disabled = false; btn.textContent = "Enter Room" }
      } else if (event.code === 4004) {
        renderRoomNotFound(container, roomId);
      } else {
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
          <button id="copy-link-btn"
            class="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white text-xs font-semibold
                   px-3 py-1.5 rounded-lg transition-colors duration-150
                   focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            <span class="flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-1.102-4.243a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
              </svg>
              <span id="copy-link-label">Copy Link</span>
            </span>
          </button>
          <span id="timer-display" class="font-mono text-sm text-gray-200 hidden"></span>
          <button id="leave-btn"
            class="ml-3 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >Leave</button>
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
          <div id="problem-text" class="problem-display" style="max-height:15rem;overflow-y:auto;padding-right:4px;"></div>
        </div>
      </div>

      <!-- Main content: sidebar + editor column -->
      <div class="flex flex-1 overflow-hidden min-h-0">
        <!-- Sidebar: participant list -->
        <aside class="w-56 border-r border-gray-800 bg-gray-900 p-4 flex flex-col gap-3 shrink-0">
          <div class="flex items-center gap-2">
            <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider border-l-2 border-indigo-500 pl-2">
              Participants
            </h2>
            <span id="participant-count" class="text-xs text-gray-600 font-mono"></span>
          </div>
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
          </div>

          <!-- Output panel: stdout/stderr/timeout rendered here -->
          <div
            id="output-panel"
            class="overflow-y-auto font-mono text-sm p-3 bg-gray-950 border-t border-gray-800"
            style="min-height: 120px; max-height: 35vh; flex-shrink: 0;"
          ></div>
        </div>
      </div>

      <!-- Toast container -->
      <div id="toast-container" class="fixed bottom-6 right-6 flex flex-col gap-2 z-50"></div>
    </div>
  `;

  // Wire copy-link button
  const copyLinkBtn = container.querySelector('#copy-link-btn');
  copyLinkBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      const label = container.querySelector('#copy-link-label');
      label.textContent = 'Copied!';
      setTimeout(() => { label.textContent = 'Copy Link'; }, 1500);
    } catch {
      // Fallback: select text in a temporary input
      const tmp = document.createElement('input');
      tmp.value = window.location.href;
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      const label = container.querySelector('#copy-link-label');
      label.textContent = 'Copied!';
      setTimeout(() => { label.textContent = 'Copy Link'; }, 1500);
    }
  });

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

  // Update participant count badge
  const countEl = container.querySelector('#participant-count');
  if (countEl) countEl.textContent = Object.keys(participants).length;
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
      <div class="w-full max-w-md text-center">
        <div class="bg-gray-900 rounded-2xl border border-gray-800 p-8 shadow-2xl">
          <h1 class="text-2xl font-bold text-white mb-3">Room Not Found</h1>
          <p class="text-gray-400 mb-6">
            Room <span class="font-mono text-indigo-400">${roomId.slice(0, 8)}...</span>
            does not exist or has ended.
          </p>
          <a href="/"
             onclick="event.preventDefault(); window.history.pushState({},'','/'); window.dispatchEvent(new PopStateEvent('popstate'))"
             class="inline-block bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700
                    text-white font-semibold py-2 px-5 rounded-xl transition-colors duration-150
                    focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2
                    focus:ring-offset-gray-900">
            Create a new room
          </a>
        </div>
      </div>
    </div>
  `;
}

function renderRoomError(container, message) {
  container.innerHTML = `
    <div class="flex items-center justify-center min-h-screen px-4">
      <div class="w-full max-w-md text-center">
        <div class="bg-gray-900 rounded-2xl border border-gray-800 p-8 shadow-2xl">
          <h1 class="text-2xl font-bold text-white mb-3">Connection Error</h1>
          <p class="text-gray-400 mb-2">Could not connect to the server.</p>
          <p class="text-red-400 text-sm font-mono mb-6">${message}</p>
          <a href="/"
             onclick="event.preventDefault(); window.history.pushState({},'','/'); window.dispatchEvent(new PopStateEvent('popstate'))"
             class="inline-block bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold
                    py-2 px-5 rounded-xl transition-colors duration-150
                    focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2
                    focus:ring-offset-gray-900">
            Go Home
          </a>
        </div>
      </div>
    </div>
  `;
}

/** Returns plain text safe for display. Only for non-DOM paths (e.g., toast). */
function safeText(str) {
  return String(str).slice(0, 64);
}
