//
//
//
// Notes service: switches between API-backed and local in-memory storage
// Adds categories/folders and sorting/filtering with local persistence and migration.
// Adds attachments support with local data URL persistence and API stubs.
// Adds reminders with local scheduler helpers and API stubs.
// Adds pinned/favorite support with migration, sorting, and API patch stubs.
// Adds Trash support: trashed flag, deletedAt timestamp, restore, permanent delete, auto-purge.
//
// IMPORTANT: This file is the public interface used by the app's pages/components.
// PUBLIC_INTERFACE tags are added to exported functions for documentation visibility.

import { generateSalt, deriveKeyFromPin, encrypt, decrypt, bytesToBase64, base64ToBytes } from "../utils/crypto";

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
const ARCHIVE_FILTER_MODES = {
  active: 'active',
  archived: 'archived',
  all: 'all',
};
const DEFAULT_SEARCH_LS_KEY = "notes.search.query";

// Attachment related defaults
const ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ATTACHMENTS_LIMIT_PER_NOTE = 10;

// Trash retention
const TRASH_RETENTION_DAYS = 30;

/* ===== Local in-memory store with localStorage persistence ===== */
const LS_KEY = "notes.mvp.list"; // legacy notes array
const LS_KEY_NOTES_STATE = "notes.mvp.state.v4"; // bumped to v4 to include trash fields
const MIGRATION_FLAG = "notes.migrated.v4";

/**
 * Local state shape:
 * {
 *   notes: [{
 *     id, title, content, created_at, updated_at,
 *     categories?: string[],
 *     attachments?: [{id, type, name, size, mime, url, createdAt}],
 *     reminder?: {
 *       reminderAt?: string, // ISO
 *       reminderId?: string,
 *       reminderStatus?: 'pending'|'fired'|'dismissed'|'snoozed',
 *       repeat?: 'none'|'daily'|'weekly'
 *     },
 *     pinned?: boolean,
 *     pinnedAt?: string|null, // ISO when pinned
 *     favorite?: boolean,
 *     archived?: boolean,
 *     // Trash
 *     trashed?: boolean,
 *     deletedAt?: string|null
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

function normalizeNoteBooleans(n) {
  return {
    ...n,
    pinned: !!n.pinned,
    favorite: !!n.favorite,
    archived: !!n.archived,
    trashed: !!n.trashed,
    pinnedAt: n.pinned
      ? n.pinnedAt
        ? new Date(n.pinnedAt).toISOString()
        : n.updated_at || n.created_at || new Date().toISOString()
      : null,
    deletedAt: n.trashed && n.deletedAt
      ? (new Date(n.deletedAt).toISOString())
      : (n.trashed ? new Date().toISOString() : null),
  };
}

function readLocalState() {
  try {
    const raw = localStorage.getItem(LS_KEY_NOTES_STATE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.notes)) {
      // normalize fields
      parsed.notes = parsed.notes.map((n) =>
        normalizeNoteBooleans({
          ...n,
          categories: Array.isArray(n.categories) ? n.categories : [],
          attachments: Array.isArray(n.attachments) ? n.attachments : [],
          reminder: n.reminder ? normalizeReminder(n.reminder) : undefined,
        })
      );
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

/**
 * INTERNAL: Build a version snapshot from a note.
 */
function buildVersionFromNote(note, summary = "") {
  const now = new Date().toISOString();
  return {
    versionId: `v_${now}_${Math.random().toString(36).slice(2, 8)}`,
    created_at: now,
    summary,
    data: {
      title: note.title || "",
      content: note.content || "",
      categories: Array.isArray(note.categories) ? [...note.categories] : [],
      attachments: Array.isArray(note.attachments) ? [...note.attachments] : [],
      reminder: note.reminder ? { ...note.reminder } : undefined,
      pinned: !!note.pinned,
      favorite: !!note.favorite,
      pinnedAt: note.pinnedAt || null,
      archived: !!note.archived,
      trashed: !!note.trashed,
      deletedAt: note.deletedAt || null,
      backgroundColor: note.backgroundColor || null,
    },
  };
}

/**
 * INTERNAL: Ensure note has versions array initialized.
 */
function ensureNoteVersions(note) {
  if (!Array.isArray(note.versions)) {
    note.versions = [];
  }
  return note;
}

// PUBLIC_INTERFACE
export function summarizeChange(prev, next) {
  /** Returns a short string summary like "title, content, tags" for changed fields. */
  const changed = [];
  if ((prev?.title || "") !== (next?.title || "")) changed.push("title");
  if ((prev?.content || "") !== (next?.content || "")) changed.push("content");
  const prevCats = JSON.stringify(Array.isArray(prev?.categories) ? [...prev.categories].sort() : []);
  const nextCats = JSON.stringify(Array.isArray(next?.categories) ? [...next.categories].sort() : []);
  if (prevCats !== nextCats) changed.push("categories");
  const prevFav = !!prev?.favorite;
  const nextFav = !!next?.favorite;
  if (prevFav !== nextFav) changed.push("favorite");
  const prevArch = !!prev?.archived;
  const nextArch = !!next?.archived;
  if (prevArch !== nextArch) changed.push("archived");
  const prevTrash = !!prev?.trashed;
  const nextTrash = !!next?.trashed;
  if (prevTrash !== nextTrash || (prev?.deletedAt || null) !== (next?.deletedAt || null)) changed.push("trash");
  const prevPin = !!prev?.pinned;
  const nextPin = !!next?.pinned;
  if (prevPin !== nextPin || (prev?.pinnedAt || null) !== (next?.pinnedAt || null)) changed.push("pinned");
  const prevAtt = JSON.stringify(Array.isArray(prev?.attachments) ? prev.attachments.map(a => ({ name: a.name, size: a.size, mime: a.mime })) : []);
  const nextAtt = JSON.stringify(
    Array.isArray(next?.attachments)
      ? next.attachments.map((a) => ({ name: a.name, size: a.size, mime: a.mime }))
      : []
  );
  if (prevAtt !== nextAtt) changed.push("attachments");
  const prevRem = prev?.reminder ? { ...prev.reminder } : undefined;
  const nextRem = next?.reminder ? { ...next.reminder } : undefined;
  if (JSON.stringify(prevRem) !== JSON.stringify(nextRem)) changed.push("reminder");
  if ((prev?.backgroundColor || null) !== (next?.backgroundColor || null)) changed.push("background");
  return changed.length ? changed.join(", ") : "no-op";
}

