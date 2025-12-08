# NotesApp Web Application

Recently Edited Section
- The Notes page shows a "Recently Edited" section above the main list, sorted by the most recent updatedAt.
- Locked notes remain protected and render with a lock placeholder.
- Accessibility: the section is a landmark region with aria-labelledby, cards are keyboard navigable (Enter/Space to open Edit), and badges include accessible labels.

Configuration via environment variables
- REACT_APP_RECENTLY_EDITED_COUNT: number of items to show by default in the section. Default: 5
- REACT_APP_RECENTLY_EDITED_DAYS: time window in days for notes to qualify as "recent." Default: 7

Example .env entries:
REACT_APP_RECENTLY_EDITED_COUNT=5
REACT_APP_RECENTLY_EDITED_DAYS=7

Behavior
- "View all" jumps to the main "Your Notes" list.
- "See more" expands beyond the default count when additional recent items exist.
- The section updates immediately when you quick-add or edit notes, leveraging existing state updates and autosave flows.

Auto-title behavior
- When the title field is empty, the app derives a title from the first non-empty line of the note content. HTML tags are stripped before deriving.
- The derived title updates live as you type and is shown as an italic placeholder (prefixed with "Auto:") in the title input. Once you type a title, auto-derivation stops and your input is used.
- This applies to Create, Edit, Autosave, and Quick Add flows. Edits to a note with an empty title will continue to auto-derive until you set one.
- Duplicate title rules still apply to derived titles:
  - Creating a new note (including autosave first create) is blocked if the derived title duplicates an existing note’s title.
  - Editing an existing note is allowed if the derived/typed title matches the note’s current title (same note), but still blocked if it conflicts with a different note’s title.
- Utilities:
  - deriveTitleFromContent(html): strips HTML, uses the first non-empty line, trims, and truncates long lines.
  - isUserProvidedTitle(titleState): true if the user input is non-empty.
- Environment:
  - REACT_APP_TITLE_MATCH_CASE_SENSITIVE (optional): set to "true" to make duplicate matching case-sensitive (default is case-insensitive).

```env
# Optional
REACT_APP_TITLE_MATCH_CASE_SENSITIVE=false
```
