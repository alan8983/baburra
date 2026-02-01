import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 測試設定
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  // 測試報告輸出目錄
  outputDir: './e2e/test-results',
  // 測試執行超時
  timeout: 30 * 1000,
  expect: {
    timeout: 5000,
  },
  // 並行執行
  fullyParallel: true,
  // CI 環境下失敗不重試
  retries: process.env.CI ? 2 : 0,
  // CI 環境下使用較少的 worker
  workers: process.env.CI ? 1 : undefined,
  // 測試報告格式
  reporter: [
    ['html', { outputFolder: './e2e/playwright-report' }],
    ['list'],
  ],
  // 共用設定
  use: {
    // 基礎 URL
    baseURL: 'http://localhost:3000',
    // 失敗時截圖
    screenshot: 'only-on-failure',
    // 失敗時錄影
    video: 'retain-on-failure',
    // 追蹤失敗測試
    trace: 'on-first-retry',
  },

  // 測試專案設定
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // 可選：其他瀏覽器
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // 開發伺服器設定
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
