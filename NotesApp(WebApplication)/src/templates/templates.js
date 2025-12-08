//
// Built-in note templates for the rich-text HTML editor
// Each template provides metadata and sanitized, simple HTML content
//
// Note: Only inline-safe tags allowed by the app's sanitizer should be used:
// Allowed tags: b, strong, i, em, u, code, br, p, div, span
// Avoid lists/headings if sanitizer doesn't allow them. We emulate using <div>/<span>.
//
// PUBLIC_INTERFACE
export const NOTE_TEMPLATES = [
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    description: "Agenda, attendees, notes, and action items.",
    contentHtml: [
      '<div><strong>Meeting Title:</strong> <span></span></div>',
      '<div><strong>Date:</strong> <span></span></div>',
      '<div><strong>Time:</strong> <span></span></div>',
      '<div><strong>Location/Link:</strong> <span></span></div>',
      '<br>',
      '<div><strong>Attendees</strong></div>',
      '<div>- <span></span></div>',
      '<div>- <span></span></div>',
      '<div>- <span></span></div>',
      '<br>',
      '<div><strong>Agenda</strong></div>',
      '<div>1) <span></span></div>',
      '<div>2) <span></span></div>',
      '<div>3) <span></span></div>',
      '<br>',
      '<div><strong>Discussion Notes</strong></div>',
      '<div>- <span></span></div>',
      '<div>- <span></span></div>',
      '<div>- <span></span></div>',
      '<br>',
      '<div><strong>Action Items</strong></div>',
      '<div>- <span><strong>Owner</strong></span>: <span>Task</span> (Due: <span></span>)</div>',
      '<div>- <span><strong>Owner</strong></span>: <span>Task</span> (Due: <span></span>)</div>',
    ].join(""),
  },
  {
    id: "daily-journal",
    name: "Daily Journal",
    description: "Prompts for gratitude, highlights, obstacles, and notes.",
    contentHtml: [
      '<div><strong>Date:</strong> <span></span></div>',
      '<br>',
      '<div><strong>Gratitude</strong></div>',
      '<div>- <span></span></div>',
      '<div>- <span></span></div>',
      '<div>- <span></span></div>',
      '<br>',
      '<div><strong>Highlights</strong></div>',
      '<div>- <span></span></div>',
      '<div>- <span></span></div>',
      '<div>- <span></span></div>',
      '<br>',
      '<div><strong>Challenges / Obstacles</strong></div>',
      '<div>- <span></span></div>',
      '<div>- <span></span></div>',
      '<br>',
      '<div><strong>Notes</strong></div>',
      '<div><span></span></div>',
    ].join(""),
  },
  {
    id: "todo-list",
    name: "To-Do List",
    description: "Simple checklist-style tasks with priorities.",
    contentHtml: [
      '<div><strong>To-Do</strong></div>',
      '<div>[ ] <span>Task 1</span> <span class="muted">(Low/Med/High)</span></div>',
      '<div>[ ] <span>Task 2</span> <span class="muted">(Low/Med/High)</span></div>',
      '<div>[ ] <span>Task 3</span> <span class="muted">(Low/Med/High)</span></div>',
      '<br>',
      '<div><strong>Notes</strong></div>',
      '<div><span></span></div>',
    ].join(""),
  },
];

// PUBLIC_INTERFACE
export function getTemplateById(id) {
  /** Return a template object by id or null if not found. */
  return NOTE_TEMPLATES.find((t) => t.id === id) || null;
}
