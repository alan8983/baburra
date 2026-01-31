import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Users, FileText, Newspaper } from 'lucide-react';

// 統計卡片資料
const stats = [
  {
    title: 'KOL 總數',
    value: '24',
    description: '+2 本月新增',
    icon: Users,
  },
  {
    title: '投資標的',
    value: '156',
    description: '+12 本月新增',
    icon: TrendingUp,
  },
  {
    title: '收錄文章',
    value: '1,284',
    description: '+48 本週新增',
    icon: Newspaper,
  },
  {
    title: '待處理草稿',
    value: '3',
    description: '最近更新: 2小時前',
    icon: FileText,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          歡迎回來！以下是您的 KOL 追蹤概覽。
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Posts */}
        <Card>
          <CardHeader>
            <CardTitle>最近收錄文章</CardTitle>
            <CardDescription>最近 5 篇收錄的 KOL 觀點文章</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium">KOL 名稱 {i}</p>
                    <p className="text-xs text-muted-foreground">
                      AAPL, TSLA | 2026/01/30
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      看多
                    </span>
                    <span className="text-sm font-medium text-green-600">+5.2%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top KOLs */}
        <Card>
          <CardHeader>
            <CardTitle>KOL 勝率排行</CardTitle>
            <CardDescription>30 日勝率前 5 名的 KOL</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'KOL A', rate: '78%', posts: 42 },
                { name: 'KOL B', rate: '72%', posts: 38 },
                { name: 'KOL C', rate: '68%', posts: 56 },
                { name: 'KOL D', rate: '65%', posts: 24 },
                { name: 'KOL E', rate: '63%', posts: 31 },
              ].map((kol, i) => (
                <div
                  key={kol.name}
                  className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{kol.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {kol.posts} 篇文章
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">{kol.rate}</p>
                    <p className="text-xs text-muted-foreground">30日勝率</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>快速操作</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <a
              href="/input"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted"
            >
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">快速輸入</p>
                <p className="text-sm text-muted-foreground">新增 KOL 觀點</p>
              </div>
            </a>
            <a
              href="/kols"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted"
            >
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">KOL 管理</p>
                <p className="text-sm text-muted-foreground">瀏覽所有 KOL</p>
              </div>
            </a>
            <a
              href="/stocks"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted"
            >
              <TrendingUp className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">投資標的</p>
                <p className="text-sm text-muted-foreground">瀏覽所有標的</p>
              </div>
            </a>
            <a
              href="/posts"
              className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted"
            >
              <Newspaper className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">所有文章</p>
                <p className="text-sm text-muted-foreground">瀏覽收錄文章</p>
              </div>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
