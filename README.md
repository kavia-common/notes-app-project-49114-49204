# notes-app-project-49114-49204

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

Restore caveats
- Restoring replaces current notes with the snapshot (last-write-wins).
- Invalid or incompatible backups are rejected.