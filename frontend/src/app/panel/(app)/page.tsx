import type { Metadata } from "next";
import { Dashboard } from "@/components/panel/Dashboard";

export const metadata: Metadata = { title: "داشبورد" };

export default function DashboardPage() {
  return <Dashboard />;
}
