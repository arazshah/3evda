"use client";

import { useState } from "react";
import { Button } from "./ui";

export function RecoveryCodes({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        این کدها را جای امنی (خارج از گوشی) نگه دارید. اگر به اپ احراز هویت دسترسی نداشتید، با هر کد یک‌بار
        می‌توانید وارد شوید. این کدها دیگر نمایش داده نمی‌شوند.
      </p>
      <ol aria-label="کدهای بازیابی" className="grid grid-cols-2 gap-2 font-mono text-lg" dir="ltr">
        {codes.map((code) => (
          <li key={code} className="rounded-brand bg-elevated px-3 py-2 text-center tracking-widest">
            {code}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="ghost"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? "کپی شد" : "کپی همه"}
        </Button>
        <a
          className="inline-flex min-h-11 items-center rounded-brand border border-line px-5 hover:border-accent"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(`3evda.com recovery codes\n${text}\n`)}`}
          download="3evda-recovery-codes.txt"
        >
          دانلود فایل
        </a>
      </div>
    </div>
  );
}
