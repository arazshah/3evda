import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

beforeAll(() => {
  // jsdom has no modal <dialog>: stand in for showModal/close (close also fires the `close` event, as browsers do).
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

function Nested({ onOuterClose }: { onOuterClose: () => void }) {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(false);
  return (
    <Dialog
      open={outer}
      onClose={() => {
        onOuterClose();
        setOuter(false);
      }}
      label="Editor"
      closeLabel="Close editor"
    >
      <button type="button" onClick={() => setInner(true)}>
        Choose image
      </button>
      <Dialog open={inner} onClose={() => setInner(false)} label="Library" closeLabel="Close library">
        <button type="button" onClick={() => setInner(false)}>
          Pick
        </button>
      </Dialog>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("closing a dialog nested inside another one leaves the outer one open", () => {
    const onOuterClose = vi.fn();
    render(<Nested onOuterClose={onOuterClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose image" }));
    fireEvent.click(screen.getByRole("button", { name: "Pick" }));
    expect(onOuterClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Choose image" })).toBeInTheDocument();
  });

  it("still closes itself", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} label="Solo" closeLabel="Close">
        <p>hello</p>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
