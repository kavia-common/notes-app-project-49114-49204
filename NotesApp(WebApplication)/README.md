# NotesApp (WebApplication) - Frontend

This directory contains the React frontend for the Notes App.
It mirrors the contents from NotesAppWebApplication to satisfy deployment tooling expecting this path.

How to run locally:
- npm install
- npm start

Build:
- npm run build

Healthcheck:
- A static file is available at public/healthz.txt and is served at /healthz.
- Ensure REACT_APP_HEALTHCHECK_PATH=/healthz matches your deployment environment.
