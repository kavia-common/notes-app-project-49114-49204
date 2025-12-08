//
// Notes service: switches between API-backed and local in-memory storage
// Adds categories/folders and sorting/filtering with local persistence and migration.
//
const API_BASE =
  process.env.REACT_APP_API_BASE ||
  process.env.REACT_APP_BACKEND_URL ||
  "";
const FEATURE_FLAGS = process.env.REACT_APP_FEATURE_FLAGS || "";
const useApi =
  !!API_BASE &&
  (FEATURE_FLAGS.includes("notes_api") ||
    FEATURE_FLAGS.includes("use_api") ||
    true) && // default true if API_BASE is present
  !FEATURE_FLAGS.includes("force_local");

const headers = {
  "Content-Type": "application/json",
};

// Types and defaults
const DEFAULT_SORT = "updated_desc"; // updated_desc | updated_asc | created_desc | created_asc | title_asc | title_desc

/* ===== Local in-memory store with localStorage persistence ===== */
const LS_KEY = "notes.mvp.list"; // legacy notes array
const LS_KEY_NOTES_STATE = "notes.mvp.state.v2"; // new state object (notes + meta)
const MIGRATION_FLAG = "notes.migrated.v2";

/**
 * Local state shape:
 * {
 *   notes: [{id, title, content, created_at, updated_at, categories?: string[]}],
 *   categories: string[] // optional global category list for quick selection
 * }
 */
function readLocalLegacyNotes() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readLocalState() {
  try {
    const raw = localStorage.getItem(LS_KEY_NOTES_STATE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.notes)) {
      // normalize categories field
      parsed.notes = parsed.notes.map((n) => ({
        ...n,
        categories: Array.isArray(n.categories) ? n.categories : [],
      }));
      parsed.categories = Array.isArray(parsed.categories)
        ? Array.from(new Set(parsed.categories))
        : [];
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeLocalState(state) {
  try {
    localStorage.setItem(LS_KEY_NOTES_STATE, JSON.stringify(state));
  } catch {
    // ignore quota errors for MVP
  }
}

function migrateIfNeeded() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;
    const newState = readLocalState();
    if (newState) {
      localStorage.setItem(MIGRATION_FLAG, "1");
      return;
    }
    const legacy = readLocalLegacyNotes();
    if (legacy && Array.isArray(legacy) && legacy.length >= 0) {
      const migrated = {
        notes: legacy.map((n) => ({
          ...n,
          categories: Array.isArray(n.categories) ? n.categories : [],
        })),
        categories: [],
      };
      writeLocalState(migrated);
      localStorage.setItem(MIGRATION_FLAG, "1");
    }
  } catch {
    // best effort
  }
}

function ensureState() {
  migrateIfNeeded();
  let state = readLocalState();
  if (!state) {
    state = { notes: [], categories: [] };
    writeLocalState(state);
  }
  return state;
}

function saveNotes(nextNotes) {
  const state = ensureState();
  writeLocalState({ ...state, notes: nextNotes });
}

function saveCategoriesList(nextCategories) {
  const state = ensureState();
  writeLocalState({ ...state, categories: Array.from(new Set(nextCategories)) });
}

// Helpers
function nextId(notes) {
  return notes.length ? Math.max(...notes.map((n) => Number(n.id) || 0)) + 1 : 1;
}

function applySortFilter(notes, options = {}) {
  const { sortBy = DEFAULT_SORT, category } = options;
  let arr = Array.isArray(notes) ? [...notes] : [];

  // Category filter (single category selection)
  if (category && category !== "all") {
    arr = arr.filter((n) =>
      Array.isArray(n.categories) ? n.categories.includes(category) : false
    );
  }

  // Sorting
  const compareStr = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
  const compareDate = (a, b) => new Date(a).getTime() - new Date(b).getTime();

  switch (sortBy) {
    case "updated_asc":
      arr.sort((a, b) => compareDate(a.updated_at || a.created_at, b.updated_at || b.created_at));
      break;
    case "updated_desc":
      arr.sort((a, b) => compareDate(b.updated_at || b.created_at, a.updated_at || a.created_at));
      break;
    case "created_asc":
      arr.sort((a, b) => compareDate(a.created_at, b.created_at));
      break;
    case "created_desc":
      arr.sort((a, b) => compareDate(b.created_at, a.created_at));
      break;
    case "title_desc":
      arr.sort((a, b) => compareStr(b.title || "", a.title || ""));
      break;
    case "title_asc":
    default:
      arr.sort((a, b) => compareStr(a.title || "", b.title || ""));
      break;
  }
  return arr;
}

// PUBLIC_INTERFACE
export async function listNotes(options = {}) {
  /**
   * List notes with optional sort and category filter.
   * options: { sortBy, category }
   * Uses API if available, else from local storage with migration support.
   */
  if (useApi) {
    try {
      const u = new URL(`${API_BASE}/notes`, window.location.origin);
      // Optional: pass sort/filter as query (backend may ignore)
      if (options.sortBy) u.searchParams.set("sortBy", options.sortBy);
      if (options.category && options.category !== "all")
        u.searchParams.set("category", options.category);

      const res = await fetch(u.toString().replace(window.location.origin, ""), { method: "GET" });
      if (!res.ok) throw new Error(`Failed to fetch notes: ${res.status}`);
      const data = await res.json();
      // Ensure categories array exists per note for UI
      const normalized = Array.isArray(data)
        ? data.map((n) => ({ ...n, categories: Array.isArray(n.categories) ? n.categories : [] }))
        : [];
      return applySortFilter(normalized, options);
    } catch (e) {
      console.warn("Falling back to local notes due to API error:", e.message);
      const state = ensureState();
      return applySortFilter(state.notes, options);
    }
  }
  const state = ensureState();
  return applySortFilter(state.notes, options);
}

