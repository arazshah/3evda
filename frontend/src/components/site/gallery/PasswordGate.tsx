"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InputField } from "@/components/ui/Field";
import type { GalleryLabels } from "@/lib/site/gallery-labels";

export function PasswordGate({
  labels,
  error,
  busy,
  onUnlock,
}: {
  labels: GalleryLabels;
  error: string;
  busy: boolean;
  onUnlock: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password) onUnlock(password);
  };
  return (
    <Card className="mx-auto max-w-md space-y-4">
      <h1 className="font-display text-3xl">{labels.unlockTitle}</h1>
      <p className="text-muted">{labels.unlockHint}</p>
      <form className="space-y-4" onSubmit={submit}>
        <InputField
          label={labels.password}
          type="password"
          dir="ltr"
          autoComplete="off"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p role="alert" className="rounded-brand border border-accent-2 px-4 py-3 text-sm">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !password}>
          {busy ? labels.unlocking : labels.unlock}
        </Button>
      </form>
    </Card>
  );
}
