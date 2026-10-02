import type { Metadata } from "next";
import { SecuritySettings } from "@/components/panel/SecuritySettings";

export const metadata: Metadata = { title: "امنیت" };

export default function SecurityPage() {
  return <SecuritySettings />;
}
