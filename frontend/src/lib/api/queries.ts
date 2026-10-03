"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiError, type MediaAsset, type WatermarkSetting } from "./client";
import { revalidatePublic } from "./revalidate";
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
  settings: ["cms", "settings"] as const,
  blocks: ["cms", "blocks"] as const,
  items: ["cms", "items"] as const,
  categories: ["portfolio", "categories"] as const,
  projects: ["portfolio", "projects"] as const,
  groups: ["pricing", "groups"] as const,
  packages: ["pricing", "packages"] as const,
};

type Schemas = components["schemas"];
export type ContentItem = Schemas["ContentItem"];
export type Collection = Schemas["CollectionEnum"];
export type Category = Schemas["Category"];
export type Project = Schemas["Project"];
export type PackageGroup = Schemas["PackageGroup"];
export type Package = Schemas["Package"];

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

export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => unwrap(api.GET("/api/admin/cms/settings")),
  });
}

export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: components["schemas"]["PatchedSiteSettings"]) =>
      unwrap(api.PATCH("/api/admin/cms/settings", { body })),
    onSuccess: async (data) => {
      await revalidatePublic("site");
      client.setQueryData(keys.settings, data);
    },
  });
}

export function useBlocks() {
  return useQuery({
    queryKey: keys.blocks,
    queryFn: () => unwrap(api.GET("/api/admin/cms/blocks/")),
  });
}

export function useSaveBlock() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      key,
      ...body
    }: {
      key: string;
      text_fa?: string;
      text_en?: string;
      media?: string | null;
    }) => unwrap(api.PATCH("/api/admin/cms/blocks/{key}/", { params: { path: { key } }, body })),
    onSuccess: async () => {
      await revalidatePublic("site");
      await client.invalidateQueries({ queryKey: keys.blocks });
    },
  });
}

// ---- repeatable content items (hero slides, services, FAQ …) ---------------------------------------

export function useItems(collection: Collection) {
  return useQuery({
    queryKey: [...keys.items, collection],
    queryFn: () => unwrap(api.GET("/api/admin/cms/items/", { params: { query: { collection } } })),
  });
}

type ItemBody = Schemas["PatchedContentItem"];

export function useSaveItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: ItemBody & { id?: number }) =>
      id === undefined
        ? unwrap(api.POST("/api/admin/cms/items/", { body: body as Schemas["ContentItem"] }))
        : unwrap(api.PATCH("/api/admin/cms/items/{id}/", { params: { path: { id } }, body })),
    onSuccess: async () => {
      await revalidatePublic("site");
      await client.invalidateQueries({ queryKey: keys.items });
    },
  });
}

export function useDeleteItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE("/api/admin/cms/items/{id}/", { params: { path: { id } } })),
    onSuccess: async () => {
      await revalidatePublic("site");
      await client.invalidateQueries({ queryKey: keys.items });
    },
  });
}

export function useReorderItems() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { collection: Collection; ids: number[] }) =>
      unwrap(api.POST("/api/admin/cms/items/reorder/", { body })),
    onSettled: async () => {
      await revalidatePublic("site");
      await client.invalidateQueries({ queryKey: keys.items });
    },
  });
}

// ---- portfolio -------------------------------------------------------------------------------------

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: () => unwrap(api.GET("/api/admin/portfolio/categories/")),
  });
}

export function useSaveCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["PatchedCategory"] & { id?: number }) =>
      id === undefined
        ? unwrap(api.POST("/api/admin/portfolio/categories/", { body: body as Category }))
        : unwrap(api.PATCH("/api/admin/portfolio/categories/{id}/", { params: { path: { id } }, body })),
    onSuccess: async () => {
      await revalidatePublic("portfolio");
      await client.invalidateQueries({ queryKey: keys.categories });
    },
  });
}

export function useDeleteCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE("/api/admin/portfolio/categories/{id}/", { params: { path: { id } } })),
    onSuccess: async () => {
      await revalidatePublic("portfolio");
      await client.invalidateQueries({ queryKey: keys.categories });
    },
  });
}

