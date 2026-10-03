import type { Metadata } from "next";
import { ProformaEditorPage } from "@/components/panel/proformas/ProformaEditor";

export const metadata: Metadata = { title: "پیش‌فاکتور جدید" };

export default function Page() {
  return <ProformaEditorPage id={null} />;
}
