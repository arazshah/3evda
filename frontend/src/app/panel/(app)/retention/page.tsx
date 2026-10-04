import type { Metadata } from "next";
import { RetentionManager } from "@/components/panel/RetentionManager";

export const metadata: Metadata = { title: "نگهداری اطلاعات" };

export default function Page() {
  return <RetentionManager />;
}
