import React, { useEffect, useRef, useState } from "react";
import { listNotes, createNote, deleteNote, updateNote } from "../services/notesService";
import "./notes.css";

// PUBLIC_INTERFACE
export default function NotesPage() {
  /** NotesPage renders a notes list with create and edit support. */
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [creating, setCreating] = useState(false);

  // Edit modal state
  const [editingNote, setEditingNote] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const createSubmitRef = useRef(null);

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
    window.clearTimeout(resetFeedbackSoon._t);
    resetFeedbackSoon._t = window.setTimeout(() => setFeedback(null), 2500);
  }

  async function handleCreate(e) {
    e.preventDefault();
    const t = title.trim();
    const c = content.trim();
    if (!t || !c) {
      setFeedback({ type: "error", message: "Title and content are required." });
      resetFeedbackSoon();
      return;
    }
    try {
      setCreating(true);
      const note = await createNote({ title: t, content: c });
      setNotes((prev) => [note, ...prev]);
      setTitle("");
      setContent("");
      setFeedback({ type: "success", message: "Note created." });
      resetFeedbackSoon();
    } catch (e) {
      setFeedback({ type: "error", message: "Failed to create note." });
      resetFeedbackSoon();
    } finally {
      setCreating(false);
    }
  }

  function openEdit(note) {
    setEditingNote(note);
    setEditTitle(note.title || "");
    setEditContent(note.content || "");
    // focus handling happens via autoFocus on input
  }

  function closeEdit() {
    setEditingNote(null);
    setEditTitle("");
    setEditContent("");
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    if (!editingNote) return;
    const t = editTitle.trim();
    const c = editContent.trim();
    if (!t || !c) {
      setFeedback({ type: "error", message: "Title and content are required." });
      resetFeedbackSoon();
      return;
    }
    try {
      setSavingEdit(true);
      const updated = await updateNote(editingNote.id, { title: t, content: c });
      // Optimistically update list
      setNotes((prev) =>
        prev.map((n) => (String(n.id) === String(editingNote.id) ? { ...n, ...updated } : n))
      );
      setFeedback({ type: "success", message: "Note updated." });
      resetFeedbackSoon();
      closeEdit();
    } catch (e) {
      setFeedback({ type: "error", message: "Failed to update note." });
      resetFeedbackSoon();
    } finally {
      setSavingEdit(false);
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

  const createDisabled = creating || !title.trim() || !content.trim();

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
                aria-required="true"
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
                aria-required="true"
              />
            </div>
            <div className="actions">
              <button
                ref={createSubmitRef}
                className="btn"
                type="submit"
                disabled={createDisabled}
                aria-disabled={createDisabled}
              >
                {creating ? "Saving…" : "Save"}
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
                      {n.updated_at ? new Date(n.updated_at).toLocaleString() : ""}
                    </div>
                  </div>
                  <div className="note-content">{n.content}</div>
                  <div className="note-actions">
                    <button
                      className="btn"
                      onClick={() => openEdit(n)}
                      aria-label={`Edit note ${n.title}`}
                    >
                      Edit
                    </button>
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

      {editingNote && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">Edit Note</div>
            <form onSubmit={handleSaveEdit} aria-label="Edit note form">
              <div className="form-row">
                <label htmlFor="edit-title">Title</label>
                <input
                  id="edit-title"
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                  aria-required="true"
                  autoFocus
                />
              </div>
              <div className="form-row">
                <label htmlFor="edit-content">Content</label>
                <textarea
                  id="edit-content"
                  rows="4"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  required
                  aria-required="true"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={closeEdit}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={savingEdit || !editTitle.trim() || !editContent.trim()}
                  aria-disabled={savingEdit || !editTitle.trim() || !editContent.trim()}
                >
                  {savingEdit ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
