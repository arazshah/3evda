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
  quoteRules: ["pricing", "rules"] as const,
  quoteSettings: ["pricing", "quote-settings"] as const,
  articles: ["blog", "articles"] as const,
  blogCategories: ["blog", "categories"] as const,
  blogTags: ["blog", "tags"] as const,
};

type Schemas = components["schemas"];
export type ContentItem = Schemas["ContentItem"];
export type Collection = Schemas["CollectionEnum"];
export type Category = Schemas["Category"];
export type Project = Schemas["Project"];
export type PackageGroup = Schemas["PackageGroup"];
export type Package = Schemas["Package"];
export type QuoteRule = Schemas["QuoteRule"];
export type QuoteSettings = Schemas["QuoteSettings"];
export type QuotePreview = Schemas["QuotePreview"];
export type QuoteInput = Schemas["QuoteInput"];
export type Article = Schemas["Article"];
export type BlogCategory = Schemas["BlogCategory"];
export type BlogTag = Schemas["BlogTag"];

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

/** Every package of every group: the reorder endpoint needs the complete order, not one group's slice. */
export function usePackages() {
  return useQuery({
    queryKey: keys.packages,
    queryFn: () => unwrap(api.GET("/api/admin/pricing/packages/")),
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

// ---- price calculator ------------------------------------------------------------------------------
// The public calculator reads its options from the API on every visit, so saving needs no cache refresh.

export function useQuoteRules() {
  return useQuery({
    queryKey: keys.quoteRules,
    queryFn: () => unwrap(api.GET("/api/admin/pricing/rules/")),
  });
}

export function useSaveQuoteRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["PatchedQuoteRule"] & { id?: number }) =>
      id === undefined
        ? unwrap(api.POST("/api/admin/pricing/rules/", { body: body as QuoteRule }))
        : unwrap(api.PATCH("/api/admin/pricing/rules/{id}/", { params: { path: { id } }, body })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.quoteRules }),
  });
}

export function useDeleteQuoteRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE("/api/admin/pricing/rules/{id}/", { params: { path: { id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.quoteRules }),
  });
}

export function useReorderQuoteRules() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => unwrap(api.POST("/api/admin/pricing/rules/reorder/", { body: { ids } })),
    onSettled: () => client.invalidateQueries({ queryKey: keys.quoteRules }),
  });
}

export function useQuoteSettings() {
  return useQuery({
    queryKey: keys.quoteSettings,
    queryFn: () => unwrap(api.GET("/api/admin/pricing/quote-settings")),
  });
}

export function useSaveQuoteSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["PatchedQuoteSettings"]) =>
      unwrap(api.PATCH("/api/admin/pricing/quote-settings", { body })),
    onSuccess: (data) => client.setQueryData(keys.quoteSettings, data),
  });
}

/** Try the saved rules with some choices (nothing is stored). */
export function usePreviewQuote() {
  return useMutation({
    mutationFn: (body: QuoteInput) => unwrap(api.POST("/api/admin/pricing/rules/preview/", { body })),
  });
}

// ---- journal ---------------------------------------------------------------------------------------
// Journal pages are read from the API without a cache, so saving needs no cache refresh here.

export type ArticleFilters = { status?: "draft" | "published"; language?: "fa" | "en"; q?: string };

export function useArticles(filters: ArticleFilters) {
  return useQuery({
    queryKey: [...keys.articles, "list", filters],
    queryFn: () => unwrap(api.GET("/api/admin/blog/articles/", { params: { query: filters } })),
  });
}

export function useArticle(id: number | undefined) {
  return useQuery({
    queryKey: [...keys.articles, "one", id],
    queryFn: () => unwrap(api.GET("/api/admin/blog/articles/{id}/", { params: { path: { id: id! } } })),
    enabled: id !== undefined,
  });
}

export function useSaveArticle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["PatchedArticle"] & { id?: number }) =>
      id === undefined
        ? unwrap(api.POST("/api/admin/blog/articles/", { body: body as Article }))
        : unwrap(api.PATCH("/api/admin/blog/articles/{id}/", { params: { path: { id } }, body })),
    onSuccess: async (article) => {
      client.setQueryData([...keys.articles, "one", article.id], article);
      await client.invalidateQueries({ queryKey: [...keys.articles, "list"] });
      await client.invalidateQueries({ queryKey: keys.blogCategories });
    },
  });
}

export function useDeleteArticle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE("/api/admin/blog/articles/{id}/", { params: { path: { id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.articles }),
  });
}

export function usePreviewLink() {
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.POST("/api/admin/blog/articles/{id}/preview-link/", { params: { path: { id } } })),
  });
}

export function useTranslateArticle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.POST("/api/admin/blog/articles/{id}/translate/", { params: { path: { id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.articles }),
  });
}

export function useBlogCategories() {
  return useQuery({
    queryKey: keys.blogCategories,
    queryFn: () => unwrap(api.GET("/api/admin/blog/categories/")),
  });
}

export function useSaveBlogCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["PatchedBlogCategory"] & { id?: number }) =>
      id === undefined
        ? unwrap(api.POST("/api/admin/blog/categories/", { body: body as BlogCategory }))
        : unwrap(api.PATCH("/api/admin/blog/categories/{id}/", { params: { path: { id } }, body })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.blogCategories }),
  });
}

export function useDeleteBlogCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE("/api/admin/blog/categories/{id}/", { params: { path: { id } } })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.blogCategories });
      await client.invalidateQueries({ queryKey: keys.articles });
    },
  });
}

export function useBlogTags() {
  return useQuery({ queryKey: keys.blogTags, queryFn: () => unwrap(api.GET("/api/admin/blog/tags/")) });
}

export function useSaveBlogTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas["PatchedBlogTag"] & { id?: number }) =>
      id === undefined
        ? unwrap(api.POST("/api/admin/blog/tags/", { body: body as BlogTag }))
        : unwrap(api.PATCH("/api/admin/blog/tags/{id}/", { params: { path: { id } }, body })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.blogTags }),
  });
}

export function useDeleteBlogTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      unwrap(api.DELETE("/api/admin/blog/tags/{id}/", { params: { path: { id } } })),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.blogTags });
      await client.invalidateQueries({ queryKey: keys.articles });
    },
  });
}
