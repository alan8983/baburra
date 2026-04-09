// 路由常數定義

export const ROUTES = {
  // Marketing pages
  HOME: '/',
  FEATURES: '/features',
  PRICING: '/pricing',

  // Auth pages
  LOGIN: '/login',
  REGISTER: '/register',
  AUTH_CALLBACK: '/auth/callback',
  RESET_PASSWORD: '/reset-password',
  RESET_PASSWORD_CONFIRM: '/reset-password/confirm',

  // App pages
  DASHBOARD: '/dashboard',
  INPUT: '/input',
  IMPORT: '/import',
  DRAFTS: '/drafts',
  DRAFT_DETAIL: (id: string) => `/drafts/${id}`,
  KOLS: '/kols',
  KOL_DETAIL: (id: string) => `/kols/${id}`,
  STOCKS: '/stocks',
  STOCK_DETAIL: (ticker: string) => `/stocks/${ticker}`,
  POSTS: '/posts',
  POST_DETAIL: (id: string) => `/posts/${id}`,
  BOOKMARKS: '/bookmarks',
  SETTINGS: '/settings',
  SCRAPE: '/scrape',
  SUBSCRIPTIONS: '/subscriptions',
} as const;

// API 路由
export const API_ROUTES = {
  // KOLs
  KOLS: '/api/kols',
  KOL_DETAIL: (id: string) => `/api/kols/${id}`,
  KOL_POSTS: (id: string) => `/api/kols/${id}/posts`,
  KOL_RETURN_RATE: (id: string) => `/api/kols/${id}/return-rate`,
  KOL_WIN_RATE: (id: string) => `/api/kols/${id}/win-rate`,

  // Stocks
  STOCKS: '/api/stocks',
  STOCK_DETAIL: (ticker: string) => `/api/stocks/${ticker}`,
  STOCK_POSTS: (ticker: string) => `/api/stocks/${ticker}/posts`,
  STOCK_PRICES: (ticker: string) => `/api/stocks/${ticker}/prices`,
  STOCK_RETURN_RATE: (ticker: string) => `/api/stocks/${ticker}/return-rate`,
  STOCK_WIN_RATE: (ticker: string) => `/api/stocks/${ticker}/win-rate`,
  STOCK_ARGUMENTS: (ticker: string) => `/api/stocks/${ticker}/arguments`,

  // Posts
  POSTS: '/api/posts',
  POST_DETAIL: (id: string) => `/api/posts/${id}`,
  POST_CHECK_DUPLICATE: '/api/posts/check-duplicate',
  POST_ARGUMENTS: (id: string) => `/api/posts/${id}/arguments`,
  POST_REANALYZE: (id: string) => `/api/posts/${id}/reanalyze`,
  POST_REANALYZE_BATCH: '/api/posts/reanalyze-batch',
  POST_STALE_COUNT: '/api/posts/stale-count',
  POST_UNREAD_COUNT: '/api/posts/unread-count',
  POST_MARK_READ: '/api/posts/mark-read',

  // Drafts
  DRAFTS: '/api/drafts',
  DRAFTS_COUNT: '/api/drafts/count',
  DRAFT_DETAIL: (id: string) => `/api/drafts/${id}`,

  // Bookmarks
  BOOKMARKS: '/api/bookmarks',
  BOOKMARK_STATUS: (postId: string) => `/api/bookmarks/${postId}`,

  // Content unlocks (layer 2/3)
  UNLOCKS: '/api/unlocks',
  UNLOCK_LAYER2: '/api/unlocks/layer2',
  UNLOCK_LAYER3: '/api/unlocks/layer3',

  // Dashboard
  DASHBOARD: '/api/dashboard',

  // AI
  AI_ANALYZE: '/api/ai/analyze',
  AI_IDENTIFY_TICKERS: '/api/ai/identify-tickers',
  AI_EXTRACT_ARGUMENTS: '/api/ai/extract-arguments',
  AI_EXTRACT_DRAFT_ARGUMENTS: '/api/ai/extract-draft-arguments',
  AI_USAGE: '/api/ai/usage',

  // Argument Categories
  ARGUMENT_CATEGORIES: '/api/argument-categories',

  // Upload
  UPLOAD: '/api/upload',

  // URL Fetch
  FETCH_URL: '/api/fetch-url',

  // Quick Input (orchestration)
  QUICK_INPUT: '/api/quick-input',

  // Profile
  PROFILE: '/api/profile',
  // Import
  IMPORT_BATCH: '/api/import/batch',

  // Scrape
  SCRAPE_DISCOVER: '/api/scrape/discover',
  SCRAPE_PROFILE: '/api/scrape/profile',
  SCRAPE_JOB: (id: string) => `/api/scrape/jobs/${id}`,
  SCRAPE_JOB_CONTINUE: (id: string) => `/api/scrape/jobs/${id}/continue`,
  SCRAPE_JOBS: '/api/scrape/jobs',

  // Subscriptions
  SUBSCRIPTIONS: '/api/subscriptions',
  SUBSCRIPTION_DELETE: (sourceId: string) => `/api/subscriptions/${sourceId}`,
  KOL_SOURCES: (kolId: string) => `/api/kols/${kolId}/sources`,

  // Cron
  CRON_PROCESS_JOBS: '/api/cron/process-jobs',
  CRON_MONITOR: '/api/cron/monitor',

  // Insights (Community)
  INSIGHTS_TRENDING_STOCKS: '/api/insights/trending-stocks',
  INSIGHTS_POPULAR_KOLS: '/api/insights/popular-kols',
  KOL_FOLLOWERS_COUNT: (id: string) => `/api/kols/${id}/followers-count`,
} as const;

// 導航項目
export const NAV_ITEMS = [
  { label: 'Dashboard', href: ROUTES.DASHBOARD, icon: 'LayoutDashboard' },
  { label: '新增內容', href: ROUTES.INPUT, icon: 'PenLine' },
  { label: '草稿', href: ROUTES.DRAFTS, icon: 'FileText', showBadge: true },
  { label: 'KOL 列表', href: ROUTES.KOLS, icon: 'Users' },
  { label: '投資標的', href: ROUTES.STOCKS, icon: 'TrendingUp' },
  { label: '所有文章', href: ROUTES.POSTS, icon: 'Newspaper' },
  { label: '設定', href: ROUTES.SETTINGS, icon: 'Settings' },
] as const;
