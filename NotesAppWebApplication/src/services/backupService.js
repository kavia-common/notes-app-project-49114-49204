import {
  _internal as notesInternal,
} from "./notesService";

//
// Backup service for frontend-only mode.
// Stores timestamped JSON snapshots of notes state in localStorage with a rolling history.
// Supports manual backup, restore from latest or a specific snapshot ID, list snapshots,
// and import/export (download/upload) of backup files.
// Preserves trash metadata (trashed, deletedAt).
//
// PUBLIC INTERFACES are annotated with PUBLIC_INTERFACE.

const BACKUP_LS_KEY = "notes.mvp.backups.v2"; // array of backup metadata+data
const BACKUP_AUTO_SCHEDULE_KEY = "notes.mvp.backups.lastAutoAt";
const BACKUP_VERSION = 2;
const BACKUP_ROLLING_KEEP = 3; // keep last 3 automatic backups by default

// Helper to read entire notes state from local storage directly to avoid import cycle
function readCurrentNotesState() {
  try {
    const raw =
      localStorage.getItem("notes.mvp.state.v4") ||
      localStorage.getItem("notes.mvp.state.v3");
    if (!raw) return { notes: [], categories: [] };
    const parsed = JSON.parse(raw);
    const notes = Array.isArray(parsed?.notes) ? parsed.notes : [];
    const categories = Array.isArray(parsed?.categories) ? parsed.categories : [];
    return { notes, categories };
  } catch {
    return { notes: [], categories: [] };
  }
}

// Validate backup data shape (simple checks)
function validateBackupShape(backup) {
  if (!backup || typeof backup !== "object") return false;
  if (!Array.isArray(backup.data?.notes)) return false;
  if (!Array.isArray(backup.data?.categories)) return false;
  return true;
}

