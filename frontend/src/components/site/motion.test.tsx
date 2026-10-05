import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CursorLabel } from "./CursorLabel";
import { Marquee } from "./Marquee";

describe("Marquee", () => {
  it("lists the words once for assistive technology and repeats them, hidden, so the loop has no seam", () => {
    const { container } = render(<Marquee label="Clients" items={["Gilas", "", "Barakat"]} />);
    expect(screen.getByRole("region", { name: "Clients" })).toBeInTheDocument();
    // The empty entry is dropped; each remaining word is in the visible row and in the hidden copy.
    const rows = container.querySelectorAll(".marquee-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toHaveAttribute("aria-hidden");
    expect(rows[1]).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".marquee-item")).toHaveLength(4);
    expect(screen.getAllByText("Gilas")).toHaveLength(2);
  });

  it("draws nothing when there is nothing to show", () => {
    const { container } = render(<Marquee label="Clients" items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CursorLabel", () => {
  it("is decorative and idle until a mouse moves", () => {
    const { container } = render(<CursorLabel />);
    const ring = container.querySelector(".cursor-ring");
    expect(ring).toHaveAttribute("aria-hidden", "true");
    expect(ring).toHaveAttribute("data-on", "false");
  });
});