// PUBLIC_INTERFACE
export function diffTextLines(a = "", b = "") {
  /** Returns simple unified diff as array of {type:'same'|'add'|'del', text} per line. */
  const aLines = String(a).split("\n");
  const bLines = String(b).split("\n");
  const max = Math.max(aLines.length, bLines.length);
  const out = [];
  for (let i = 0; i < max; i++) {
    const la = aLines[i] ?? "";
    const lb = bLines[i] ?? "";
    if (la === lb) out.push({ type: "same", text: la });
    else {
      if (la !== "") out.push({ type: "del", text: la });
      if (lb !== "") out.push({ type: "add", text: lb });
    }
  }
  return out;
}

// PUBLIC_INTERFACE
export async function listNoteVersions(noteId) {
  const state = ensureState();
  const note = state.notes.find((n) => String(n.id) === String(noteId));
  if (!note) return [];
  ensureNoteVersions(note);
  // newest first
  return [...note.versions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// PUBLIC_INTERFACE
export async function getNoteVersion(noteId, versionId) {
  const state = ensureState();
  const note = state.notes.find((n) => String(n.id) === String(noteId));
  if (!note) throw new Error("Note not found");
  ensureNoteVersions(note);
  const v = note.versions.find((vv) => vv.versionId === versionId);
  if (!v) throw new Error("Version not found");
  return v;
}

// PUBLIC_INTERFACE
export async function diffNoteVersion(noteId, versionId) {
  const state = ensureState();
  const note = state.notes.find((n) => String(n.id) === String(noteId));
  if (!note) throw new Error("Note not found");
  ensureNoteVersions(note);
  const ver = note.versions.find((vv) => vv.versionId === versionId);
  if (!ver) throw new Error("Version not found");
  return {
    titleChanged: (ver.data.title || "") !== (note.title || ""),
    contentDiff: diffTextLines(ver.data.content || "", note.content || ""),
  };
}

// PUBLIC_INTERFACE
export async function revertNoteToVersion(noteId, versionId) {
  const state = ensureState();
  const idx = state.notes.findIndex((n) => String(n.id) === String(noteId));
  if (idx === -1) throw new Error("Note not found");
  const note = ensureNoteVersions(state.notes[idx]);

  const selected = note.versions.find((vv) => vv.versionId === versionId);
  if (!selected) throw new Error("Version not found");

  // Create a version from current before reverting
  const before = buildVersionFromNote(note, "manual revert checkpoint");
  note.versions = [before, ...note.versions];

  // Apply selected version data
  const now = new Date().toISOString();
  const reverted = normalizeNoteBooleans({
    ...note,
    title: selected.data.title,
    content: selected.data.content,
    categories: Array.isArray(selected.data.categories) ? selected.data.categories : [],
    attachments: Array.isArray(selected.data.attachments) ? selected.data.attachments : [],
    reminder: selected.data.reminder ? normalizeReminder(selected.data.reminder) : undefined,
    pinned: !!selected.data.pinned,
    favorite: !!selected.data.favorite,
    pinnedAt: selected.data.pinnedAt || null,
    archived: !!selected.data.archived,
    trashed: !!selected.data.trashed,
    deletedAt: selected.data.deletedAt || null,
    updated_at: now,
  });

  state.notes[idx] = reverted;
  writeLocalState(state);
  return reverted;
}

function migrateIfNeeded() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;

    // v3 -> v4 migration path: try current; else read older versions or legacy
    let state = null;
    try {
      const rawV4 = localStorage.getItem(LS_KEY_NOTES_STATE);
      if (rawV4) {
        state = JSON.parse(rawV4);
      } else {
        const rawV3 = localStorage.getItem("notes.mvp.state.v3");
        if (rawV3) {
          state = JSON.parse(rawV3);
        }
      }
    } catch {
      state = null;
    }

    if (state && Array.isArray(state.notes)) {
      const migrated = {
        notes: state.notes.map((n) =>
          normalizeNoteBooleans({
            ...n,
            categories: Array.isArray(n.categories) ? n.categories : [],
            attachments: Array.isArray(n.attachments) ? n.attachments : [],
            reminder: n.reminder ? normalizeReminder(n.reminder) : undefined,
            trashed: !!n.trashed,
            deletedAt: n.trashed ? (n.deletedAt ? new Date(n.deletedAt).toISOString() : new Date().toISOString()) : null,
          })
        ),
        categories: Array.isArray(state.categories) ? state.categories : [],
      };
      writeLocalState(migrated);
      localStorage.setItem(MIGRATION_FLAG, "1");
      return;
    }

    const legacy = readLocalLegacyNotes();
    if (legacy && Array.isArray(legacy) && legacy.length >= 0) {
      const migrated = {
        notes: legacy.map((n) =>
          normalizeNoteBooleans({
            ...n,
            categories: Array.isArray(n.categories) ? n.categories : [],
            attachments: Array.isArray(n.attachments) ? n.attachments : [],
            reminder: n.reminder ? normalizeReminder(n.reminder) : undefined,
            trashed: false,
            deletedAt: null,
          })
        ),
        categories: [],
      };
      writeLocalState(migrated);
      localStorage.setItem(MIGRATION_FLAG, "1");
    } else {
      writeLocalState({ notes: [], categories: [] });
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

// Sort/filter now needs to place pinned first (by pinnedAt desc) among matched notes
function applySortFilter(notes, options = {}) {
  const { sortBy = DEFAULT_SORT, category, query, archivedMode = ARCHIVE_FILTER_MODES.active } = options;
  let arr = Array.isArray(notes) ? [...notes] : [];

  // Exclude trashed from all lists by default here; callers for Trash list will filter separately
  arr = arr.filter(n => !n.trashed);

  // Archived filter (default to active only)
  if (archivedMode === ARCHIVE_FILTER_MODES.active) {
    arr = arr.filter(n => !n.archived);
  } else if (archivedMode === ARCHIVE_FILTER_MODES.archived) {
    arr = arr.filter(n => !!n.archived);
  } // 'all' shows both

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

  // Split pinned and others
  const pinned = [];
  const others = [];
  for (const n of arr) {
    if (n.pinned) pinned.push(n);
    else others.push(n);
  }

  const compareStr = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
  const compareDate = (a, b) => new Date(a).getTime() - new Date(b).getTime();

  // Sort "others" by existing sort rules
  switch (sortBy) {
    case "updated_asc":
      others.sort((a, b) => compareDate(a.updated_at || a.created_at, b.updated_at || b.created_at));
      break;
    case "updated_desc":
      others.sort((a, b) => compareDate(b.updated_at || b.created_at, a.updated_at || a.created_at));
      break;
    case "created_asc":
      others.sort((a, b) => compareDate(a.created_at, b.created_at));
      break;
    case "created_desc":
      others.sort((a, b) => compareDate(b.created_at, a.created_at));
      break;
    case "title_desc":
      others.sort((a, b) => compareStr(b.title || "", a.title || ""));
      break;
    case "title_asc":
    default:
      others.sort((a, b) => compareStr(a.title || "", b.title || ""));
      break;
  }

  // Sort pinned by pinnedAt desc, tie-breaker: updated_at desc
  pinned.sort((a, b) => {
    const pa = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
    const pb = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
    if (pb !== pa) return pb - pa;
    const ua = new Date(a.updated_at || a.created_at).getTime();
    const ub = new Date(b.updated_at || b.created_at).getTime();
    return ub - ua;
  });

  return [...pinned, ...others];
}

// PUBLIC_INTERFACE
export async function listNotes(options = {}) {
  /**
   * List notes with optional sort, category filter and search query.
   * options: { sortBy, category, query, archivedMode }
   * Uses API if available, else from local storage with migration support.
   * Trashed notes are excluded by default in this list.
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
      if (options.archivedMode && options.archivedMode !== ARCHIVE_FILTER_MODES.all) {
        u.searchParams.set("archived", options.archivedMode === ARCHIVE_FILTER_MODES.archived ? "true" : "false");
      }
      // Ensure trashed excluded on API if supported - pass param
      u.searchParams.set("trashed", "false");

      const res = await fetch(u.toString().replace(window.location.origin, ""), { method: "GET" });
      if (!res.ok) throw new Error(`Failed to fetch notes: ${res.status}`);
      const data = await res.json();
      let normalized = Array.isArray(data)
        ? data.map((n) =>
            normalizeNoteBooleans({
              ...n,
              categories: Array.isArray(n.categories) ? n.categories : [],
              attachments: Array.isArray(n.attachments) ? n.attachments : [],
              reminder: n.reminder ? normalizeReminder(n.reminder) : undefined,
              backgroundColor: n.backgroundColor || null,
            })
          )
        : [];
      // Try decrypt for each
      const decrypted = await Promise.all(normalized.map((n) => tryDecryptIfUnlocked(n)));
      return applySortFilter(decrypted, options);
    } catch (e) {
      console.warn("Falling back to local notes due to API error:", e.message);
      const state = ensureState();
      const decrypted = await Promise.all(state.notes.map((n) => tryDecryptIfUnlocked(n)));
      return applySortFilter(decrypted, options);
    }
  }
  const state = ensureState();
  const decrypted = await Promise.all(state.notes.map((n) => tryDecryptIfUnlocked(n)));
  return applySortFilter(decrypted, options);
}

// PUBLIC_INTERFACE
export async function listTrashedNotes({ query } = {}) {
  /** List only trashed notes, optionally filtered by query */
  const state = ensureState();
  let arr = state.notes.filter(n => !!n.trashed);
  if (query && String(query).trim()) {
    const q = String(query).trim().toLowerCase();
    arr = arr.filter(n => (n.title || "").toLowerCase().includes(q) || (n.content || "").toLowerCase().includes(q));
  }
  // Sort trashed by deletedAt desc, then updated_at desc
  arr.sort((a, b) => {
    const da = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
    const db = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
    if (db !== da) return db - da;
    const ua = new Date(a.updated_at || a.created_at).getTime();
    const ub = new Date(b.updated_at || b.created_at).getTime();
    return ub - ua;
  });
  return arr;
}

// PUBLIC_INTERFACE
export async function searchNotes({ query, sortBy, category, archivedMode } = {}) {
  return listNotes({ query, sortBy, category, archivedMode });
}

// PUBLIC_INTERFACE
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

// PUBLIC_INTERFACE
export const SEARCH_STORAGE_KEY = DEFAULT_SEARCH_LS_KEY;

// Note-lock feature flags and session handling
const NOTELOCK_ENABLED = String(process.env.REACT_APP_NOTELOCK_ENABLED ?? "true") !== "false";
const SESSION_TIMEOUT_MIN = Number(process.env.REACT_APP_NOTELOCK_SESSION_TIMEOUT || "15");
const sessionUnlock = {
  // id -> { keyPromise, unlockedAtMs }
  _map: new Map(),
  set(id, keyPromise) {
    this._map.set(String(id), { keyPromise, unlockedAtMs: Date.now() });
  },
  get(id) {
    const e = this._map.get(String(id));
    if (!e) return null;
    if (Date.now() - e.unlockedAtMs > SESSION_TIMEOUT_MIN * 60 * 1000) {
      this._map.delete(String(id));
      return null;
    }
    return e.keyPromise;
  },
  clear(id) { this._map.delete(String(id)); },
  touch(id) {
    const e = this._map.get(String(id));
    if (e) e.unlockedAtMs = Date.now();
  }
};

// Helpers to apply lock transformations
async function maybeEncryptNoteBodyForSave(noteId, payload, lockMeta) {
  if (!NOTELOCK_ENABLED) return payload;
  if (!lockMeta?.isLocked || !lockMeta?.salt || !lockMeta?.cipher || !lockMeta?.iv) {
    // If locking freshly: if lockMeta.pin is present we encrypt text now
    if (lockMeta?.pin && (payload.content ?? "") !== "") {
      const salt = await generateSalt(16);
      const key = await deriveKeyFromPin(lockMeta.pin, salt);
      const enc = await encrypt(payload.content || "", key);
      return {
        ...payload,
        content: "", // do not store plaintext
        lock: {
          isLocked: true,
          salt: bytesToBase64(salt),
          iv: enc.iv,
          cipher: enc.cipher,
          lockHint: lockMeta.lockHint || "",
          lockedAt: new Date().toISOString(),
        },
      };
    }
    return payload;
  }
  // Already locked; re-encrypt only if content is present (from editing)
  if (typeof payload.content === "string" && payload.content !== "") {
    // Must have an unlocked key in session to re-encrypt updates
    const keyPromise = sessionUnlock.get(noteId);
    if (!keyPromise) {
      // cannot re-encrypt without key; keep existing encrypted content, drop provided content
      const { content, ...rest } = payload;
      return { ...rest };
    }
    const key = await keyPromise;
    const enc = await encrypt(payload.content || "", key);
    return {
      ...payload,
      content: "",
      lock: {
        isLocked: true,
        salt: lockMeta.salt,
        iv: enc.iv,
        cipher: enc.cipher,
        lockHint: lockMeta.lockHint || "",
        lockedAt: lockMeta.lockedAt || new Date().toISOString(),
      },
    };
  }
  return payload;
}

function buildLockedPlaceholder(note) {
  return {
    ...note,
    // Hide plaintext content for locked notes until unlocked
    content: "\u{1F512} Locked",
    _locked: true,
  };
}

async function tryDecryptIfUnlocked(note) {
  if (!NOTELOCK_ENABLED) return note;
  const lk = note.lock;
  if (!lk?.isLocked) return note;
  const keyPromise = sessionUnlock.get(note.id);
  if (!keyPromise) return buildLockedPlaceholder(note);
  try {
    const key = await keyPromise;
    const text = await decrypt({ cipher: lk.cipher, iv: lk.iv }, key);
    sessionUnlock.touch(note.id);
    return { ...note, content: text, _locked: false };
  } catch {
    return buildLockedPlaceholder(note);
  }
}

// PUBLIC_INTERFACE
export async function createNote(note) {
  /**
   * Create a note (title, content, categories?: string[], attachments?: array).
   * Uses API if available, otherwise local.
   * Initializes trashed=false, deletedAt=null.
   * Note lock: when note.lockPin is provided (4-digit string), content is encrypted client-side.
   */
  const payloadBase = {
    title: note.title,
    content: note.content,
    categories: Array.isArray(note.categories)
      ? note.categories.filter(Boolean)
      : [],
    trashed: false,
    deletedAt: null,
    backgroundColor: note.backgroundColor || null,
    // attachments ignored for API create; handled by separate upload
  };
  const lockMetaInput = note.lockPin
    ? { pin: String(note.lockPin), lockHint: note.lockHint || "" }
    : null;
  const payload = await maybeEncryptNoteBodyForSave("__new__", payloadBase, lockMetaInput);
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed to create note: ${res.status}`);
      const created = await res.json();
      return normalizeNoteBooleans({
        ...created,
        categories: Array.isArray(created.categories) ? created.categories : [],
        attachments: Array.isArray(created.attachments) ? created.attachments : [],
        reminder: created.reminder ? normalizeReminder(created.reminder) : undefined,
      });
    } catch (e) {
      console.warn("Falling back to local create due to API error:", e.message);
      return localCreateNote({
        ...payload,
        attachments: note.attachments || [],
        reminder: note.reminder,
      });
    }
  }
  return localCreateNote({
    ...payload,
    attachments: note.attachments || [],
    reminder: note.reminder,
  });
}

// PUBLIC_INTERFACE
export async function updateNote(id, note) {
  /**
   * Update a note by id with {title?, content?, categories?, attachments?, reminder?, pinned?, favorite?, pinnedAt?, archived?, lockPin?, removeLock?};
   * - If lockPin provided, encrypt content and set lock metadata; stores ciphertext and clears plaintext.
   * - If removeLock is true, remove lock details and save plaintext.
   * - When already locked and content is changed while unlocked, content is re-encrypted using existing key (from session).
   */
  const sanitized = { ...note };
  delete sanitized.trashed;
  delete sanitized.deletedAt;

  // Lock transformations
  const state = ensureState();
  const prev = state.notes.find((n) => String(n.id) === String(id));
  const wasLocked = !!prev?.lock?.isLocked;
  const applyLockIntent = NOTELOCK_ENABLED && (sanitized.lockPin || sanitized.removeLock);

  // Prepare basic payload first
  let payload = {
    ...(sanitized.title !== undefined ? { title: sanitized.title } : {}),
    ...(sanitized.content !== undefined ? { content: sanitized.content } : {}),
    ...(sanitized.categories !== undefined
      ? { categories: Array.isArray(sanitized.categories) ? sanitized.categories : [] }
      : {}),
    ...(useApi
      ? {} // do not send attachments in PUT in API mode
      : sanitized.attachments !== undefined
      ? { attachments: Array.isArray(sanitized.attachments) ? sanitized.attachments : [] }
      : {}),
    ...(sanitized.reminder !== undefined ? { reminder: normalizeReminder(sanitized.reminder) } : {}),
    ...(sanitized.pinned !== undefined ? { pinned: !!sanitized.pinned } : {}),
    ...(sanitized.favorite !== undefined ? { favorite: !!sanitized.favorite } : {}),
    ...(sanitized.pinnedAt !== undefined ? { pinnedAt: sanitized.pinnedAt } : {}),
    ...(sanitized.archived !== undefined ? { archived: !!sanitized.archived } : {}),
    ...(sanitized.backgroundColor !== undefined ? { backgroundColor: sanitized.backgroundColor || null } : {}),
  };

  if (NOTELOCK_ENABLED) {
    if (sanitized.removeLock === true && wasLocked) {
      // Removing lock: requires note content to be provided as plaintext by the caller
      sessionUnlock.clear(id);
      payload = {
        ...payload,
        lock: undefined,
        // content as provided (plaintext)
      };
    } else if (sanitized.lockPin) {
      // Setting/changing lock now
      sessionUnlock.clear(id);
      payload = await maybeEncryptNoteBodyForSave(id, payload, { pin: String(sanitized.lockPin), lockHint: sanitized.lockHint || "" });
    } else if (wasLocked) {
      // Keep encrypted if no content change or re-encrypt when content changed
      payload = await maybeEncryptNoteBodyForSave(id, payload, prev.lock);
    }
  }
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`Failed to update note: ${res.status}`);
      const updated = await res.json();
      return normalizeNoteBooleans({
        ...updated,
        categories: Array.isArray(updated.categories) ? updated.categories : [],
        attachments: Array.isArray(updated.attachments) ? updated.attachments : [],
        reminder: updated.reminder ? normalizeReminder(updated.reminder) : undefined,
      });
    } catch (e) {
      console.warn("Falling back to local update due to API error:", e.message);
      return localUpdateNote(id, payload);
    }
  }
  return localUpdateNote(id, payload);
}

// PUBLIC_INTERFACE
export async function deleteNote(id) {
  /** Move note to Trash instead of hard delete (backwards-compatible name). */
  return moveNoteToTrash(id);
}

// PUBLIC_INTERFACE
export async function permanentlyDeleteNote(id) {
  /** Permanently delete a note by id (irreversible). */
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete note: ${res.status}`);
      // fall through to remove locally as well
    } catch (e) {
      console.warn("API permanent delete failed or offline; applying locally:", e.message);
    }
  }
  return localPermanentDelete(id);
}

