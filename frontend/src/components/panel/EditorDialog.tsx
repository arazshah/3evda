"use client";

import type { ReactNode } from "react";
import { Dialog } from "@/components/ui/Dialog";

/** A modal editor on the panel's surface, closed with Esc, the × button or a click outside. */
export function EditorDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={onClose} label={title} closeLabel="بستن">
      <div className="max-h-dvh w-[min(48rem,100dvw)] overflow-y-auto rounded-brand border border-line bg-surface p-4 sm:p-6">
        <h2 className="mb-4 font-display text-2xl">{title}</h2>
        {children}
      </div>
    </Dialog>
  );
}
