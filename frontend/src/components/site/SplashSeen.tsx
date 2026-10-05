"use client";

import { useEffect } from "react";
import { SPLASH_COOKIE, SPLASH_SECONDS } from "@/lib/splash";

/** Remembers that the intro has been shown. The intro itself is pure CSS; this is all the script it needs. */
export function SplashSeen() {
  useEffect(() => {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${SPLASH_COOKIE}=1; Path=/; Max-Age=${SPLASH_SECONDS}; SameSite=Lax${secure}`;
  }, []);
  return null;
}
