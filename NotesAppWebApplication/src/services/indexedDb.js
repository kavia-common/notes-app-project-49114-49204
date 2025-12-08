const DB_NAME = 'notesAppDB';
const DB_VERSION = 1;
const NOTES_STORE = 'notes';
const QUEUE_STORE = 'queue';
const META_STORE = 'meta';

/**
 * INTERNAL: Open the IndexedDB database, creating object stores if needed.
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        const store = db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
        store.createIndex('updated_at', 'updated_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'qid', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * INTERNAL: Generic transaction helper.
 */
async function withStore(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store, tx);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * INTERNAL: Generate a client temporary ID for offline-created notes.
 */
function generateClientId() {
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// PUBLIC_INTERFACE
export async function idbSaveNotes(notes) {
  /** Save an array of notes into IndexedDB, replacing those IDs. */
  return withStore(NOTES_STORE, 'readwrite', (store) => {
    notes.forEach((n) => store.put(n));
  });
}

// PUBLIC_INTERFACE
export async function idbUpsertNote(note) {
  /** Upsert a single note into IndexedDB. */
  return withStore(NOTES_STORE, 'readwrite', (store) => {
    store.put(note);
  });
}

// PUBLIC_INTERFACE
export async function idbDeleteNoteById(id) {
  /** Delete a note by id in IndexedDB. */
  return withStore(NOTES_STORE, 'readwrite', (store) => {
    store.delete(id);
  });
}

// PUBLIC_INTERFACE
export async function idbGetAllNotes() {
  /** Get all notes from IndexedDB. */
  return withStore(NOTES_STORE, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

// PUBLIC_INTERFACE
export function idbGenerateClientNote({ title, content, tags }) {
  /** Create a client-side temporary note with metadata for offline use. */
  const now = new Date().toISOString();
  return {
    id: generateClientId(),
    title,
    content,
    tags: tags || [],
    created_at: now,
    updated_at: now,
    _localOnly: true,
    _version: 1,
    _unsynced: true,
  };
}

// PUBLIC_INTERFACE
export async function idbQueueMutation(mutation) {
  /**
   * Queue a mutation operation for offline sync.
   * mutation = { type: 'create'|'update'|'delete', noteId, payload, ts }
   */
  const toQueue = { ...mutation, ts: mutation.ts || Date.now() };
  return withStore(QUEUE_STORE, 'readwrite', (store) => {
    store.add(toQueue);
  });
}

// PUBLIC_INTERFACE
export async function idbReadQueue() {
  /** Read all queued mutations. */
  return withStore(QUEUE_STORE, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

// PUBLIC_INTERFACE
export async function idbClearQueue() {
  /** Clear sync queue. */
  return withStore(QUEUE_STORE, 'readwrite', (store) => store.clear());
}

// PUBLIC_INTERFACE
export async function idbRemoveQueueItemsByIds(qids) {
  /** Remove specific queue items by their qid. */
  return withStore(QUEUE_STORE, 'readwrite', (store) => {
    qids.forEach((id) => store.delete(id));
  });
}

// PUBLIC_INTERFACE
export async function idbGetMeta(key) {
  /** Get metadata value by key. */
  return withStore(META_STORE, 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  });
}

// PUBLIC_INTERFACE
export async function idbSetMeta(key, value) {
  /** Set metadata key/value. */
  return withStore(META_STORE, 'readwrite', (store) => {
    store.put({ key, value });
  });
}
