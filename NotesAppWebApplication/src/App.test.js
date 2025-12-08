import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

/**
 * Integration tests including sorting and category filtering
 * using notesService local storage fallback.
 */

beforeEach(() => {
  // Reset local storage for isolation
  window.localStorage.clear();
});

test("renders Notes UI title", () => {
  render(<App />);
  const title = screen.getByText(/Create a Note/i);
  expect(title).toBeInTheDocument();
});

test("creating a note adds it to the list", async () => {
  render(<App />);

  const titleInput = screen.getByLabelText(/Title/i);
  const contentInput = screen.getByLabelText(/Content/i);
  const saveBtn = screen.getByRole("button", { name: /Save/i });

  fireEvent.change(titleInput, { target: { value: "My First Note" } });
  fireEvent.change(contentInput, { target: { value: "Hello world" } });
  fireEvent.click(saveBtn);

  await waitFor(() =>
    expect(screen.getByText("My First Note")).toBeInTheDocument()
  );
  expect(screen.getByText("Hello world")).toBeInTheDocument();
});

test("editing a note updates its title and content", async () => {
  render(<App />);

  // Create a note first
  fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Old Title" } });
  fireEvent.change(screen.getByLabelText(/Content/i), { target: { value: "Old Content" } });
  fireEvent.click(screen.getByRole("button", { name: /Save/i }));

  await waitFor(() => expect(screen.getByText("Old Title")).toBeInTheDocument());

  // Open edit
  fireEvent.click(screen.getByRole("button", { name: /Edit note Old Title/i }));

  const editTitle = await screen.findByLabelText(/Title/i, { selector: "input#edit-title" });
  const editContent = screen.getByLabelText(/Content/i, { selector: "textarea#edit-content" });

  // Update values
  fireEvent.change(editTitle, { target: { value: "New Title" } });
  fireEvent.change(editContent, { target: { value: "New Content" } });

  // Save
  const modalSave = screen.getByRole("button", { name: /^Save$/i });
  fireEvent.click(modalSave);

  await waitFor(() => expect(screen.getByText("New Title")).toBeInTheDocument());
  expect(screen.getByText("New Content")).toBeInTheDocument();
  expect(screen.queryByText("Old Title")).not.toBeInTheDocument();
});

test("sort by title ascending and descending works", async () => {
  render(<App />);

  // Create two notes
  fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Bravo" } });
  fireEvent.change(screen.getByLabelText(/^Content$/i), { target: { value: "B content" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

  await waitFor(() => expect(screen.getByText("Bravo")).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Alpha" } });
  fireEvent.change(screen.getByLabelText(/^Content$/i), { target: { value: "A content" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

  await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());

  // Choose title ascending
  const sortSelects = screen.getAllByLabelText(/Sort notes/i);
  fireEvent.change(sortSelects[0], { target: { value: "title_asc" } });

  const itemsAsc = screen.getAllByRole("listitem");
  expect(itemsAsc[0]).toHaveTextContent("Alpha");

  // Choose title descending
  fireEvent.change(sortSelects[0], { target: { value: "title_desc" } });
  const itemsDesc = screen.getAllByRole("listitem");
  expect(itemsDesc[0]).toHaveTextContent("Bravo");
});

test("search filters notes by title, content and tags (case-insensitive)", async () => {
  render(<App />);

  // Create notes
  fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Travel Plans" } });
  fireEvent.change(screen.getByLabelText(/^Content$/i), { target: { value: "Visit Japan" } });
  fireEvent.change(screen.getByLabelText(/Categories \(comma-separated\)/i), { target: { value: "Leisure, Asia" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
  await waitFor(() => expect(screen.getByText("Travel Plans")).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Work Tasks" } });
  fireEvent.change(screen.getByLabelText(/^Content$/i), { target: { value: "Finish report" } });
  fireEvent.change(screen.getByLabelText(/Categories \(comma-separated\)/i), { target: { value: "Office" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
  await waitFor(() => expect(screen.getByText("Work Tasks")).toBeInTheDocument());

  // Search by content keyword
  const search = screen.getByLabelText(/Search notes/i);
  fireEvent.change(search, { target: { value: "japan" } });

  await waitFor(() => {
    const items = screen.getAllByRole("listitem");
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]).toHaveTextContent(/Travel Plans/i);
  });

  // Clear and search by tag
  fireEvent.change(search, { target: { value: "asia" } });
  await waitFor(() => {
    const texts = screen.getAllByRole("listitem").map((li) => li.textContent || "");
    expect(texts.some((t) => t.includes("Travel Plans"))).toBe(true);
    expect(texts.some((t) => t.includes("Work Tasks"))).toBe(false);
  });
});

test("category filtering shows only matching notes", async () => {
  render(<App />);

  // Create three notes with categories
  fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Work plan" } });
  fireEvent.change(screen.getByLabelText(/^Content$/i), { target: { value: "Do tasks" } });
  fireEvent.change(screen.getByLabelText(/Categories \(comma-separated\)/i), {
    target: { value: "Work, Planning" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
  await waitFor(() => expect(screen.getByText("Work plan")).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Home chores" } });
  fireEvent.change(screen.getByLabelText(/^Content$/i), { target: { value: "Clean up" } });
  fireEvent.change(screen.getByLabelText(/Categories \(comma-separated\)/i), {
    target: { value: "Home" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
  await waitFor(() => expect(screen.getByText("Home chores")).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Trip ideas" } });
  fireEvent.change(screen.getByLabelText(/^Content$/i), { target: { value: "Visit mountains" } });
  fireEvent.change(screen.getByLabelText(/Categories \(comma-separated\)/i), {
    target: { value: "Planning, Travel" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
  await waitFor(() => expect(screen.getByText("Trip ideas")).toBeInTheDocument());

  // Click category "Planning" from sidebar
  const planningBtn = screen.getByRole("button", { name: /Planning/i });
  fireEvent.click(planningBtn);

  // Only notes with Planning should be visible (Work plan and Trip ideas)
  const items = screen.getAllByRole("listitem");
  const texts = items.map((li) => li.textContent || "");
  expect(texts.some((t) => t.includes("Home chores"))).toBe(false);
  expect(texts.some((t) => t.includes("Work plan"))).toBe(true);
  expect(texts.some((t) => t.includes("Trip ideas"))).toBe(true);

  // Back to All Notes
  fireEvent.click(screen.getByRole("button", { name: /All Notes/i }));
  const allItems = screen.getAllByRole("listitem");
  expect(allItems.length >= 3).toBe(true);
});
