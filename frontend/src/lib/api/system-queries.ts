"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { unwrap } from "./queries";
import type { components } from "./schema";

export type SystemStatus = components["schemas"]["SystemStatus"];
export type StatusCheck = components["schemas"]["Check"];

/** The card is a glance, not a live feed: once a minute is enough, and again whenever the tab is looked at. */
export const STATUS_REFRESH_MS = 60_000;

export function useSystemStatus() {
  return useQuery({
    queryKey: ["system", "status"],
    queryFn: () => unwrap(api.GET("/api/admin/system/status")),
    refetchInterval: STATUS_REFRESH_MS,
    refetchOnWindowFocus: true,
  });
}