function readBackups() {
  try {
    const raw = localStorage.getItem(BACKUP_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeBackups(list) {
  try {
    localStorage.setItem(BACKUP_LS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function toId(ts) {
  return `bkp_${ts}`;
}

function getNowIso() {
  return new Date().toISOString();
}

// PUBLIC_INTERFACE
export function listBackups() {
  /** List available backups metadata: [{id, created_at, count}] */
  const items = readBackups();
  return items
    .map((b) => ({
      id: b.id,
      created_at: b.created_at,
      count: Array.isArray(b.data?.notes) ? b.data.notes.length : 0,
      source: b.source || "manual", // manual|auto|import
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// PUBLIC_INTERFACE
export function getLatestBackupMeta() {
  /** Returns latest backup metadata or null */
  const list = listBackups();
  return list.length ? list[0] : null;
}

// PUBLIC_INTERFACE
export function backupNow({ source = "manual" } = {}) {
  /**
   * Create a snapshot of current notes and categories, store it with a timestamped id.
   * Returns { id, created_at, count }.
   * Includes trashed metadata.
   */
  const { notes, categories } = readCurrentNotesState();
  const created_at = getNowIso();
  const id = toId(created_at.replace(/[^0-9TZ:-]/g, ""));
  const entry = {
    id,
    version: BACKUP_VERSION,
    created_at,
    source,
    data: {
      notes,
      categories,
      meta: {
        version: BACKUP_VERSION,
        created_at,
      },
    },
  };
  const list = readBackups();
  const next = [entry, ...list];
  // If this is automatic backup, enforce rolling history (keep newest N autos)
  if (source === "auto") {
    const autos = next.filter((b) => b.source === "auto");
    if (autos.length > BACKUP_ROLLING_KEEP) {
      const keepIds = autos
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, BACKUP_ROLLING_KEEP)
        .map((b) => b.id);
      // remove auto entries not in keepIds
      const pruned = next.filter((b) => b.source !== "auto" || keepIds.includes(b.id));
      writeBackups(pruned);
    } else {
      writeBackups(next);
    }
  } else {
    writeBackups(next);
  }
  try {
    localStorage.setItem(BACKUP_AUTO_SCHEDULE_KEY, created_at);
  } catch {}
  return { id, created_at, count: notes.length };
}

// PUBLIC_INTERFACE
export function restoreFromLatest() {
  /**
   * Restores the notes state from the latest backup.
   * Returns { restored: number, from: id, created_at } or throws on error.
   */
  const list = readBackups();
  if (!list.length) throw new Error("No backups available");
  const latest = list
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  return restoreFromBackupId(latest.id);
}

// PUBLIC_INTERFACE
export function restoreFromBackupId(backupId) {
  /**
   * Restore from a specific snapshot id.
   * Replaces current state with saved snapshot.
   */
  const list = readBackups();
  const found = list.find((b) => String(b.id) === String(backupId));
  if (!found) throw new Error("Backup not found");
  if (!validateBackupShape(found)) throw new Error("Backup data invalid or incompatible");

  const { notes, categories } = found.data;

  // Basic normalization; keep trashed metadata intact
  const normalizedNotes = Array.isArray(notes)
    ? notes.map((n) => ({
        ...n,
        pinned: !!n.pinned,
        favorite: !!n.favorite,
        archived: !!n.archived,
        trashed: !!n.trashed,
        deletedAt: n.trashed && n.deletedAt ? new Date(n.deletedAt).toISOString() : (n.trashed ? new Date().toISOString() : null),
        pinnedAt: n.pinned ? (n.pinnedAt ? new Date(n.pinnedAt).toISOString() : (n.updated_at || n.created_at || new Date().toISOString())) : null,
        categories: Array.isArray(n.categories) ? n.categories : [],
        attachments: Array.isArray(n.attachments) ? n.attachments : [],
        reminder: n.reminder && typeof n.reminder === "object" ? normalizeReminder(n.reminder) : undefined,
      }))
    : [];

  const normalized = {
    notes: normalizedNotes,
    categories: Array.isArray(categories) ? Array.from(new Set(categories)) : [],
  };

  try {
    localStorage.setItem("notes.mvp.state.v4", JSON.stringify(normalized));
  } catch (e) {
    throw new Error("Failed to write restored data to storage");
  }

  return { restored: normalizedNotes.length, from: found.id, created_at: found.created_at };
}

// Normalize reminder similar to notesService to ensure shape correctness
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
export function scheduleAutomaticBackupsDaily() {
  /**
   * Simple in-app scheduler: if last auto-backup older than 24h, create a new one.
   * Should be called on app load and then periodically (e.g., via setInterval in UI).
   */
  try {
    const last = localStorage.getItem(BACKUP_AUTO_SCHEDULE_KEY);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    if (!last || now - new Date(last).getTime() >= dayMs) {
      backupNow({ source: "auto" });
    }
  } catch {
    // best effort
  }
}

// PUBLIC_INTERFACE
export function exportLatestBackupToFile() {
  /**
   * Create a backup now and trigger a download of the JSON file.
   * Returns metadata of the backup created.
   */
  const meta = backupNow({ source: "manual" });
  const list = readBackups();
  const found = list.find((b) => b.id === meta.id);
  if (!found) return meta;

  const dataStr = JSON.stringify(found, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const datePart = meta.created_at.replace(/[:.]/g, "-");
  a.download = `notes-backup-${datePart}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return meta;
}

// PUBLIC_INTERFACE
export async function importBackupFromFile(file) {
  /**
   * Parse uploaded .json and store as an "import" source backup entry.
   * Returns {id, created_at, count}. Does not immediately restore.
   */
  if (!file) throw new Error("No file provided");
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file");
  }
  if (!validateBackupShape(parsed)) {
    throw new Error("Backup file is not compatible");
  }
  const created_at = getNowIso();
  const id = toId(created_at.replace(/[^0-9TZ:-]/g, ""));
  const entry = {
    id,
    version: parsed.version || BACKUP_VERSION,
    created_at,
    source: "import",
    data: parsed.data,
  };
  const list = readBackups();
  writeBackups([entry, ...list]);
  return { id, created_at, count: Array.isArray(parsed.data?.notes) ? parsed.data.notes.length : 0 };
}
