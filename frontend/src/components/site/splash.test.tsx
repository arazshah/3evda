import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SPLASH_COOKIE, SPLASH_SECONDS } from "@/lib/splash";
import { SplashSeen } from "./SplashSeen";

afterEach(() => {
  document.cookie = `${SPLASH_COOKIE}=; Path=/; Max-Age=0`;
});

describe("SplashSeen", () => {
  it("remembers that the intro has played, for a limited time, and draws nothing", () => {
    const { container } = render(<SplashSeen />);
    expect(container).toBeEmptyDOMElement();
    expect(document.cookie).toContain(`${SPLASH_COOKIE}=1`);
    expect(SPLASH_SECONDS).toBeGreaterThan(0);
    expect(SPLASH_SECONDS).toBeLessThanOrEqual(60 * 60);
  });
});
