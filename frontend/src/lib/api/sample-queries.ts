"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { unwrap } from "./queries";
import type { components } from "./schema";

export type SampleState = components["schemas"]["SampleState"];

const key = ["sample-content"] as const;
const BUSY = ["loading", "unloading"];

/** Polls every 2 seconds while a load or an unload is running, so the page notices when it finishes. */
export function useSampleState() {
  return useQuery({
    queryKey: key,
    queryFn: () => unwrap(api.GET("/api/admin/sample-content/")),
    refetchInterval: (query) => (BUSY.includes(query.state.data?.status ?? "") ? 2000 : false),
  });
}

function useStart(path: "/api/admin/sample-content/load/" | "/api/admin/sample-content/unload/") {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST(path, { body: { confirm: true } })),
    onSuccess: (data) => client.setQueryData(key, data),
  });
}

export const useLoadSample = () => useStart("/api/admin/sample-content/load/");
export const useUnloadSample = () => useStart("/api/admin/sample-content/unload/");
