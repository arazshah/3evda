import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-brand px-6 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-bg hover:bg-accent/90",
  secondary: "border border-line text-text hover:border-accent",
  ghost: "text-muted hover:text-text",
};

export function buttonClass(variant: Variant = "primary", extra = ""): string {
  return `${BASE} ${VARIANTS[variant]} ${extra}`.trim();
}

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant }) {
  return <a className={buttonClass(variant, className)} {...props} />;
}
