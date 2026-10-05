import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

const labels = { label: "Colour theme", system: "System", light: "Light", dark: "Dark" };

function cookie(): string {
  return document.cookie;
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
    document.cookie = "threevda_theme=; Path=/; Max-Age=0";
  });
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("starts from the choice the server wrote on <html>", () => {
    document.documentElement.dataset.theme = "dark";
    render(<ThemeToggle labels={labels} />);
    expect(screen.getByRole("button", { name: "Colour theme: Dark" })).toBeInTheDocument();
  });

  it("cycles system, light, dark and back, keeping <html> and the cookie in step", () => {
    render(<ThemeToggle labels={labels} />);
    const button = () => screen.getByRole("button");
    expect(button()).toHaveAccessibleName("Colour theme: System");

    fireEvent.click(button());
    expect(button()).toHaveAccessibleName("Colour theme: Light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(cookie()).toContain("threevda_theme=light");

    fireEvent.click(button());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(cookie()).toContain("threevda_theme=dark");

    fireEvent.click(button());
    expect(button()).toHaveAccessibleName("Colour theme: System");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(cookie()).not.toContain("threevda_theme=light");
    expect(cookie()).not.toContain("threevda_theme=dark");
  });
});
