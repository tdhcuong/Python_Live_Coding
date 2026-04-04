const IS_DEV = window.location.port === '5173';
const API_BASE = IS_DEV ? 'http://localhost:8000' : window.location.origin;

export function renderHome(container) {
  container.innerHTML = `
    <div class="flex items-center justify-center min-h-screen px-4">
      <div class="w-full max-w-md">
        <div class="text-center mb-10">
          <h1 class="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent mb-3">Python Live Coding</h1>
          <p class="text-gray-400 text-lg">Collaborative Python sessions, no account required.</p>
        </div>

        <div class="bg-gray-900 rounded-2xl border border-gray-800 p-8 shadow-2xl">
          <h2 class="text-xl font-semibold text-gray-100 mb-2">Start a Session</h2>
          <p class="text-gray-400 text-sm mb-6">
            Create a room and share the link with participants.
          </p>

          <button
            id="create-room-btn"
            class="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700
                   text-white font-semibold py-3 px-6 rounded-xl
                   transition-colors duration-150 focus:outline-none
                   focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2
                   focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Room
          </button>

          <p id="create-error" class="text-red-400 text-sm mt-3 hidden"></p>
        </div>

        <p class="text-center text-gray-600 text-xs mt-8">Built for collaborative coding sessions</p>
      </div>
    </div>
  `;

  const btn = container.querySelector("#create-room-btn");
  const errorEl = container.querySelector("#create-error");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Creating...";
    errorEl.classList.add("hidden");

    try {
      const resp = await fetch(`${API_BASE}/create-room`, { method: "POST" });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      const data = await resp.json();
      // Store host token in sessionStorage keyed by room_id for host controls
      sessionStorage.setItem(`host_token:${data.room_id}`, data.host_token)
      // Navigate to the room page (client-side routing)
      window.history.pushState({}, "", `/room/${data.room_id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (err) {
      errorEl.textContent = `Failed to create room: ${err.message}`;
      errorEl.classList.remove("hidden");
      btn.disabled = false;
      btn.textContent = "Create Room";
    }
  });
}
