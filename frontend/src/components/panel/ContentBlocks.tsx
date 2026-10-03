"use client";

import { useState, type FormEvent } from "react";
import { errorMessage } from "@/lib/api/client";
import { useBlocks, useSaveBlock } from "@/lib/api/queries";
import type { components } from "@/lib/api/schema";
import { previewUrl } from "./media-utils";
import { MediaPicker, type PickedMedia } from "./MediaPicker";
import { Alert, Button, Card, Field, TextArea } from "./ui";

type Block = components["schemas"]["ContentBlock"];

// Mirrors apps/cms/blocks.py GROUPS; an unknown group falls back to its key.
const GROUP_LABELS: Record<string, string> = {
  home: "صفحه‌ی خانه",
  portfolio: "نمونه‌کارها",
  services: "خدمات",
  packages: "پکیج‌ها",
  about: "درباره‌ی من",
  contact: "تماس",
  footer: "پایین صفحه",
};

export function ContentBlocks() {
  const blocks = useBlocks();
  const [group, setGroup] = useState("home");
  if (blocks.isError) return <Alert>بارگذاری متن‌ها ناموفق بود.</Alert>;
  if (!blocks.data) return <p className="text-muted">در حال بارگذاری…</p>;

  const groups = [...new Set(blocks.data.map((b) => b.group))];
  const shown = blocks.data.filter((b) => b.group === group);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">متن‌ها و تصاویر صفحات</h1>
      <div role="group" aria-label="بخش‌ها" className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={g === group}
            onClick={() => setGroup(g)}
            className={`min-h-11 rounded-full border px-4 text-sm ${
              g === group ? "border-accent bg-accent text-bg" : "border-line text-muted hover:border-accent"
            }`}
          >
            {GROUP_LABELS[g] ?? g}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-4">
        {shown.map((block) => (
          <BlockEditor key={block.key} block={block} />
        ))}
      </div>
    </div>
  );
}

function BlockEditor({ block }: { block: Block }) {
  const save = useSaveBlock();
  const [fa, setFa] = useState(block.text_fa ?? "");
  const [en, setEn] = useState(block.text_en ?? "");
  const [media, setMedia] = useState<PickedMedia | null>(() =>
    block.media
      ? {
          id: block.media,
          src: block.media_detail ? (previewUrl(block.media_detail) ?? null) : null,
          label: block.display_name,
        }
      : null,
  );
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const isImage = block.kind === "image";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await save.mutateAsync(
        isImage ? { key: block.key, media: media?.id ?? null } : { key: block.key, text_fa: fa, text_en: en },
      );
      setMessage({ tone: "success", text: "ذخیره شد." });
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3" aria-label={block.display_name}>
        <h2 className="font-bold">{block.display_name}</h2>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        {isImage ? (
          <MediaPicker label={block.display_name} value={media} onChange={setMedia} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {block.kind === "longtext" ? (
              <>
                <TextArea label="فارسی" dir="rtl" value={fa} onChange={(e) => setFa(e.target.value)} />
                <TextArea label="English" dir="ltr" value={en} onChange={(e) => setEn(e.target.value)} />
              </>
            ) : (
              <>
                <Field label="فارسی" dir="rtl" value={fa} onChange={(e) => setFa(e.target.value)} />
                <Field label="English" dir="ltr" value={en} onChange={(e) => setEn(e.target.value)} />
              </>
            )}
          </div>
        )}
        <div>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "در حال ذخیره…" : "ذخیره"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
