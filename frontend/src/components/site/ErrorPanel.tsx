export type ErrorLabels = {
  title: string;
  body: string;
  code: string;
  retry: string;
  home: string;
  homeHref: string;
};

export function ErrorPanel({
  labels,
  code,
  onRetry,
}: {
  labels: ErrorLabels;
  code: string;
  onRetry: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">{labels.title}</h1>
      <p className="max-w-prose text-muted">{labels.body}</p>
      {code && (
        <p className="text-sm">
          <span className="text-muted">{labels.code}: </span>
          <code dir="ltr" className="select-all rounded-brand border border-line bg-elevated px-2 py-1">
            {code}
          </code>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center rounded-brand bg-accent px-5 font-semibold text-bg hover:opacity-90"
        >
          {labels.retry}
        </button>
        <a className="text-accent underline-offset-4 hover:underline" href={labels.homeHref}>
          {labels.home}
        </a>
      </div>
    </main>
  );
}
