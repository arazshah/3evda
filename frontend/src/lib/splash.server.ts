import { cookies } from "next/headers";
import { SPLASH_COOKIE } from "./splash";

/** True until the visitor has seen the intro. Read on the server so the markup is right from the first byte. */
export async function splashPending(): Promise<boolean> {
  return !(await cookies()).has(SPLASH_COOKIE);
}
