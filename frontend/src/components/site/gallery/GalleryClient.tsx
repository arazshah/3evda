"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Locale } from "@/i18n/config";
import type { PublicGallery } from "@/lib/site/gallery-api";
import {
  GalleryApiError,
  REFRESH_MS,
  galleryApi,
  keepAccess,
  startDownload,
  storedAccess,
  type GalleryFinal,
  type GalleryPhoto,
  type GalleryPhotos,
} from "@/lib/site/gallery-client";
import { fill, formatCount as formatNumber, type GalleryLabels } from "@/lib/site/gallery-labels";
import { Lightbox } from "./Lightbox";
import { PasswordGate } from "./PasswordGate";

type Phase = "checking" | "gate" | "ready" | "expired" | "failed";
type Zip = { id: number; done: number; total: number } | null;

/** The client's page: unlock, look, choose, write notes, send, download. Everything private stays out of the URL. */
export function GalleryClient({
  initial,
  linkToken,
  locale,
  labels,
  pollMs = 1500,
}: {
  initial: PublicGallery;
  linkToken: string;
  locale: Locale;
  labels: GalleryLabels;
  /** How often a ZIP being made is asked about. */
  pollMs?: number;
}) {
  const [api] = useState(() => galleryApi(linkToken));
  const access = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>(initial.status === "expired" ? "expired" : "checking");
  const [data, setData] = useState<GalleryPhotos | null>(null);
  const [submitted, setSubmitted] = useState(initial.submitted);
  const [gateError, setGateError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  const [zip, setZip] = useState<Zip>(null);
  const [finals, setFinals] = useState<GalleryFinal[]>([]);
  const retried = useRef(new Set<number>());
  const rtl = locale === "fa";
  const level = initial.download_level;

  const say = (text: string, tone: "ok" | "error" = "error") => setMessage({ tone, text });
  const generic = (error: unknown) =>
    error instanceof GalleryApiError && error.status === 429 ? labels.errorRate : labels.errorGeneric;

  const toGate = useCallback(
    (text?: string) => {
      access.current = null;
      keepAccess(linkToken, null);
      setData(null);
      setOpen(null);
      setPhase("gate");
      if (text) setGateError(text);
    },
    [linkToken],
  );

  const load = useCallback(
    async (token: string) => {
      const photos = await api.photos(token);
      access.current = token;
      keepAccess(linkToken, token);
      setData(photos);
      setSubmitted(photos.submitted);
      setPhase("ready");
      api
        .finals(token)
        .then((r) => setFinals(r.finals))
        .catch(() => undefined);
    },
    [api, linkToken],
  );

  /** A gallery without a password is opened with a token too, so the same checks guard every request. */
  const open_ = useCallback(
    async (password?: string) => {
      setBusy(true);
      setGateError("");
      try {
        const { token } = await api.unlock(password);
        await load(token);
      } catch (error) {
        const status = error instanceof GalleryApiError ? error.status : 0;
        if (status === 410) setPhase("expired");
        else if (status === 429) {
          setPhase("gate");
          setGateError(labels.tooMany);
        } else if (initial.has_password) {
          setPhase("gate");
          setGateError(status === 403 ? labels.wrongPassword : generic(error));
        } else {
          setPhase("failed"); // nothing to type in: offer another try
          setGateError(generic(error));
        }
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labels and the gallery do not change while the page is open
    [api, load],
  );

  // First visit: a token kept for this tab, else straight in (no password) or the gate.
  useEffect(() => {
    if (phase === "expired") return;
    const stored = storedAccess(linkToken);
    const start = async () => {
      if (stored) {
        try {
          await load(stored);
          return;
        } catch {
          keepAccess(linkToken, null);
        }
      }
      if (initial.has_password) setPhase("gate");
      else await open_();
    };
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  /** Fresh list: renews the preview addresses (signed for an hour) and shows the owner's changes, e.g. a reopening. */
  const refresh = useCallback(
    async (scheduled: boolean) => {
      const token = access.current;
      if (!token) return;
      if (scheduled) retried.current.clear();
      try {
        const photos = await api.photos(token);
        setData(photos);
        setSubmitted(photos.submitted);
      } catch (error) {
        if (error instanceof GalleryApiError && error.status === 401) {
          if (initial.has_password) toGate(labels.sessionEnded);
          else void open_();
        } else if (error instanceof GalleryApiError && error.status === 410) setPhase("expired");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labels do not change while the page is open
    [api, toGate, open_],
  );

  useEffect(() => {
    if (phase !== "ready") return;
    const timer = setInterval(() => void refresh(true), REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [phase, refresh]);

  /** A preview that fails to load (its address expired) is asked for again, once. */
  const onImageError = useCallback(
    (photo: GalleryPhoto) => {
      if (retried.current.has(photo.id)) return;
      retried.current.add(photo.id);
      void refresh(false);
    },
    [refresh],
  );

  const patchPhoto = (id: number, change: Partial<GalleryPhoto>) =>
    setData((current) =>
      current
        ? { ...current, photos: current.photos.map((p) => (p.id === id ? { ...p, ...change } : p)) }
        : current,
    );

  const mark = (id: number, on: boolean) =>
    setPending((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const onSelectError = (error: unknown) => {
    if (error instanceof GalleryApiError && error.status === 401) {
      if (initial.has_password) toGate(labels.sessionEnded);
      else void open_();
    } else if (error instanceof GalleryApiError && error.code === "limit_reached") say(labels.limitReached);
    else if (error instanceof GalleryApiError && error.code === "submitted") {
      setSubmitted(true);
      void refresh(false);
    } else say(labels.selectFailed);
  };

  const toggle = async (photo: GalleryPhoto) => {
    const token = access.current;
    if (!token || submitted || pending.has(photo.id)) return;
    setMessage(null);
    const want = !photo.selected;
    mark(photo.id, true);
    patchPhoto(photo.id, { selected: want });
    setData((d) => (d ? { ...d, selected_count: d.selected_count + (want ? 1 : -1) } : d));
    try {
      const done = await api.select(token, photo.id, { selected: want });
      patchPhoto(photo.id, { selected: done.selected });
      setData((d) => (d ? { ...d, selected_count: done.selected_count } : d));
    } catch (error) {
      patchPhoto(photo.id, { selected: photo.selected });
      setData((d) => (d ? { ...d, selected_count: d.selected_count + (want ? -1 : 1) } : d));
      onSelectError(error);
    } finally {
      mark(photo.id, false);
    }
  };

  const retouch = async (photo: GalleryPhoto, on: boolean) => {
    const token = access.current;
    if (!token || submitted) return;
    patchPhoto(photo.id, { retouch: on });
    try {
      await api.select(token, photo.id, { retouch: on });
    } catch (error) {
      patchPhoto(photo.id, { retouch: photo.retouch });
      onSelectError(error);
    }
  };

  const saveNote = async (photo: GalleryPhoto, comment: string): Promise<boolean> => {
    const token = access.current;
    if (!token || submitted) return false;
    try {
      const done = await api.select(token, photo.id, { comment });
      patchPhoto(photo.id, { comment: done.comment });
      return true;
    } catch (error) {
      onSelectError(error);
      return false;
    }
  };

  const send = async () => {
    const token = access.current;
    if (!token || !data) return;
    if (data.selected_count === 0) return say(labels.nothingSelected);
    if (!window.confirm(fill(labels.submitConfirm, { n: formatNumber(data.selected_count, locale) }))) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.submit(token);
      setSubmitted(true);
    } catch (error) {
      if (error instanceof GalleryApiError && error.code === "nothing_selected") say(labels.nothingSelected);
      else onSelectError(error);
    } finally {
      setBusy(false);
    }
  };

  const allowed = (photo: GalleryPhoto) =>
    level !== "none" && (level === "selected" || level === "selected_original" ? photo.selected : true);

  const download = async (photo: GalleryPhoto) => {
    const token = access.current;
    if (!token) return;
    setMessage(null);
    try {
      const link = await api.photoLink(token, photo.id);
      startDownload(link.url, link.filename);
    } catch (error) {
      if (error instanceof GalleryApiError && (error.status === 403 || error.status === 404))
        say(labels.downloadNotAllowed);
      else say(labels.downloadFailed);
    }
  };

  const downloadFinal = async (final: GalleryFinal) => {
    const token = access.current;
    if (!token) return;
    try {
      const link = await api.finalLink(token, final.id);
      startDownload(link.url, link.filename);
    } catch {
      say(labels.downloadFailed);
    }
  };

  const cancelled = useRef(false);
  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  /** Ask for the ZIP, then ask how it is going until the link comes (one rebuild if the permissions changed meanwhile). */
  const makeZip = async () => {
    const token = access.current;
    if (!token || zip) return;
    setMessage(null);
    try {
      let job = await api.startZip(token);
      setZip({ id: job.id, done: job.done, total: job.total });
      let rebuilt = false;
      for (;;) {
        await new Promise((r) => setTimeout(r, pollMs));
        if (cancelled.current) return;
        try {
          job = await api.zip(token, job.id);
        } catch (error) {
          if (error instanceof GalleryApiError && error.code === "stale" && !rebuilt) {
            rebuilt = true;
            job = await api.startZip(token);
            setZip({ id: job.id, done: job.done, total: job.total });
            continue;
          }
          throw error;
        }
        setZip({ id: job.id, done: job.done, total: job.total });
        if (job.status === "failed") throw new GalleryApiError(500, "zip_failed");
        if (job.status === "ready" && job.url) {
          startDownload(job.url, job.filename ?? "gallery.zip");
          say(labels.zipReady, "ok");
          break;
        }
      }
    } catch (error) {
      if (error instanceof GalleryApiError && error.code === "nothing_to_download") say(labels.zipNothing);
      else if (error instanceof GalleryApiError && error.status === 401) toGate(labels.sessionEnded);
      else say(labels.zipFailed);
    } finally {
      setZip(null);
    }
  };

  if (phase === "expired") {
    return (
      <Card className="mx-auto max-w-xl space-y-3">
        <h1 className="font-display text-2xl font-extrabold">{labels.expiredTitle}</h1>
        <p className="text-muted">{labels.expiredBody}</p>
      </Card>
    );
  }
  if (phase === "failed") {
    return (
      <Card className="mx-auto max-w-xl space-y-3">
        <p role="alert">{gateError}</p>
        <Button disabled={busy} onClick={() => void open_()}>
          {labels.retry}
        </Button>
      </Card>
    );
  }
  if (phase === "checking") {
    return (
      <p role="status" className="text-center text-muted">
        {labels.loading}
      </p>
    );
  }
  if (phase === "gate") {
    return <PasswordGate labels={labels} error={gateError} busy={busy} onUnlock={(p) => void open_(p)} />;
  }

  const photos = data?.photos ?? [];
  const counter =
    initial.selection_limit !== null
      ? fill(labels.counterLimit, {
          n: formatNumber(data?.selected_count ?? 0, locale),
          max: formatNumber(initial.selection_limit, locale),
        })
      : fill(labels.counterFree, { n: formatNumber(data?.selected_count ?? 0, locale) });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="font-display text-3xl font-extrabold" dir="auto">
          {initial.title}
        </h1>
        {!submitted && <p className="max-w-2xl text-muted">{labels.intro}</p>}
      </header>

      {submitted && (
        <section role="status" className="rounded-brand border border-success p-4">
          <h2 className="font-bold">{labels.submittedTitle}</h2>
          <p className="text-muted">{labels.submittedBody}</p>
        </section>
      )}
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-brand border px-4 py-3 text-sm ${message.tone === "error" ? "border-accent-2" : "border-success"}`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="font-semibold">
          {counter}
        </p>
        <div className="flex flex-wrap gap-3">
          {level !== "none" && (
            <Button variant="secondary" disabled={zip !== null} onClick={() => void makeZip()}>
              {zip
                ? fill(labels.zipPreparing, {
                    done: formatNumber(zip.done, locale),
                    total: formatNumber(zip.total, locale),
                  })
                : labels.downloadZip}
            </Button>
          )}
          {!submitted && (
            <Button disabled={busy} onClick={() => void send()}>
              {busy ? labels.submitting : labels.submit}
            </Button>
          )}
        </div>
      </div>
      {!submitted && <p className="text-sm text-muted">{labels.submitHint}</p>}

      {photos.length === 0 && <p className="text-muted">{labels.empty}</p>}
      {photos.length > 0 && (
        <ul aria-label={labels.photos} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => (
            <li key={photo.id} className="relative">
              <button
                type="button"
                aria-label={fill(labels.open, { name: photo.name })}
                onClick={() => setOpen(index)}
                className="block w-full overflow-hidden rounded-brand border border-line bg-elevated"
                style={{
                  aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : "3 / 2",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a private, signed, short-lived address */}
                <img
                  src={photo.thumb_url}
                  alt={photo.name}
                  loading="lazy"
                  decoding="async"
                  onError={() => onImageError(photo)}
                  className="h-full w-full object-cover"
                />
              </button>
              <button
                type="button"
                aria-pressed={photo.selected}
                aria-label={
                  photo.selected
                    ? fill(labels.unselect, { name: photo.name })
                    : fill(labels.select, { name: photo.name })
                }
                disabled={submitted || pending.has(photo.id)}
                onClick={() => void toggle(photo)}
                className={`absolute end-2 top-2 flex size-11 items-center justify-center rounded-full border text-lg font-bold disabled:opacity-60 ${
                  photo.selected ? "border-accent bg-accent text-bg" : "border-line bg-bg/80 text-text"
                }`}
              >
                <span aria-hidden="true">{photo.selected ? "✓" : "+"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {finals.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-2xl font-bold">{labels.finalsTitle}</h2>
          <p className="text-muted">{labels.finalsHint}</p>
          <ul aria-label={labels.finalsTitle} className="flex flex-col gap-2">
            {finals.map((f) => (
              <li key={f.id}>
                <Button variant="secondary" onClick={() => void downloadFinal(f)}>
                  {fill(labels.downloadFinal, { name: f.filename })}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open !== null && photos[open] && (
        <Lightbox
          photos={photos}
          index={open}
          labels={labels}
          rtl={rtl}
          locked={submitted}
          pending={pending.has(photos[open]!.id)}
          canDownload={allowed}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          onToggle={(p) => void toggle(p)}
          onSaveNote={saveNote}
          onRetouch={(p, on) => void retouch(p, on)}
          onDownload={(p) => void download(p)}
          onImageError={onImageError}
        />
      )}
    </div>
  );
}
