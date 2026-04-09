# Invariants - Baburra.io

> **版本**: 1.0  
> **最後更新**: 2026-01-29  
> **狀態**: 規格定義（所有 Agent 必須驗證）

---

## 一、概述

本文件定義 Baburra.io 應用的不變量（Invariants）。不變量是系統中必須始終為真的規則，違反不變量會導致資料不一致或業務邏輯錯誤。

**所有 Agent 在實作功能時必須**：

1. 檢查相關的不變量
2. 在程式碼中實作驗證邏輯
3. 撰寫測試確保不變量被遵守

---

## 二、資料不變量

### I1: Post 發布必須有完整參照

**描述**：已發布的 Post 必須關聯有效的 KOL 和 Stock。

```typescript
// domain/validators/post.invariants.ts

const I1_publishedPostMustHaveValidReferences = (post: Post): boolean => {
  if (post.status === 'Published') {
    return post.kol_id !== null && post.stock_ticker !== null;
  }
  return true; // Draft 不受此限制
};
```

**驗證時機**：

- Post 狀態從 `Draft` 變為 `Published` 時
- API Route: `PUT /api/posts/{id}/publish`

**違反處理**：

- 回傳 400 錯誤，錯誤碼 `MISSING_REQUIRED_FIELDS`

---

### I2: Sentiment 值域限制

**描述**：sentiment 只能是三種值之一。

```typescript
const VALID_SENTIMENTS = ['Bullish', 'Bearish', 'Neutral'] as const;
type Sentiment = (typeof VALID_SENTIMENTS)[number];

const I2_sentimentMustBeValid = (sentiment: string | null): boolean => {
  if (sentiment === null) return true; // Draft 可為 null
  return VALID_SENTIMENTS.includes(sentiment as Sentiment);
};
```

**驗證時機**：

- Post 建立/更新時
- 資料庫層使用 CHECK 約束

**SQL 約束**：

```sql
CHECK (sentiment IN ('Bullish', 'Bearish', 'Neutral'))
```

---

### I3: 發文時間不能晚於建檔時間

**描述**：KOL 的發文時間 (`posted_at`) 不能晚於記錄建檔時間 (`created_at`)。

```typescript
const I3_postedAtMustBeBeforeCreatedAt = (post: Post): boolean => {
  if (post.posted_at === null) return true;
  return new Date(post.posted_at) <= new Date(post.created_at);
};
```

**驗證時機**：

- Post 建立/更新時
- 特別注意時區處理

---

### I4: KOL 名稱用戶內唯一

**描述**：同一用戶的 KOL 名稱不可重複。

```typescript
const I4_kolNameMustBeUniquePerUser = async (
  userId: string,
  kolName: string,
  excludeId?: string // 更新時排除自己
): Promise<boolean> => {
  const existing = await supabase
    .from('kols')
    .select('id')
    .eq('user_id', userId)
    .eq('name', kolName)
    .neq('id', excludeId ?? '')
    .single();

  return existing.data === null;
};
```

**驗證時機**：

- KOL 建立/更新時
- 資料庫層使用 UNIQUE 約束

**SQL 約束**：

```sql
UNIQUE(user_id, name)
```

---

### I5: 股價快取有效期

**描述**：股價快取 7 天內有效，超過需重新抓取。

```typescript
const CACHE_VALIDITY_DAYS = 7;

const I5_stockPriceCacheIsValid = (lastUpdated: Date): boolean => {
  const now = new Date();
  const diffDays = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= CACHE_VALIDITY_DAYS;
};
```

**驗證時機**：

- 查詢股價時
- API Route: `GET /api/stocks/{ticker}/prices`

---

### I6: Status 狀態轉換不可逆

**描述**：Post 狀態從 `Draft` 變為 `Published` 後不可逆。

```typescript
const I6_statusTransitionIsValid = (currentStatus: PostStatus, newStatus: PostStatus): boolean => {
  if (currentStatus === 'Published' && newStatus === 'Draft') {
    return false; // 不可逆
  }
  return true;
};
```

**驗證時機**：

- Post 更新時
- 可考慮使用資料庫 Trigger

**SQL Trigger**：

```sql
CREATE OR REPLACE FUNCTION prevent_unpublish()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'Published' AND NEW.status = 'Draft' THEN
    RAISE EXCEPTION 'Cannot unpublish a published post';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_prevent_unpublish
BEFORE UPDATE ON posts
FOR EACH ROW EXECUTE FUNCTION prevent_unpublish();
```

---

## 三、業務規則不變量

### B1: 免費用戶 AI 分析配額

**描述**：免費用戶每月最多 10 次 AI 分析。

```typescript
const FREE_AI_QUOTA = 10;

const B1_freeUserAIQuota = async (userId: string): Promise<boolean> => {
  const profile = await getProfile(userId);

  if (profile.plan === 'pro') {
    return true; // Pro 用戶無限制
  }

  return profile.ai_usage_count < FREE_AI_QUOTA;
};
```

