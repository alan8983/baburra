'use client';

/**
 * 文章論點檢視元件
 * 顯示文章中提取的所有論點
 */

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SENTIMENT_LABELS, SENTIMENT_COLORS, type Sentiment } from '@/domain/models/post';

interface Argument {
  id: string;
  categoryCode: string;
  categoryName: string;
  parentName: string;
  originalText: string | null;
  summary: string | null;
  sentiment: Sentiment;
  confidence: number | null;
}

interface PostArgumentsProps {
  arguments: Argument[];
  className?: string;
}

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

export function PostArguments({ arguments: args, className }: PostArgumentsProps) {
  if (!args || args.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-base">論點分析</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">尚未提取論點</p>
        </CardContent>
      </Card>
    );
  }

  // 依父類別分組
  const groupedArgs = args.reduce(
    (acc, arg) => {
      const parent = arg.parentName;
      if (!acc[parent]) {
        acc[parent] = [];
      }
      acc[parent].push(arg);
      return acc;
    },
    {} as Record<string, Argument[]>
  );

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span>🧠</span>
          <span>論點分析</span>
          <Badge variant="secondary" className="ml-auto">
            {args.length} 個論點
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(groupedArgs).map(([parentName, parentArgs], groupIndex) => (
          <div key={parentName}>
            {groupIndex > 0 && <Separator className="my-4" />}
            <div className="space-y-3">
              <h4 className="text-muted-foreground text-sm font-medium">{parentName}</h4>
              {parentArgs.map((arg) => (
                <ArgumentCard key={arg.id} argument={arg} />
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ArgumentCard({ argument }: { argument: Argument }) {
  const icon = CATEGORY_ICONS[argument.categoryCode] || '📌';
  const sentimentLabel = SENTIMENT_LABELS[argument.sentiment];
  const sentimentColors = SENTIMENT_COLORS[argument.sentiment];

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-sm font-medium">{argument.categoryName}</span>
        </div>
        <Badge className={sentimentColors}>{sentimentLabel}</Badge>
      </div>

      {argument.summary && <p className="text-sm">{argument.summary}</p>}

      {argument.originalText && (
        <blockquote className="border-muted text-muted-foreground border-l-2 pl-3 text-xs italic">
          {argument.originalText.length > 150
            ? `${argument.originalText.slice(0, 150)}...`
            : argument.originalText}
        </blockquote>
      )}

      {argument.confidence !== null && (
        <div className="text-muted-foreground flex items-center gap-1 text-xs">
          <span>信心度:</span>
          <span className="font-medium">{Math.round(argument.confidence * 100)}%</span>
        </div>
      )}
    </div>
  );
}

export default PostArguments;