// PUBLIC_INTERFACE
export async function moveNoteToTrash(id) {
  /** Soft-delete a note: set trashed=true, deletedAt=now. */
  const nowIso = new Date().toISOString();
  if (useApi) {
    // If backend supports PATCH for trash, try it; otherwise local-only
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ trashed: true, deletedAt: nowIso }),
      });
      if (!res.ok) throw new Error(`Failed to move to trash: ${res.status}`);
      const updated = await res.json();
      return localUpdateNote(id, normalizeNoteBooleans({ ...updated, trashed: true, deletedAt: nowIso }));
    } catch (e) {
      console.warn("Trash PATCH failed or unsupported, applying locally:", e.message);
    }
  }
  return localUpdateNote(id, { trashed: true, deletedAt: nowIso });
}

// PUBLIC_INTERFACE
export async function restoreNoteFromTrash(id) {
  /** Restore a trashed note: set trashed=false, deletedAt=null. */
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ trashed: false, deletedAt: null }),
      });
      if (!res.ok) throw new Error(`Failed to restore note: ${res.status}`);
      const updated = await res.json();
      return localUpdateNote(id, normalizeNoteBooleans({ ...updated, trashed: false, deletedAt: null }));
    } catch (e) {
      console.warn("Restore PATCH failed or unsupported, applying locally:", e.message);
    }
  }
  return localUpdateNote(id, { trashed: false, deletedAt: null });
}

