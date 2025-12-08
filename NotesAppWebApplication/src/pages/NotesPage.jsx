import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  listNotes,
  listCategories,
  createNote,
  deleteNote,
  updateNote,
  _internal,
} from "../services/notesService";
import "./notes.css";

// PUBLIC_INTERFACE
export default function NotesPage() {
  /** NotesPage renders a notes list with create/edit, sorting, and category organization. */
  const [notes, setNotes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [newNoteCatsInput, setNewNoteCatsInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [creating, setCreating] = useState(false);

  // Sorting and filter state (persist to URL)
  const [sortBy, setSortBy] = useState(() => getParamOrDefault("sort", _internal.DEFAULT_SORT));
  const [selectedCategory, setSelectedCategory] = useState(() =>
    getParamOrDefault("cat", "all")
  );

  // Edit modal state
  const [editingNote, setEditingNote] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCatsInput, setEditCatsInput] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const createSubmitRef = useRef(null);

  // URL helpers
  function getParamOrDefault(key, def) {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get(key) || def;
    } catch {
      return def;
    }
  }
  function setUrlParams(next) {
    try {
      const u = new URL(window.location.href);
      Object.entries(next).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "" || v === "all") {
          u.searchParams.delete(k);
        } else {
          u.searchParams.set(k, v);
        }
      });
      window.history.replaceState({}, "", u.toString());
    } catch {
      // no-op
    }
  }

  // Load notes and categories
  async function loadData(options) {
    setLoading(true);
    try {
      const [list, cats] = await Promise.all([
        listNotes({ sortBy: options?.sortBy ?? sortBy, category: options?.category ?? selectedCategory }),
        listCategories(),
      ]);
      setNotes(Array.isArray(list) ? list : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch (e) {
      setFeedback({ type: "error", message: "Failed to load notes." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadData();
      if (!mounted) return;
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist sort and category filter into URL and reload notes when changed
  useEffect(() => {
    setUrlParams({ sort: sortBy, cat: selectedCategory });
    loadData({ sortBy, category: selectedCategory });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortBy, selectedCategory]);

  function resetFeedbackSoon() {
    window.clearTimeout(resetFeedbackSoon._t);
    resetFeedbackSoon._t = window.setTimeout(() => setFeedback(null), 2500);
  }

  const parsedNewNoteCategories = useMemo(() => {
    return splitCategories(newNoteCatsInput);
  }, [newNoteCatsInput]);

  const parsedEditCategories = useMemo(() => {
    return splitCategories(editCatsInput);
  }, [editCatsInput]);

  function splitCategories(input) {
    if (!input) return [];
    return Array.from(
      new Set(
        input
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      )
    );
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
      const note = await createNote({
        title: t,
        content: c,
        categories: parsedNewNoteCategories,
      });
      setNotes((prev) => _internal.applySortFilter([note, ...prev], { sortBy, category: selectedCategory }));
      setTitle("");
      setContent("");
      setNewNoteCatsInput("");
      setFeedback({ type: "success", message: "Note created." });
      // refresh categories list
      const cats = await listCategories();
      setCategories(cats);
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
    setEditCatsInput(Array.isArray(note.categories) ? note.categories.join(", ") : "");
  }

  function closeEdit() {
    setEditingNote(null);
    setEditTitle("");
    setEditContent("");
    setEditCatsInput("");
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
      const updated = await updateNote(editingNote.id, {
        title: t,
        content: c,
        categories: parsedEditCategories,
      });
      // Optimistically update list with resort/filter
      setNotes((prev) => {
        const next = prev.map((n) =>
          String(n.id) === String(editingNote.id) ? { ...n, ...updated } : n
        );
        return _internal.applySortFilter(next, { sortBy, category: selectedCategory });
      });
      setFeedback({ type: "success", message: "Note updated." });
      resetFeedbackSoon();
      closeEdit();
      const cats = await listCategories();
      setCategories(cats);
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
      setNotes((prev) =>
        prev.filter((n) => String(n.id) !== String(confirmDeleteId))
      );
      setFeedback({ type: "success", message: "Note deleted." });
    } catch {
      setFeedback({ type: "error", message: "Failed to delete note." });
    } finally {
      setConfirmDeleteId(null);
      resetFeedbackSoon();
    }
  }

  const createDisabled = creating || !title.trim() || !content.trim();

  const sortOptions = [
    { value: "updated_desc", label: "Updated (newest)" },
    { value: "updated_asc", label: "Updated (oldest)" },
    { value: "created_desc", label: "Created (newest)" },
    { value: "created_asc", label: "Created (oldest)" },
    { value: "title_asc", label: "Title (A→Z)" },
    { value: "title_desc", label: "Title (Z→A)" },
  ];

  const visibleCategories = useMemo(() => ["all", ...categories], [categories]);

  return (
    <div className="notes-app">
      <header className="navbar">
        <div className="brand">Notes</div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-title">Folders</div>
            <ul className="category-list" role="listbox" aria-label="Category filter">
              {visibleCategories.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    className={`category-item ${selectedCategory === c ? "active" : ""}`}
                    onClick={() => setSelectedCategory(c)}
                    aria-selected={selectedCategory === c}
                  >
                    {c === "all" ? "All Notes" : c}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <main className="container main">
          <section className="card">
            <div className="toolbar">
              <h2 className="title" style={{ marginBottom: 0 }}>Create a Note</h2>
              <div className="sort-control">
                <label htmlFor="sort-select" className="sr-only">Sort notes</label>
                <select
                  id="sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort notes"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

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
              <div className="form-row">
                <label htmlFor="note-categories">Categories (comma-separated)</label>
                <input
                  id="note-categories"
                  type="text"
                  value={newNoteCatsInput}
                  onChange={(e) => setNewNoteCatsInput(e.target.value)}
                  placeholder="e.g., Work, Ideas"
                  aria-describedby="cats-help"
                />
                <div id="cats-help" className="muted" style={{ fontSize: 12 }}>
                  Assign multiple categories by separating with commas.
                </div>
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
            <div className="toolbar">
              <h2 className="title" style={{ marginBottom: 0 }}>Your Notes</h2>
              <div className="sort-control">
                <label htmlFor="sort-select-2" className="sr-only">Sort notes</label>
                <select
                  id="sort-select-2"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort notes"
                >
                  {sortOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="muted">Loading…</div>
            ) : notes.length === 0 ? (
              <div className="muted">No notes. Try different filters or create one above.</div>
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
                    {Array.isArray(n.categories) && n.categories.length > 0 && (
                      <div className="note-categories">
                        {n.categories.map((c) => (
                          <span key={c} className="chip" aria-label={`Category ${c}`}>
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
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
      </div>

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
              <div className="form-row">
                <label htmlFor="edit-categories">Categories (comma-separated)</label>
                <input
                  id="edit-categories"
                  type="text"
                  value={editCatsInput}
                  onChange={(e) => setEditCatsInput(e.target.value)}
                  placeholder="e.g., Personal, Ideas"
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
