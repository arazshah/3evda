/** Every message the gallery page shows; read on the server and passed down, so the client carries no message files. */
export const GALLERY_LABEL_KEYS = [
  "title",
  "intro",
  "loading",
  "unlockTitle",
  "unlockHint",
  "password",
  "unlock",
  "unlocking",
  "wrongPassword",
  "tooMany",
  "expiredTitle",
  "expiredBody",
  "sessionEnded",
  "errorGeneric",
  "errorRate",
  "retry",
  "photos",
  "count",
  "counterLimit",
  "counterFree",
  "empty",
  "open",
  "select",
  "unselect",
  "selectedBadge",
  "limitReached",
  "selectFailed",
  "lightbox",
  "close",
  "previous",
  "next",
  "position",
  "comment",
  "commentHint",
  "saveComment",
  "commentSaved",
  "retouch",
  "submit",
  "submitHint",
  "submitConfirm",
  "submitting",
  "nothingSelected",
  "submittedTitle",
  "submittedBody",
  "download",
  "downloadFailed",
  "downloadNotAllowed",
  "downloadZip",
  "zipPreparing",
  "zipFailed",
  "zipNothing",
  "zipReady",
  "finalsTitle",
  "finalsHint",
  "finalsFailed",
  "downloadFinal",
] as const;

export type GalleryLabels = Record<(typeof GALLERY_LABEL_KEYS)[number], string>;

/** `{n}`-style placeholders in a message. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}

/** A whole number in the reader's digits. */
export function formatCount(value: number, locale: "fa" | "en"): string {
  return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(value);
}
