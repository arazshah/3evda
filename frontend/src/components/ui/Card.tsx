import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-brand border border-line bg-surface p-6 transition-colors duration-300 ${className}`.trim()}
      {...props}
    />
  );
}
