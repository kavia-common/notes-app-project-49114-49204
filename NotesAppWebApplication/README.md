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

## Background Color per Note

You can set a background color for each note. The selected color appears:
- In the notes list card
- In the editor canvas (Create/Edit)
- In the Edit modal preview

How to set:
- Create form: use the “Background color” picker under the editor. Choose a preset swatch or set a custom color.
- Edit dialog: use the same “Background color” picker.
- Quick Add: an optional color picker is available before content.

Persistence:
- The color is saved with the note metadata (note.backgroundColor) and survives reloads and backups/exports.

Accessibility:
- The app automatically switches text color to maintain good contrast (light/dark text) and adds a subtle overlay for very light or saturated backgrounds to improve readability. Aim for colors that preserve contrast with text for best results.
- If a chosen color leads to low contrast, consider a darker/lighter shade.

Reset:
- Use the “Clear” button in the color picker to remove the color.

## Quick Add Note (Popup)

A lightweight popup for quickly creating short notes without leaving your current context.

- Open via the floating + button at the bottom-right, or the keyboard shortcut:
  - Ctrl/Cmd + Shift + N
- Minimal fields:
  - Title (optional)
  - Content (required) — single textarea with character counter
- Autosaves your draft while the popup is open, so accidental closes don’t lose text
- Accessibility:
  - Proper dialog semantics with focus trapping
  - Escape closes the popup
  - First input focused on open
- Submit:
  - Creates the note via the existing notesService
  - Inserts the new note at the top of the list (respecting current sort/filter composition)
  - Shows the existing Save Success toast
  - Prevents duplicate submissions and disables the submit button while saving
  - Inline validation ensures content is not empty
- Content sanitization:
  - Reuses the app’s existing sanitization logic to keep input safe

Configuration:
- QUICK_ADD_MAX_LENGTH via env var:
  - REACT_APP_QUICK_ADD_MAX_LENGTH (default 280)
  - Legacy alias: REACT_APP_QUICK_ADD_CHAR_LIMIT

## Duplicate title detection

- The app warns when a note title matches an existing note’s title (case-insensitive, trimmed, and with collapsed whitespace by default).
- Where it applies:
  - Create form (real-time as you type): shows a subtle inline warning and a small warning badge; the Save button is disabled while a duplicate is present.
  - Edit dialog: warns if you change the title to match another note’s title; your own note’s original title is allowed (the check excludes the same note by id).
  - Quick Add popup: same inline warning and Save disable.
- Autosave behavior:
  - For a brand new note (create-on-first-save), autosave is skipped when the title is a duplicate.
  - For edits, autosave is allowed when the duplicate refers to the same note id (i.e., no change) but would be blocked if it would conflict with a different note.
- Accessibility:
  - Warnings are also announced via an ARIA live (polite) region so screen readers are notified.
- Configuration:
  - REACT_APP_ALLOW_DUPLICATE_TITLES=false (default). Set to true to disable duplicate checking.
  - REACT_APP_TITLE_MATCH_CASE_SENSITIVE=false (default). Set to true to make duplicate matching case-sensitive.
  - You can also adjust the matching logic in src/utils/titleUtils.js if you prefer different normalization rules.

## Auto-save

- The editor automatically saves your note as you type using a debounced request (default 1000ms after you stop typing).
- On successful auto-save or manual save, a lightweight success toast appears for a short duration to confirm the save (see “Save success feedback” below).
- If the note has not been created yet, the first auto-save will create it; further edits will update the same note.
- Status is shown inline near the editor: “Saving…”, “Saved”, or “Offline - changes will sync”.
- Offline: When there’s no connectivity, your latest changes are cached locally (localStorage) under a key like `autosave_note_<id|new>` and retried when you come back online.
- Validation: Completely empty notes (both title and content empty) are not saved.
- Debounce interval can be configured via environment variable:
  - REACT_APP_AUTOSAVE_DEBOUNCE_MS (milliseconds, default 1000)

