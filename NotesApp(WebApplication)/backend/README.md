# NotesApp Backend (FastAPI)

Development:
- Install Python dependencies:
  pip install -r backend/requirements.txt
- Run backend:
  BACKEND_PORT=5179 python -m uvicorn backend.main:app --host 0.0.0.0 --port 5179 --reload
- Vite dev server is configured to proxy:
  - /api/* -> backend
  - /ws -> backend (WebSocket)
  - Note: The frontend itself handles /healthz (200) via middleware; backend health is accessible as /healthz on the backend origin if you hit it directly (e.g., http://localhost:5179/healthz).

Frontend + Backend together:
- Install Node deps: npm install
- Install Python deps: pip install -r backend/requirements.txt
- Start both: npm run dev:all

Environment variables:
- BACKEND_PORT (default 5179)
- REACT_APP_* variables are exposed to the frontend; by default API_BASE is set to /api and HEALTHCHECK_PATH to /healthz for proxying via Vite.
