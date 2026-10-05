import { defineConfig, devices } from "@playwright/test";

// Runs against an already-running stack (docker compose ... up --wait), never a dev server.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /sample\.spec/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "mobile",
      testIgnore: /sample\.spec/,
      use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } },
    },
    {
      // Fills and empties the whole public site, so it must not overlap with any other spec.
      name: "sample",
      testMatch: /sample\.spec/,
      dependencies: ["desktop", "mobile"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