**驗證時機**：

- AI 分析 API 調用前
- API Route: `POST /api/ai/analyze`

**違反處理**：

- 回傳 403 錯誤，錯誤碼 `QUOTA_EXCEEDED`
- 提示用戶升級方案

---

### B2: 免費用戶 KOL 追蹤限制

**描述**：免費用戶最多追蹤 5 位 KOL。

```typescript
const FREE_KOL_LIMIT = 5;

const B2_freeUserKOLLimit = async (userId: string): Promise<boolean> => {
  const profile = await getProfile(userId);

  if (profile.plan === 'pro') {
    return true;
  }

  const kolCount = await supabase
    .from('kols')
    .select('id', { count: 'exact' })
    .eq('user_id', userId);

  return (kolCount.count ?? 0) < FREE_KOL_LIMIT;
};
```

**驗證時機**：

- KOL 建立時
- API Route: `POST /api/kols`

**違反處理**：

- 回傳 403 錯誤，錯誤碼 `QUOTA_EXCEEDED`

---

### B3: 用戶資料隔離

**描述**：用戶只能存取自己的資料。

```typescript
const B3_userCanOnlyAccessOwnData = (resourceUserId: string, currentUserId: string): boolean => {
  return resourceUserId === currentUserId;
};
```

**驗證時機**：

- 所有 CRUD 操作
- 主要透過 Supabase RLS 實現

**SQL RLS Policy**：

```sql
CREATE POLICY "Users can only access own data" ON kols
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access own data" ON stocks
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access own data" ON posts
  FOR ALL USING (auth.uid() = user_id);
```

---

### B4: AI 分析結果必須包含 Sentiment

**描述**：AI 分析完成後，結果必須包含有效的 sentiment。

```typescript
const B4_aiAnalysisMustHaveSentiment = (result: AIAnalysisResult): boolean => {
  return result.sentiment !== null && VALID_SENTIMENTS.includes(result.sentiment);
};
```

**驗證時機**：

- AI 分析回應處理時
- 如果 AI 回傳無效結果，預設為 'Neutral'

---

## 四、勝率計算不變量

### W1: 勝率門檻（動態 1σ）

**描述**：勝率判定使用 **per-(ticker, period, postedAt)** 的 1 個標準差（1σ）作為動態門檻，由 `volatility.calculator.ts` 計算，並由 `win-rate.calculator.ts` + `win-rate.service.ts` 統一分類。先前的固定 ±2% 規則為示例，已被取代。

**核心規則：**

- σ = N 日重疊報酬序列（`r_i = p[i+N]/p[i] - 1`）的樣本標準差。**不**使用 √T 縮放。
- Lookback：5d/30d → 1 年；90d → 2 年；365d → 3 年。
- **無前視偏差（no look-ahead）**：σ 僅使用 `date < postedAt` 的價格列。
- **IPO fallback**：若標的歷史不足 lookback，改用同市場指數（TW → `^TWII`，US/CRYPTO → `SPY`）。`HK` 市場不支援，會丟出 `UnsupportedMarketError`。
- 結果以記憶體 LRU 快取，key = `(ticker, periodDays, asOfDate-YYYY-MM-DD)`。

**分類（Bullish: sentiment > 0, Bearish: sentiment < 0, Neutral: sentiment === 0）：**

| Bullish 報酬 | Bearish 報酬 | 結果 |
| --- | --- | --- |
| `> +1σ` | `< -1σ` | `win` |
| `[-1σ, +1σ]` | `[-1σ, +1σ]` | `noise` |
| `< -1σ` | `> +1σ` | `lose` |

`Neutral` 或 `priceChange === null` → `excluded`。

**勝率公式：** `winRate = winCount / (winCount + loseCount)`，分母為 0 時為 `null`。Noise 不計入分母。

**唯一實作位置：** `src/domain/calculators/win-rate.calculator.ts` + `src/domain/services/win-rate.service.ts`。所有 consumer surface（KOL scorecard、dashboard pulse、KOL leaderboard、stock detail）皆透過 `/api/kols/[id]/win-rate`、`/api/stocks/[ticker]/win-rate` 或 `/api/dashboard` 取得勝率，**不得**內聯重新實作分類邏輯。

---

### W2: 漲跌幅計算基準

**描述**：漲跌幅以 `posted_at` 當天收盤價為基準。

