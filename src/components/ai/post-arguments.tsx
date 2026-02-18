'use client';

/**
 * 文章論點檢視元件
 * 以標的分組、卡片網格呈現 AI 提取的投資論點
 */

import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SENTIMENT_LABELS, SENTIMENT_COLORS, type Sentiment } from '@/domain/models/post';
import { CATEGORY_ICONS } from '@/domain/models/argument-categories';
import { cn } from '@/lib/utils';

// =====================
// Types (exported for consumers)
// =====================

export interface ArgumentItem {
  id: string;
  categoryCode: string;
  categoryName: string;
  parentName: string;
  originalText: string | null;
  summary: string | null;
  sentiment: Sentiment;
  confidence: number | null;
}

export interface TickerArgumentGroup {
  ticker: string;
  name: string;
  arguments: ArgumentItem[];
}

interface PostArgumentsProps {
  tickerGroups: TickerArgumentGroup[];
  className?: string;
}

// =====================
// Sentiment border colors
// =====================

const SENTIMENT_BORDER: Record<Sentiment, string> = {
  [-2]: 'border-l-red-600',
  [-1]: 'border-l-red-400',
  [0]: 'border-l-gray-300',
  [1]: 'border-l-green-400',
  [2]: 'border-l-green-600',
};

// =====================
// Main component
// =====================

export function PostArguments({ tickerGroups, className }: PostArgumentsProps) {
  if (!tickerGroups || tickerGroups.length === 0) {
    return (
      <div className={cn('rounded-lg border p-6', className)}>
        <h3 className="text-base font-semibold">論點分析</h3>
        <p className="text-muted-foreground mt-2 text-sm">尚未提取論點</p>
      </div>
    );
  }

  const totalCount = tickerGroups.reduce((sum, g) => sum + g.arguments.length, 0);

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <span>🧠</span>
          <span>論點分析</span>
        </h3>
        <Badge variant="secondary">{totalCount} 個論點</Badge>
      </div>

      {/* Per-ticker sections */}
      {tickerGroups.map((group, i) => (
        <div key={group.ticker}>
          {i > 0 && <Separator className="mb-6" />}
          <TickerSection group={group} />
        </div>
      ))}
    </div>
  );
}

// =====================
// Ticker section
// =====================

function TickerSection({ group }: { group: TickerArgumentGroup }) {
  // Group by parentName within this ticker
  const byParent = group.arguments.reduce(
    (acc, arg) => {
      const parent = arg.parentName;
      if (!acc[parent]) acc[parent] = [];
      acc[parent].push(arg);
      return acc;
    },
    {} as Record<string, ArgumentItem[]>
  );

  return (
    <div className="space-y-4">
      {/* Ticker header */}
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-sm font-semibold">
          {group.ticker}
        </Badge>
        <span className="text-muted-foreground text-sm">{group.name}</span>
        <span className="text-muted-foreground text-xs">({group.arguments.length})</span>
      </div>

      {/* Category sub-groups with card grids */}
      {Object.entries(byParent).map(([parentName, args]) => (
        <div key={parentName} className="space-y-2">
          <h4 className="text-muted-foreground text-xs font-medium tracking-wide">{parentName}</h4>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {args.map((arg) => (
              <ArgumentCard key={arg.id} argument={arg} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================
// Argument card
// =====================

function ArgumentCard({ argument }: { argument: ArgumentItem }) {
  const icon = CATEGORY_ICONS[argument.categoryCode] || '📌';
  const borderColor = SENTIMENT_BORDER[argument.sentiment];
  const sentimentLabel = SENTIMENT_LABELS[argument.sentiment];
  const sentimentTextColor = SENTIMENT_COLORS[argument.sentiment]?.split(' ')[0] || '';

  const hasDetails = argument.originalText || argument.confidence !== null;

  const card = (
    <div
      className={cn(
        'rounded-lg border border-l-4 p-3 transition-colors',
        borderColor,
        hasDetails && 'cursor-default'
      )}
    >
      {/* Category line */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-sm">{icon}</span>
        <span className="text-muted-foreground text-xs font-medium">{argument.categoryName}</span>
      </div>

      {/* Summary */}
      {argument.summary && <p className="text-sm leading-relaxed">{argument.summary}</p>}

      {/* Sentiment label */}
      <span className={cn('mt-1.5 block text-xs', sentimentTextColor)}>{sentimentLabel}</span>
    </div>
  );

  if (!hasDetails) return card;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs space-y-1.5 p-3">
        {argument.originalText && (
          <p className="text-xs italic">
            {argument.originalText.length > 200
              ? `${argument.originalText.slice(0, 200)}...`
              : argument.originalText}
          </p>
        )}
        {argument.confidence !== null && (
          <p className="text-xs font-medium">信心度: {Math.round(argument.confidence * 100)}%</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export default PostArguments;
