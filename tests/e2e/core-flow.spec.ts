import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * 核心流程 E2E 測試
 *
 * 測試草稿編輯 → 發布的 UI 流程，不依賴 Gemini AI API。
 * 草稿透過 POST /api/drafts（純 CRUD，無 AI）預先建立，
 * 避免 AI 分析的不確定等待時間。
 *
 * 原始的完整流程測試（含 AI 分析等待）已移至 tests/e2e/archive/
 */

const TEST_CONTENT = 'E2E 測試文章：AAPL 股票技術面多頭，建議買進。';
const TEST_KOL_NAME = 'E2E Test KOL';
const TEST_STOCK_TICKER = 'AAPL';

let testDraftId: string | null = null;
let testPostId: string | null = null;
let testKolId: string | null = null;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

test.describe('草稿編輯與發布流程', () => {
  test.beforeAll(async () => {
    const supabase = getSupabase();

    // 建立或查詢測試用 KOL
    const { data: kolData, error: kolError } = await supabase
      .from('kols')
      .insert({
        name: TEST_KOL_NAME,
        slug: `e2e-test-kol-${Date.now()}`,
        bio: 'E2E 測試用 KOL',
      })
      .select()
      .single();

    if (kolError?.message?.includes('duplicate')) {
      const { data: existing } = await supabase
        .from('kols')
        .select('id')
        .eq('name', TEST_KOL_NAME)
        .single();
      testKolId = existing?.id || null;
    } else if (kolError) {
      throw new Error(`Failed to create test KOL: ${kolError.message}`);
    } else {
      testKolId = kolData?.id || null;
    }

    // 確保測試用 Stock 存在
    const { error: stockError } = await supabase
      .from('stocks')
      .insert({ ticker: TEST_STOCK_TICKER, name: 'Apple Inc.', market: 'US' })
      .select()
      .single();

    if (stockError && !stockError.message?.includes('duplicate')) {
      throw new Error(`Failed to create test stock: ${stockError.message}`);
    }
  });

  test.afterAll(async () => {
    try {
      const supabase = getSupabase();
      if (testPostId) {
        await supabase.from('posts').delete().eq('id', testPostId);
      }
      if (testDraftId) {
        await supabase.from('drafts').delete().eq('id', testDraftId);
      }
    } catch {
      // cleanup best-effort
    }
  });

  test('透過 API 建立草稿 → 編輯 → 發布', async ({ page, request }) => {
    // Step 1: 透過 API 建立草稿（純 CRUD，不經過 AI，< 1 秒）
    const createRes = await request.post('/api/drafts', {
      data: {
        content: TEST_CONTENT,
        sentiment: 1,
        stockNameInputs: [`${TEST_STOCK_TICKER} (Apple Inc.)`],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const draft = await createRes.json();
    testDraftId = draft.id;
    expect(testDraftId).toBeTruthy();

    // Step 2: 導航到草稿編輯頁
    await page.goto(`/drafts/${testDraftId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=編輯草稿')).toBeVisible({ timeout: 15000 });

    // Step 3: 選擇 KOL
    const kolSelectorButton = page
      .locator('button')
      .filter({ hasText: /搜尋或選擇 KOL|KOL/ })
      .first();

    if (await kolSelectorButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await kolSelectorButton.click();
      await page.waitForTimeout(800);

      const kolSearchInput = page.locator('input[placeholder*="搜尋 KOL"]');
      if (await kolSearchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await kolSearchInput.fill(TEST_KOL_NAME);
        await page.waitForTimeout(800);

        const kolOption = page
          .locator('[role="option"]')
          .filter({ hasText: TEST_KOL_NAME })
          .first();
        if (await kolOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await kolOption.click();
        }
      }
    }

    // Step 4: 選擇股票
    const stockSelectorButton = page
      .locator('button')
      .filter({ hasText: /搜尋或選擇標的|標的/ })
      .first();

    if (await stockSelectorButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await stockSelectorButton.click();
      await page.waitForTimeout(800);

      const stockSearchInput = page.locator('input[placeholder*="搜尋"]').first();
      if (await stockSearchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        await stockSearchInput.fill(TEST_STOCK_TICKER);
        await page.waitForTimeout(800);

        const stockOption = page
          .locator('[role="option"]')
          .filter({ hasText: TEST_STOCK_TICKER })
          .first();
        if (await stockOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await stockOption.click();
        }
      }
    }

    // Step 5: 設定情緒為「看多」
    const sentimentButton = page.locator('button:has-text("看多")');
    if (await sentimentButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await sentimentButton.click();
    }

    // Step 6: 點擊「發布」按鈕
    const publishButton = page.locator('button:has-text("發布")').first();
    await expect(publishButton).toBeVisible({ timeout: 10000 });
    await publishButton.click();

    // Step 7: 確認發布
    await expect(page.locator('text=確認發布')).toBeVisible({ timeout: 5000 });
    const confirmButton = page.locator('button:has-text("確認發布")');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Step 8: 等待導航到文章詳情頁
    await page.waitForURL(/\/posts\/[^/]+/, { timeout: 15000 });
    const postIdMatch = page.url().match(/\/posts\/([^/]+)/);
    if (postIdMatch) {
      testPostId = postIdMatch[1];
    }

    // Step 9: 驗證文章內容
    await expect(page.locator('body')).toContainText(TEST_CONTENT.substring(0, 20), {
      timeout: 10000,
    });
  });
});
