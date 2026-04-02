# URL 文章抓取模塊 - Output Spec

> **版本**: 1.1
> **適用於**: Release 01 (Twitter/X) & Release 02 (Facebook, Threads, YouTube)
> **目標**: 確保輸出格式符合 Phase 8 AI 分析需求

---

## 一、概述

本文件定義 URL 文章抓取模塊的輸出規格，確保抓取的文章內容能夠直接使用於：

- Phase 8 情緒分析 (`analyzeSentiment`)
- Phase 8 論點提取 (`extractArguments`)
- 建立 Draft 草稿
- 建立 Post 文章

---

## 二、Output Spec

### 2.1 成功回應格式

```typescript
interface UrlFetchResult {
  // ========== 必填欄位 ==========

  /**
   * 文章主文內容（純文字）
   *
   * 格式要求：
   * - 類型：string（純文字，不包含 HTML/Markdown 標籤）
   * - 長度：最少 10 字元，最多 10,000 字元
   * - 格式：移除所有 HTML 標籤、Markdown 語法，保留純文字內容
   * - 換行：保留換行符號 \n（用於段落分隔）
   * - 清理：移除多餘空白、廣告內容、導覽列等無關文字
   *
   * 範例：
   * "台積電（TSMC）最新財報顯示，第三季營收創歷史新高。
   *
   * 主要成長動能來自 AI 晶片需求強勁，預期第四季將持續成長。"
   */
  content: string;

  /**
   * 原始網址
   * - 用於重複檢測和來源追蹤
   * - 必須是完整的 URL（包含 protocol）
   */
  sourceUrl: string;

  /**
   * 來源平台
   * - 'twitter': Twitter/X 平台
   * - 'facebook': Facebook 平台
   * - 'threads': Meta Threads 平台
   * - 'youtube': YouTube 影片（逐字稿擷取）
   * - 'youtube_short': YouTube 短影片（<=60秒，平價轉錄）
   * - 'manual': 其他來源或手動輸入
   */
  sourcePlatform: 'twitter' | 'facebook' | 'threads' | 'youtube' | 'youtube_short' | 'manual';

  // ========== 選填欄位 ==========

  /**
   * 文章標題（如果有的話）
   * - 如果來源沒有標題，可為 null
   * - 長度限制：最多 200 字元
   */
  title: string | null;

  /**
   * 圖片 URL 陣列
   * - 從文章中提取的圖片連結
   * - 必須是完整的 URL（可直接存取）
   * - 空陣列表示沒有圖片
   */
  images: string[];

  /**
   * 發文時間
   * - ISO 8601 格式字串或 Date 物件
   * - 如果無法取得，可為 null
   * - 用於記錄 KOL 實際發文時間
   */
  postedAt: string | Date | null;

  /**
   * KOL 名稱（如果能夠識別）
   * - 從文章或頁面中提取的作者名稱
   * - 如果無法識別，可為 null
   * - 用於後續自動匹配 KOL
   */
  kolName: string | null;

  /**
   * KOL 頭像 URL（如果能夠取得）
   * - 如果無法取得，可為 null
   */
  kolAvatarUrl: string | null;
}
```

### 2.2 錯誤回應格式

```typescript
interface UrlFetchError {
  /**
   * 錯誤類型
   */
  error: {
    /**
     * 錯誤代碼
     * - 'INVALID_URL': 無效的 URL
     * - 'FETCH_FAILED': 無法取得網頁內容
     * - 'CONTENT_TOO_SHORT': 內容過短（少於 10 字元）
     * - 'CONTENT_TOO_LONG': 內容過長（超過 10,000 字元）
     * - 'UNSUPPORTED_PLATFORM': 不支援的平台
     * - 'RATE_LIMITED': 請求過於頻繁
     * - 'PARSE_ERROR': 解析錯誤
     */
    code:
      | 'INVALID_URL'
      | 'FETCH_FAILED'
      | 'CONTENT_TOO_SHORT'
      | 'CONTENT_TOO_LONG'
      | 'UNSUPPORTED_PLATFORM'
      | 'RATE_LIMITED'
      | 'PARSE_ERROR';

    /**
     * 錯誤訊息（人類可讀）
     */
    message: string;

    /**
     * 詳細資訊（可選）
     */
    details?: Record<string, any>;
  };
}
```

---

## 三、Content 格式規範

### 3.1 文字清理規則

