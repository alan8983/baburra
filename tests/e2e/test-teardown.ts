/**
 * E2E 測試 Teardown 腳本
 *
 * 此腳本用於清理測試過程中產生的資料，確保測試環境乾淨。
 * 可以手動執行或在 CI/CD 流程中自動執行。
 *
 * 使用方法：
 *   npx tsx tests/e2e/test-teardown.ts
 *
 * 或設定環境變數後執行：
 *   NEXT_PUBLIC_SUPABASE_URL=xxx NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx npx tsx tests/e2e/test-teardown.ts
 */

import { createClient } from '@supabase/supabase-js';

// 測試資料標記（用於識別測試產生的資料）
const TEST_MARKER = 'E2E_TEST';
const TEST_KOL_NAME = 'E2E Test KOL';

async function cleanupTestData() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ 缺少 Supabase 環境變數：');
    console.error('   NEXT_PUBLIC_SUPABASE_URL');
    console.error('   NEXT_PUBLIC_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  console.log('🧹 開始清理測試資料...\n');

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // 1. 刪除測試產生的 Posts（透過關聯的 KOL 或內容標記）
    console.log('📝 清理測試產生的 Posts...');

    // 方法 1: 透過 KOL 名稱查找
    const { data: testKols } = await supabase.from('kols').select('id').eq('name', TEST_KOL_NAME);

    if (testKols && testKols.length > 0) {
      const kolIds = testKols.map((k) => k.id);

      // 查找這些 KOL 的 posts
      const { data: testPosts } = await supabase.from('posts').select('id').in('kol_id', kolIds);

      if (testPosts && testPosts.length > 0) {
        // 刪除相關的 post_stocks 記錄
        const postIds = testPosts.map((p) => p.id);
        await supabase.from('post_stocks').delete().in('post_id', postIds);

        // 刪除 post_arguments 記錄（如果存在）
        await supabase.from('post_arguments').delete().in('post_id', postIds);

        // 刪除 posts
        const { error: postsError } = await supabase.from('posts').delete().in('id', postIds);

        if (postsError) {
          console.error('  ⚠️  刪除 Posts 時發生錯誤:', postsError.message);
        } else {
          console.log(`  ✅ 已刪除 ${testPosts.length} 筆 Posts`);
        }
      }
    }

    // 方法 2: 透過內容標記查找（如果內容包含測試標記）
    const { data: markedPosts } = await supabase
      .from('posts')
      .select('id')
      .like('content', `%${TEST_MARKER}%`);

    if (markedPosts && markedPosts.length > 0) {
      const markedPostIds = markedPosts.map((p) => p.id);

      await supabase.from('post_stocks').delete().in('post_id', markedPostIds);
      await supabase.from('post_arguments').delete().in('post_id', markedPostIds);

      const { error: markedError } = await supabase.from('posts').delete().in('id', markedPostIds);

      if (!markedError) {
        console.log(`  ✅ 已刪除 ${markedPosts.length} 筆標記的 Posts`);
      }
    }

    // 2. 刪除測試產生的 Drafts
    console.log('\n📄 清理測試產生的 Drafts...');

    // 透過 KOL 關聯查找
    if (testKols && testKols.length > 0) {
      const kolIds = testKols.map((k) => k.id);

      const { data: testDrafts } = await supabase.from('drafts').select('id').in('kol_id', kolIds);

      if (testDrafts && testDrafts.length > 0) {
        const draftIds = testDrafts.map((d) => d.id);

        // 刪除相關的 draft_stocks 記錄
        await supabase.from('draft_stocks').delete().in('draft_id', draftIds);

        // 刪除 drafts
        const { error: draftsError } = await supabase.from('drafts').delete().in('id', draftIds);

        if (draftsError) {
          console.error('  ⚠️  刪除 Drafts 時發生錯誤:', draftsError.message);
        } else {
          console.log(`  ✅ 已刪除 ${testDrafts.length} 筆 Drafts`);
        }
      }
    }

    // 透過內容標記查找
    const { data: markedDrafts } = await supabase
      .from('drafts')
      .select('id')
      .like('content', `%${TEST_MARKER}%`);

    if (markedDrafts && markedDrafts.length > 0) {
      const markedDraftIds = markedDrafts.map((d) => d.id);

      await supabase.from('draft_stocks').delete().in('draft_id', markedDraftIds);

      const { error: markedDraftError } = await supabase
        .from('drafts')
        .delete()
        .in('id', markedDraftIds);

      if (!markedDraftError) {
        console.log(`  ✅ 已刪除 ${markedDrafts.length} 筆標記的 Drafts`);
      }
    }

    // 3. 可選：刪除測試 KOL（如果沒有其他資料關聯）
    // 注意：這可能會影響其他測試，所以預設不執行
    // 如果需要完全清理，可以取消註解以下代碼
    /*
    console.log('\n👤 清理測試 KOL...');
    if (testKols && testKols.length > 0) {
      const kolIds = testKols.map((k) => k.id);
      
      // 檢查是否還有其他 posts 或 drafts 關聯
      const { data: remainingPosts } = await supabase
        .from('posts')
        .select('id')
        .in('kol_id', kolIds)
        .limit(1);
      
      const { data: remainingDrafts } = await supabase
        .from('drafts')
        .select('id')
        .in('kol_id', kolIds)
        .limit(1);
      
      if (!remainingPosts?.length && !remainingDrafts?.length) {
        const { error: kolsError } = await supabase
          .from('kols')
          .delete()
          .in('id', kolIds);
        
        if (kolsError) {
          console.error('  ⚠️  刪除 KOLs 時發生錯誤:', kolsError.message);
        } else {
          console.log(`  ✅ 已刪除 ${testKols.length} 筆測試 KOLs`);
        }
      } else {
        console.log('  ℹ️  跳過刪除 KOL（仍有其他資料關聯）');
      }
    }
    */

    console.log('\n✨ 清理完成！');
  } catch (error) {
    console.error('\n❌ 清理過程中發生錯誤:', error);
    process.exit(1);
  }
}

// 執行清理
if (require.main === module) {
  cleanupTestData()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('清理失敗:', error);
      process.exit(1);
    });
}

export { cleanupTestData };
