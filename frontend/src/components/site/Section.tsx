import type { ReactNode } from "react";

/** Page gutter and width shared by the header, the sections and the footer. */
export const GUTTER = "px-[clamp(1rem,4vw,3.5rem)]";
export const WIDE = `mx-auto w-full max-w-[84rem] ${GUTTER}`;

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
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={`${WIDE} pt-[clamp(4rem,9vw,8.5rem)]`}
    >
      {title ? (
        <div className="reveal mb-10 flex flex-wrap items-end justify-between gap-4 md:mb-14">
          <div className="max-w-prose">
            <h2
              id={headingId}
              className="font-display mask-in text-[clamp(1.75rem,3.4vw,3rem)] leading-[1.05]"
            >
              {title}
            </h2>
            {intro ? <p className="mt-3 text-muted">{intro}</p> : null}
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
    <div className={`${WIDE} pt-[clamp(3rem,7vw,6rem)]`}>
      <h1 className="font-display mask-load text-[clamp(2rem,4.4vw,3.75rem)] leading-[1]">{title}</h1>
      {intro ? <p className="mt-5 max-w-prose text-lg text-muted">{intro}</p> : null}
    </div>
  );
}
