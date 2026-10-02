import type { ReactNode } from "react";
import { PanelShell } from "@/components/panel/PanelShell";

export default function PanelAppLayout({ children }: { children: ReactNode }) {
  return <PanelShell>{children}</PanelShell>;
}
