// Runs the app's own e2e suite against the production server on :8000 (built with CARDIOLENS_TEST_HOOKS=1),
// instead of the dev stack, so the video's test counts come from a real run on the same build that is filmed.
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
import base from "../../app/frontend/playwright.config";

export default {
  ...base,
  testDir: path.resolve(here, "../../app/frontend/e2e"),
  use: { ...base.use, baseURL: "http://localhost:8000" },
  webServer: { ...base.webServer, url: "http://localhost:8000/api/health", reuseExistingServer: true },
};
