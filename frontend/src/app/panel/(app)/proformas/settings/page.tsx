import type { Metadata } from "next";
import { ProformaSettingsForm } from "@/components/panel/proformas/ProformaSettingsForm";

export const metadata: Metadata = { title: "اطلاعات صدور پیش‌فاکتور" };

export default function Page() {
  return <ProformaSettingsForm />;
}
