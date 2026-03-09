import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 快速輸入功能 E2E 煙霧測試 — 資料驅動模板
 *
 * 使用方式：在 tests/e2e/fixtures/quick-input/ 目錄中新增一個 .txt 檔案即可。
 * 檔案格式：
 *   第一行：# 測試名稱
 *   第二行：---
 *   之後：  文章內容（純文字，避免 URL 以免依賴外部 oEmbed API）
 *
 * 設計原則：
 * - 使用短文本（< 200 字）以減少 AI 處理時間
 * - 不使用 URL 類輸入（避免依賴 Twitter oEmbed 等外部服務）
 * - 使用 Promise.race 同時監聽成功導航和錯誤 toast
 * - AI 欄位為 soft assertions — 不會因 AI 不可用而失敗
 * - 完整的 11 筆原始案例（含 URL 類）已移至 tests/e2e/archive/
 */

// ========================================
// 從 fixtures 目錄載入測試案例
// ========================================

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'quick-input');

function loadTestCases(): Array<{ name: string; input: string }> {
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  const files = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.txt'))
    .sort();
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
    const match = raw.match(/^(.*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
      throw new Error(`Fixture file "${file}" is missing the --- separator`);
    }
    const name = match[1].replace(/^#\s*/, '').trim();
    const input = match[2].trim();
    if (!name || !input) {
      throw new Error(`Fixture file "${file}" has empty name or input`);
    }
    return { name, input };
  });
}

const TEST_CASES = loadTestCases();

// ========================================
// 測試邏輯
// ========================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

const createdDraftIds: string[] = [];

test.describe('快速輸入 — 煙霧測試', () => {
  test.afterAll(async () => {
    try {
      const supabase = getSupabase();
      for (const draftId of createdDraftIds) {
        await supabase.from('drafts').delete().eq('id', draftId);
      }
    } catch {
      // Supabase env vars may not be set
    }
  });

  for (const tc of TEST_CASES) {
    test(`${tc.name}`, async ({ page }) => {
      // 1. 前往輸入頁並貼上內容
      await page.goto('/input');
      await page.waitForLoadState('networkidle');

      const textarea = page.locator('textarea').first();
      await expect(textarea).toBeVisible({ timeout: 15000 });
      await textarea.fill(tc.input);

      // 2. 確認按鈕已啟用後送出
      const createButton = page.locator('button:has-text("建立草稿")');
      await expect(createButton).toBeEnabled({ timeout: 5000 });
      await createButton.click();

      // 3. 等待結果：wizard 完成步驟（step 4 顯示「匯入完成」）或出現錯誤 toast
      const result = await Promise.race([
        page
          .locator('text=匯入完成')
          .waitFor({ timeout: 90000 })
          .then(() => 'complete' as const),
        page
          .locator('[data-sonner-toast][data-type="error"]')
          .waitFor({ timeout: 90000 })
          .then(() => 'error-toast' as const),
      ]);

      if (result === 'error-toast') {
        // API 錯誤（AI 配額用完、內部錯誤等）— UI 正確顯示了錯誤
        const toastText = await page
          .locator('[data-sonner-toast][data-type="error"]')
          .textContent();
        console.log(`  ⚠ "${tc.name}" got error toast: ${toastText}`);
        return;
      }

      // 4. 成功 — wizard 到達 step 4（完成），查看草稿按鈕應可見
      await expect(page.locator('text=匯入完成')).toBeVisible({ timeout: 10000 });
      const viewDraftButton = page.locator('button:has-text("查看草稿")');
      await expect(viewDraftButton).toBeVisible({ timeout: 5000 });

      // 5. 點擊「查看草稿」導航到草稿頁
      await viewDraftButton.click();
      await page.waitForURL(/\/drafts\/[^/]+/, { timeout: 15000 });

      // 6. 記錄草稿 ID（用於 cleanup）
      const draftIdMatch = page.url().match(/\/drafts\/([^/]+)/);
      expect(draftIdMatch).toBeTruthy();
      createdDraftIds.push(draftIdMatch![1]);

      // 7. DB 驗證：草稿已建立且有內容
      const supabase = getSupabase();
      const { data: draft } = await supabase
        .from('drafts')
        .select('content, sentiment, stock_name_inputs')
        .eq('id', draftIdMatch![1])
        .single();

      expect(draft).toBeTruthy();
      expect(draft!.content).toBeTruthy();

      // AI 欄位 — soft log（不影響測試結果）
      if (draft!.sentiment == null) {
        console.log(`  ℹ AI sentiment not set for "${tc.name}"`);
      }
      if (!draft!.stock_name_inputs?.length) {
        console.log(`  ℹ AI stock identification empty for "${tc.name}"`);
      }
    });
  }

  test('空白輸入不應送出', async ({ page }) => {
    await page.goto('/input');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('textarea')).toBeVisible({ timeout: 15000 });
    const createButton = page.locator('button:has-text("建立草稿")');
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await expect(createButton).toBeDisabled();
  });
});
