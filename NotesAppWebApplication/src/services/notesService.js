//
// Notes service: switches between API-backed and local in-memory storage
//

const API_BASE = process.env.REACT_APP_API_BASE || "";
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

// PUBLIC_INTERFACE
export async function listNotes() {
  /** List notes from API if available, else from local storage. */
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes`, { method: "GET" });
      if (!res.ok) throw new Error(`Failed to fetch notes: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn("Falling back to local notes due to API error:", e.message);
      return localListNotes();
    }
  }
  return localListNotes();
}

// PUBLIC_INTERFACE
export async function createNote(note) {
  /** Create a note (title, content). Uses API if available, otherwise local. */
  const payload = { title: note.title, content: note.content };
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed to create note: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn("Falling back to local create due to API error:", e.message);
      return localCreateNote(payload);
    }
  }
  return localCreateNote(payload);
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

/* ===== Local in-memory store with localStorage persistence ===== */
const LS_KEY = "notes.mvp.list";

function readLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

function writeLocal(notes) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(notes));
  } catch {
    // ignore quota errors for MVP
  }
}

function localListNotes() {
  return Promise.resolve(readLocal());
}

function localCreateNote(payload) {
  const notes = readLocal();
  const now = new Date().toISOString();
  const newNote = {
    id: notes.length ? Math.max(...notes.map((n) => n.id || 0)) + 1 : 1,
    title: payload.title,
    content: payload.content,
    created_at: now,
    updated_at: now,
  };
  const next = [newNote, ...notes];
  writeLocal(next);
  return Promise.resolve(newNote);
}

function localDeleteNote(id) {
  const notes = readLocal();
  const next = notes.filter((n) => String(n.id) !== String(id));
  writeLocal(next);
  return Promise.resolve(true);
}

export const _internal = { useApi };