export function useReorderCategories() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      unwrap(api.POST("/api/admin/portfolio/categories/reorder/", { body: { ids } })),
    onSettled: async () => {
      await revalidatePublic("portfolio");
      await client.invalidateQueries({ queryKey: keys.categories });
    },
  });
}

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: () => unwrap(api.GET("/api/admin/portfolio/projects/")),
  });
}

export function useSaveProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["PatchedProject"] & { id?: number }) =>
      id === undefined
        ? unwrap(api.POST("/api/admin/portfolio/projects/", { body: body as Project }))
        : unwrap(api.PATCH("/api/admin/portfolio/projects/{id}/", { params: { path: { id } }, body })),
    onSuccess: async () => {
      await revalidatePublic("portfolio");
      await client.invalidateQueries({ queryKey: keys.projects });
      // Category project counts change with every project save.
      await client.invalidateQueries({ queryKey: keys.categories });
    },
  });
}

export function useDeleteProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE("/api/admin/portfolio/projects/{id}/", { params: { path: { id } } })),
    onSuccess: async () => {
      await revalidatePublic("portfolio");
      await client.invalidateQueries({ queryKey: keys.projects });
      await client.invalidateQueries({ queryKey: keys.categories });
    },
  });
}

export function useReorderProjects() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      unwrap(api.POST("/api/admin/portfolio/projects/reorder/", { body: { ids } })),
    onSettled: async () => {
      await revalidatePublic("portfolio");
      await client.invalidateQueries({ queryKey: keys.projects });
    },
  });
}

// ---- pricing ---------------------------------------------------------------------------------------

export function usePackageGroups() {
  return useQuery({
    queryKey: keys.groups,
    queryFn: () => unwrap(api.GET("/api/admin/pricing/groups/")),
  });
}

export function useSaveGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["PatchedPackageGroup"] & { id?: number }) =>
      id === undefined
        ? unwrap(api.POST("/api/admin/pricing/groups/", { body: body as PackageGroup }))
        : unwrap(api.PATCH("/api/admin/pricing/groups/{id}/", { params: { path: { id } }, body })),
    onSuccess: async () => {
      await revalidatePublic("packages");
      await client.invalidateQueries({ queryKey: keys.groups });
    },
  });
}

export function useDeleteGroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE("/api/admin/pricing/groups/{id}/", { params: { path: { id } } })),
    onSuccess: async () => {
      await revalidatePublic("packages");
      await client.invalidateQueries({ queryKey: keys.groups });
      await client.invalidateQueries({ queryKey: keys.packages });
    },
  });
}

export function useReorderGroups() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => unwrap(api.POST("/api/admin/pricing/groups/reorder/", { body: { ids } })),
    onSettled: async () => {
      await revalidatePublic("packages");
      await client.invalidateQueries({ queryKey: keys.groups });
    },
  });
}

export function usePackages(group: number | undefined) {
  return useQuery({
    queryKey: [...keys.packages, group],
    queryFn: () => unwrap(api.GET("/api/admin/pricing/packages/", { params: { query: { group } } })),
    enabled: group !== undefined,
  });
}

export function useSavePackage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["PatchedPackage"] & { id?: number }) =>
      id === undefined
        ? unwrap(api.POST("/api/admin/pricing/packages/", { body: body as Package }))
        : unwrap(api.PATCH("/api/admin/pricing/packages/{id}/", { params: { path: { id } }, body })),
    onSuccess: async () => {
      await revalidatePublic("packages");
      await client.invalidateQueries({ queryKey: keys.packages });
      await client.invalidateQueries({ queryKey: keys.groups });
    },
  });
}

export function useDeletePackage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE("/api/admin/pricing/packages/{id}/", { params: { path: { id } } })),
    onSuccess: async () => {
      await revalidatePublic("packages");
      await client.invalidateQueries({ queryKey: keys.packages });
      await client.invalidateQueries({ queryKey: keys.groups });
    },
  });
}

export function useReorderPackages() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      unwrap(api.POST("/api/admin/pricing/packages/reorder/", { body: { ids } })),
    onSettled: async () => {
      await revalidatePublic("packages");
      await client.invalidateQueries({ queryKey: keys.packages });
    },
  });
}
