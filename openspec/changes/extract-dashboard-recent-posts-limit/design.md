## Context

專案有 `src/lib/constants/` 目錄（例如 `routes.ts`, `tiers.ts`）集中管理常數。Dashboard 相關常數目前散在各處，這個 change 是把第一個 magic number 歸位，建立「dashboard constants」模式，未來類似常數可沿用。

Stakeholder：未來維護者、產品（若日後要調整顯示數量）。

## Goals / Non-Goals

**Goals:**
- 移除 `dashboard/route.ts` 的硬編碼 `5`
- 建立 dashboard 相關常數的歸位
- 若前端也硬編碼，同步抽成常數（消除前後端同步改動的風險）

**Non-Goals:**
- 不改成環境變數或 feature flag（過度工程）
- 不把數字變成使用者可設定（UI preference，非本 change 範圍）
- 不處理其他 magic numbers

## Decisions

### D1. 常數檔案位置

**Chosen**：`src/lib/constants/dashboard.ts`（新檔）。

**Alternative considered**：放到現有的 `routes.ts` 或新增到 `tiers.ts`。拒絕理由：兩者語意不符。獨立檔 clean。

### D2. 常數命名

```ts
/**
 * Dashboard 首頁「最近動態」卡片顯示的 post 數。
 * 同時由 API route (`/api/dashboard`) 與前端 dashboard 頁面使用，
 * 確保兩邊顯示數量一致。
 */
export const DASHBOARD_RECENT_POSTS_LIMIT = 5;
```

### D3. 若前端硬編碼了 5，範圍擴充

若審閱發現前端 `src/app/(app)/dashboard/**` 也有硬編 5，在此 change 內一併改。若沒有，則僅改 route.ts。

### D4. 不做過度重構

不把所有 dashboard 相關數字（如「顯示幾個 KOL」「顯示幾檔股票」）一次全抽。只處理「最近 post 5 筆」這一個，其他若有類似需求，follow-up change。

## Risks / Trade-offs

- **[R1] 常數名過於具體，日後若被別處複用會變成 misnomer** → Mitigation：命名 `DASHBOARD_RECENT_POSTS_LIMIT` 已夠具體，他處若需類似常數自建即可
- **[R2] 增加一個常數檔的 import 成本** → Mitigation：常數本就該歸位，成本可忽略

## Migration Plan

1. 建立 `src/lib/constants/dashboard.ts`
2. 修改 `src/app/api/dashboard/route.ts` 引用常數
3. 審閱前端 dashboard 相關檔，若有硬編碼 5 同步改
4. `npm run type-check && npm test` 綠
5. 手動：啟 dev server 打開 dashboard 驗證顯示無變化（應仍顯示 5 筆）

**Rollback**：revert commit

## Open Questions

- 是否需要把這個常數放到 `openspec/specs/api-contracts/spec.md` 的 dashboard endpoint 描述？→ 不需要；常數是實作細節，spec 只需說「回傳最近 N 篇」
