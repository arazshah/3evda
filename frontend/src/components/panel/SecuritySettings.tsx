"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage } from "@/lib/api/client";
import { unwrap } from "@/lib/api/queries";
import { RecoveryCodes } from "./RecoveryCodes";
import { Alert, Button, Card, Field } from "./ui";

export function SecuritySettings() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-tight">امنیت</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <PasswordChange />
        <RegenerateCodes />
      </div>
    </div>
  );
}

function PasswordChange() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (next !== repeat) {
      setMessage({ tone: "error", text: "رمز جدید و تکرار آن یکسان نیستند." });
      return;
    }
    setBusy(true);
    try {
      await unwrap(
        api.POST("/api/auth/password", { body: { current_password: current, new_password: next } }),
      );
      setMessage({ tone: "success", text: "رمز عبور تغییر کرد و از بقیه‌ی دستگاه‌ها خارج شدید." });
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">تغییر رمز عبور</h2>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <Field
          label="رمز فعلی"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <Field
          label="رمز جدید"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          hint="حداقل ۱۲ کاراکتر"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <Field
          label="تکرار رمز جدید"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
        <Button type="submit" disabled={busy || !current || !next}>
          تغییر رمز
        </Button>
      </form>
    </Card>
  );
}

function RegenerateCodes() {
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await unwrap(api.POST("/api/auth/recovery-codes", { body: { password } }));
      setCodes(data.recovery_codes);
      setPassword("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h2 className="mb-4 font-display text-2xl">کدهای بازیابی جدید</h2>
      {codes ? (
        <RecoveryCodes codes={codes} />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm text-muted">با ساخت کدهای جدید، کدهای قبلی باطل می‌شوند.</p>
          {error && <Alert>{error}</Alert>}
          <Field
            label="رمز عبور"
            type="password"
            autoComplete="current-password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={busy || !password}>
            ساخت کدهای جدید
          </Button>
        </form>
      )}
    </Card>
  );
}
