import type { components } from "@/lib/api/schema";

type S = components["schemas"];
export type SiteData = S["PublicSite"];
export type SiteSettings = S["PublicSettings"];
export type SiteItem = S["PublicItem"];
export type Media = S["PublicMedia"];
export type Category = S["PublicCategory"];
export type Project = S["PublicProject"];
export type ProjectDetail = S["PublicProjectDetail"];
export type Portfolio = S["PublicPortfolio"];
export type PackageGroup = S["PublicGroup"];
export type Package = S["PublicPackage"];
