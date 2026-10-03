import type { Metadata } from "next";
import { LoginFlow } from "@/components/panel/LoginFlow";

export const metadata: Metadata = { title: "ورود" };

export default function LoginPage() {
  return <LoginFlow />;
}
