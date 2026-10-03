import { notFound } from "next/navigation";
import type { Package, PackageGroup, Portfolio, ProjectDetail, SiteData } from "./types";

const BASE = process.env.INTERNAL_API_URL ?? "http://localhost:8000";
const REVALIDATE_SECONDS = 30;

export const TAGS = { site: "site", portfolio: "portfolio", packages: "packages" } as const;

async function getJson<T>(path: string, tag: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { next: { revalidate: REVALIDATE_SECONDS, tags: [tag] } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return (await res.json()) as T;
  } catch (error) {
    // A failed read must never turn into a cached empty page: surface it so Next serves the last good copy.
    throw new Error(`Public API unavailable: ${String(error)}`);
  }
}

export async function getSite(): Promise<SiteData> {
  const data = await getJson<SiteData>("/api/public/site", TAGS.site);
  if (!data) throw new Error("Public site payload is missing");
  return data;
}

export async function getPortfolio(): Promise<Portfolio> {
  const data = await getJson<Portfolio>("/api/public/portfolio", TAGS.portfolio);
  return data ?? { categories: [], projects: [] };
}

export async function getProject(slug: string): Promise<ProjectDetail> {
  const data = await getJson<ProjectDetail>(
    `/api/public/portfolio/${encodeURIComponent(slug)}`,
    TAGS.portfolio,
  );
  if (!data) notFound();
  return data;
}

export async function getPackageGroups(): Promise<PackageGroup[]> {
  const data = await getJson<{ groups: PackageGroup[] }>("/api/public/packages", TAGS.packages);
  return data?.groups ?? [];
}

export function featuredPackages(groups: PackageGroup[]): Package[] {
  return groups.flatMap((g) => g.packages).filter((p) => p.is_featured);
}