// PUBLIC_INTERFACE
export async function archiveNote(id) {
  /** Archive a note by id (soft-hide from active list). */
  const nowIso = new Date().toISOString();
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ archived: true, updated_at: nowIso }),
      });
      if (!res.ok) throw new Error(`Failed to archive note: ${res.status}`);
      const updated = await res.json();
      return localUpdateNote(id, normalizeNoteBooleans({ ...updated, archived: true }));
    } catch (e) {
      console.warn("Archive PATCH failed or unsupported, applying locally:", e.message);
    }
  }
  return localUpdateNote(id, { archived: true });
}

// PUBLIC_INTERFACE
export async function unarchiveNote(id) {
  /** Unarchive a note by id (return to active list). */
  const nowIso = new Date().toISOString();
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ archived: false, updated_at: nowIso }),
      });
      if (!res.ok) throw new Error(`Failed to unarchive note: ${res.status}`);
      const updated = await res.json();
      return localUpdateNote(id, normalizeNoteBooleans({ ...updated, archived: false }));
    } catch (e) {
      console.warn("Unarchive PATCH failed or unsupported, applying locally:", e.message);
    }
  }
  return localUpdateNote(id, { archived: false });
}

// PUBLIC_INTERFACE
export async function listArchived(options = {}) {
  /** List archived notes; supports sort, category, and query. */
  const notes = await listNotes({ ...options, archivedMode: ARCHIVE_FILTER_MODES.archived });
  return notes;
}

