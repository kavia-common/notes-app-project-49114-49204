# NotesApp (WebApplication)

This is a Vite + React app for the Notes App frontend.

Run locally:
- Install dependencies: npm install
- Start dev server: npm run dev

Environment:
- Uses REACT_APP_* variables from .env
- Binds to port REACT_APP_PORT (default 3000) and host 0.0.0.0

Health:
- Frontend becomes ready when the Vite server is listening on the configured port.
