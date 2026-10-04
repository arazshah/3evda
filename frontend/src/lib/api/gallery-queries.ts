"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { unwrap } from "./queries";
import type { components } from "./schema";

type Schemas = components["schemas"];
export type Gallery = Schemas["Gallery"];
export type GalleryPhoto = Schemas["GalleryPhoto"];
export type DownloadLevel = Schemas["DownloadLevelEnum"];
export type FinalFile = Schemas["FinalFile"];
export type DownloadLogRow = Schemas["DownloadLog"];
export type Selections = Schemas["Selections"];

export const galleryKeys = {
  all: ["galleries"] as const,
  list: ["galleries", "list"] as const,
  detail: (id: number) => ["galleries", "detail", id] as const,
  photos: (id: number) => ["galleries", "photos", id] as const,
  selections: (id: number, only: string) => ["galleries", "selections", id, only] as const,
  finals: (id: number) => ["galleries", "finals", id] as const,
  downloads: (id: number) => ["galleries", "downloads", id] as const,
};

export function useGalleries() {
  return useQuery({ queryKey: galleryKeys.list, queryFn: () => unwrap(api.GET("/api/admin/galleries/")) });
}

export function useGallery(id: number) {
  return useQuery({
    queryKey: galleryKeys.detail(id),
    queryFn: () => unwrap(api.GET("/api/admin/galleries/{id}/", { params: { path: { id } } })),
  });
}

export type GalleryInput = {
  title: string;
  client_name: string;
  language: "fa" | "en";
  expires_at: string | null;
  selection_limit: number | null;
  download_level: DownloadLevel;
  watermark: boolean;
  note: string;
  password?: string;
  clear_password?: boolean;
};

export function useCreateGallery() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: GalleryInput) => unwrap(api.POST("/api/admin/galleries/", { body: body as Gallery })),
    onSuccess: async (gallery) => {
      client.setQueryData(galleryKeys.detail(gallery.id), gallery);
      await client.invalidateQueries({ queryKey: galleryKeys.list });
    },
  });
}

export function useUpdateGallery(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<GalleryInput>) =>
      unwrap(
        api.PATCH("/api/admin/galleries/{id}/", {
          params: { path: { id } },
          body: { ...body, clear_password: body.clear_password ?? false },
        }),
      ),
    onSuccess: async (gallery) => {
      client.setQueryData(galleryKeys.detail(id), gallery);
      await client.invalidateQueries({ queryKey: galleryKeys.list });
    },
  });
}

export function useDeleteGallery() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error, response } = await api.DELETE("/api/admin/galleries/{id}/", {
        params: { path: { id } },
      });
      if (error !== undefined || !response.ok)
        throw error ?? { code: "http_error", detail: `HTTP ${response.status}` };
    },
    onSuccess: () => client.invalidateQueries({ queryKey: galleryKeys.all }),
  });
}

export type GalleryAction = "publish" | "reopen" | "archive" | "unarchive" | "new-link";

export function useGalleryAction(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: GalleryAction) => {
      const params = { params: { path: { id } } };
      switch (action) {
        case "publish":
          return unwrap(api.POST("/api/admin/galleries/{id}/publish/", params));
        case "reopen":
          return unwrap(api.POST("/api/admin/galleries/{id}/reopen/", params));
        case "archive":
          return unwrap(api.POST("/api/admin/galleries/{id}/archive/", params));
        case "unarchive":
          return unwrap(api.POST("/api/admin/galleries/{id}/unarchive/", params));
        case "new-link":
          return unwrap(api.POST("/api/admin/galleries/{id}/new-link/", params));
      }
    },
    onSuccess: async (gallery) => {
      client.setQueryData(galleryKeys.detail(id), gallery);
      await client.invalidateQueries({ queryKey: galleryKeys.list });
    },
  });
}

/** Photos are polled while any is still being prepared by the worker. */
export function useGalleryPhotos(id: number) {
  return useQuery({
    queryKey: galleryKeys.photos(id),
    queryFn: () => unwrap(api.GET("/api/admin/galleries/{id}/photos/", { params: { path: { id } } })),
    refetchInterval: (query) => (query.state.data?.some((p) => p.status === "pending") ? 3000 : false),
  });
}

export function useReorderPhotos(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      const { error, response } = await api.PATCH("/api/admin/galleries/{id}/photos/order/", {
        params: { path: { id } },
        body: { ids },
      });
      if (error !== undefined || !response.ok)
        throw error ?? { code: "http_error", detail: `HTTP ${response.status}` };
    },
    onSuccess: () => client.invalidateQueries({ queryKey: galleryKeys.photos(id) }),
  });
}

export function useDeletePhoto(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: number) => {
      const { error, response } = await api.DELETE("/api/admin/galleries/{id}/photos/{photo_id}/", {
        params: { path: { id, photo_id: photoId } },
      });
      if (error !== undefined || !response.ok)
        throw error ?? { code: "http_error", detail: `HTTP ${response.status}` };
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: galleryKeys.photos(id) });
      await client.invalidateQueries({ queryKey: galleryKeys.detail(id) });
    },
  });
}

export function useSelections(id: number, only: string) {
  return useQuery({
    queryKey: galleryKeys.selections(id, only),
    queryFn: () =>
      unwrap(
        api.GET("/api/admin/galleries/{id}/selections/", {
          params: { path: { id }, query: only ? { only } : {} },
        }),
      ),
  });
}

export function useFinals(id: number) {
  return useQuery({
    queryKey: galleryKeys.finals(id),
    queryFn: () => unwrap(api.GET("/api/admin/galleries/{id}/finals/", { params: { path: { id } } })),
  });
}

export function useDeleteFinal(id: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (finalId: number) => {
      const { error, response } = await api.DELETE("/api/admin/galleries/{id}/finals/{final_id}/", {
        params: { path: { id, final_id: finalId } },
      });
      if (error !== undefined || !response.ok)
        throw error ?? { code: "http_error", detail: `HTTP ${response.status}` };
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: galleryKeys.finals(id) });
      await client.invalidateQueries({ queryKey: galleryKeys.detail(id) });
    },
  });
}

export function useDownloadLog(id: number) {
  return useQuery({
    queryKey: galleryKeys.downloads(id),
    queryFn: () => unwrap(api.GET("/api/admin/galleries/{id}/downloads/", { params: { path: { id } } })),
  });
}
