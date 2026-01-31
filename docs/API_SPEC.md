# API Specification - Stock KOL Tracker Web

> **版本**: 1.0  
> **最後更新**: 2026-01-29  
> **狀態**: 規格定義（前後端 Agent 必須遵守）

---

## 一、概述

本文件定義 Stock KOL Tracker Web 應用的 API 契約。所有 API 實作必須符合此規格。

### 基本資訊

- **Base URL**: `/api`
- **認證方式**: Supabase Auth (Bearer Token)
- **內容類型**: `application/json`

### 通用回應格式

#### 成功回應

```typescript
interface SuccessResponse<T> {
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}
```

#### 錯誤回應

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}
```

### 通用錯誤碼

| 狀態碼 | 錯誤碼 | 說明 |
|--------|--------|------|
| 400 | VALIDATION_ERROR | 輸入驗證失敗 |
| 401 | UNAUTHORIZED | 未認證 |
| 403 | FORBIDDEN | 無權限 |
| 404 | NOT_FOUND | 資源不存在 |
| 409 | CONFLICT | 資源衝突 |
| 429 | RATE_LIMITED | 請求過於頻繁 |
| 500 | INTERNAL_ERROR | 伺服器錯誤 |

---

## 二、認證 API

### 2.1 註冊

由 Supabase Auth 處理，使用 `@supabase/auth-helpers-nextjs`。

### 2.2 登入

由 Supabase Auth 處理。

### 2.3 登出

由 Supabase Auth 處理。

### 2.4 取得當前用戶

```
GET /api/auth/me
```

**回應**：

```typescript
{
  data: {
    id: string;
    email: string;
    profile: Profile;
  }
}
```

---

## 三、KOL API

### 3.1 取得 KOL 列表

```
GET /api/kols
```

**Query 參數**：

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| q | string | ❌ | 搜尋關鍵字（名稱） |
| page | number | ❌ | 頁碼（預設 1） |
| limit | number | ❌ | 每頁筆數（預設 20，最大 100） |

**回應**：

```typescript
{
  data: KOL[];
  meta: {
    total: number;
    page: number;
    limit: number;
  }
}
```

### 3.2 取得單一 KOL

```
GET /api/kols/{id}
```

**回應**：

```typescript
{
  data: KOLWithStats
}
```

### 3.3 建立 KOL

```
POST /api/kols
```

**請求 Body**：

```typescript
{
  name: string;       // 必填，1-100 字元
  bio?: string;       // 選填，最多 500 字元
  social_link?: string; // 選填，有效 URL
}
```

**回應**：`201 Created`

```typescript
{
  data: KOL
}
```

**錯誤**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 400 | VALIDATION_ERROR | 名稱為空或超過長度 |
| 409 | DUPLICATE_NAME | 名稱已存在 |
| 403 | QUOTA_EXCEEDED | 免費用戶超過 5 個 KOL |

### 3.4 更新 KOL

```
PUT /api/kols/{id}
```

**請求 Body**：

```typescript
{
  name?: string;
  bio?: string;
  social_link?: string;
}
```

**回應**：

```typescript
{
  data: KOL
}
```

### 3.5 刪除 KOL

```
DELETE /api/kols/{id}
```

**回應**：`204 No Content`

**錯誤**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 409 | HAS_POSTS | KOL 有關聯的 Post，無法刪除 |

---

## 四、Stock API

### 4.1 取得 Stock 列表

```
GET /api/stocks
```

**Query 參數**：

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| q | string | ❌ | 搜尋關鍵字（ticker 或名稱） |
| page | number | ❌ | 頁碼 |
| limit | number | ❌ | 每頁筆數 |

**回應**：

```typescript
{
  data: StockWithStats[];
  meta: {
    total: number;
    page: number;
    limit: number;
  }
}
```

### 4.2 取得單一 Stock

```
GET /api/stocks/{ticker}
```

**回應**：

```typescript
{
  data: StockWithStats
}
```

### 4.3 建立/更新 Stock (Upsert)

```
PUT /api/stocks/{ticker}
```

**請求 Body**：

```typescript
{
  name?: string;
  exchange?: string;
}
```

**回應**：

```typescript
{
  data: Stock
}
```

### 4.4 刪除 Stock

```
DELETE /api/stocks/{ticker}
```

**回應**：`204 No Content`

---

## 五、Post API

### 5.1 取得 Post 列表

```
GET /api/posts
```

**Query 參數**：

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| status | string | ❌ | 'Draft' \| 'Published' |
| kol_id | string | ❌ | 篩選特定 KOL |
| stock_ticker | string | ❌ | 篩選特定 Stock |
| page | number | ❌ | 頁碼 |
| limit | number | ❌ | 每頁筆數 |

**回應**：

```typescript
{
  data: PostWithDetails[];
  meta: {
    total: number;
    page: number;
    limit: number;
  }
}
```

### 5.2 取得單一 Post

```
GET /api/posts/{id}
```

**回應**：

```typescript
{
  data: PostWithDetails & {
    price_changes: PriceChangeResult[];
  }
}
```

### 5.3 建立草稿

```
POST /api/posts
```

**請求 Body**：

```typescript
{
  content: string;  // 必填
}
```

**回應**：`201 Created`

```typescript
{
  data: Post
}
```

### 5.4 更新草稿

```
PUT /api/posts/{id}
```

**請求 Body**：

```typescript
{
  content?: string;
  kol_id?: string;
  stock_ticker?: string;
  sentiment?: 'Bullish' | 'Bearish' | 'Neutral';
  posted_at?: string;  // ISO 8601
  ai_analysis_json?: AIAnalysisResult;
}
```

**回應**：

```typescript
{
  data: Post
}
```

**錯誤**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 400 | ALREADY_PUBLISHED | 已發布的 Post 無法編輯 |

### 5.5 發布 Post

```
PUT /api/posts/{id}/publish
```

**請求 Body**：

```typescript
{
  kol_id: string;       // 必填
  stock_ticker: string; // 必填
  sentiment: 'Bullish' | 'Bearish' | 'Neutral'; // 必填
  posted_at: string;    // 必填，ISO 8601
}
```

**回應**：

```typescript
{
  data: Post
}
```

**錯誤**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 400 | MISSING_REQUIRED_FIELDS | 缺少必填欄位 |
| 400 | ALREADY_PUBLISHED | 已發布的 Post 無法再次發布 |
| 404 | KOL_NOT_FOUND | KOL 不存在 |
| 404 | STOCK_NOT_FOUND | Stock 不存在 |

### 5.6 刪除 Post

```
DELETE /api/posts/{id}
```

**回應**：`204 No Content`

---

## 六、AI 分析 API

### 6.1 分析文本

```
POST /api/ai/analyze
```

**請求 Body**：

```typescript
{
  content: string;  // 必填，要分析的文本
}
```

**回應**：

```typescript
{
  data: {
    sentiment: 'Bullish' | 'Bearish' | 'Neutral';
    tickers: string[];
    kolName: string | null;
    postedAtText: string | null;
    summary: string[];
    redundantText: string | null;
  }
}
```

**錯誤**：

| 狀態碼 | 錯誤碼 | 情境 |
|--------|--------|------|
| 403 | QUOTA_EXCEEDED | 免費用戶超過 10 次/月 |
| 503 | AI_SERVICE_ERROR | Gemini API 錯誤 |

### 6.2 取得用量

```
GET /api/ai/usage
```

**回應**：

```typescript
{
  data: {
    used: number;
    limit: number;
    resetAt: string;  // ISO 8601
  }
}
```

---

## 七、股價 API

### 7.1 取得股價資料

```
GET /api/stocks/{ticker}/prices
```

**Query 參數**：

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| startDate | string | ❌ | 開始日期 (YYYY-MM-DD) |
| endDate | string | ❌ | 結束日期 (YYYY-MM-DD) |

**回應**：

```typescript
{
  data: {
    ticker: string;
    prices: StockPrice[];
    lastUpdated: string;
  }
}
```

### 7.2 計算漲跌幅

```
GET /api/stocks/{ticker}/price-change
```

**Query 參數**：

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| fromDate | string | ✅ | 起始日期 |
| days | number | ❌ | 計算天數（預設 5） |

**回應**：

```typescript
{
  data: PriceChangeResult
}
```

---

## 八、勝率統計 API

### 8.1 取得 KOL 勝率

```
GET /api/kols/{id}/win-rate
```

**Query 參數**：

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| periods | string | ❌ | 計算週期，逗號分隔（預設 "5,30,90,365"） |
| stock_ticker | string | ❌ | 篩選特定 Stock |

**回應**：

```typescript
{
  data: {
    kol_id: string;
    overall: WinRateStats[];
    by_stock: {
      [ticker: string]: WinRateStats[];
    };
  }
}
```

### 8.2 取得 Stock 勝率

```
GET /api/stocks/{ticker}/win-rate
```

**Query 參數**：

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| periods | string | ❌ | 計算週期 |

**回應**：

```typescript
{
  data: {
    stock_ticker: string;
    overall: WinRateStats[];
  }
}
```

---

## 九、Rate Limiting

### 限制規則

| 用戶類型 | API | 限制 |
|----------|-----|------|
| Free | /api/ai/analyze | 10 次/月 |
| Free | 其他 API | 100 次/分鐘 |
| Pro | /api/ai/analyze | 無限制 |
| Pro | 其他 API | 1000 次/分鐘 |

### Rate Limit Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1706531200
```

---

## 十、Webhook API（未來擴充）

### 10.1 Stripe/LemonSqueezy Webhook

```
POST /api/webhooks/payment
```

處理付費方案變更。

---

## 十一、OpenAPI Schema

完整的 OpenAPI 3.0 Schema 請參見 `openapi.yaml`（Phase 1 建立）。

---

## 十二、修改記錄

| 版本 | 日期 | 修改內容 |
|------|------|----------|
| 1.0 | 2026-01-29 | 初始版本 |
