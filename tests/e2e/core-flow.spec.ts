import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * 核心輸入流程 E2E 測試
 *
 * 此測試模擬完整的 Happy Path：
 * 1. 從 /input 頁面開始
 * 2. 貼上測試內容
 * 3. 建立草稿並導向編輯頁
 * 4. 選擇 KOL、股票、設定情緒
 * 5. 預覽並確認建檔
 * 6. 驗證導航和資料正確性
 *
 * 環境變數需求：
 * - NEXT_PUBLIC_SUPABASE_URL
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - TEST_USER_ID 或 DEV_USER_ID (用於跳過認證，可選)
 */

// 測試資料
const TEST_CONTENT = '這是一篇測試文章，內容提到 AAPL 股票，我認為未來會上漲。';
const TEST_KOL_NAME = 'E2E Test KOL';
const TEST_STOCK_TICKER = 'AAPL';

// 儲存測試產生的 ID，用於 teardown
let testDraftId: string | null = null;
let testPostId: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let testKolId: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let testStockId: string | null = null;

test.describe('核心輸入流程 - Happy Path', () => {
  test.beforeAll(async () => {
    // 使用 Supabase anon key 建立測試用的 KOL 和 Stock
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 建立測試用 KOL
    const { data: kolData, error: kolError } = await supabase
      .from('kols')
      .insert({
        name: TEST_KOL_NAME,
        slug: `e2e-test-kol-${Date.now()}`,
        bio: 'E2E 測試用 KOL',
      })
      .select()
      .single();

    if (kolError && !kolError.message.includes('duplicate')) {
      throw new Error(`Failed to create test KOL: ${kolError.message}`);
    }

    // 如果已存在，則查詢現有的
    if (kolError && kolError.message.includes('duplicate')) {
      const { data: existingKol } = await supabase
        .from('kols')
        .select('id')
        .eq('name', TEST_KOL_NAME)
        .single();
      testKolId = existingKol?.id || null;
    } else {
      testKolId = kolData?.id || null;
    }

    // 建立或查詢測試用 Stock
    const { data: stockData, error: stockError } = await supabase
      .from('stocks')
      .insert({
        ticker: TEST_STOCK_TICKER,
        name: 'Apple Inc.',
        market: 'US',
      })
      .select()
      .single();

    if (stockError && !stockError.message.includes('duplicate')) {
      throw new Error(`Failed to create test stock: ${stockError.message}`);
    }

    if (stockError && stockError.message.includes('duplicate')) {
      const { data: existingStock } = await supabase
        .from('stocks')
        .select('id')
        .eq('ticker', TEST_STOCK_TICKER)
        .single();
      testStockId = existingStock?.id || null;
    } else {
      testStockId = stockData?.id || null;
    }
  });

  test.afterAll(async () => {
    // 清理測試資料
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) return;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 刪除測試產生的 Post
    if (testPostId) {
      await supabase.from('posts').delete().eq('id', testPostId);
    }

    // 刪除測試產生的 Draft
    if (testDraftId) {
      await supabase.from('drafts').delete().eq('id', testDraftId);
    }

    // 注意：KOL 和 Stock 可能被其他測試使用，所以不刪除
    // 如果需要完全清理，可以使用 service role key
  });

  test('從輸入頁面到建檔完成的完整流程', async ({ page }) => {
    // Step 1: 前往輸入頁面
    await page.goto('/input');
    await page.waitForLoadState('networkidle');

    // 驗證頁面已載入
    await expect(page.locator('h1:has-text("快速輸入")')).toBeVisible();

    // Step 2: 輸入測試內容
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();
    await textarea.fill(TEST_CONTENT);

    // Step 3: 點擊「建立草稿」按鈕
    const createButton = page.locator('button:has-text("建立草稿")');
    await expect(createButton).toBeVisible();
    await createButton.click();

    // Step 4: 等待導航到草稿編輯頁（AI 分析可能需要較長時間）
    await page.waitForURL(/\/drafts\/[^/]+/, { timeout: 60000 });
    await page.waitForLoadState('networkidle');
    const draftUrl = page.url();
    const draftIdMatch = draftUrl.match(/\/drafts\/([^/]+)/);
    if (draftIdMatch) {
      testDraftId = draftIdMatch[1];
    }

    // 驗證已進入草稿編輯頁
    await expect(page.locator('text=編輯草稿')).toBeVisible({ timeout: 10000 });

    // Step 5: 選擇 KOL
    // 找到 KOL 選擇器的觸發按鈕
    const kolSelectorButton = page
      .locator('button')
      .filter({ hasText: /搜尋或選擇 KOL|KOL/ })
      .first();
    await expect(kolSelectorButton).toBeVisible({ timeout: 10000 });
    await kolSelectorButton.click();

    // 等待 KOL 選擇器彈出（Popover）
    await page.waitForTimeout(800);

    // 搜尋並選擇測試 KOL
    const kolSearchInput = page.locator('input[placeholder*="搜尋 KOL"]');
    await expect(kolSearchInput).toBeVisible({ timeout: 5000 });
    await kolSearchInput.fill(TEST_KOL_NAME);
    await page.waitForTimeout(800); // 等待搜尋結果載入

    // 選擇匹配的 KOL（在 CommandItem 中）
    const kolOption = page.locator('[role="option"]').filter({ hasText: TEST_KOL_NAME }).first();
    await expect(kolOption).toBeVisible({ timeout: 5000 });
    await kolOption.click();

    // Step 6: 選擇股票
    // 找到股票選擇器的觸發按鈕
    const stockSelectorButton = page
      .locator('button')
      .filter({ hasText: /搜尋或選擇標的|標的/ })
      .first();
    await expect(stockSelectorButton).toBeVisible({ timeout: 10000 });
    await stockSelectorButton.click();

    // 等待股票選擇器彈出
    await page.waitForTimeout(800);

    // 搜尋並選擇測試股票
    const stockSearchInput = page.locator('input[placeholder*="搜尋"]').first();
    await expect(stockSearchInput).toBeVisible({ timeout: 5000 });
    await stockSearchInput.fill(TEST_STOCK_TICKER);
    await page.waitForTimeout(800); // 等待搜尋結果載入

    // 選擇匹配的股票（在 CommandItem 中）
    const stockOption = page
      .locator('[role="option"]')
      .filter({ hasText: TEST_STOCK_TICKER })
      .first();
    await expect(stockOption).toBeVisible({ timeout: 5000 });
    await stockOption.click();

    // Step 7: 設定發文時間（使用快捷選項「1小時前」）
    const timeInput = page.locator('input[type="datetime-local"]');
    if (await timeInput.isVisible()) {
      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);
      const timeString = oneHourAgo.toISOString().slice(0, 16);
      await timeInput.fill(timeString);
    } else {
      // 如果有快捷選項按鈕，點擊「1小時前」
      const quickTimeButton = page.locator('button:has-text("1小時前")');
      if (await quickTimeButton.isVisible()) {
        await quickTimeButton.click();
      }
    }

    // Step 8: 設定情緒為「看多」
    const sentimentButton = page.locator('button:has-text("看多")');
    await expect(sentimentButton).toBeVisible({ timeout: 5000 });
    await sentimentButton.click();

    // Step 9: 點擊「預覽並確認」按鈕
    const previewButton = page
      .locator('a:has-text("預覽並確認")')
      .or(page.locator('button:has-text("預覽並確認")'))
      .first();
    await expect(previewButton).toBeVisible({ timeout: 10000 });
    await previewButton.click();

    // Step 10: 等待導航到預覽確認頁
    await page.waitForURL(/\/posts\/new/, { timeout: 10000 });
    await expect(page.locator('text=文章預覽')).toBeVisible({ timeout: 10000 });

    // Step 11: 確認情緒已設定為「看多」（如果尚未設定，則設定它）
    // 檢查情緒選擇器是否已選中「看多」
    const previewSentimentButton = page.locator('button:has-text("看多")').first();
    await previewSentimentButton.waitFor({ state: 'visible', timeout: 5000 });

    // 等待一下讓樣式渲染完成
    await page.waitForTimeout(500);

    // 檢查按鈕是否已被選中（bg-green-100 用於看多，bg-green-600 用於強烈看多）
    const classList = await previewSentimentButton.evaluate((el) => Array.from(el.classList));
    const isSelected = classList.some((cls) => cls.includes('bg-green'));

    if (!isSelected) {
      await previewSentimentButton.click();
      // 等待點擊後的狀態更新
      await page.waitForTimeout(500);
    }

    // Step 12: 點擊「確認建檔」按鈕
    const confirmButton = page.locator('button:has-text("確認建檔")');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Step 13: 等待導航到文章詳情頁
    await page.waitForURL(/\/posts\/[^/]+/, { timeout: 15000 });
    const postUrl = page.url();
    const postIdMatch = postUrl.match(/\/posts\/([^/]+)/);
    if (postIdMatch) {
      testPostId = postIdMatch[1];
    }

    // 驗證已進入文章詳情頁
    await expect(page.locator('body')).toContainText(TEST_CONTENT.substring(0, 20), {
      timeout: 10000,
    });

    // Step 14: 驗證文章出現在 posts 列表中
    await page.goto('/posts');
    await page.waitForLoadState('networkidle');

    // 驗證文章內容出現在列表中
    await expect(page.locator('body')).toContainText(TEST_CONTENT.substring(0, 20), {
      timeout: 10000,
    });
  });
});
