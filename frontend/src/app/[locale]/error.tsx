"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { ErrorPanel } from "@/components/site/ErrorPanel";
import { trackingCode } from "@/lib/site/tracking-code";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPage");
  // Read from the page itself (the server cannot know it here); nothing to subscribe to, and "" while rendering on the server.
  const code = useSyncExternalStore(
    () => () => {},
    () => trackingCode(error, document),
    () => "",
  );
  return (
    <ErrorPanel
      labels={{
        title: t("title"),
        body: t("body"),
        code: t("code"),
        retry: t("retry"),
        home: t("home"),
        homeHref: t("homeHref"),
      }}
      code={code}
      onRetry={reset}
    />
  );
}
