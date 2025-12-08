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