1. **移除 HTML 標籤**
   - 移除所有 `<tag>` 標籤
   - 保留標籤內的文字內容
   - 範例：`<p>這是內容</p>` → `這是內容`

2. **移除 Markdown 語法**
   - 移除 `#`、`**`、`*`、`[]()` 等 Markdown 標記
   - 保留純文字內容
   - 範例：`**粗體**` → `粗體`

3. **保留換行**
   - 保留段落之間的換行符號 `\n`
   - 移除多餘的連續換行（超過 2 個換行合併為 2 個）

4. **移除無關內容**
   - 移除廣告文字
   - 移除導覽列、頁尾等非文章內容
   - 移除「分享」、「按讚」等社交媒體按鈕文字

5. **清理空白**
   - 移除行首行尾空白
   - 將連續空白字元合併為單一空白
   - 保留段落之間的適當間距

### 3.2 Content 長度驗證

```typescript
function validateContent(content: string): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Content must be a non-empty string' };
  }

  const trimmed = content.trim();

  if (trimmed.length < 10) {
    return {
      valid: false,
      error: `Content too short: ${trimmed.length} characters (minimum: 10)`,
    };
  }

  if (trimmed.length > 10000) {
    return {
      valid: false,
      error: `Content too long: ${trimmed.length} characters (maximum: 10000)`,
    };
  }

  return { valid: true };
}
```

### 3.3 Content 範例

**✅ 正確格式**：

```
台積電（TSMC）最新財報顯示，第三季營收創歷史新高。

主要成長動能來自 AI 晶片需求強勁，預期第四季將持續成長。公司預估全年營收將較去年成長 20% 以上。

從估值角度來看，目前本益比約 18 倍，相較於同業仍屬合理範圍。
```

**❌ 錯誤格式**：

```
<article>
  <h1>台積電財報</h1>
  <p>第三季營收創新高</p>
</article>
```

（包含 HTML 標籤）

```
**台積電**財報顯示[連結](https://example.com)
```

（包含 Markdown 語法）

```
台積電
```

（內容過短，少於 10 字元）

---

## 四、與 Phase 8 的整合

### 4.1 直接使用於 AI 分析

抓取模塊的 `content` 輸出可以直接傳入 Phase 8 的 AI 分析函數：

```typescript
// 情緒分析
const sentimentResult = await analyzeSentiment(fetchResult.content);

// 論點提取
const argumentsResult = await extractArguments(fetchResult.content, stock.ticker, stock.name);
```

### 4.2 建立 Draft

```typescript
const draft = await createDraft({
  content: fetchResult.content, // ✅ 直接使用
  sourceUrl: fetchResult.sourceUrl, // ✅ 記錄來源
  images: fetchResult.images, // ✅ 圖片陣列
  postedAt: fetchResult.postedAt, // ✅ 發文時間
  kolNameInput: fetchResult.kolName, // ✅ 可選：KOL 名稱
});
```

### 4.3 建立 Post

```typescript
const post = await createPost({
  content: fetchResult.content, // ✅ 直接使用
  sourceUrl: fetchResult.sourceUrl, // ✅ 記錄來源
  sourcePlatform: fetchResult.sourcePlatform, // ✅ 平台類型
  images: fetchResult.images, // ✅ 圖片陣列
  postedAt: fetchResult.postedAt, // ✅ 發文時間
  title: fetchResult.title, // ✅ 標題（可選）
  // ... 其他必填欄位
});
```

---

## 五、實作建議

### 5.1 API 端點設計

```typescript
// POST /api/fetch-url
interface FetchUrlRequest {
  url: string;
}

interface FetchUrlResponse {
  data: UrlFetchResult;
}
```

### 5.2 錯誤處理

```typescript
// 範例錯誤處理
try {
  const result = await fetchUrlContent(url);

  // 驗證 content
  const validation = validateContent(result.content);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  return { data: result };
} catch (error) {
  if (error.code === 'FETCH_FAILED') {
    return NextResponse.json(
      { error: { code: 'FETCH_FAILED', message: '無法取得網頁內容' } },
      { status: 400 }
    );
  }
  // ... 其他錯誤處理
}
```

### 5.3 平台特定處理

