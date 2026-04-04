#!/usr/bin/env bash
set -e

echo "=== Python Live Coding — Tunnel Setup ==="
echo ""

# Step 1: Build the frontend
echo "[1/2] Building frontend..."
cd frontend
npm run build
cd ..
echo "  Frontend built -> frontend/dist/"
echo ""

# Step 2: Print tunnel instructions
echo "[2/2] Starting backend on port 8000..."
echo ""
echo "  Open a SECOND terminal and run ONE of these tunnel commands:"
echo ""
echo "    localtunnel:  npx lt --port 8000"
echo "    ngrok:        ngrok http 8000"
echo ""
echo "  Then share the public URL with participants."
echo "  WebSocket connections work through both tunnel providers."
echo ""
echo "  Press Ctrl+C to stop the server."
echo "-------------------------------------------"
echo ""

# Start the backend (blocks until Ctrl+C)
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
