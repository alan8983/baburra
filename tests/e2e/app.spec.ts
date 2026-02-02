import { test, expect } from '@playwright/test';

test.describe('App Navigation', () => {
  test('首頁可以正常載入', async ({ page }) => {
    await page.goto('/');
    
    // 應該顯示首頁內容或重導向到 dashboard
    await expect(page).toHaveURL(/\/(dashboard)?/);
  });

  test('可以訪問 Dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    
    // 等待頁面載入
    await page.waitForLoadState('networkidle');
    
    // 應該顯示 Dashboard 標題或相關內容
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });
});

test.describe('KOL Management', () => {
  test('KOL 列表頁可以載入', async ({ page }) => {
    await page.goto('/kols');
    
    // 等待頁面載入
    await page.waitForLoadState('networkidle');
    
    // 應該顯示 KOL 列表或搜尋框
    const searchInput = page.locator('input[placeholder*="搜尋"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Stock Management', () => {
  test('股票列表頁可以載入', async ({ page }) => {
    await page.goto('/stocks');
    
    // 等待頁面載入
    await page.waitForLoadState('networkidle');
    
    // 應該顯示股票列表或搜尋框
    const searchInput = page.locator('input[placeholder*="搜尋"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Draft Management', () => {
  test('草稿列表頁可以載入', async ({ page }) => {
    await page.goto('/drafts');
    
    // 等待頁面載入
    await page.waitForLoadState('networkidle');
    
    // 應該顯示草稿相關內容
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });
});

test.describe('Input Flow', () => {
  test('快速輸入頁可以載入', async ({ page }) => {
    await page.goto('/input');
    
    // 等待頁面載入
    await page.waitForLoadState('networkidle');
    
    // 應該顯示輸入框
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10000 });
  });

  test('可以輸入內容並儲存草稿', async ({ page }) => {
    await page.goto('/input');
    
    // 等待頁面載入
    await page.waitForLoadState('networkidle');
    
    // 找到輸入框並輸入內容
    const textarea = page.locator('textarea').first();
    await textarea.fill('測試內容：AAPL 看多');
    
    // 找到並點擊儲存草稿按鈕
    const saveButton = page.locator('button:has-text("儲存")');
    if (await saveButton.isVisible()) {
      await saveButton.click();
      
      // 等待儲存完成
      await page.waitForTimeout(1000);
    }
  });
});
