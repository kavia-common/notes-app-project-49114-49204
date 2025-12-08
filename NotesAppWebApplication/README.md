# Notes App (Web)

A simple notes app built with React that supports creating, editing, deleting, backing up, and exporting notes. Offline access is supported via browser storage and an offline-friendly flow.

## Features
- Create, edit, and delete notes
- Live Notes Counter (total and filtered counts; updates on CRUD, archive, trash/restore, delete)
- Full-text search on title/content
- Backup to localStorage and restore
- Export notes to JSON/TXT/PDF/ZIP
- Offline-friendly with local persistence
- Archive notes
- Trash (Recently Deleted) with 30-day retention

## Trash (Recently Deleted)
- Deleting a note now moves it to Trash (soft delete). The note is marked with:
  - `trashed: true`
  - `deletedAt: ISO timestamp`
- Trashed notes are excluded from the main list. Use a Trash view/filter in the UI to see trashed notes (if present in your current UI).
- Actions available for trashed notes:
  - Restore: returns the note to the main list.
  - Delete Permanently: removes the note forever.
- Auto-purge: Trashed notes older than 30 days are purged automatically in the background when the app is in use.

Retention policy:
- Trashed notes are retained for up to 30 days from `deletedAt` and then permanently removed.
- Policy may be adjusted in code via TRASH_RETENTION_DAYS.

## Backup and Export
- Backups (local) and exports (JSON) include trash metadata (`trashed`, `deletedAt`).
- When exporting JSON, you can choose to exclude trashed notes.
- Restoring from backup preserves trash status and timestamps.

## Offline Access and Sync
- Notes are stored in browser storage for offline use.
- Create, edit, archive, and delete while offline; changes are kept locally.
- When a backend is introduced, queued changes can sync back (architecture ready).

## Handwriting Canvas

- Click "✍️ Handwriting" in the Create form to open a pressure-sensitive drawing canvas (supports mouse/touch/stylus).
- Tools: Pen/Eraser, color, thickness, Undo/Redo, Clear.
- Click "Insert & Save" to embed the sketch (as a data URL image) in the note content and add it as an attachment for offline persistence and backup/export.
- The component lives at src/components/HandwritingCanvas.jsx with minimal styles in src/components/handwriting.css.

## Auto-save

- The editor automatically saves your note as you type using a debounced request (default 1000ms after you stop typing).
- If the note has not been created yet, the first auto-save will create it; further edits will update the same note.
- Status is shown inline near the editor: “Saving…”, “Saved”, or “Offline - changes will sync”.
- Offline: When there’s no connectivity, your latest changes are cached locally (localStorage) under a key like `autosave_note_<id|new>` and retried when you come back online.
- Validation: Completely empty notes (both title and content empty) are not saved.
- Debounce interval can be configured via environment variable:
  - REACT_APP_AUTOSAVE_DEBOUNCE_MS (milliseconds, default 1000)

## Development
- npm install
- npm start

The dev server is launched via scripts/dev.cjs which maps flags and env vars:
- Host binding: HOST or REACT_APP_HOST, default 0.0.0.0
- Port: PORT or REACT_APP_PORT, default 3000
Examples:
- HOST=0.0.0.0 PORT=3000 npm start
- npm start -- --host 0.0.0.0 --port 3000

Healthcheck:
- A static healthcheck file is available at /healthz.txt (served from public/healthz.txt) returning "ok".
- Configure your preview/proxy to check http://<host>:3000/healthz.txt

## Testing
- npm test
