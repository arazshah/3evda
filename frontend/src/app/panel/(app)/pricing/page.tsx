import type { Metadata } from "next";
import { QuoteRulesManager } from "@/components/panel/QuoteRulesManager";

export const metadata: Metadata = { title: "قواعد قیمت" };

export default function Page() {
  return <QuoteRulesManager />;
}