```typescript
const W2_calculatePriceChange = async (
  ticker: string,
  postedAt: Date,
  days: number
): Promise<PriceChangeResult | null> => {
  // 1. 找到 posted_at 當天或之後最近的交易日
  const startPrice = await findClosestTradingDay(ticker, postedAt, 'forward');

  // 2. 找到 N 天後的收盤價
  const endDate = addDays(postedAt, days);
  const endPrice = await findClosestTradingDay(ticker, endDate, 'backward');

  if (!startPrice || !endPrice) {
    return null; // 資料不足
  }

  const change = endPrice.close - startPrice.close;
  const changePercent = change / startPrice.close;

  return {
    days,
    startDate: startPrice.date,
    endDate: endPrice.date,
    startPrice: startPrice.close,
    endPrice: endPrice.close,
    change,
    changePercent,
  };
};
```

**注意**：

- 需處理非交易日（順延到最近交易日）
- 需處理資料不足的情況

---

## 五、不變量驗證器

### 統一驗證介面

```typescript
// domain/validators/index.ts

import { Post, KOL, Stock, Profile } from '../models';

export const PostInvariants = {
  I1_publishedPostMustHaveValidReferences,
  I2_sentimentMustBeValid,
  I3_postedAtMustBeBeforeCreatedAt,
  I6_statusTransitionIsValid,
};

export const KOLInvariants = {
  I4_kolNameMustBeUniquePerUser,
};

export const BusinessInvariants = {
  B1_freeUserAIQuota,
  B2_freeUserKOLLimit,
  B3_userCanOnlyAccessOwnData,
  B4_aiAnalysisMustHaveSentiment,
};

export const CacheInvariants = {
  I5_stockPriceCacheIsValid,
};

export const WinRateInvariants = {
  // W1 is now implemented by classifyOutcome + getVolatilityThreshold
  // (see src/domain/calculators/{win-rate,volatility}.calculator.ts).
  W2_calculatePriceChange,
};

// 驗證 Post（建立/更新時）
export const validatePost = async (
  post: Post,
  previousStatus?: PostStatus
): Promise<ValidationResult> => {
  const errors: string[] = [];

  if (!PostInvariants.I1_publishedPostMustHaveValidReferences(post)) {
    errors.push('Published post must have kol_id and stock_ticker');
  }

  if (!PostInvariants.I2_sentimentMustBeValid(post.sentiment)) {
    errors.push('Invalid sentiment value');
  }

  if (!PostInvariants.I3_postedAtMustBeBeforeCreatedAt(post)) {
    errors.push('posted_at cannot be after created_at');
  }

  if (previousStatus && !PostInvariants.I6_statusTransitionIsValid(previousStatus, post.status)) {
    errors.push('Cannot unpublish a published post');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
```

---

## 六、測試要求

每個不變量必須有對應的測試：

```typescript
// __tests__/invariants/post.invariants.test.ts

describe('Post Invariants', () => {
  describe('I1: publishedPostMustHaveValidReferences', () => {
    it('should return true when draft has no references', () => {
      const post = { status: 'Draft', kol_id: null, stock_ticker: null };
      expect(I1_publishedPostMustHaveValidReferences(post)).toBe(true);
    });

    it('should return false when published post has no kol_id', () => {
      const post = { status: 'Published', kol_id: null, stock_ticker: 'AAPL' };
      expect(I1_publishedPostMustHaveValidReferences(post)).toBe(false);
    });

    it('should return true when published post has all references', () => {
      const post = { status: 'Published', kol_id: 'xxx', stock_ticker: 'AAPL' };
      expect(I1_publishedPostMustHaveValidReferences(post)).toBe(true);
    });
  });

  // ... 更多測試
});
```

---

## 七、不變量總覽表

| ID  | 類別 | 規則                       | 驗證時機  | 實作層級     |
| --- | ---- | -------------------------- | --------- | ------------ |
| I1  | 資料 | 發布的Post必須有KOL和Stock | 發布時    | Service + DB |
| I2  | 資料 | sentiment值域限制          | 建立/更新 | DB CHECK     |
| I3  | 資料 | posted_at ≤ created_at     | 建立/更新 | Service      |
| I4  | 資料 | KOL名稱用戶內唯一          | 建立/更新 | DB UNIQUE    |
| I5  | 快取 | 股價快取7天有效            | 查詢時    | Service      |
| I6  | 資料 | 狀態轉換不可逆             | 更新時    | DB Trigger   |
| B1  | 業務 | 免費用戶AI ≤ 10次/月       | AI調用    | API Route    |
| B2  | 業務 | 免費用戶KOL ≤ 5位          | KOL建立   | API Route    |
| B3  | 業務 | 用戶資料隔離               | 所有CRUD  | RLS          |
| B4  | 業務 | AI結果必須有sentiment      | AI回應    | Service      |
| W1  | 勝率 | 動態 1σ 門檻判定（無前視）  | 計算時    | Calculator + Service |
| W2  | 勝率 | 以posted_at為基準          | 計算時    | Calculator   |

---

## 八、修改記錄

| 版本 | 日期       | 修改內容 |
| ---- | ---------- | -------- |
| 1.0  | 2026-01-29 | 初始版本 |
