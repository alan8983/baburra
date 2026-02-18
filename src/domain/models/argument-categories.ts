/**
 * 論點分析框架類別常數
 * 用於將 AI 提取的 categoryCode 映射到顯示名稱和父類別
 */

export const FRAMEWORK_CATEGORIES: Record<string, { name: string; parentName: string }> = {
  FINANCIALS: { name: '財務體質', parentName: '量化分析' },
  MOMENTUM: { name: '動能類', parentName: '量化分析' },
  VALUATION: { name: '估值', parentName: '量化分析' },
  MARKET_SIZE: { name: '市場規模', parentName: '質化分析' },
  MOAT: { name: '護城河', parentName: '質化分析' },
  OPERATIONAL_QUALITY: { name: '營運品質', parentName: '質化分析' },
  CATALYST: { name: '催化劑', parentName: '催化劑' },
};

export const CATEGORY_ICONS: Record<string, string> = {
  FINANCIALS: '💰',
  MOMENTUM: '📈',
  VALUATION: '💵',
  MARKET_SIZE: '🌍',
  MOAT: '🏰',
  OPERATIONAL_QUALITY: '⚙️',
  CATALYST: '🔥',
};
