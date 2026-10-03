import type { ReactNode } from "react";

export function Section({
  title,
  intro,
  children,
  id,
  action,
}: {
  title?: string;
  intro?: string;
  children: ReactNode;
  id?: string;
  action?: ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={title ? headingId : undefined} className="mx-auto max-w-6xl px-4 pt-16">
      {title ? (
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-prose">
            <h2 id={headingId} className="font-display text-3xl font-extrabold">
              {title}
            </h2>
            {intro ? <p className="mt-2 text-muted">{intro}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PageTitle({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-14">
      <h1 className="font-display text-4xl font-extrabold sm:text-5xl">{title}</h1>
      {intro ? <p className="mt-4 max-w-prose text-lg text-muted">{intro}</p> : null}
    </div>
  );
}