## Last Updated timestamps

The app records and displays a “Last updated” time for each note.

- Whenever a note is created or modified (autosave, quick add, formatting/color changes, reminder updates, and lock/unlock operations that change content), its updated_at field is set.
- The Notes list and the editor footers show “Last updated: …” as a relative time, with a tooltip that shows the exact ISO time.

Locked notes:
- Locked notes still display the updated time but never expose note content until unlocked.

Offline vs Server time:
- Offline edits use local device time for updated_at and are persisted safely.
- On the next successful save/sync, if the backend returns an authoritative timestamp, the UI replaces the local time with server time.

Accessibility:
- After saves complete, a polite ARIA-live message announces that the note was saved and when it was last updated.

## Save success feedback

- After a successful save (auto-save or manual save), the app displays a small, non-intrusive success toast saying “Note saved successfully”.
- The toast is an ARIA live polite region for accessibility and auto-hides after about 2 seconds by default.
- Rapid consecutive auto-saves will not spam multiple toasts; the same message is coalesced by refreshing the timer.
- Duration can be configured with the environment variable:
  - REACT_APP_SAVE_SUCCESS_TOAST_MS (milliseconds, default 2000)
- The success toast does not replace existing inline statuses (“Saving…”, “Saved”, “Offline - changes will sync”); it is additive user feedback placed at the bottom-right.

## Templates

Built-in templates let you quickly scaffold common note types:
- Meeting Notes
- Daily Journal
- To-Do List

How to use:
- In the Create form, choose “Insert template…” to prefill the editor.
- In the Edit dialog, use the template picker in the formatting toolbar to insert into the note.
Behavior:
- If the editor is empty, the template replaces the content.
- If the editor has text, the template is appended with a simple divider.
- In Create mode, insertion triggers auto-save; the caret moves to the top of the editor.

Rendering:
- Templates are plain, sanitized HTML compatible with the app’s rich-text editor and preview. Only inline-safe tags are used.

Extending with custom templates (developers):
- Add new template objects to src/templates/templates.js:
  - { id: string, name: string, description: string, contentHtml: string }
  - Keep HTML limited to allowed tags: b, strong, i, em, u, code, br, p, div, span.
- The Template Picker automatically lists all entries in NOTE_TEMPLATES.

## Character & Word Count

The app shows live character and word counts in all authoring surfaces.

Where it appears:
- Create editor (toolbar/footer under the content editor)
- Edit modal editor (footer under the editor)
- Quick Add popup (compact counter near the textarea)

Behavior:
- Words are sequences of non-whitespace characters separated by whitespace.
- Characters count visible text after stripping HTML tags (the editor stores sanitized HTML, counters ignore tags).
- Counts update as you type and are efficiently computed (~100ms work using a lightweight utility).
- Screen readers get polite announcements of updated counts at most once per second to avoid verbosity (aria-live='polite').

Locked notes:
- Edit modal shows “Locked” in place of counts if a note is locked and not unlocked for the session.
- When unlocked (decrypted), counts are computed from the decrypted visible text.

Quick Add limits:
- If a character limit is configured via REACT_APP_QUICK_ADD_MAX_LENGTH (default 280), the counter shows “current/limit (words)”.
- The content is validated against the limit on submit.

Configuration tips:
- REACT_APP_QUICK_ADD_MAX_LENGTH=280 to change Quick Add character budget.
- REACT_APP_AUTOSAVE_DEBOUNCE_MS controls autosave debounce; counters are separate and won’t interfere.

Implementation details:
- Utility at src/utils/textMetrics.js exports:
  - stripHtml(input)
  - countWords(text)
  - countChars(text)
  - getTextMetricsFromHtml(html) -> { words, chars }
- Live announcements are throttled to avoid noisy screen reader output.

## Undo / Redo

Editors now support undo/redo with toolbar buttons and keyboard shortcuts.

