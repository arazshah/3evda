"use client";

import { moveId } from "@/lib/reorder";
import { Button } from "./ui";

export type Row = { id: number; title: string; detail?: string; published: boolean };

/**
 * An ordered list of rows with move up/down, edit and delete. The order is changed with buttons
 * rather than dragging so it works from the keyboard and on a phone.
 */
export function ResourceList({
  label,
  rows,
  onReorder,
  onEdit,
  onDelete,
  disabled = false,
}: {
  label: string;
  rows: Row[];
  /** Leave out for lists that have no manual order. */
  onReorder?: (ids: number[]) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  disabled?: boolean;
}) {
  const ids = rows.map((r) => r.id);
  if (rows.length === 0) return <p className="text-muted">هنوز موردی اضافه نشده است.</p>;
  return (
    <ul aria-label={label} className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <li
          key={row.id}
          className="flex flex-wrap items-center gap-3 rounded-brand border border-line bg-surface p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold" dir="auto">
              {row.title}
            </p>
            {row.detail && (
              <p className="truncate text-sm text-muted" dir="auto">
                {row.detail}
              </p>
            )}
          </div>
          <span className={`text-xs ${row.published ? "text-success" : "text-muted"}`}>
            {row.published ? "منتشر شده" : "پیش‌نویس"}
          </span>
          <div className="flex flex-wrap gap-2">
            {onReorder && (
              <>
                <Button
                  variant="ghost"
                  className="min-w-11 px-3"
                  disabled={disabled || index === 0}
                  aria-label={`بالا بردن ${row.title}`}
                  onClick={() => onReorder(moveId(ids, index, -1))}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  className="min-w-11 px-3"
                  disabled={disabled || index === rows.length - 1}
                  aria-label={`پایین بردن ${row.title}`}
                  onClick={() => onReorder(moveId(ids, index, 1))}
                >
                  ↓
                </Button>
              </>
            )}
            <Button variant="ghost" aria-label={`ویرایش ${row.title}`} onClick={() => onEdit(row.id)}>
              ویرایش
            </Button>
            <Button variant="danger" aria-label={`حذف ${row.title}`} onClick={() => onDelete(row.id)}>
              حذف
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
