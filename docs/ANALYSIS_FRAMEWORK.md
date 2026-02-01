# 投資分析框架（論點類別定義）

本文件定義 Phase 8 論點提取所使用的「特定框架」，供 `argument_categories` seed、AI Prompt 與 UI 顯示使用。

---

## 階層結構（兩層）

- **第一層**：分析維度（量化 / 質化 / 催化劑）
- **第二層**：具體論點類別（共 7 個）

```
量化 (QUANTITATIVE)
├── FINANCIALS    財務體質
├── MOMENTUM      動能類
└── VALUATION     估值

質化 (QUALITATIVE)
├── MARKET_SIZE          市場規模
├── MOAT                 護城河
└── OPERATIONAL_QUALITY  營運品質

催化劑 (EVENT_DRIVEN)
└── CATALYST     催化劑
```

---

## 第一層：分析維度

| Code | 顯示名稱 | 說明 |
|------|----------|------|
| `QUANTITATIVE` | 量化 | 財務數據、技術指標、估值倍數等可量化分析 |
| `QUALITATIVE` | 質化 | 市場、競爭優勢、營運品質等質化分析 |
| `EVENT_DRIVEN` | 催化劑 | 特定時間點事件對股價的驅動 |

---

## 第二層：論點類別

### 量化 (parent: QUANTITATIVE)

| Code | 顯示名稱 | 說明 | 歸類要點 |
|------|----------|------|----------|
| `FINANCIALS` | 財務體質 | 公司的成長率、利潤率等資訊 | 屬於公司財報內部資訊，歸為財務類 |
| `MOMENTUM` | 動能類 | 價格的成長與交易量 | 屬於技術分析的內容 |
| `VALUATION` | 估值 | 股價與交易乘數（如 PE 倍數、EV/EBITDA 倍數等） | 量化第三類 |

### 質化 (parent: QUALITATIVE)

| Code | 顯示名稱 | 說明 | 歸類要點 |
|------|----------|------|----------|
| `MARKET_SIZE` | 市場規模 | 公司所在賽道、可觸及市場（TAM）規模、市場 CAGR | 公司外部成長；KOL 提到賽道前景時，評估市場規模與年複合成長率 |
| `MOAT` | 護城河 | 技術、規模、許可、專利等競爭優勢 | 公司本身具有的特別競爭優勢 |
| `OPERATIONAL_QUALITY` | 營運品質 | 與同業比較的利潤率，從護城河或商業模式出發 | 重點在「為何 A 公司利潤率優於 B 公司」（如台積電 vs Intel），非成長趨勢 |

### 催化劑 (parent: EVENT_DRIVEN)

| Code | 顯示名稱 | 說明 | 歸類要點 |
|------|----------|------|----------|
| `CATALYST` | 催化劑 | 交易時間點與動能的催化；特定時間點事件 | 財報、聯準會（Fed）動向、FDA 審批、生技公司特定事件等可能驅動股價 |

---

## Seed 資料順序建議（argument_categories）

撰寫 migration / seed 時建議順序（`sort_order` 可依此）：

1. QUANTITATIVE（parent_id = null）
2. FINANCIALS（parent = QUANTITATIVE）
3. MOMENTUM（parent = QUANTITATIVE）
4. VALUATION（parent = QUANTITATIVE）
5. QUALITATIVE（parent_id = null）
6. MARKET_SIZE（parent = QUALITATIVE）
7. MOAT（parent = QUALITATIVE）
8. OPERATIONAL_QUALITY（parent = QUALITATIVE）
9. EVENT_DRIVEN（parent_id = null）
10. CATALYST（parent = EVENT_DRIVEN）

---

## Phase 8 使用處

- **8.8 匯入論點類別**：依本框架寫入 `argument_categories` seed
- **8.9 論點提取 Prompt**：將上述類別 code、name、description 填入 `{frameworkCategories}`
- **UI**：標的論點彙整、文章論點檢視可依兩層結構分組顯示
