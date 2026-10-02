import type { Metadata } from "next";
import { WatermarkForm } from "@/components/panel/WatermarkForm";

export const metadata: Metadata = { title: "واترمارک" };

export default function WatermarkPage() {
  return <WatermarkForm />;
}
