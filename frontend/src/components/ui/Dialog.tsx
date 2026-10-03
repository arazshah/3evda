"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Modal built on the native <dialog>: focus trap, Esc to close and inert background come from the browser. */
export function Dialog({
  open,
  onClose,
  label,
  closeLabel,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  closeLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-auto max-h-dvh max-w-dvw bg-transparent p-0 text-text backdrop:bg-bg/90 ${className}`}
    >
      {open ? (
        <div className="relative">
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="absolute end-2 top-2 z-10 inline-flex size-11 items-center justify-center rounded-full bg-bg/80 text-xl hover:bg-bg"
          >
            ×
          </button>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
