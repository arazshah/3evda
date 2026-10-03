import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InputField } from "./Field";
import { Button } from "./Button";

describe("InputField", () => {
  it("links the label, the control and the error message", () => {
    render(<InputField label="Phone" error="Required" />);
    const input = screen.getByLabelText("Phone");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Required");
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });

  it("shows a hint without marking the field invalid", () => {
    render(<InputField label="Email" hint="We reply within a day" />);
    const input = screen.getByLabelText("Email");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).toHaveAccessibleDescription("We reply within a day");
  });
});

describe("Button", () => {
  it("is a non-submitting button by default and fires onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toHaveAttribute("type", "button");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
