import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-accent text-bg hover:opacity-90",
    ghost: "border border-line text-text hover:border-accent",
    danger: "border border-accent-2 text-text hover:bg-accent-2",
  }[variant];
  return (
    <button
      type="button"
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-brand px-5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-11 rounded-brand border border-line bg-elevated px-3 text-text outline-none focus:border-accent"
        {...props}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-accent-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-brand border border-line bg-surface p-6 ${className}`}>{children}</section>
  );
}

export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "success" }) {
  const styles = tone === "error" ? "border-accent-2 text-text" : "border-success text-text";
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-brand border px-4 py-3 text-sm ${styles}`}
    >
      {children}
    </p>
  );
}
