import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "inverse" | "inverseOutline";

const BASE =
  "btn-label inline-flex min-h-11 items-center justify-center gap-2 rounded-brand border px-6 transition-colors duration-300 disabled:cursor-not-allowed disabled:opacity-50";
const VARIANTS: Record<Variant, string> = {
  primary: "border-text bg-text text-bg hover:border-accent hover:bg-accent",
  secondary: "border-text text-text hover:bg-text hover:text-bg",
  ghost: "border-transparent text-muted hover:text-text",
  // On the always-dark "ink" surfaces (hero, closing band, footer), whatever the page theme is.
  inverse: "border-on-ink bg-on-ink text-ink hover:border-accent-on-ink hover:bg-accent-on-ink",
  inverseOutline: "border-on-ink/50 text-on-ink hover:bg-on-ink hover:text-ink",
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
