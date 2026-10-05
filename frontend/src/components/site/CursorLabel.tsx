"use client";

import { useEffect, useRef } from "react";

/**
 * A soft ring that trails the mouse and grows into a labelled disc over anything marked `data-cursor="Label"`
 * (the project tiles). Only for a real mouse (`pointer: fine`) and only when motion is welcome; it is decorative,
 * never takes the pointer and never replaces the system cursor. Nothing is drawn until the mouse first moves.
 */
export function CursorLabel() {
  const ring = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ring.current;
    const label = text.current;
    if (!el || !label || !window.matchMedia) return;
    const fine = window.matchMedia("(pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || calm.matches) return;

    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    let frame = 0;
    let shown = false;

    const tick = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(tick) : 0;
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      tx = event.clientX;
      ty = event.clientY;
      if (!shown) {
        shown = true;
        x = tx;
        y = ty;
        el.dataset.on = "true";
      }
      const target = (event.target as Element | null)?.closest<HTMLElement>("[data-cursor]");
      const words = target?.dataset.cursor ?? "";
      if (label.textContent !== words) label.textContent = words;
      el.dataset.big = words ? "true" : "false";
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const leave = () => {
      el.dataset.on = "false";
      shown = false;
    };

    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={ring} className="cursor-ring" aria-hidden="true" data-on="false" data-big="false">
      <span ref={text} />
    </div>
  );
}
