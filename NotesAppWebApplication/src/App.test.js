import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

/**
 * Basic integration tests for create and edit flows using localStorage fallback.
 * We rely on notesService local store when API is not configured in tests.
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