- Where available:
  - Create editor (rich-text, contentEditable)
  - Edit dialog editor (rich-text, contentEditable)
  - Quick Add textarea (native browser history)
- Toolbar:
  - ↶ Undo and ↷ Redo buttons are in the editor toolbars. Buttons are disabled if no further undo/redo is available.
  - Actions are announced via an ARIA live (polite) region for screen readers.
- Shortcuts:
  - Ctrl/Cmd + Z: Undo
  - Ctrl/Cmd + Shift + Z: Redo
  - Ctrl/Cmd + Y: Redo
- Behavior:
  - For contentEditable editors, the app prefers native browser undo/redo (execCommand/history) where available.
  - If not available, the app maintains its own history stack with throttled snapshots (~300ms) capturing sanitized HTML and caret/selection positions. The max history depth is ~100.
  - No-op changes are skipped, and snapshots are coalesced to avoid noisy states (e.g., template insert is recorded as a single step).
  - Autosave does not trigger on every undo/redo keystroke. It schedules a debounced save once interactions settle, preserving performance.

## Rich-text formatting

The editor supports lightweight inline formatting:

- Bold, Italic, Underline
- Inline code

How to use:
- Select text and click toolbar buttons above the editor.
- Keyboard shortcuts:
  - Ctrl/Cmd+B for Bold
  - Ctrl/Cmd+I for Italic
  - Ctrl/Cmd+U for Underline
- Inline code: select text and click the </> button (wraps selection in a code style).

Storage format:
- Content is saved as sanitized HTML. The notes list and previews render this HTML so formatting appears in the snippet.

Security:
- HTML is sanitized on input and on render using DOMPurify to prevent XSS. Only the following inline tags are allowed: b, strong, i, em, u, code, br, p, div, span. No attributes are preserved.

Tips:
- Pasting rich text will be sanitized automatically.
- The search highlight works on the sanitized HTML output.

## Text Size Preference

- Use the "Text size" control in the toolbar to switch between Small, Medium, and Large text.
- The selection applies across note previews, the editor, and reading views.
- The choice is saved in your browser and restored on next visit.
- Default can be overridden via environment variable:
  - REACT_APP_DEFAULT_FONT_SIZE=small|medium|large
- Implementation uses a data-font-size attribute on the document root with CSS variable scaling to avoid layout shifts and editor conflicts.

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

## Note Lock (4-digit PIN)

You can lock individual notes with a 4-digit PIN. When locked:
- The note content is encrypted client-side with AES-GCM. The key is derived from your PIN using PBKDF2 (SHA-256) with a per-note random salt.
- Only the ciphertext, IV, and salt are stored; your raw PIN is never saved.
- The list shows a lock icon and masked preview; content is hidden until you unlock.

How to use:
- Create form: click "Set PIN" to assign a 4-digit PIN before saving your new note.
- Edit dialog: click "Set PIN" to lock; "Remove PIN" to remove the lock (stores plaintext again).
- Unlock: click "Unlock" on a locked note and enter your PIN. If correct, the note is unlocked for this browser session.

Autosave and editing:
- When a note is locked, autosave saves the encrypted body.
- When you unlock and edit, content is re-encrypted on save.

Security caveats:
- Client-side encryption protects against casual inspection but cannot protect against an attacker with full access to your running browser context or device.
- 4-digit PINs are low-entropy. Prefer not to use predictable PINs; this is not a replacement for robust account-level encryption.
- Do not forget your PIN. Without it, content cannot be decrypted.

Environment flags:
- REACT_APP_NOTELOCK_ENABLED=true (default true): turns the feature on/off.
- REACT_APP_NOTELOCK_SESSION_TIMEOUT=15 (minutes): inactivity timeout for auto-relock of session unlocks.

Accessibility:
- Modals are keyboard-accessible with focus management and aria-live feedback for errors.
- Lock state changes are announced in live regions.

## Testing
- npm test
