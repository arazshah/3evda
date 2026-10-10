import type { Metadata } from "next";
import { ImageGuide } from "@/components/panel/ImageGuide";
import { SettingsForm } from "@/components/panel/SettingsForm";

export const metadata: Metadata = { title: "تنظیمات سایت" };

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <SettingsForm />
      <ImageGuide />
    </div>
  );
}
