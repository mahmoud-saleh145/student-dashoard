import { defineConfig, devices } from '@playwright/test';

const STUB_API_PORT = Number(process.env.STUB_API_PORT ?? 4599);
const APP_PORT = Number(process.env.APP_PORT ?? 4598);

/**
 * End-to-end configuration.
 *
 * The dashboard runs as a real production build against a stub upstream API
 * (`e2e/stub-api`). That combination is deliberate: the parts being tested —
 * cookie handling, the proxy, role routing, the login refusal — are all in the
 * dashboard, and pointing them at a controllable upstream is the only way to
 * assert on an expired token or a 403 without contriving one in a real
 * database.
 *
 * Both servers are started by Playwright, so `npm test` needs nothing running.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Normally Playwright resolves its own bundled browser. CHROMIUM_PATH
        // is an escape hatch for restricted environments (CI images, sandboxes)
        // where the browser is pre-installed and the download host is blocked.
        ...(process.env.CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } }
          : {}),
      },
    },
  ],

  webServer: [
    {
      command: `node e2e/stub-api/server.mjs`,
      port: STUB_API_PORT,
      reuseExistingServer: !process.env.CI,
      env: { STUB_API_PORT: String(STUB_API_PORT) },
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // A production build, not `next dev`: middleware, caching headers and
      // server components behave differently in development, and the point of
      // these tests is what ships.
      command: `npm run build && npx next start --port ${APP_PORT}`,
      port: APP_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        API_BASE_URL: `http://127.0.0.1:${STUB_API_PORT}/api/v1`,
        SECURE_COOKIES: 'false',
        NODE_ENV: 'production',
        // The proxy refuses a mutating request whose Origin does not match
        // APP_ORIGIN. .env sets that to the development origin, so without
        // this line every write the interface attempts is answered 403 here —
        // which is exactly what happened the first time a test drove one.
        APP_ORIGIN: `http://127.0.0.1:${APP_PORT}`,
      },
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
