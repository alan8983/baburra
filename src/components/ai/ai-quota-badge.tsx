'use client';

/**
 * AI 配額徽章元件
 * 顯示剩餘 AI 使用次數
 */

import { useTranslations } from 'next-intl';
import { useAiUsage } from '@/hooks/use-ai';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles } from 'lucide-react';

interface AiQuotaBadgeProps {
  variant?: 'default' | 'compact';
  className?: string;
}

export function AiQuotaBadge({ variant = 'default', className }: AiQuotaBadgeProps) {
  const t = useTranslations('common');
  const { data: usage, isLoading, error } = useAiUsage();

  if (isLoading) {
    return (
      <Badge variant="outline" className={className}>
        <Sparkles className="mr-1 h-3 w-3" />
        <span className="animate-pulse">...</span>
      </Badge>
    );
  }

  if (error || !usage) {
    return null;
  }

  const { remaining, weeklyLimit, resetAt } = usage;
  const percentage = (remaining / weeklyLimit) * 100;

  // 根據剩餘比例決定顏色
  const colorClass =
    percentage > 50
      ? 'text-green-600 bg-green-50 border-green-200'
      : percentage > 20
        ? 'text-yellow-600 bg-yellow-50 border-yellow-200'
        : 'text-red-600 bg-red-50 border-red-200';

  // 格式化重置時間
  const formatResetTime = () => {
    if (!resetAt) return t('ai.nextWeek');
    const reset = new Date(resetAt);
    const now = new Date();
    const diffDays = Math.ceil((reset.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return t('time.resetToday');
    if (diffDays === 1) return t('time.resetTomorrow');
    return t('time.resetInDays', { days: diffDays });
  };

  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className={`${colorClass} ${className}`}>
              <Sparkles className="mr-1 h-3 w-3" />
              {remaining}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('ai.quotaDisplay', { remaining, limit: weeklyLimit })}</p>
            <p className="text-muted-foreground text-xs">{formatResetTime()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`${colorClass} ${className}`}>
            <Sparkles className="mr-1 h-3 w-3" />
            <span>{t('ai.quotaDisplay', { remaining, limit: weeklyLimit })}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('ai.weeklyRemaining')}</p>
          <p className="text-muted-foreground text-xs">{formatResetTime()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default AiQuotaBadge;
