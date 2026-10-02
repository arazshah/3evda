"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiError, type MediaAsset, type WatermarkSetting } from "./client";
import type { components } from "./schema";

type Result<T> = { data?: T; error?: unknown; response: Response };

/** openapi-fetch returns {data, error}; React Query wants a value or a thrown error. */
export async function unwrap<T>(promise: Promise<Result<T>>): Promise<T> {
  const { data, error, response } = await promise;
  if (error !== undefined || !response.ok) {
    throw (error ?? { code: "http_error", detail: `HTTP ${response.status}` }) as ApiError;
  }
  return data as T;
}

export const keys = {
  me: ["me"] as const,
  media: ["media"] as const,
  mediaList: (params: MediaListParams) => ["media", "list", params] as const,
  watermark: ["watermark"] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => unwrap(api.GET("/api/auth/me")), staleTime: 30_000 });
}

export type MediaListParams = {
  q?: string;
  kind?: components["schemas"]["KindEnum"];
  status?: components["schemas"]["StatusEnum"];
  page?: number;
};

const isBusy = (asset: MediaAsset) => asset.status === "pending" || asset.status === "processing";

export function useMediaList(params: MediaListParams) {
  return useQuery({
    queryKey: keys.mediaList(params),
    queryFn: () => unwrap(api.GET("/api/admin/media/", { params: { query: params } })),
    placeholderData: keepPreviousData,
    // Keep polling while anything is still being processed by the worker.
    refetchInterval: (query) => (query.state.data?.results.some(isBusy) ? 3000 : false),
  });
}

export function useUpdateMedia() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; alt_fa?: string; alt_en?: string }) =>
      unwrap(api.PATCH("/api/admin/media/{id}/", { params: { path: { id } }, body })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.media }),
  });
}

export function useDeleteMedia() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/api/admin/media/{id}/", { params: { path: { id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.media }),
  });
}

export function useReprocessMedia() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST("/api/admin/media/{id}/reprocess/", { params: { path: { id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.media }),
  });
}

export function useWatermark() {
  return useQuery({
    queryKey: keys.watermark,
    queryFn: () => unwrap(api.GET("/api/admin/settings/watermark")),
  });
}

export function useSaveWatermark() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Omit<WatermarkSetting, "updated_at">) =>
      unwrap(api.PUT("/api/admin/settings/watermark", { body: body as WatermarkSetting })),
    onSuccess: (data) => client.setQueryData(keys.watermark, data),
  });
}
