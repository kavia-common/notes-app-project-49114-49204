import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import App from "./App";

beforeEach(() => {
  window.localStorage.clear();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

test("can set a future reminder on create, fires scheduler and allows snooze/dismiss", async () => {
  render(<App />);

  // Create basic note
  fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Rem Note" } });
  fireEvent.change(screen.getByLabelText(/Content/i), { target: { value: "Has reminder" } });

  // Set reminder for ~1 minute in future to simulate due
  const in1min = new Date(Date.now() + 60 * 1000);
  const yyyy = in1min.toISOString().slice(0, 10);
  const hh = String(in1min.getHours()).padStart(2, "0");
  const mm = String(in1min.getMinutes()).padStart(2, "0");

  const dateInput = screen.getByLabelText(/Reminder date/i, { selector: "#rem-date" });
  const timeInput = screen.getByLabelText(/Reminder time/i, { selector: "#rem-time" });
  fireEvent.change(dateInput, { target: { value: yyyy } });
  fireEvent.change(timeInput, { target: { value: `${hh}:${mm}` } });

  fireEvent.click(screen.getByRole("button", { name: /Save/i }));

  await waitFor(() => expect(screen.getByText("Rem Note")).toBeInTheDocument());

  // Fast-forward 31 seconds to trigger interval check
  await act(async () => {
    jest.advanceTimersByTime(31_000);
  });

  // Toast should appear
  const toast = await screen.findByText(/Reminder due/i);
  expect(toast).toBeInTheDocument();

  // Snooze +5m
  const snoozeBtn = screen.getByRole("button", { name: /Snooze \+5m/i });
  fireEvent.click(snoozeBtn);

  await waitFor(() => {
    // Toast disappears
    expect(screen.queryByText(/Reminder due/i)).not.toBeInTheDocument();
  });

  // Trigger again after 5 minutes to see it reappear
  await act(async () => {
    jest.advanceTimersByTime(5 * 60 * 1000 + 1000);
  });

  const toast2 = await screen.findByText(/Reminder due/i);
  expect(toast2).toBeInTheDocument();

  // Dismiss
  const dismissBtn = screen.getByRole("button", { name: /Dismiss/i });
  fireEvent.click(dismissBtn);

  await waitFor(() => {
    expect(screen.queryByText(/Reminder due/i)).not.toBeInTheDocument();
  });
});
