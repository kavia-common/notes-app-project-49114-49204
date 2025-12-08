# notes-app-project-49114-49204

Update: Notes Counter
- The Notes page now shows a live counter of total notes and filtered counts (Active/Archived) in the header toolbar.
- Counts update automatically on create/edit/archive/trash/restore/delete and work offline via the local notes service.

Update: Voice-to-Text Dictation
- The web app now includes a voice-to-text feature using the browser Web Speech API.
- See NotesAppWebApplication/README.md for usage instructions, browser support, and limitations.


Backup & Restore
- Frontend-only mode: backups are stored in browser localStorage with optional export/import of .json files.
- Settings page offers: Backup now, Restore from latest, Download backup, Upload backup.
- Automatic backups run daily while the app is open and keep a rolling history of the last 3 automatic snapshots.

Endpoints
- This template instance does not include a FastAPI backend; therefore, the API endpoints in the task spec are implemented client-side.
- If integrating a backend later, implement:
  - POST /api/backup
  - GET /api/backup/latest
  - POST /api/restore
  - GET /api/backup/list
and store JSON files under a server backups/ directory with timestamped names.

Templates
- Built-in note templates (Meeting Notes, Daily Journal, To-Do List) are available in the UI.
- See NotesAppWebApplication/README.md (Templates section) for details and how to add custom templates.

Text Size
- The web app supports Small/Medium/Large text size with persistence.
- Configure default via REACT_APP_DEFAULT_FONT_SIZE (small|medium|large). See NotesAppWebApplication/README.md.

Restore caveats
- Restoring replaces current notes with the snapshot (last-write-wins).
- Invalid or incompatible backups are rejected.