'use client';

/**
 * 文章論點檢視元件
 * 以標的分組、卡片網格呈現 AI 提取的投資論點
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { type Sentiment } from '@/domain/models/post';
import { sentimentKey } from '@/lib/utils/sentiment';
import { CATEGORY_ICONS } from '@/domain/models/argument-categories';
import { cn } from '@/lib/utils';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import type { FinancialColors } from '@/lib/colors/financial-colors';

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
  statementType: string | null;
}

export interface TickerArgumentGroup {
  ticker: string;
  name: string;
  source?: 'explicit' | 'inferred';
  inferenceReason?: string | null;
  arguments: ArgumentItem[];
}

interface PostArgumentsProps {
  tickerGroups: TickerArgumentGroup[];
  className?: string;
}

// =====================
// Palette-aware color helpers
// =====================

function getSentimentBorderColor(sentiment: Sentiment, colors: FinancialColors): string {
  if (sentiment >= 3) return colors.bullish.textStrong.replace('text-', 'border-l-');
  if (sentiment >= 2) return colors.bullish.text.replace('text-', 'border-l-');
  if (sentiment >= 1) return colors.bullish.textLight.replace('text-', 'border-l-');
  if (sentiment === 0) return 'border-l-gray-300';
  if (sentiment >= -1) return colors.bearish.textLight.replace('text-', 'border-l-');
  if (sentiment >= -2) return colors.bearish.text.replace('text-', 'border-l-');
  return colors.bearish.textStrong.replace('text-', 'border-l-');
}

function getSentimentTextColor(sentiment: Sentiment, colors: FinancialColors): string {
  if (sentiment > 0) return colors.bullish.text;
  if (sentiment < 0) return colors.bearish.text;
  return colors.neutral.text;
}

// =====================
// Main component
// =====================

export function PostArguments({ tickerGroups, className }: PostArgumentsProps) {
  const t = useTranslations('common');

  if (!tickerGroups || tickerGroups.length === 0) {
    return (
      <div className={cn('rounded-lg border p-6', className)}>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          {t('ai.argumentAnalysis')}
          <Badge variant="outline" className="text-muted-foreground text-[10px] font-normal">
            {t('ai.underDevelopment')}
          </Badge>
        </h3>
        <p className="text-muted-foreground mt-2 text-sm">{t('ai.noArguments')}</p>
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
          <span>{t('ai.argumentAnalysis')}</span>
          <Badge variant="outline" className="text-muted-foreground text-[10px] font-normal">
            {t('ai.underDevelopment')}
          </Badge>
        </h3>
        <Badge variant="secondary">{t('ai.argumentCount', { count: totalCount })}</Badge>
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
  const [isExpanded, setIsExpanded] = useState(true);

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
      {/* Ticker header — clickable to collapse/expand */}
      <button
        type="button"
        className="flex w-full items-center gap-2"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Badge variant="outline" className="text-sm font-semibold">
          {group.ticker}
        </Badge>
        {group.source === 'inferred' && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="border-amber-300 text-[10px] font-normal text-amber-600"
              >
                推論
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">
                此標的為系統根據宏觀分析推論，非 KOL 直接提及
                {group.inferenceReason && (
                  <>
                    <br />
                    <span className="font-medium">{group.inferenceReason}</span>
                  </>
                )}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
        <span className="text-muted-foreground text-sm">{group.name}</span>
        <span className="text-muted-foreground text-xs">({group.arguments.length})</span>
        {isExpanded ? (
          <ChevronUp className="text-muted-foreground ml-auto h-4 w-4" />
        ) : (
          <ChevronDown className="text-muted-foreground ml-auto h-4 w-4" />
        )}
      </button>

      {/* Category sub-groups with card grids */}
      {isExpanded &&
        Object.entries(byParent).map(([parentName, args]) => (
          <div key={parentName} className="space-y-2">
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide">
              {parentName}
            </h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
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
  const t = useTranslations('common');
  const { colors } = useColorPalette();
  const icon = CATEGORY_ICONS[argument.categoryCode] || '📌';
  const borderColor = getSentimentBorderColor(argument.sentiment, colors);
  const sentimentLabel = t(`sentiment.${sentimentKey(argument.sentiment)}`);
  const sentimentTextColor = getSentimentTextColor(argument.sentiment, colors);

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
        {argument.statementType && argument.statementType !== 'mixed' && (
          <Badge variant="outline" className="text-muted-foreground text-[10px] font-normal">
            {argument.statementType === 'fact' ? t('ai.fact') : t('ai.opinion')}
          </Badge>
        )}
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
          <p className="text-xs font-medium">
            {t('ai.confidencePercent', { percent: Math.round(argument.confidence * 100) })}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export default PostArguments;