// PUBLIC_INTERFACE
export async function fetchNotes() {
  /** Fetch all notes; throws on HTTP error when API mode is on. Falls back to local state when API not configured. */
  if (useApi) {
    const u = new URL(`${API_BASE}/notes`, window.location.origin);
    // Explicitly exclude trashed
    u.searchParams.set("trashed", "false");
    const res = await fetch(u.toString().replace(window.location.origin, ""));
    if (!res.ok) throw new Error("Failed to fetch notes");
    const data = await res.json();
    return Array.isArray(data)
      ? data.map((n) =>
          normalizeNoteBooleans({
            ...n,
            categories: Array.isArray(n.categories) ? n.categories : [],
            attachments: Array.isArray(n.attachments) ? n.attachments : [],
            reminder: n.reminder ? normalizeReminder(n.reminder) : undefined,
            backgroundColor: n.backgroundColor || null,
          })
        )
      : [];
  }
  // Local fallback: return stored notes (not trashed filter is caller's responsibility here)
  const state = ensureState();
  return state.notes.filter(n => !n.trashed);
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



function localCreateNote(payload) {
  const state = ensureState();
  const now = new Date().toISOString();
  const newNote = normalizeNoteBooleans({
    id: nextId(state.notes),
    title: payload.title,
    content: payload.content || "",
    categories: Array.isArray(payload.categories) ? payload.categories : [],
    attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
    reminder: payload.reminder ? normalizeReminder(payload.reminder) : undefined,
    created_at: now,
    updated_at: now,
    pinned: false,
    favorite: false,
    pinnedAt: null,
    versions: [], // initialize versions history
    archived: false,
    trashed: false,
    deletedAt: null,
  });
  if (NOTELOCK_ENABLED && payload.lock?.isLocked) {
    newNote.lock = {
      isLocked: true,
      salt: payload.lock.salt,
      iv: payload.lock.iv,
      cipher: payload.lock.cipher,
      lockHint: payload.lock.lockHint || "",
      lockedAt: payload.lock.lockedAt || now,
    };
    newNote.content = ""; // never store plaintext alongside cipher
  }
  const next = [newNote, ...state.notes];
  saveNotes(next);
  // Update categories list with any new categories
  if (newNote.categories.length) {
    saveCategoriesList([...(state.categories || []), ...newNote.categories]);
  }
  return Promise.resolve(newNote);
}

function localPermanentDelete(id) {
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
  const prevRaw = state.notes[idx];
  const prev = ensureNoteVersions(prevRaw);

  // compute next tentative state without updated_at to compare changes
  const pinnedIncoming = payload.pinned;
  let pinnedAtPatch = {};
  if (pinnedIncoming !== undefined) {
    if (pinnedIncoming && !prev.pinned) {
      pinnedAtPatch = { pinnedAt: now };
    } else if (!pinnedIncoming && prev.pinned) {
      pinnedAtPatch = { pinnedAt: null };
    }
  }
  // trash patches
  const trashPatch = {};
  if (payload.trashed !== undefined) {
    trashPatch.trashed = !!payload.trashed;
    trashPatch.deletedAt = payload.trashed ? (payload.deletedAt || now) : null;
  }

  // Apply lock metadata if any
  let lockPatch = {};
  if (NOTELOCK_ENABLED) {
    if (payload.lock === undefined) {
      // unchanged
    } else if (!payload.lock) {
      // remove lock
      lockPatch = { lock: undefined };
    } else if (payload.lock.isLocked) {
      lockPatch = {
        lock: {
          isLocked: true,
          salt: payload.lock.salt,
          iv: payload.lock.iv,
          cipher: payload.lock.cipher,
          lockHint: payload.lock.lockHint || "",
          lockedAt: payload.lock.lockedAt || now,
        },
      };
    }
  }

  const tentative = normalizeNoteBooleans({
    ...prev,
    ...(payload.title !== undefined ? { title: payload.title } : {}),
    ...(payload.content !== undefined ? { content: payload.content } : {}),
    ...(payload.categories !== undefined
      ? { categories: Array.isArray(payload.categories) ? payload.categories : [] }
      : {}),
    ...(payload.attachments !== undefined
      ? { attachments: Array.isArray(payload.attachments) ? payload.attachments : [] }
      : {}),
    ...(payload.reminder !== undefined ? { reminder: normalizeReminder(payload.reminder) } : {}),
    ...(payload.pinned !== undefined ? { pinned: !!payload.pinned } : {}),
    ...(payload.favorite !== undefined ? { favorite: !!payload.favorite } : {}),
    ...(payload.archived !== undefined ? { archived: !!payload.archived } : {}),
    ...(payload.pinnedAt !== undefined ? { pinnedAt: payload.pinnedAt } : pinnedAtPatch),
    ...trashPatch,
    ...lockPatch,
  });

  // If locked, ensure plaintext content is not stored
  if (NOTELOCK_ENABLED && tentative.lock?.isLocked) {
    tentative.content = "";
  }

  // Determine if meaningful fields changed to create a version snapshot
  const changedSummary = summarizeChange(
    {
      title: prev.title,
      content: prev.content,
      categories: prev.categories,
      attachments: prev.attachments,
      reminder: prev.reminder,
      pinned: prev.pinned,
      favorite: prev.favorite,
      archived: prev.archived,
      pinnedAt: prev.pinnedAt,
      trashed: prev.trashed,
      deletedAt: prev.deletedAt,
      backgroundColor: prev.backgroundColor || null,
    },
    {
      title: tentative.title,
      content: tentative.content,
      categories: tentative.categories,
      attachments: tentative.attachments,
      reminder: tentative.reminder,
      pinned: tentative.pinned,
      favorite: tentative.favorite,
      archived: tentative.archived,
      pinnedAt: tentative.pinnedAt,
      trashed: tentative.trashed,
      deletedAt: tentative.deletedAt,
      backgroundColor: tentative.backgroundColor || null,
    }
  );

  // Push previous version if there were changes
  if (changedSummary && changedSummary !== "no-op") {
    const version = buildVersionFromNote(prev, changedSummary);
    prev.versions = [version, ...(Array.isArray(prev.versions) ? prev.versions : [])];
  }

  const updated = normalizeNoteBooleans({
    ...tentative,
    updated_at: now,
  });

  const next = [...state.notes];
  next[idx] = updated;
  saveNotes(next);

  // sync categories list if provided
  if (payload.categories) {
    saveCategoriesList([...(state.categories || []), ...payload.categories]);
  }
  return Promise.resolve(updated);
}

// ===== Reminders: model, persistence, scheduler, API stubs =====

/**
 * Normalize reminder object to expected shape.
 * reminder: {
 *   reminderAt?: ISO string,
 *   reminderId?: string,
 *   reminderStatus?: 'pending'|'fired'|'dismissed'|'snoozed',
 *   repeat?: 'none'|'daily'|'weekly'
 * }
 */
function normalizeReminder(rem) {
  if (!rem) return undefined;
  const out = { ...rem };
  if (out.reminderAt) {
    const d = new Date(out.reminderAt);
    if (isNaN(d.getTime())) {
      delete out.reminderAt;
    } else {
      out.reminderAt = d.toISOString();
    }
  }
  if (!out.repeat) out.repeat = "none";
  if (!out.reminderStatus) out.reminderStatus = "pending";
  if (!out.reminderId) out.reminderId = `rem_${Math.random().toString(36).slice(2, 10)}`;
  return out;
}

// PUBLIC_INTERFACE
export async function setReminder(noteId, reminder) {
  const norm = normalizeReminder(reminder);
  if (!norm?.reminderAt) {
    throw new Error("Reminder time is required");
  }
  const now = Date.now();
  const ts = new Date(norm.reminderAt).getTime();
  if (isNaN(ts) || ts <= now) {
    throw new Error("Reminder time must be in the future");
  }

  if (useApi) {
    // Best-effort API stub, fallback to local
    try {
      const res = await fetch(`${API_BASE}/notes/${noteId}/reminders`, {
        method: "POST",
        headers,
        body: JSON.stringify(norm),
      });
      if (!res.ok) throw new Error(`Failed to set reminder: ${res.status}`);
      const data = await res.json();
      return localUpdateNote(noteId, { reminder: normalizeReminder(data) });
    } catch (e) {
      console.warn("Reminder API unavailable; using local:", e.message);
    }
  }
  return localUpdateNote(noteId, { reminder: norm });
}

// PUBLIC_INTERFACE
export async function clearReminder(noteId) {
  if (useApi) {
    try {
      const res = await fetch(`${API_BASE}/notes/${noteId}/reminders`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Failed to clear reminder: ${res.status}`);
    } catch (e) {
      console.warn("Reminder DELETE stub failed, proceeding local:", e.message);
    }
  }
  return localUpdateNote(noteId, { reminder: undefined });
}

// PUBLIC_INTERFACE
export async function listDueReminders(nowIso) {
  const nowTs = nowIso ? new Date(nowIso).getTime() : Date.now();
  const state = ensureState();
  const due = [];
  for (const n of state.notes) {
    const r = n.reminder;
    if (!r || !r.reminderAt) continue;
    const ts = new Date(r.reminderAt).getTime();
    if (!isNaN(ts) && ts <= nowTs && (r.reminderStatus === "pending" || r.reminderStatus === "snoozed")) {
      due.push({ note: n, reminder: r });
    }
  }
  return due;
}

// PUBLIC_INTERFACE
export async function dismissReminder(noteId) {
  const state = ensureState();
  const idx = state.notes.findIndex((n) => String(n.id) === String(noteId));
  if (idx === -1) throw new Error("Note not found");
  const n = state.notes[idx];
  if (!n.reminder) return n;
  const updated = { ...n, reminder: { ...n.reminder, reminderStatus: "dismissed" } };
  const next = [...state.notes];
  next[idx] = updated;
  saveNotes(next);
  return updated;
}

// PUBLIC_INTERFACE
export async function snoozeReminder(noteId, minutes = 5) {
  const state = ensureState();
  const idx = state.notes.findIndex((nn) => String(nn.id) === String(noteId));
  if (idx === -1) throw new Error("Note not found");
  const n = state.notes[idx];
  if (!n.reminder?.reminderAt) throw new Error("No reminder to snooze");
  const baseTs = Date.now();
  const nextAt = new Date(baseTs + minutes * 60 * 1000).toISOString();
  const updated = {
    ...n,
    reminder: {
      ...n.reminder,
      reminderAt: nextAt,
      reminderStatus: "snoozed",
    },
    updated_at: new Date().toISOString(),
  };
  const next = [...state.notes];
  next[idx] = updated;
  saveNotes(next);
  return updated;
}

/**
 * INTERNAL: When a reminder fires and has a repeat rule, compute the next reminderAt.
 */
function computeNextRepeat(reminder) {
  if (!reminder?.repeat || reminder.repeat === "none") return null;
  const base = new Date(reminder.reminderAt);
  if (isNaN(base.getTime())) return null;
  if (reminder.repeat === "daily") {
    base.setDate(base.getDate() + 1);
    return base.toISOString();
  }
  if (reminder.repeat === "weekly") {
    base.setDate(base.getDate() + 7);
    return base.toISOString();
  }
  return null;
}

// PUBLIC_INTERFACE
export async function markDueAsFired(nowIso) {
  const nowTs = nowIso ? new Date(nowIso).getTime() : Date.now();
  const state = ensureState();
  const next = [...state.notes];
  const firedIds = [];
  for (let i = 0; i < next.length; i++) {
    const n = next[i];
    const r = n.reminder;
    if (!r?.reminderAt) continue;
    const ts = new Date(r.reminderAt).getTime();
    if (isNaN(ts) || ts > nowTs) continue;
    if (r.reminderStatus === "dismissed") continue;
    // Mark fired
    firedIds.push(n.id);
    const nextRepeatAt = computeNextRepeat(r);
    const newReminder = nextRepeatAt
      ? { ...r, reminderAt: nextRepeatAt, reminderStatus: "pending" }
      : { ...r, reminderStatus: "fired" };
    next[i] = { ...n, reminder: newReminder, updated_at: new Date().toISOString() };
  }
  if (firedIds.length) {
    saveNotes(next);
  }
  return firedIds;
}

// PUBLIC_INTERFACE
export async function togglePin(noteId) {
  const state = ensureState();
  const note = state.notes.find((n) => String(n.id) === String(noteId));
  if (!note) throw new Error("Note not found");
  const targetPinned = !note.pinned;
  const nowIso = new Date().toISOString();

  if (useApi) {
    // PATCH stub for backend integration
    try {
      const res = await fetch(`${API_BASE}/notes/${noteId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ pinned: targetPinned, pinnedAt: targetPinned ? nowIso : null }),
      });
      if (!res.ok) throw new Error(`Failed to patch pin: ${res.status}`);
      const updated = await res.json();
      return localUpdateNote(noteId, normalizeNoteBooleans(updated));
    } catch (e) {
      console.warn("Pin PATCH failed or unsupported, applying locally:", e.message);
    }
  }

  return localUpdateNote(noteId, { pinned: targetPinned, pinnedAt: targetPinned ? nowIso : null });
}

