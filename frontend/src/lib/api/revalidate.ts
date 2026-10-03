export type PublicTag = "site" | "portfolio" | "packages";

/** Best-effort: if it fails, the public pages still refresh on their own within 30 seconds. */
export async function revalidatePublic(...tags: PublicTag[]): Promise<boolean> {
  try {
    const res = await fetch("/panel/revalidate", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
