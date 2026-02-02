'use client';

/**
 * 標的論點彙整 Tab 元件
 * 顯示特定標的的所有論點分布與統計
 */

import { useState } from 'react';
import { useStockArguments, type StockArgumentSummary } from '@/hooks/use-ai';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SENTIMENT_LABELS, SENTIMENT_COLORS, type Sentiment } from '@/domain/models/post';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants/routes';

// 論點類別對應的圖示
const CATEGORY_ICONS: Record<string, string> = {
  QUANTITATIVE: '📊',
  QUALITATIVE: '📝',
  EVENT_DRIVEN: '⚡',
  FINANCIALS: '💰',
  MOMENTUM: '📈',
  VALUATION: '💵',
  MARKET_SIZE: '🌍',
  MOAT: '🏰',
  OPERATIONAL_QUALITY: '⚙️',
  CATALYST: '🔥',
};

interface StockArgumentsTabProps {
  ticker: string;
}

export function StockArgumentsTab({ ticker }: StockArgumentsTabProps) {
  const { data, isLoading, error } = useStockArguments(ticker);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-muted h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-muted-foreground text-center">載入論點資料失敗</p>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.totalArgumentCount === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-muted-foreground text-center">尚無論點資料</p>
          <p className="text-muted-foreground mt-2 text-center text-sm">
            當文章被 AI 分析時，論點會自動提取並顯示在此處
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* 總覽 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>📊 論點分布統計</span>
            <Badge variant="secondary">{data.totalArgumentCount} 個論點</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {data.summary.map((group) => (
              <div key={group.parent.id} className="rounded-lg border p-3 text-center">
                <div className="mb-1 text-2xl">{CATEGORY_ICONS[group.parent.code] || '📌'}</div>
                <div className="font-medium">{group.parent.name}</div>
                <div className="text-primary text-2xl font-bold">{group.totalMentions}</div>
                <div className="text-muted-foreground text-xs">次提及</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 詳細論點列表 */}
      <div className="space-y-4">
        {data.summary.map((group) => (
          <div key={group.parent.id}>
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <span>{CATEGORY_ICONS[group.parent.code] || '📌'}</span>
              <span>{group.parent.name}</span>
              <Badge variant="outline">{group.totalMentions}</Badge>
            </h3>

            <div className="space-y-3">
              {group.children.map((child) => (
                <CategoryCard key={child.category.id} data={child} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface CategoryCardProps {
  data: StockArgumentSummary['summary'][0]['children'][0];
}

function CategoryCard({ data }: CategoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const icon = CATEGORY_ICONS[data.category.code] || '📌';

  // 計算看多/看空比例
  const totalSentimentCount = data.bullishCount + data.bearishCount;
  const bullishPercentage =
    totalSentimentCount > 0 ? (data.bullishCount / totalSentimentCount) * 100 : 50;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>{icon}</span>
            <CardTitle className="text-sm font-medium">{data.category.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{data.mentionCount} 次提及</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-8 w-8 p-0"
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* 看多/看空比例條 */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-green-600">看多 {data.bullishCount}</span>
            <span className="text-red-600">看空 {data.bearishCount}</span>
          </div>
          <div className="bg-muted flex h-2 overflow-hidden rounded-full">
            <div
              className="bg-green-500 transition-all"
              style={{ width: `${bullishPercentage}%` }}
            />
            <div
              className="bg-red-500 transition-all"
              style={{ width: `${100 - bullishPercentage}%` }}
            />
          </div>
        </div>

        {/* 時間範圍 */}
        {data.firstMentionedAt && data.lastMentionedAt && (
          <div className="text-muted-foreground flex gap-4 text-xs">
            <span>首次提及: {formatDate(data.firstMentionedAt)}</span>
            <span>最近提及: {formatDate(data.lastMentionedAt)}</span>
          </div>
        )}

        {/* 展開的論點詳情 */}
        {isExpanded && data.arguments.length > 0 && (
          <>
            <Separator />
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {/* 看多論點 */}
              {data.arguments.filter((a) => a.sentiment > 0).length > 0 && (
                <div>
                  <h5 className="mb-2 text-sm font-medium text-green-600">
                    ▲ 看多論點 ({data.arguments.filter((a) => a.sentiment > 0).length})
                  </h5>
                  <div className="space-y-2">
                    {data.arguments
                      .filter((a) => a.sentiment > 0)
                      .slice(0, 5)
                      .map((arg) => (
                        <ArgumentItem key={arg.id} argument={arg} />
                      ))}
                  </div>
                </div>
              )}

              {/* 中立論點 */}
              {data.arguments.filter((a) => a.sentiment === 0).length > 0 && (
                <div>
                  <h5 className="mb-2 text-sm font-medium text-gray-600">
                    ● 中立論點 ({data.arguments.filter((a) => a.sentiment === 0).length})
                  </h5>
                  <div className="space-y-2">
                    {data.arguments
                      .filter((a) => a.sentiment === 0)
                      .slice(0, 5)
                      .map((arg) => (
                        <ArgumentItem key={arg.id} argument={arg} />
                      ))}
                  </div>
                </div>
              )}

              {/* 看空論點 */}
              {data.arguments.filter((a) => a.sentiment < 0).length > 0 && (
                <div>
                  <h5 className="mb-2 text-sm font-medium text-red-600">
                    ▼ 看空論點 ({data.arguments.filter((a) => a.sentiment < 0).length})
                  </h5>
                  <div className="space-y-2">
                    {data.arguments
                      .filter((a) => a.sentiment < 0)
                      .slice(0, 5)
                      .map((arg) => (
                        <ArgumentItem key={arg.id} argument={arg} />
                      ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface ArgumentItemProps {
  argument: StockArgumentSummary['summary'][0]['children'][0]['arguments'][0];
}

function ArgumentItem({ argument }: ArgumentItemProps) {
  const sentimentLabel = SENTIMENT_LABELS[argument.sentiment as Sentiment];
  const sentimentColors = SENTIMENT_COLORS[argument.sentiment as Sentiment];

  return (
    <div className="rounded-lg border p-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          {argument.summary && <p className="mb-1">{argument.summary}</p>}
          {argument.originalText && (
            <blockquote className="border-muted text-muted-foreground border-l-2 pl-2 text-xs italic">
              {argument.originalText.length > 100
                ? `${argument.originalText.slice(0, 100)}...`
                : argument.originalText}
            </blockquote>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge className={`${sentimentColors} text-xs`}>{sentimentLabel}</Badge>
          <Link href={ROUTES.POST_DETAIL(argument.postId)}>
            <Button variant="ghost" size="sm" className="h-6 px-2">
              <ExternalLink className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
      <div className="text-muted-foreground mt-1 text-xs">{formatDate(argument.createdAt)}</div>
    </div>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export default StockArgumentsTab;