// PUBLIC_INTERFACE
export async function createNote(note) {
  /**
   * Create a note (title, content, categories?: string[]).
   * Uses API if available, otherwise local.
   */
  const payload = {
    title: note.title,
    content: note.content,
    categories: Array.isArray(note.categories)
      ? note.categories.filter(Boolean)
      : [],
  };
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed to create note: ${res.status}`);
      const created = await res.json();
      return { ...created, categories: Array.isArray(created.categories) ? created.categories : [] };
    } catch (e) {
      console.warn("Falling back to local create due to API error:", e.message);
      return localCreateNote(payload);
    }
  }
  return localCreateNote(payload);
}

/** PUBLIC_INTERFACE */
export async function updateNote(id, note) {
  /**
   * Update a note by id with {title?, content?, categories?}; API if available, else local.
   */
  const payload = {
    ...(note.title !== undefined ? { title: note.title } : {}),
    ...(note.content !== undefined ? { content: note.content } : {}),
    ...(note.categories !== undefined
      ? { categories: Array.isArray(note.categories) ? note.categories : [] }
      : {}),
  };
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed to update note: ${res.status}`);
      const updated = await res.json();
      return { ...updated, categories: Array.isArray(updated.categories) ? updated.categories : [] };
    } catch (e) {
      console.warn("Falling back to local update due to API error:", e.message);
      return localUpdateNote(id, payload);
    }
  }
  return localUpdateNote(id, payload);
}

// PUBLIC_INTERFACE
export async function deleteNote(id) {
  /** Delete note by id; API if available or local. */
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete note: ${res.status}`);
      return true;
    } catch (e) {
      console.warn("Falling back to local delete due to API error:", e.message);
      return localDeleteNote(id);
    }
  }
  return localDeleteNote(id);
}

// PUBLIC_INTERFACE
export async function listCategories() {
  /** List all categories known in local state (union of note categories plus saved list). */
  const state = ensureState();
  const union = new Set(state.categories);
  state.notes.forEach((n) => (n.categories || []).forEach((c) => union.add(c)));
  return Array.from(union).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

// PUBLIC_INTERFACE
export async function addCategoryToNote(noteId, category) {
  /** Add a single category to note; persists locally; API if present will be handled by updateNote. */
  const state = ensureState();
  const idx = state.notes.findIndex((n) => String(n.id) === String(noteId));
  if (idx === -1) return Promise.reject(new Error("Note not found"));
  const note = state.notes[idx];
  const cats = new Set(Array.isArray(note.categories) ? note.categories : []);
  if (category && category.trim()) cats.add(category.trim());
  const updated = await localUpdateNote(noteId, { categories: Array.from(cats) });
  // also store category in categories list
  saveCategoriesList([...state.categories, category.trim()]);
  return updated;
}

// PUBLIC_INTERFACE
export async function removeCategoryFromNote(noteId, category) {
  /** Remove a single category from note; local only; API handled by updateNote if available. */
  const state = ensureState();
  const idx = state.notes.findIndex((n) => String(n.id) === String(noteId));
  if (idx === -1) return Promise.reject(new Error("Note not found"));
  const note = state.notes[idx];
  const cats = new Set(Array.isArray(note.categories) ? note.categories : []);
  if (category) cats.delete(category);
  return localUpdateNote(noteId, { categories: Array.from(cats) });
}

/* ===== Local store implementations ===== */

function localListNotes() {
  const state = ensureState();
  return Promise.resolve(state.notes);
}

function localCreateNote(payload) {
  const state = ensureState();
  const now = new Date().toISOString();
  const newNote = {
    id: nextId(state.notes),
    title: payload.title,
    content: payload.content,
    categories: Array.isArray(payload.categories) ? payload.categories : [],
    created_at: now,
    updated_at: now,
  };
  const next = [newNote, ...state.notes];
  saveNotes(next);
  // Update categories list with any new categories
  if (newNote.categories.length) {
    saveCategoriesList([...(state.categories || []), ...newNote.categories]);
  }
  return Promise.resolve(newNote);
}

function localDeleteNote(id) {
  const state = ensureState();
  const next = state.notes.filter((n) => String(n.id) !== String(id));
  saveNotes(next);
  return Promise.resolve(true);
}

function localUpdateNote(id, payload) {
  const state = ensureState();
  const idx = state.notes.findIndex((n) => String(n.id) === String(id));
  if (idx === -1) {
    return Promise.reject(new Error("Note not found"));
  }
  const now = new Date().toISOString();
  const updated = {
    ...state.notes[idx],
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.content !== undefined ? { content: payload.content } : {}),
    ...(payload.categories !== undefined
      ? { categories: Array.isArray(payload.categories) ? payload.categories : [] }
      : {}),
    updated_at: now,
  };
  const next = [...state.notes];
  next[idx] = updated;
  saveNotes(next);
  // sync categories list if provided
  if (payload.categories) {
    saveCategoriesList([...(state.categories || []), ...payload.categories]);
  }
  return Promise.resolve(updated);
}

export const _internal = { useApi, DEFAULT_SORT, applySortFilter };
