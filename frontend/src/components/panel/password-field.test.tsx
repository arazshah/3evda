import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field } from "./ui";

afterEach(cleanup);

describe("a password field", () => {
  it("is hidden by default and can be shown and hidden again", () => {
    render(<Field label="رمز عبور" type="password" defaultValue="s3cret-value-123" />);
    const input = screen.getByLabelText("رمز عبور");
    expect(input).toHaveAttribute("type", "password");
    const toggle = screen.getByRole("button", { name: "نمایش" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveAttribute("aria-controls", input.id);

    fireEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "پنهان" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "پنهان" }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("hides the password again when focus leaves the field", () => {
    render(
      <>
        <Field label="رمز عبور" type="password" />
        <button type="button">جای دیگر</button>
      </>,
    );
    const input = screen.getByLabelText("رمز عبور");
    fireEvent.click(screen.getByRole("button", { name: "نمایش" }));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.blur(input, { relatedTarget: screen.getByRole("button", { name: "جای دیگر" }) });
    expect(input).toHaveAttribute("type", "password");
  });

  it("keeps it shown while focus moves between the field and its own button", () => {
    render(<Field label="رمز عبور" type="password" />);
    const input = screen.getByLabelText("رمز عبور");
    const toggle = screen.getByRole("button", { name: "نمایش" });
    fireEvent.click(toggle);
    fireEvent.blur(input, { relatedTarget: screen.getByRole("button", { name: "پنهان" }) });
    expect(input).toHaveAttribute("type", "text");
  });

  it("does not add a button to other fields", () => {
    render(<Field label="نام" type="text" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("still passes a typed value through", () => {
    render(<Field label="رمز عبور" type="password" />);
    const input = screen.getByLabelText("رمز عبور") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "abc" } });
    expect(input.value).toBe("abc");
  });
});
