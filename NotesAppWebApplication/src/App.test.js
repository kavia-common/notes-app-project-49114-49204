import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders Notes UI title", () => {
  render(<App />);
  const title = screen.getByText(/Create a Note/i);
  expect(title).toBeInTheDocument();
});
