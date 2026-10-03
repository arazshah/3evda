import type { Metadata } from "next";
import { ProjectsManager } from "@/components/panel/ProjectsManager";

export const metadata: Metadata = { title: "نمونه‌کارها" };

export default function Page() {
  return <ProjectsManager />;
}
