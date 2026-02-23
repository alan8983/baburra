import { test, expect } from '@playwright/test';

test.describe('App Navigation', () => {
  test('首頁重導向到快速輸入', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/input/);
  });

  test('可以訪問 Dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });
});

test.describe('Page Loading', () => {
  test('KOL 列表頁可以載入', async ({ page }) => {
    await page.goto('/kols');
    await page.waitForLoadState('networkidle');

    // 頁面標題應可見（即使 API 失敗進入 error state，h1 仍會顯示）
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
  });

  test('股票列表頁可以載入', async ({ page }) => {
    await page.goto('/stocks');
    await page.waitForLoadState('networkidle');

    // 頁面標題應可見（即使 API 失敗進入 error state，h1 仍會顯示）
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
  });

  test('草稿列表頁可以載入', async ({ page }) => {
    await page.goto('/drafts');
    await page.waitForLoadState('networkidle');

    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('快速輸入頁可以載入', async ({ page }) => {
    await page.goto('/input');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('textarea')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("建立草稿")')).toBeVisible();
  });
});

test.describe('Input Page', () => {
  test('空白內容時建立草稿按鈕應停用', async ({ page }) => {
    await page.goto('/input');
    await page.waitForLoadState('networkidle');

    const createButton = page.locator('button:has-text("建立草稿")');
    await expect(createButton).toBeVisible();
    await expect(createButton).toBeDisabled();
  });

  test('輸入內容後按鈕應啟用', async ({ page }) => {
    await page.goto('/input');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea').first();
    const createButton = page.locator('button:has-text("建立草稿")');

    await expect(createButton).toBeDisabled();
    await textarea.fill('測試內容');
    await expect(createButton).toBeEnabled();
  });
});
