import React, { useEffect, useState } from 'react';

// PUBLIC_INTERFACE
export default function App() {
  /** This is the public UI entry for the Notes app. Renders even if backend is down. */
  const cfg = typeof __APP_CONFIG__ !== 'undefined' ? __APP_CONFIG__ : {};

  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);

  // Try to load notes from backend if available; otherwise show an empty UI.
  useEffect(() => {
    let cancelled = false;
    const apiBase = cfg.API_BASE || '/api';
    const url = `${apiBase}/notes`;
    setLoading(true);
    fetch(url)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setApiError(`Backend unavailable (status ${r.status})`);
          setNotes([]);
          return;
        }
        const data = await r.json().catch(() => []);
        setNotes(Array.isArray(data) ? data : []);
        setApiError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setApiError('Backend unreachable');
        setNotes([]);
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    const apiBase = cfg.API_BASE || '/api';
    try {
      const r = await fetch(`${apiBase}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content }),
      });
      if (!r.ok) throw new Error(`Failed (${r.status})`);
      const note = await r.json();
      setNotes((prev) => [...prev, note]);
      setTitle('');
      setContent('');
      setApiError(null);
    } catch (err) {
      // Do not block UI; show message
      setApiError('Cannot create note: backend not running');
    }
  };

  const handleDelete = async (id) => {
    const apiBase = cfg.API_BASE || '/api';
    try {
      const r = await fetch(`${apiBase}/notes/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('delete failed');
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch {
      setApiError('Cannot delete note: backend not running');
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', margin: '2rem', maxWidth: 800 }}>
      <h1>Notes</h1>

      {apiError && (
        <div role="status" aria-live="polite" style={{ background: '#fff8e1', border: '1px solid #ffe0b2', padding: '0.5rem 0.75rem', borderRadius: 6, marginBottom: '1rem' }}>
          {apiError}. The UI works in frontend-only mode. Start backend to enable saving.
        </div>
      )}

      <form onSubmit={handleCreate} style={{ display: 'grid', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <label>
          <span style={{ display: 'block', fontWeight: 600 }}>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc' }}
          />
        </label>
        <label>
          <span style={{ display: 'block', fontWeight: 600 }}>Content</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write something..."
            rows={4}
            style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid #ccc' }}
          />
        </label>
        <div>
          <button type="submit" style={{ padding: '0.5rem 0.9rem', borderRadius: 6, background: '#1a73e8', color: '#fff', border: 'none' }}>
            Add Note
          </button>
        </div>
      </form>

      <h2 style={{ marginBottom: '0.5rem' }}>Your Notes</h2>
      {loading ? (
        <p>Loading…</p>
      ) : notes.length === 0 ? (
        <p>No notes yet. {apiError ? 'Start backend to load/save notes.' : 'Create your first note.'}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '0.75rem' }}>
          {notes.map((n) => (
            <li key={n.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{n.title}</div>
                  {n.content && <div style={{ color: '#555', marginTop: 4, whiteSpace: 'pre-wrap' }}>{n.content}</div>}
                </div>
                <button onClick={() => handleDelete(n.id)} style={{ background: 'transparent', border: '1px solid #e57373', color: '#e57373', borderRadius: 6, padding: '0.25rem 0.5rem' }}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
