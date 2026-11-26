import posthog from "posthog-js";

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? "", {
  api_host: "/ingest",
  ui_host: "https://us.posthog.com",
  defaults: "2026-01-30",
  capture_exceptions: true,
  // Surveys aren't used, so skip loading their script.
  disable_surveys: true,
  debug: process.env.NODE_ENV === "development",
});