// PUBLIC_INTERFACE
export async function toggleFavorite(noteId) {
  const state = ensureState();
  const note = state.notes.find((n) => String(n.id) === String(noteId));
  if (!note) throw new Error("Note not found");
  const targetFavorite = !note.favorite;

  if (useApi) {
    // PATCH stub for backend integration
    try {
      const res = await fetch(`${API_BASE}/notes/${noteId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ favorite: targetFavorite }),
      });
      if (!res.ok) throw new Error(`Failed to patch favorite: ${res.status}`);
      const updated = await res.json();
      return localUpdateNote(noteId, normalizeNoteBooleans(updated));
    } catch (e) {
      console.warn("Favorite PATCH failed or unsupported, applying locally:", e.message);
    }
  }

  return localUpdateNote(noteId, { favorite: targetFavorite });
}

// PUBLIC_INTERFACE
export function getTrashRetentionDays() {
  /** Returns retention period in days for trashed items before auto-purge */
  return TRASH_RETENTION_DAYS;
}

// PUBLIC_INTERFACE
export async function purgeExpiredTrashedNotes() {
  /** Permanently delete trashed notes older than TRASH_RETENTION_DAYS */
  const state = ensureState();
  const now = Date.now();
  const cutoffMs = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const keep = [];
  const toDelete = [];
  for (const n of state.notes) {
    if (n.trashed && n.deletedAt && (now - Date.parse(n.deletedAt)) > cutoffMs) {
      toDelete.push(n.id);
    } else {
      keep.push(n);
    }
  }
  if (toDelete.length > 0) {
    saveNotes(keep);
  }
  return toDelete.length;
}

/**
 * PUBLIC_INTERFACE
 * Unlock a locked note for the current session using a 4-digit PIN.
 * Returns true if unlocked, false otherwise.
 */
export async function unlockNoteForSession(noteId, pin) {
  const state = ensureState();
  const note = state.notes.find((n) => String(n.id) === String(noteId));
  if (!NOTELOCK_ENABLED || !note?.lock?.isLocked) return true;
  if (!/^\d{4}$/.test(String(pin || ""))) return false;
  try {
    const salt = base64ToBytes(note.lock.salt);
    const keyPromise = deriveKeyFromPin(String(pin), salt);
    const key = await keyPromise;
    // Verify by trying a decrypt
    await decrypt({ cipher: note.lock.cipher, iv: note.lock.iv }, key);
    // success -> store promise for reuse
    sessionUnlock.set(noteId, Promise.resolve(key));
    return true;
  } catch {
    return false;
  }
}

// PUBLIC_INTERFACE
export function relockNoteInSession(noteId) {
  /** Remove the in-memory session key for a note (manual relock). */
  sessionUnlock.clear(noteId);
  return true;
}

// PUBLIC_INTERFACE
export function isNoteLocked(note) {
  /** Returns true if the note is locked and not unlocked in this session. */
  if (!NOTELOCK_ENABLED) return false;
  if (!note?.lock?.isLocked) return false;
  const hasKey = !!sessionUnlock.get(note.id);
  return !hasKey;
}

export const _internal = {
  useApi,
  DEFAULT_SORT,
  ARCHIVE_FILTER_MODES,
  applySortFilter,
  ATTACHMENTS_LIMIT_PER_NOTE,
  ATTACHMENT_MAX_SIZE_BYTES,
  NOTElOCK_ENABLED: NOTELOCK_ENABLED,
};
