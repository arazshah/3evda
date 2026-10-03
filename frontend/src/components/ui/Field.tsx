import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

const CONTROL =
  "min-h-11 w-full rounded-brand border border-line bg-elevated px-3 text-text placeholder:text-muted/70 focus-visible:border-accent aria-[invalid=true]:border-accent-2";

type Common = { label: string; error?: string; hint?: ReactNode };

export function InputField({
  label,
  error,
  hint,
  id,
  ...props
}: Common & InputHTMLAttributes<HTMLInputElement>) {
  const auto = useId();
  const inputId = id ?? auto;
  const noteId = `${inputId}-note`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={inputId}
        className={CONTROL}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? noteId : undefined}
        {...props}
      />
      {error ? (
        <p id={noteId} role="alert" className="text-sm text-accent-2">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextareaField({
  label,
  error,
  hint,
  id,
  ...props
}: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const auto = useId();
  const inputId = id ?? auto;
  const noteId = `${inputId}-note`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-semibold">
        {label}
      </label>
      <textarea
        id={inputId}
        rows={5}
        className={`${CONTROL} py-2`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? noteId : undefined}
        {...props}
      />
      {error ? (
        <p id={noteId} role="alert" className="text-sm text-accent-2">
          {error}
        </p>
      ) : hint ? (
        <p id={noteId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
