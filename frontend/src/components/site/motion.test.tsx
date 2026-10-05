import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CursorLabel } from "./CursorLabel";
import { Marquee } from "./Marquee";

describe("Marquee", () => {
  const labels = { label: "Clients", pauseLabel: "Pause the ticker", playLabel: "Play the ticker" };

  it("lists the words once for assistive technology; every repeat is hidden from it", () => {
    const { container } = render(<Marquee items={["Gilas", "", "Barakat"]} {...labels} />);
    expect(screen.getByRole("region", { name: "Clients" })).toBeInTheDocument();
    const rows = container.querySelectorAll(".marquee-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toHaveAttribute("aria-hidden");
    expect(rows[1]).toHaveAttribute("aria-hidden", "true");
    // Only the first copy in the visible row is exposed.
    expect(rows[0]!.querySelectorAll(".marquee-item:not([aria-hidden])")).toHaveLength(2);
    expect(screen.getAllByText("Gilas", { exact: false }).length).toBeGreaterThan(2);
  });

  it("repeats a short list until one row is wide enough to fill a screen", () => {
    const { container } = render(<Marquee items={["Only one"]} {...labels} />);
    expect(
      container.querySelector(".marquee-row")!.querySelectorAll(".marquee-item").length,
    ).toBeGreaterThanOrEqual(16);
  });

  it("can be paused and resumed without a mouse", () => {
    const { container } = render(<Marquee items={["Gilas"]} {...labels} />);
    const section = container.querySelector(".marquee")!;
    expect(section).toHaveAttribute("data-paused", "false");
    fireEvent.click(screen.getByRole("button", { name: "Pause the ticker" }));
    expect(section).toHaveAttribute("data-paused", "true");
    fireEvent.click(screen.getByRole("button", { name: "Play the ticker" }));
    expect(section).toHaveAttribute("data-paused", "false");
  });

  it("draws nothing when there is nothing to show", () => {
    const { container } = render(<Marquee items={[]} {...labels} />);
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
