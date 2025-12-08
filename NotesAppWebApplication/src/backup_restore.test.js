import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import App from "./App";

/**
 * Round-trip test: create notes, run Backup now, then Restore from latest and ensure notes persist.
 * Uses localStorage-based service (no backend).
 */
beforeEach(() => {
  window.localStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

test("backup now and restore latest round-trip", async () => {
  render(<App />);

  // Create two notes
  fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Alpha Backup" } });
  fireEvent.change(screen.getByLabelText(/^Content$/i), { target: { value: "Content A" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

  await waitFor(() => expect(screen.getByText("Alpha Backup")).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: "Beta Backup" } });
  fireEvent.change(screen.getByLabelText(/^Content$/i), { target: { value: "Content B" } });
  fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

  await waitFor(() => expect(screen.getByText("Beta Backup")).toBeInTheDocument());

  // Find and click "Backup now" in Settings
  // Ensure Settings section exists by its title
  const settingsHeading = await screen.findByText(/Settings/i);
  expect(settingsHeading).toBeInTheDocument();

  const backupBtn = screen.getByRole("button", { name: /Backup now/i });
  fireEvent.click(backupBtn);

  // Feedback should indicate success
  await waitFor(() => {
    expect(
      screen.getByRole("status", { description: /feedback/i })
    ).toBeTruthy();
  });

  // Trigger Restore from latest with confirmation modal
  const restoreBtn = screen.getByRole("button", { name: /Restore from latest/i });
  fireEvent.click(restoreBtn);

  // Confirm modal appears
  const confirmText = await screen.findByText(/replace your current notes/i);
  expect(confirmText).toBeInTheDocument();

  const confirmRestore = screen.getByRole("button", { name: /^Restore$/i });
  fireEvent.click(confirmRestore);

  // After restore, notes should still be present
  await waitFor(() => {
    expect(screen.getByText("Alpha Backup")).toBeInTheDocument();
    expect(screen.getByText("Beta Backup")).toBeInTheDocument();
  });
});
