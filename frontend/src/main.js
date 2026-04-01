import "./style.css";
import { renderHome } from "./pages/home.js";
import { renderRoom } from "./pages/room.js";

const app = document.getElementById("app");

function route() {
  const path = window.location.pathname;
  const roomMatch = path.match(/^\/room\/([a-f0-9-]+)$/i);

  if (roomMatch) {
    const roomId = roomMatch[1];
    renderRoom(app, roomId);
  } else {
    renderHome(app);
  }
}

// Initial render
route();

// Handle browser back/forward and programmatic pushState
window.addEventListener("popstate", route);
