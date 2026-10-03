import type { Metadata } from "next";
import { SettingsForm } from "@/components/panel/SettingsForm";

export const metadata: Metadata = { title: "تنظیمات سایت" };

export default function SettingsPage() {
  return <SettingsForm />;
}
