/**
 * Offline Sync Service
 * - Detects connectivity (online/offline)
 * - Queues mutations while offline (create/update/delete)
 * - Background sync on reconnect
 * - Conflict resolution: last-write-wins with version history fallback
 */

import {
  idbQueueMutation,
  idbReadQueue,
  idbRemoveQueueItemsByIds,
  idbGetAllNotes,
  idbUpsertNote,
  idbDeleteNoteById,
  idbSaveNotes,
  idbGetMeta,
  idbSetMeta,
} from './indexedDb';
import { fetchNotes, createNote, updateNote, deleteNote as apiDeleteNote, archiveNote, unarchiveNote } from './notesService';

// PUBLIC_INTERFACE
export function isOnline() {
  /** Returns true if navigator reports online. */
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

let subscribers = [];
let syncing = false;

// PUBLIC_INTERFACE
export function subscribeConnectivity(cb) {
  /** Subscribe to connectivity changes. Returns unsubscribe fn. */
  subscribers.push(cb);
  return () => {
    subscribers = subscribers.filter((fn) => fn !== cb);
  };
}

function emit(status) {
  subscribers.forEach((fn) => {
    try {
      fn(status);
    } catch (e) {
      // swallow
    }
  });
}

function listenConnectivity() {
  if (typeof window !== 'undefined') {
    window.addEventListener('online', async () => {
      emit({ online: true });
      await backgroundSync();
    });
    window.addEventListener('offline', () => {
      emit({ online: false });
    });
  }
}

// Initialize listener immediately
listenConnectivity();

/**
 * INTERNAL: Merge server and local notes with last-write-wins.
 * Returns merged array, and a version history map for conflicts.
 */
function mergeNotes(serverNotes, localNotes) {
  const map = new Map();
  const history = []; // For conflicts we keep the older version for possible UI surfacing

  const addOrCompare = (n, origin) => {
    const existing = map.get(n.id);
    const updatedAt = new Date(n.updated_at).getTime();
    if (!existing) {
      map.set(n.id, { ...n, _unsynced: n._unsynced || false, _localOnly: n._localOnly || false });
    } else {
      // last write wins
      const existingTs = new Date(existing.updated_at).getTime();
      if (updatedAt >= existingTs) {
        // keep history
        history.push({ old: existing, new: n, origin });
        map.set(n.id, { ...n, _unsynced: n._unsynced || existing._unsynced, _localOnly: n._localOnly || false });
      } else {
        history.push({ old: n, new: existing, origin });
      }
    }
  };

  (localNotes || []).forEach((n) => addOrCompare(n, 'local'));
  (serverNotes || []).forEach((n) => addOrCompare(n, 'server'));
  return { merged: Array.from(map.values()), history };
}

/**
 * INTERNAL: Apply queued mutations to backend, resolving client temp IDs.
 */
async function applyQueueAgainstServer() {
  const queue = await idbReadQueue();
  if (!queue.length) return { applied: [], errors: [] };

  const appliedQids = [];
  const errors = [];
  const clientIdMap = new Map(); // tempId -> serverId

  for (const item of queue.sort((a, b) => a.ts - b.ts)) {
    try {
      if (item.type === 'create') {
        // item.payload is the note body; may include temp client id
        const res = await createNote(item.payload);
        const saved = res;
        // Replace local temp note with server one
        if (item.noteId && String(item.noteId).startsWith('client-')) {
          clientIdMap.set(item.noteId, saved.id);
          await idbDeleteNoteById(item.noteId);
        }
        await idbUpsertNote({ ...saved, _unsynced: false, _localOnly: false });
        appliedQids.push(item.qid);
      } else if (item.type === 'update') {
        const noteId = clientIdMap.get(item.noteId) || item.noteId;
        const res = await updateNote(noteId, item.payload);
        await idbUpsertNote({ ...res, _unsynced: false, _localOnly: false });
        appliedQids.push(item.qid);
      } else if (item.type === 'delete') {
        const noteId = clientIdMap.get(item.noteId) || item.noteId;
        await apiDeleteNote(noteId);
        await idbDeleteNoteById(noteId);
        appliedQids.push(item.qid);
      } else if (item.type === 'archive') {
        const noteId = clientIdMap.get(item.noteId) || item.noteId;
        const res = await archiveNote(noteId);
        await idbUpsertNote({ ...res, _unsynced: false, _localOnly: false });
        appliedQids.push(item.qid);
      } else if (item.type === 'unarchive') {
        const noteId = clientIdMap.get(item.noteId) || item.noteId;
        const res = await unarchiveNote(noteId);
        await idbUpsertNote({ ...res, _unsynced: false, _localOnly: false });
        appliedQids.push(item.qid);
      }
    } catch (e) {
      // Keep error but do not stop remaining queue
      errors.push({ qid: item.qid, error: e?.message || String(e) });
    }
  }

  if (appliedQids.length) {
    await idbRemoveQueueItemsByIds(appliedQids);
  }
  return { applied: appliedQids, errors };
}

// PUBLIC_INTERFACE
export async function backgroundSync() {
  /**
   * Attempt to synchronize queued mutations, then reconcile with server.
   * Performs merge and saves merged set into IndexedDB.
   */
  if (syncing) return;
  if (!isOnline()) return;
  syncing = true;
  try {
    await applyQueueAgainstServer();
    // Fetch fresh server notes
    const serverNotes = await fetchNotes();
    const localNotes = await idbGetAllNotes();
    const { merged, history } = mergeNotes(serverNotes, localNotes);
    // After server is source-of-truth post-queue, mark unsynced false
    const normalized = merged.map((n) => ({
      ...n,
      _unsynced: false,
      _localOnly: String(n.id).startsWith('client-'),
    }));
    await idbSaveNotes(normalized);
    await idbSetMeta('lastSync', new Date().toISOString());
    return { merged: normalized, history };
  } catch (e) {
    return { error: e?.message || String(e) };
  } finally {
    syncing = false;
  }
}

// PUBLIC_INTERFACE
export async function queueCreate(noteBody) {
  /**
   * Queue create when offline; if online, try immediately then cache.
   */
  const ts = Date.now();
  if (isOnline()) {
    try {
      const created = await createNote(noteBody);
      await idbUpsertNote({ ...created, _unsynced: false, _localOnly: false });
      return { note: created, queued: false };
    } catch (e) {
      // fallthrough to queue for retry
    }
  }
  // offline or failed online attempt
  const local = {
    ...noteBody,
    id: noteBody.id, // may be client id from caller
    created_at: noteBody.created_at || new Date().toISOString(),
    updated_at: noteBody.updated_at || new Date().toISOString(),
    _unsynced: true,
    _localOnly: true,
  };
  await idbUpsertNote(local);
  await idbQueueMutation({ type: 'create', noteId: local.id, payload: noteBody, ts });
  return { note: local, queued: true };
}

// PUBLIC_INTERFACE
export async function queueUpdate(noteId, changes) {
  /**
   * Queue update when offline; if online, try immediately then cache.
   */
  const ts = Date.now();
  const patch = { ...changes, updated_at: new Date().toISOString() };

  if (isOnline()) {
    try {
      const updated = await updateNote(noteId, patch);
      await idbUpsertNote({ ...updated, _unsynced: false, _localOnly: false });
      return { note: updated, queued: false };
    } catch (e) {
      // fallthrough to queue for retry
    }
  }

  // Update local and queue
  const local = { id: noteId, ...patch, _unsynced: true };
  await idbUpsertNote(local);
  await idbQueueMutation({ type: 'update', noteId, payload: patch, ts });
  return { note: local, queued: true };
}

// PUBLIC_INTERFACE
export async function queueDelete(noteId) {
  /**
   * Queue delete when offline; if online, try immediately then cache.
   */
  const ts = Date.now();
  if (isOnline()) {
    try {
      await apiDeleteNote(noteId);
      await idbDeleteNoteById(noteId);
      return { queued: false };
    } catch (e) {
      // fallthrough
    }
  }
  // Mark removal locally and queue
  await idbDeleteNoteById(noteId);
  await idbQueueMutation({ type: 'delete', noteId, ts });
  return { queued: true };
}

// PUBLIC_INTERFACE
export async function queueArchive(noteId) {
  /** Queue archive mutation for a note; attempts immediate if online. */
  const ts = Date.now();
  if (isOnline()) {
    try {
      const res = await archiveNote(noteId);
      await idbUpsertNote({ ...res, _unsynced: false, _localOnly: false });
      return { queued: false };
    } catch (e) {
      // fallthrough
    }
  }
  await idbUpsertNote({ id: noteId, archived: true, updated_at: new Date().toISOString(), _unsynced: true });
  await idbQueueMutation({ type: 'archive', noteId, ts });
  return { queued: true };
}

// PUBLIC_INTERFACE
export async function queueUnarchive(noteId) {
  /** Queue unarchive mutation for a note; attempts immediate if online. */
  const ts = Date.now();
  if (isOnline()) {
    try {
      const res = await unarchiveNote(noteId);
      await idbUpsertNote({ ...res, _unsynced: false, _localOnly: false });
      return { queued: false };
    } catch (e) {
      // fallthrough
    }
  }
  await idbUpsertNote({ id: noteId, archived: false, updated_at: new Date().toISOString(), _unsynced: true });
  await idbQueueMutation({ type: 'unarchive', noteId, ts });
  return { queued: true };
}

// PUBLIC_INTERFACE
export async function hydrateNotes() {
  /**
   * Load notes: online -> fetch & merge with local; offline -> local only.
   */
  try {
    const local = await idbGetAllNotes();
    if (!isOnline()) {
      return { notes: local, source: 'local' };
    }
    // Online: try sync, then merge fresh
    await backgroundSync();
    const server = await fetchNotes();
    const { merged } = (function () {
      // Merge again in case local changed since sync call
      return (function (srv, loc) {
        const res = {};
        const m = new Map();
        const h = [];
        const add = (n, o) => {
          const e = m.get(n.id);
          const ts = new Date(n.updated_at).getTime();
          if (!e) m.set(n.id, n);
          else {
            const ets = new Date(e.updated_at).getTime();
            if (ts >= ets) {
              h.push({ old: e, new: n, o });
              m.set(n.id, n);
            } else {
              h.push({ old: n, new: e, o });
            }
          }
        };
        loc.forEach((n) => add(n, 'local'));
        srv.forEach((n) => add(n, 'server'));
        res.merged = Array.from(m.values());
        return res;
      })(server, local);
    })();
    await idbSaveNotes(merged.map((n) => ({ ...n, _unsynced: false, _localOnly: false })));
    return { notes: merged, source: 'server+local' };
  } catch (e) {
    const local = await idbGetAllNotes();
    return { notes: local, source: 'local', error: e?.message || String(e) };
  }
}
