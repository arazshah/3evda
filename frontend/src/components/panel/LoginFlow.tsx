"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage, type AuthState } from "@/lib/api/client";
import { keys, unwrap, useMe } from "@/lib/api/queries";
import { RecoveryCodes } from "./RecoveryCodes";
import { Alert, Button, Card, Field } from "./ui";

type TotpSetup = { otpauth_uri: string; secret: string; qr_data_uri: string };

export function LoginFlow() {
  const router = useRouter();
  const client = useQueryClient();
  const me = useMe();
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const state = me.data?.state;

  useEffect(() => {
    api.GET("/api/auth/csrf");
  }, []);

  useEffect(() => {
    if (state === "verified" && !recoveryCodes) router.replace("/panel");
  }, [state, recoveryCodes, router]);

  const setState = (next: AuthState) => client.setQueryData(keys.me, next);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <p className="mb-1 text-sm tracking-widest text-accent">3EVDA</p>
        {recoveryCodes ? (
          <>
            <h1 className="mb-4 text-2xl font-bold">کدهای بازیابی</h1>
            <RecoveryCodes codes={recoveryCodes} />
            <Button className="mt-6 w-full" onClick={() => router.replace("/panel")}>
              کدها را ذخیره کردم، ادامه
            </Button>
          </>
        ) : state === "otp_required" ? (
          <VerifyStep onDone={setState} />
        ) : state === "enrollment_required" ? (
          <EnrollStep
            onDone={(codes) => {
              setRecoveryCodes(codes);
              client.invalidateQueries({ queryKey: keys.me });
            }}
          />
        ) : state === "anonymous" ? (
          <PasswordStep onDone={setState} />
        ) : (
          <p className="text-muted">در حال بارگذاری…</p>
        )}
      </Card>
    </main>
  );
}

function useSubmit<T>(action: () => Promise<T>, onDone: (value: T) => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await action());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, submit };
}

function PasswordStep({ onDone }: { onDone: (state: AuthState) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { error, busy, submit } = useSubmit(
    () => unwrap(api.POST("/api/auth/login", { body: { username, password } })),
    onDone,
  );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-2xl font-bold">ورود به پنل</h1>
      {error && <Alert>{error}</Alert>}
      <Field
        label="نام کاربری"
        name="username"
        autoComplete="username"
        dir="ltr"
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <Field
        label="رمز عبور"
        name="password"
        type="password"
        autoComplete="current-password"
        dir="ltr"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" disabled={busy || !username || !password}>
        {busy ? "در حال بررسی…" : "ادامه"}
      </Button>
    </form>
  );
}

function CodeField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <Field
      label={label}
      name="code"
      inputMode="text"
      autoComplete="one-time-code"
      dir="ltr"
      maxLength={16}
      required
      value={value}
      onChange={(e) => onChange(e.target.value.trim())}
    />
  );
}

function VerifyStep({ onDone }: { onDone: (state: AuthState) => void }) {
  const [code, setCode] = useState("");
  const { error, busy, submit } = useSubmit(
    () => unwrap(api.POST("/api/auth/verify", { body: { code } })),
    onDone,
  );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-2xl font-bold">ورود دومرحله‌ای</h1>
      <p className="text-sm text-muted">کد ۶ رقمی اپ احراز هویت یا یکی از کدهای بازیابی را وارد کنید.</p>
      {error && <Alert>{error}</Alert>}
      <CodeField label="کد" value={code} onChange={setCode} />
      <Button type="submit" disabled={busy || code.length < 6}>
        {busy ? "در حال بررسی…" : "ورود"}
      </Button>
    </form>
  );
}

function EnrollStep({ onDone }: { onDone: (codes: string[]) => void }) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    unwrap(api.GET("/api/auth/totp/setup"))
      .then(setSetup)
      .catch((err) => setLoadError(errorMessage(err)));
  }, []);

  const { error, busy, submit } = useSubmit(
    () => unwrap(api.POST("/api/auth/totp/confirm", { body: { code } })),
    (data) => onDone(data.recovery_codes),
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <h1 className="text-2xl font-bold">فعال‌سازی ورود دومرحله‌ای</h1>
      <p className="text-sm text-muted">
        با اپی مثل Google Authenticator یا Microsoft Authenticator این کد QR را اسکن کنید، سپس کد ۶ رقمی را
        وارد کنید.
      </p>
      {loadError && <Alert>{loadError}</Alert>}
      {setup && (
        <>
          {/* Rendered as an image (not inline markup) so the SVG can never execute anything. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={setup.qr_data_uri.startsWith("data:image/svg+xml") ? setup.qr_data_uri : ""}
            alt="کد QR برای اپ احراز هویت"
            className="mx-auto w-56 rounded-brand"
          />
          <p className="text-center text-sm text-muted">
            ورود دستی کلید:
            <code dir="ltr" data-testid="totp-secret" className="mt-1 block break-all font-mono text-text">
              {setup.secret}
            </code>
          </p>
        </>
      )}
      {error && <Alert>{error}</Alert>}
      <CodeField label="کد ۶ رقمی" value={code} onChange={setCode} />
      <Button type="submit" disabled={busy || !setup || code.length < 6}>
        {busy ? "در حال بررسی…" : "فعال‌سازی"}
      </Button>
    </form>
  );
}
