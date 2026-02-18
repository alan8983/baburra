import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E 測試設定
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  // 測試結束後自動清理 E2E 測試產生的資料（KOL、Posts、Drafts）
  globalTeardown: './tests/e2e/test-teardown.ts',
  // 測試報告輸出目錄
  outputDir: './tests/e2e/test-results',
  // 測試執行超時
  // 設定為 90 秒，因為 AI 分析（Gemini API）在 CI 環境下可能需要 15-30 秒，
  // 加上頁面導航、DB 寫入等操作，30 秒在 CI 環境下不夠用。
  timeout: 90 * 1000,
  expect: {
    timeout: 10000,
  },
  // 並行執行
  fullyParallel: true,
  // CI 環境下失敗不重試
  retries: process.env.CI ? 2 : 0,
  // CI 環境下使用較少的 worker
  workers: process.env.CI ? 1 : undefined,
  // 測試報告格式
  reporter: [['html', { outputFolder: './tests/e2e/playwright-report' }], ['list']],
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
    env: {
      // 傳遞測試用戶 ID，讓 middleware 跳過認證檢查
      TEST_USER_ID: process.env.TEST_USER_ID || '00000000-0000-0000-0000-000000000001',
      // 確保 Supabase 環境變數也被傳遞
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      // Gemini API key for AI analysis
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    },
  },
});
