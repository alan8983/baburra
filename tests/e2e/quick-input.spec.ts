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
 *   之後：  文章內容（可以很長、多行）
 *
 * 測試框架會自動為每個檔案：
 * 1. 貼上文字到輸入頁
 * 2. 送出並等待草稿建立
 * 3. 查詢 DB 驗證 AI 有識別出標的 (stock_name_inputs) 和情緒 (sentiment)
 *
 * 快速新增案例：node scripts/add-e2e-case.mjs "測試名稱"
 * 注意：這些測試需要有效的 GEMINI_API_KEY 環境變數
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
// 測試邏輯 — 不需要修改以下內容
// ========================================

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

const createdDraftIds: string[] = [];

test.describe('快速輸入 - 資料驅動煙霧測試', () => {
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
      await expect(textarea).toBeVisible();
      await textarea.fill(tc.input);

      // 2. 送出
      const createButton = page.locator('button:has-text("建立草稿")');
      await expect(createButton).toBeVisible();
      await createButton.click();

      // 3. 等待導航到草稿編輯頁（AI 分析可能需要較長時間）
      // timeout 設為 80 秒：Gemini API 在 CI 環境下可能需要 15-30 秒，
      // 論點提取已改為並行呼叫，但仍需足夠的緩衝。
      await page.waitForURL(/\/drafts\/[^/]+/, { timeout: 80000 });
      await page.waitForLoadState('networkidle');
      await expect(page.locator('text=編輯草稿')).toBeVisible({ timeout: 15000 });

      // 4. 取得草稿 ID
      const draftIdMatch = page.url().match(/\/drafts\/([^/]+)/);
      expect(draftIdMatch).toBeTruthy();
      const draftId = draftIdMatch![1];
      createdDraftIds.push(draftId);

      // 5. 查詢 DB 驗證 AI 識別結果
      const supabase = getSupabase();
      const { data: draft } = await supabase
        .from('drafts')
        .select('content, sentiment, stock_name_inputs, kol_name_input')
        .eq('id', draftId)
        .single();

      expect(draft).toBeTruthy();
      // 內容應存在
      expect(draft!.content).toBeTruthy();
      // AI 應識別出情緒（非 null）
      expect(draft!.sentiment).not.toBeNull();
      // AI 應識別出至少一個標的
      expect(draft!.stock_name_inputs.length).toBeGreaterThan(0);
    });
  }

  // 獨立測試：空白輸入
  test('空白輸入不應送出', async ({ page }) => {
    await page.goto('/input');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible();

    const createButton = page.locator('button:has-text("建立草稿")');
    const isDisabled = await createButton.isDisabled();
    if (isDisabled) {
      expect(isDisabled).toBe(true);
    } else {
      await createButton.click();
      await page.waitForTimeout(2000);
      expect(page.url()).toContain('/input');
    }
  });
});
