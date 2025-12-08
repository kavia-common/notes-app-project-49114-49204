//
// Notes service: switches between API-backed and local in-memory storage
// Adds categories/folders and sorting/filtering with local persistence and migration.
// Adds attachments support with local data URL persistence and API stubs.
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
const DEFAULT_SEARCH_LS_KEY = "notes.search.query";

// Attachment related defaults
const ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ATTACHMENTS_LIMIT_PER_NOTE = 10;

/* ===== Local in-memory store with localStorage persistence ===== */
const LS_KEY = "notes.mvp.list"; // legacy notes array
const LS_KEY_NOTES_STATE = "notes.mvp.state.v2"; // new state object (notes + meta)
const MIGRATION_FLAG = "notes.migrated.v2";

/**
 * Local state shape:
 * {
 *   notes: [{
 *     id, title, content, created_at, updated_at,
 *     categories?: string[],
 *     attachments?: [{id, type, name, size, mime, url, createdAt}]
 *   }],
 *   categories: string[]
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
      // normalize fields
      parsed.notes = parsed.notes.map((n) => ({
        ...n,
        categories: Array.isArray(n.categories) ? n.categories : [],
        attachments: Array.isArray(n.attachments) ? n.attachments : [],
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
          attachments: Array.isArray(n.attachments) ? n.attachments : [],
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

function nextAttachmentId(attachments) {
  return attachments.length ? Math.max(...attachments.map((a) => Number(a.id) || 0)) + 1 : 1;
}

function getAttachmentType(mime = "") {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function applySortFilter(notes, options = {}) {
  const { sortBy = DEFAULT_SORT, category, query } = options;
  let arr = Array.isArray(notes) ? [...notes] : [];

  // Category filter (single category selection)
  if (category && category !== "all") {
    arr = arr.filter((n) =>
      Array.isArray(n.categories) ? n.categories.includes(category) : false
    );
  }

  // Text/tags/attachment name search filter (case-insensitive)
  if (query && String(query).trim()) {
    const q = String(query).trim().toLowerCase();
    arr = arr.filter((n) => {
      const title = (n.title || "").toLowerCase();
      const content = (n.content || "").toLowerCase();
      const categories = Array.isArray(n.categories) ? n.categories.map((c) => (c || "").toLowerCase()) : [];
      const attachmentNames = Array.isArray(n.attachments)
        ? n.attachments.map((a) => String(a.name || "").toLowerCase())
        : [];
      return (
        title.includes(q) ||
        content.includes(q) ||
        categories.some((c) => c.includes(q)) ||
        attachmentNames.some((name) => name.includes(q))
      );
    });
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
   * List notes with optional sort, category filter and search query.
   * options: { sortBy, category, query }
   * Uses API if available, else from local storage with migration support.
   */
  if (useApi) {
    try {
      const u = new URL(`${API_BASE}/notes`, window.location.origin);
      if (options.sortBy) u.searchParams.set("sortBy", options.sortBy);
      if (options.category && options.category !== "all")
        u.searchParams.set("category", options.category);
      if (options.query && String(options.query).trim())
        u.searchParams.set("q", String(options.query).trim());
      if (options.category && options.category !== "all")
        u.searchParams.set("tags", options.category);

      const res = await fetch(u.toString().replace(window.location.origin, ""), { method: "GET" });
      if (!res.ok) throw new Error(`Failed to fetch notes: ${res.status}`);
      const data = await res.json();
      const normalized = Array.isArray(data)
        ? data.map((n) => ({
            ...n,
            categories: Array.isArray(n.categories) ? n.categories : [],
            attachments: Array.isArray(n.attachments) ? n.attachments : [],
          }))
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

/**
 * PUBLIC_INTERFACE
 * Search helper that mirrors listNotes but emphasizes query param.
 */
export async function searchNotes({ query, sortBy, category } = {}) {
  return listNotes({ query, sortBy, category });
}

/**
 * PUBLIC_INTERFACE
 * Return HTML string with <mark> wrapping matches (safe for simple highlighting).
 * Caller should render with dangerouslySetInnerHTML only for controlled content.
 */
export function applySearchHighlight(text, query) {
  const s = String(text ?? "");
  const q = String(query ?? "").trim();
  if (!q) return s;
  try {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    return s.replace(re, (m) => `<mark class="hl">${m}</mark>`);
  } catch {
    return s;
  }
}

/**
 * PUBLIC_INTERFACE
 * Accessor for search query persistence key.
 */
export const SEARCH_STORAGE_KEY = DEFAULT_SEARCH_LS_KEY;

// PUBLIC_INTERFACE
export async function createNote(note) {
  /**
   * Create a note (title, content, categories?: string[], attachments?: array).
   * Uses API if available, otherwise local.
   */
  const payload = {
    title: note.title,
    content: note.content,
    categories: Array.isArray(note.categories)
      ? note.categories.filter(Boolean)
      : [],
    // attachments ignored for API create; handled by separate upload
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
      return {
        ...created,
        categories: Array.isArray(created.categories) ? created.categories : [],
        attachments: Array.isArray(created.attachments) ? created.attachments : [],
      };
    } catch (e) {
      console.warn("Falling back to local create due to API error:", e.message);
      return localCreateNote({ ...payload, attachments: note.attachments || [] });
    }
  }
  return localCreateNote({ ...payload, attachments: note.attachments || [] });
}

/** PUBLIC_INTERFACE */
export async function updateNote(id, note) {
  /**
   * Update a note by id with {title?, content?, categories?, attachments?}; API if available, else local.
   * For API path, attachments should be managed by upload/deleteAttachment endpoints, so we ignore attachments array here.
   */
  const payload = {
    ...(note.title !== undefined ? { title: note.title } : {}),
    ...(note.content !== undefined ? { content: note.content } : {}),
    ...(note.categories !== undefined
      ? { categories: Array.isArray(note.categories) ? note.categories : [] }
      : {}),
    ...(useApi
      ? {} // do not send attachments in PUT in API mode
      : note.attachments !== undefined
      ? { attachments: Array.isArray(note.attachments) ? note.attachments : [] }
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
      return {
        ...updated,
        categories: Array.isArray(updated.categories) ? updated.categories : [],
        attachments: Array.isArray(updated.attachments) ? updated.attachments : [],
      };
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

/**
 * PUBLIC_INTERFACE
 * Upload a single attachment for a note. In local mode stores data URL in localStorage.
 * In API mode, attempts multipart/form-data POST to `${API_BASE}/notes/:id/attachments`.
 */
export async function uploadAttachment(noteId, file) {
  if (!file) throw new Error("No file provided");
  if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
    throw new Error("File too large. Max 10MB");
  }
  if (useApi) {
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE}/notes/${noteId}/attachments`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`Failed to upload: ${res.status}`);
      const att = await res.json();
      return att;
    } catch (e) {
      console.warn("Attachment API not available; falling back to local:", e.message);
      // fall through to local
    }
  }
  // Local mode: encode as data URL and persist in note.attachments
  const state = ensureState();
  const idx = state.notes.findIndex((n) => String(n.id) === String(noteId));
  if (idx === -1) throw new Error("Note not found");
  const note = state.notes[idx];
  const current = Array.isArray(note.attachments) ? note.attachments : [];
  if (current.length >= ATTACHMENTS_LIMIT_PER_NOTE) {
    throw new Error(`Maximum ${ATTACHMENTS_LIMIT_PER_NOTE} attachments per note`);
  }
  const url = await toBase64(file);
  const now = new Date().toISOString();
  const attachment = {
    id: nextAttachmentId(current),
    type: getAttachmentType(file.type || ""),
    name: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    url, // data URL
    createdAt: now,
  };
  const updated = {
    ...note,
    attachments: [attachment, ...current],
    updated_at: now,
  };
  const next = [...state.notes];
  next[idx] = updated;
  saveNotes(next);
  return attachment;
}

/**
 * PUBLIC_INTERFACE
 * Delete an attachment from a note. In API mode, attempts DELETE and falls back to local.
 */
export async function deleteAttachment(noteId, attachmentId) {
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes/${noteId}/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Failed to delete attachment: ${res.status}`);
      return true;
    } catch (e) {
      console.warn("Attachment delete API not available; falling back to local:", e.message);
      // fall through to local
    }
  }
  // Local
  const state = ensureState();
  const idx = state.notes.findIndex((n) => String(n.id) === String(noteId));
  if (idx === -1) throw new Error("Note not found");
  const note = state.notes[idx];
  const filtered = (note.attachments || []).filter((a) => String(a.id) !== String(attachmentId));
  const now = new Date().toISOString();
  const updated = { ...note, attachments: filtered, updated_at: now };
  const next = [...state.notes];
  next[idx] = updated;
  saveNotes(next);
  return true;
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
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
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
    ...(payload.attachments !== undefined
      ? { attachments: Array.isArray(payload.attachments) ? payload.attachments : [] }
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

export const _internal = {
  useApi,
  DEFAULT_SORT,
  applySortFilter,
  ATTACHMENTS_LIMIT_PER_NOTE,
  ATTACHMENT_MAX_SIZE_BYTES,
};
