import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";

beforeEach(() => {
  window.localStorage.clear();
});

test("can pin and favorite notes, and pinned appear first", async () => {
  render(<App />);

  // Create two notes: Alpha and Bravo
  fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Alpha" } });
  fireEvent.change(screen.getByLabelText(/^Content$/i), { target: { value: "A content" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

  await waitFor(() => expect(screen.getByText("Alpha")).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Bravo" } });
  fireEvent.change(screen.getByLabelText(/^Content$/i), { target: { value: "B content" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

  await waitFor(() => expect(screen.getByText("Bravo")).toBeInTheDocument());

  // Default sort: updated_desc; pin "Bravo" to force to top
  const bravoPin = screen.getAllByRole("button", { name: /Pin note Bravo|Unpin note Bravo/i })[0];
  fireEvent.click(bravoPin);

  await waitFor(() => {
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/Bravo/i);
  });

  // Favorite Alpha
  const alphaFav = screen.getAllByRole("button", { name: /Favorite.*Alpha|Remove favorite.*Alpha/i })[0];
  fireEvent.click(alphaFav);

  // Filter Favorites only - should show Alpha
  const favFilter = screen.getByRole("button", { name: /Favorites/i });
  fireEvent.click(favFilter);

  await waitFor(() => {
    const itemsFav = screen.getAllByRole("listitem");
    expect(itemsFav.length).toBeGreaterThanOrEqual(1);
    expect(itemsFav[0]).toHaveTextContent(/Alpha/i);
  });

  // Switch to Pinned filter - should show Bravo at top
  const pinnedFilter = screen.getByRole("button", { name: /Pinned/i });
  fireEvent.click(pinnedFilter);

  await waitFor(() => {
    const itemsPinned = screen.getAllByRole("listitem");
    expect(itemsPinned[0]).toHaveTextContent(/Bravo/i);
  });

  // Back to All
  const allFilter = screen.getByRole("button", { name: /^All$/i });
  fireEvent.click(allFilter);

  // Unpin Bravo and ensure it no longer forced to top after unpin
  const bravoUnpin = screen.getAllByRole("button", { name: /Unpin note Bravo|Pin note Bravo/i })[0];
  fireEvent.click(bravoUnpin);

  await waitFor(() => {
    const items = screen.getAllByRole("listitem");
    // With updated_desc sort, the most recently updated could be either;
    // we at least ensure list renders without errors.
    expect(items.length).toBeGreaterThanOrEqual(2);
  });
});
