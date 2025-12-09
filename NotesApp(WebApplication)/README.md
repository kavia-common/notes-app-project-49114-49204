# NotesApp (WebApplication)

This is a Vite + React app for the Notes App frontend with an integrated FastAPI backend for development.

Run locally:
- Install frontend dependencies: npm install
- Install backend dependencies: pip install -r backend/requirements.txt
- Start both servers: npm run dev:all
  - Frontend: Vite on REACT_APP_PORT (default 3000)
  - Backend: FastAPI on BACKEND_PORT (default 5179)
  - Vite proxies /api/* and /ws to the backend.
  - Note: The frontend itself serves /healthz via a lightweight Vite middleware. The SPA (index.html) is served at '/'.

Alternative:
- Start backend only: npm run dev:backend
- Start frontend only: npm run dev

Environment:
- Copy .env.example to .env and adjust as needed
- Uses REACT_APP_* variables from .env
- Binds to port REACT_APP_PORT (default 3000) and host 0.0.0.0
- Backend port configured via BACKEND_PORT (default 5179)

Health:
- The frontend exposes a health endpoint at GET /healthz (returns { "status": "ok", "service": "frontend" }).
- The app UI loads at '/', and API endpoints are under '/api'.
- When the backend is running, the app's status section should show "backend: healthy".
