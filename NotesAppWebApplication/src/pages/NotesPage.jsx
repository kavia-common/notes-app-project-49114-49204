import React, { useEffect, useState } from "react";
import { listNotes, createNote, deleteNote } from "../services/notesService";
import "./notes.css";

// PUBLIC_INTERFACE
export default function NotesPage() {
  /** NotesPage renders a minimal notes list and create form MVP. */
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await listNotes();
        if (mounted) setNotes(Array.isArray(data) ? data : []);
      } catch (e) {
        setFeedback({ type: "error", message: "Failed to load notes." });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  function resetFeedbackSoon() {
    setTimeout(() => setFeedback(null), 2500);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setFeedback({ type: "error", message: "Title and content are required." });
      resetFeedbackSoon();
      return;
    }
    try {
      const note = await createNote({ title: title.trim(), content: content.trim() });
      setNotes((prev) => [note, ...prev]);
      setTitle("");
      setContent("");
      setFeedback({ type: "success", message: "Note created." });
      resetFeedbackSoon();
    } catch (e) {
      setFeedback({ type: "error", message: "Failed to create note." });
    }
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    try {
      await deleteNote(confirmDeleteId);
      setNotes((prev) => prev.filter((n) => String(n.id) !== String(confirmDeleteId)));
      setFeedback({ type: "success", message: "Note deleted." });
    } catch {
      setFeedback({ type: "error", message: "Failed to delete note." });
    } finally {
      setConfirmDeleteId(null);
      resetFeedbackSoon();
    }
  }

  return (
    <div className="notes-app">
      <header className="navbar">
        <div className="brand">Notes</div>
      </header>

      <main className="container">
        <section className="card">
          <h2 className="title">Create a Note</h2>
          <form onSubmit={handleCreate} className="note-form" aria-label="Create note form">
            <div className="form-row">
              <label htmlFor="note-title">Title</label>
              <input
                id="note-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Your note title"
                required
              />
            </div>
            <div className="form-row">
              <label htmlFor="note-content">Content</label>
              <textarea
                id="note-content"
                rows="4"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write something..."
                required
              />
            </div>
            <div className="actions">
              <button className="btn" type="submit">
                Save
              </button>
            </div>
          </form>
          {feedback && (
            <div
              role="status"
              className={`feedback ${feedback.type === "error" ? "error" : "success"}`}
            >
              {feedback.message}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="title">Your Notes</h2>
          {loading ? (
            <div className="muted">Loading…</div>
          ) : notes.length === 0 ? (
            <div className="muted">No notes yet. Create your first note above.</div>
          ) : (
            <ul className="notes-list">
              {notes.map((n) => (
                <li key={n.id} className="note-item">
                  <div className="note-meta">
                    <div className="note-title">{n.title}</div>
                    <div className="note-date">
                      {n.updated_at
                        ? new Date(n.updated_at).toLocaleString()
                        : ""}
                    </div>
                  </div>
                  <div className="note-content">{n.content}</div>
                  <div className="note-actions">
                    {/* Edit would be implemented in a later iteration */}
                    <button
                      className="btn btn-danger"
                      onClick={() => setConfirmDeleteId(n.id)}
                      aria-label={`Delete note ${n.title}`}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {confirmDeleteId !== null && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">Confirm Deletion</div>
            <div className="modal-body">Are you sure you want to delete this note?</div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
