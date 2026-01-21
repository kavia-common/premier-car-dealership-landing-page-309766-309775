import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders hero headline and inventory section", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", {
      name: /find your next car/i,
    })
  ).toBeInTheDocument();

  expect(
    screen.getByRole("heading", {
      name: /featured inventory/i,
    })
  ).toBeInTheDocument();
});
