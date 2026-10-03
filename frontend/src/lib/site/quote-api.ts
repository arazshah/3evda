import { json } from "./fresh";
import type { QuoteOptions } from "./types";

/** What the calculator offers: labels and quantity limits (never prices). */
export function getQuoteOptions(): Promise<QuoteOptions> {
  return json<QuoteOptions>("/api/public/quote/options");
}
