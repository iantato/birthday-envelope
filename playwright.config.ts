import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4330',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4330',
    url: 'http://127.0.0.1:4330',
    reuseExistingServer: false,
  },
  projects: [
    ...[320, 375, 390, 768, 1280].map((width) => ({
      name: `chromium-${width}`,
      use: { browserName: 'chromium' as const, viewport: { width, height: 844 } },
    })),
    { name: 'chromium-touch', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: 'webkit-mobile', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
