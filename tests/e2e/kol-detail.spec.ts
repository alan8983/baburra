/**
 * KOL detail page E2E coverage (Q3 in qa-standards).
 *
 * Loads /kols/<seededKolId> and asserts:
 *   - the per-stock NVDA card text shows the same number as a SQL probe
 *     (`COUNT(post_stocks WHERE stock_id=<NVDA-id> AND post_id IN (SELECT id FROM posts WHERE kol_id=<seededKolId>))`),
 *   - the win-rate ring's value is not the literal `—` after the
 *     scorecard-cache polling settles (max 30 s).
 *
 * This is the page-level half of the QA gate — invariants I-1…I-4 catch
 * DB/cache drift but only Playwright catches a CSS regression that hides the
 * breakdown card.
 *
 * Skipped automatically when the seeded Gooaye row is absent (greenfield envs).
 */

import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const GOOAYE_KOL_ID = 'b7a958c4-f9f4-48e1-8dbf-a8966bf1484e';
const NVDA_TICKER = 'NVDA';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key);
}

async function probeNvdaPostCount(kolId: string): Promise<number | null> {
  const supabase = getSupabase();
  const { data: stock } = await supabase
    .from('stocks')
    .select('id')
    .eq('ticker', NVDA_TICKER)
    .maybeSingle();
  if (!stock?.id) return null;

  const { count, error } = await supabase
    .from('post_stocks')
    .select('post_id, posts!inner(kol_id)', { count: 'exact', head: true })
    .eq('stock_id', stock.id)
    .eq('posts.kol_id', kolId);
  if (error) throw new Error(`probeNvdaPostCount: ${error.message}`);
  return count ?? 0;
}

test.describe('KOL detail page consistency (Q3)', () => {
  test.skip(
    !process.env.NEXT_PUBLIC_SUPABASE_URL,
    'Requires NEXT_PUBLIC_SUPABASE_URL'
  );

  test('NVDA card count matches the SQL probe and win-rate ring is not "—"', async ({ page }) => {
    // Bail out early if the seeded KOL is missing (e.g. fresh local DB).
    const expectedCount = await probeNvdaPostCount(GOOAYE_KOL_ID);
    test.skip(expectedCount === null, 'NVDA stock row missing — skipping');
    test.skip((expectedCount ?? 0) === 0, 'No NVDA posts for the seeded KOL — skipping');

    await page.goto(`/kols/${GOOAYE_KOL_ID}`);
    await page.waitForLoadState('networkidle');

    // The KolStockSection header renders "共 N 篇文章" via a Badge.
    // Wait up to 30 s for it to appear; the limit=1000 fetch may take a moment.
    const nvdaHeader = page.locator('a', { hasText: NVDA_TICKER }).first();
    await expect(nvdaHeader).toBeVisible({ timeout: 30_000 });

    // Locate the badge sibling that contains the post count for the NVDA card.
    // The header layout is `<a>NVDA</a> — <span>NAME</span> <Badge>共 N 篇文章</Badge>`.
    const nvdaSection = nvdaHeader.locator('xpath=ancestor::div[contains(@class, "space-y-4")][1]');
    const countText = await nvdaSection
      .locator('text=/共\\s*\\d+\\s*篇文章/')
      .first()
      .textContent({ timeout: 30_000 });

    expect(countText, 'Per-stock NVDA card should show "共 N 篇文章"').toBeTruthy();
    const match = countText!.match(/(\d+)/);
    expect(match, 'Count text should contain a number').toBeTruthy();
    const renderedCount = parseInt(match![1], 10);

    expect(
      renderedCount,
      `NVDA card count (${renderedCount}) should match SQL probe (${expectedCount})`
    ).toBe(expectedCount);

    // Win-rate ring: poll until the value text is not the em-dash placeholder.
    // The ring renders inside the KolScorecard component; the value is in a
    // text node alongside "精準度". After the scorecard cache settles to
    // {status: 'ready'}, the ring shows a percentage or stays empty if there
    // is genuinely insufficient data — but never the literal "—".
    const ringContainer = page
      .locator('text=/精準度|hit rate|hitRate/i')
      .first()
      .locator('xpath=ancestor::div[1]');

    // Poll up to 30 s for the polling state to settle (3s refetch interval).
    await expect(async () => {
      const ringText = (await ringContainer.textContent({ timeout: 5_000 })) ?? '';
      expect(
        ringText,
        `Win-rate ring text should not be just "—" — got: ${JSON.stringify(ringText)}`
      ).not.toMatch(/^[\s—–\-—]+$/);
    }).toPass({ timeout: 30_000 });
  });
});
