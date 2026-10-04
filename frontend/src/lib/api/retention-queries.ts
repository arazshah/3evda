"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { unwrap } from "./queries";
import type { components } from "./schema";

type Schemas = components["schemas"];
export type RetentionSettings = Schemas["RetentionSettings"];
export type RetentionPreview = Schemas["Preview"];
export type RetentionRunResult = Schemas["RunResult"];

const keys = {
  settings: ["retention", "settings"] as const,
  preview: ["retention", "preview"] as const,
};

export function useRetentionSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => unwrap(api.GET("/api/admin/retention/settings/")),
  });
}

export function useRetentionPreview() {
  return useQuery({
    queryKey: keys.preview,
    queryFn: () => unwrap(api.GET("/api/admin/retention/preview/")),
  });
}

export function useSaveRetention() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["PatchedRetentionSettings"]) =>
      unwrap(api.PATCH("/api/admin/retention/settings/", { body })),
    onSuccess: async (data) => {
      client.setQueryData(keys.settings, data);
      await client.invalidateQueries({ queryKey: keys.preview }); // the limits changed what would be removed
    },
  });
}

export function useRunRetention() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/admin/retention/run/", { body: { confirm: true } })),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: keys.settings }),
        client.invalidateQueries({ queryKey: keys.preview }),
      ]);
    },
  });
}
