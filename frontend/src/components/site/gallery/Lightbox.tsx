"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { Button } from "@/components/ui/Button";
import type { GalleryPhoto } from "@/lib/site/gallery-client";
import { fill, type GalleryLabels } from "@/lib/site/gallery-labels";

/** A photo shown large, with its choice, note and retouch request. Keyboard, swipe and screen readers are supported. */
export function Lightbox({
  photos,
  index,
  labels,
  rtl,
  locked,
  pending,
  canDownload,
  onIndex,
  onClose,
  onToggle,
  onSaveNote,
  onRetouch,
  onDownload,
  onImageError,
}: {
  photos: GalleryPhoto[];
  index: number;
  labels: GalleryLabels;
  rtl: boolean;
  locked: boolean;
  pending: boolean;
  canDownload: (photo: GalleryPhoto) => boolean;
  onIndex: (index: number) => void;
  onClose: () => void;
  onToggle: (photo: GalleryPhoto) => void;
  onSaveNote: (photo: GalleryPhoto, comment: string) => Promise<boolean>;
  onRetouch: (photo: GalleryPhoto, retouch: boolean) => void;
  onDownload: (photo: GalleryPhoto) => void;
  onImageError: (photo: GalleryPhoto) => void;
}) {
  const photo = photos[index]!;
  const dialog = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const [note, setNote] = useState(photo.comment);
  const [saved, setSaved] = useState(false);
  const go = (delta: number) => onIndex(Math.min(photos.length - 1, Math.max(0, index + delta)));

  // The note belongs to the photo on show.
  const [shown, setShown] = useState(photo.id);
  if (shown !== photo.id) {
    setShown(photo.id);
    setNote(photo.comment);
    setSaved(false);
  }

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);

  // The next and previous photos are fetched ahead of time.
  useEffect(() => {
    for (const near of [photos[index + 1], photos[index - 1]]) {
      if (near) new Image().src = near.preview_url;
    }
  }, [photos, index]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const typing = target.tagName === "TEXTAREA" || target.tagName === "INPUT";
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (!typing && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
      // The reading direction decides which way is «forward».
      const forward = (event.key === "ArrowRight") !== rtl;
      event.preventDefault();
      go(forward ? 1 : -1);
    } else if (event.key === "Tab") {
      // Keep the focus inside the dialog.
      const items = dialog.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), textarea, input:not([disabled])",
      );
      if (!items || items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const onTouchEnd = (event: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (start === null) return;
    const dx = event.changedTouches[0]!.clientX - start;
    if (Math.abs(dx) < 50) return;
    // Dragging towards the start of the line moves forward.
    go(dx < 0 !== rtl ? 1 : -1);
  };

  const save = async () => {
    setSaved(false);
    setSaved(await onSaveNote(photo, note));
  };

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={labels.lightbox}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex flex-col bg-bg/95 outline-none"
    >
      <div className="flex items-center justify-between gap-2 p-3">
        <p className="truncate text-sm text-muted" dir="auto">
          {photo.name} · {fill(labels.position, { n: index + 1, total: photos.length })}
        </p>
        <Button variant="secondary" onClick={onClose}>
          {labels.close}
        </Button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-2"
        onTouchStart={(e) => (touch.current = e.touches[0]!.clientX)}
        onTouchEnd={onTouchEnd}
      >
        <button
          type="button"
          aria-label={labels.previous}
          disabled={index <= 0}
          onClick={() => go(-1)}
          className="absolute start-2 z-10 flex size-11 items-center justify-center rounded-full border border-line bg-surface text-xl disabled:opacity-30"
        >
          <span aria-hidden="true">{rtl ? "›" : "‹"}</span>
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed, short-lived address */}
        <img
          key={photo.id}
          src={photo.preview_url}
          alt={photo.name}
          onError={() => onImageError(photo)}
          className="max-h-full max-w-full object-contain"
        />
        <button
          type="button"
          aria-label={labels.next}
          disabled={index >= photos.length - 1}
          onClick={() => go(1)}
          className="absolute end-2 z-10 flex size-11 items-center justify-center rounded-full border border-line bg-surface text-xl disabled:opacity-30"
        >
          <span aria-hidden="true">{rtl ? "‹" : "›"}</span>
        </button>
      </div>
      <div className="max-h-[45vh] space-y-3 overflow-y-auto border-t border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={photo.selected ? "primary" : "secondary"}
            aria-pressed={photo.selected}
            disabled={locked || pending}
            onClick={() => onToggle(photo)}
          >
            {photo.selected
              ? fill(labels.unselect, { name: photo.name })
              : fill(labels.select, { name: photo.name })}
          </Button>
          {canDownload(photo) && (
            <Button variant="secondary" onClick={() => onDownload(photo)}>
              {labels.download}
            </Button>
          )}
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={photo.retouch}
              disabled={locked}
              onChange={(e) => onRetouch(photo, e.target.checked)}
            />
            {labels.retouch}
          </label>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="photo-note" className="text-sm font-semibold">
            {labels.comment}
          </label>
          <textarea
            id="photo-note"
            rows={2}
            maxLength={500}
            dir="auto"
            readOnly={locked}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setSaved(false);
            }}
            aria-describedby="photo-note-hint"
            className="min-h-11 w-full rounded-brand border border-line bg-elevated px-3 py-2 text-text focus-visible:border-accent"
          />
          <p id="photo-note-hint" className="text-sm text-muted">
            {labels.commentHint}
          </p>
        </div>
        {!locked && (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={note === photo.comment} onClick={() => void save()}>
              {labels.saveComment}
            </Button>
            {saved && (
              <span role="status" className="text-sm text-success">
                {labels.commentSaved}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