```typescript
// Twitter/X 平台（Release 01 — 已實作）
// 使用免費 oEmbed API (https://publish.twitter.com/oembed)
// 限制：僅提取文字與作者名稱，無圖片/時間/頭像；不支援討論串與長文 Articles
function parseTwitter(url: string): UrlFetchResult {
  // 呼叫 oEmbed API 取得 HTML
  // 從 <p> 標籤提取文字
  // 移除 t.co / pic.twitter.com 短網址
  // 解碼 HTML entities
}

// Facebook 平台（Release 02 — stub 已存在）
function parseFacebook(url: string, html: string): UrlFetchResult {
  // 提取貼文內容（HTML + JSON-LD + Open Graph 解析）
  // 移除 Facebook 特定元素
  // 提取圖片
  // 提取發文時間
}

// Threads 平台（Release 02 — stub 已存在）
function parseThreads(url: string, html: string): UrlFetchResult {
  // HTML 解析提取內容
  // 提取圖片、KOL 名稱、頭像、發文時間
}

// YouTube 平台（Release 02 — 待實作）
function parseYouTube(url: string): UrlFetchResult {
  // 1. 從 URL 提取 video ID
  // 2. 擷取影片逐字稿（Transcript）
  // 3. 將逐字稿作為 content 回傳
  // 4. 提取頻道名稱作為 kolName
  // 注意：content 可能較長，需注意 10,000 字元上限
}
```

---

## 六、測試案例

### 6.1 成功案例

```typescript
// 輸入
const url = 'https://twitter.com/user/status/1234567890';

// 預期輸出
{
  content: "台積電最新財報顯示強勁成長，主要受惠於 AI 晶片需求。預期未來幾個季度將持續成長動能。",
  sourceUrl: "https://twitter.com/user/status/1234567890",
  sourcePlatform: "twitter",
  title: null,
  images: ["https://pbs.twimg.com/media/xxx.jpg"],
  postedAt: "2026-02-05T10:30:00Z",
  kolName: "投資達人",
  kolAvatarUrl: "https://pbs.twimg.com/profile_images/xxx.jpg"
}
```

### 6.2 YouTube 成功案例

```typescript
// 輸入
const url = 'https://www.youtube.com/watch?v=abcdefg1234';

// 預期輸出
{
  content: "大家好，今天來分析台積電最新的季度財報。從營收數據來看，AI 相關業務持續成長...\n\n我認為目前的估值仍然合理，建議長期持有。",
  sourceUrl: "https://www.youtube.com/watch?v=abcdefg1234",
  sourcePlatform: "youtube",
  title: "台積電 Q3 財報深度分析｜AI 晶片需求爆發",
  images: [],
  postedAt: "2026-01-20T08:00:00Z",
  kolName: "投資頻道名稱",
  kolAvatarUrl: null
}
```

> **注意**: YouTube 逐字稿可能很長，超過 10,000 字元時需截斷或摘要處理。

### 6.3 錯誤案例

```typescript
// 內容過短
{
  error: {
    code: "CONTENT_TOO_SHORT",
    message: "Content too short: 5 characters (minimum: 10)"
  }
}

// 無效 URL
{
  error: {
    code: "INVALID_URL",
    message: "Invalid URL format"
  }
}
```

---

## 七、檢查清單

在實作 URL 抓取模塊時，請確認：

- [ ] `content` 是純文字格式（無 HTML/Markdown）
- [ ] `content` 長度在 10-10,000 字元之間
- [ ] `content` 保留適當的換行符號
- [ ] `sourceUrl` 是完整的 URL
- [ ] `sourcePlatform` 正確識別平台類型（twitter / facebook / threads / youtube / youtube_short / manual）
- [ ] `images` 陣列包含完整的圖片 URL
- [ ] `postedAt` 是有效的日期格式
- [ ] 錯誤情況都有適當的錯誤代碼和訊息
- [ ] 輸出可以直接用於 `analyzeSentiment()` 和 `extractArguments()`
- [ ] 輸出可以直接用於 `createDraft()` 和 `createPost()`

---

## 八、修改記錄

| 版本 | 日期       | 修改內容                                                                                                           |
| ---- | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| 1.0  | 2026-02-05 | 初始版本 - 定義 URL 抓取模塊 Output Spec                                                                           |
| 1.1  | 2026-02-18 | 新增 Threads、YouTube 平台至 sourcePlatform；補充各平台解析說明與 Twitter oEmbed 限制；新增 YouTube 逐字稿測試案例 |
| 1.2  | 2026-04-02 | 新增 `youtube_short` 來源平台值，用於 YouTube 短影片（<=60秒）的獨立追蹤與平價計費 |
