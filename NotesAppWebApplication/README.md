# Notes App (Web)

A simple notes app built with React that supports creating, editing, deleting, backing up, and exporting notes. Offline access is supported via browser storage and an offline-friendly flow.

## Features
- Create, edit, and delete notes
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

## Development
- npm install
- npm start

## Testing
- npm test
