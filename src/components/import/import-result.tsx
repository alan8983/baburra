'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CheckCircle2, AlertCircle, XCircle, ArrowRight, RotateCcw, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ROUTES } from '@/lib/constants';
import { SENTIMENT_COLORS } from '@/domain/models/post';
import type { ImportBatchResult } from '@/hooks/use-import';
interface ImportResultProps {
  result: ImportBatchResult;
  onImportMore: () => void;
}

export function ImportResult({ result, onImportMore }: ImportResultProps) {
  const t = useTranslations('import');
  const tCommon = useTranslations('common');

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('result.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* KOL info */}
          <p className="text-sm">
            {result.kolCreated
              ? t('result.kolCreated', { name: result.kolName })
              : t('result.kolMatched', { name: result.kolName })}
          </p>

          {/* Stats */}
          <div className="flex flex-wrap gap-2">
            {result.totalImported > 0 && (
              <Badge variant="default">
                {t('result.imported', { count: result.totalImported })}
              </Badge>
            )}
            {result.totalDuplicate > 0 && (
              <Badge variant="secondary">
                {t('result.duplicates', { count: result.totalDuplicate })}
              </Badge>
            )}
            {result.totalError > 0 && (
              <Badge variant="destructive">
                {t('result.errors', { count: result.totalError })}
              </Badge>
            )}
          </div>

          <Separator />

          {/* Per-URL results */}
          <div className="space-y-3">
            {result.urlResults.map((urlResult, index) => (
              <div key={index} className="flex items-start gap-3 rounded-lg border p-3">
                {/* Status icon */}
                {urlResult.status === 'success' && (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" />
                )}
                {urlResult.status === 'duplicate' && (
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-500" />
                )}
                {urlResult.status === 'error' && (
                  <XCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                )}

                <div className="min-w-0 flex-1">
                  {/* URL */}
                  <p className="text-muted-foreground truncate text-xs">{urlResult.url}</p>

                  {/* Title */}
                  {urlResult.title && (
                    <p className="mt-1 truncate text-sm font-medium">{urlResult.title}</p>
                  )}

                  {/* Status badge + sentiment */}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge
                      variant={
                        urlResult.status === 'success'
                          ? 'default'
                          : urlResult.status === 'duplicate'
                            ? 'secondary'
                            : 'destructive'
                      }
                      className="text-xs"
                    >
                      {t(
                        `result.status${urlResult.status.charAt(0).toUpperCase() + urlResult.status.slice(1)}`
                      )}
                    </Badge>

                    {urlResult.sentiment !== undefined && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${SENTIMENT_COLORS[urlResult.sentiment]}`}
                      >
                        {tCommon(
                          `sentiment.${['stronglyBearish', 'bearish', 'neutral', 'bullish', 'stronglyBullish'][urlResult.sentiment + 2]}`
                        )}
                      </span>
                    )}

                    {urlResult.sourcePlatform && (
                      <Badge variant="outline" className="text-xs">
                        {urlResult.sourcePlatform}
                      </Badge>
                    )}
                  </div>

                  {/* Tickers */}
                  {urlResult.stockTickers && urlResult.stockTickers.length > 0 && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      {t('result.stocksIdentified', {
                        tickers: urlResult.stockTickers.join(', '),
                      })}
                    </p>
                  )}

                  {/* Error message */}
                  {urlResult.error && (
                    <p className="text-destructive mt-1 text-xs">{urlResult.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Onboarding note */}
          {result.onboardingQuotaUsed && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Info className="h-4 w-4" />
              {t('result.onboardingQuotaNote')}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CTAs */}
      <div className="flex gap-3">
        <Button asChild className="flex-1">
          <Link href={ROUTES.KOL_DETAIL(result.kolId)}>
            {t('result.viewKol')}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
        <Button variant="outline" onClick={onImportMore} className="flex-1">
          <RotateCcw className="mr-1 h-4 w-4" />
          {t('result.importMore')}
        </Button>
      </div>
    </div>
  );
}
