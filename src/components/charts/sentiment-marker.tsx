'use client';

import { useTranslations } from 'next-intl';
import type { SentimentMarkerItem } from './candlestick-chart';
import { sentimentKey } from '@/lib/utils/sentiment';

export type { SentimentMarkerItem };

/**
 * 將發文時間與情緒轉成 K 線圖標記（單一文章）
 */
export function postToSentimentMarker(
  postedAt: string,
  sentiment: number,
  options?: { price?: number; text?: string }
): SentimentMarkerItem {
  const date = postedAt.includes('T') ? postedAt.slice(0, 10) : postedAt.slice(0, 10);
  return {
    time: date,
    sentiment,
    price: options?.price,
    text: options?.text,
  };
}

/**
 * 圖表下方情緒圖例（可選）
 */
export function SentimentMarkerLegend({ markers }: { markers: SentimentMarkerItem[] }) {
  const t = useTranslations('common');
  if (markers.length === 0) return null;
  return (
    <div className="text-muted-foreground mt-2 flex flex-wrap gap-3 text-xs">
      {markers.map((m, i) => {
        const label = t(`sentiment.${sentimentKey(m.sentiment)}`);
        return (
          <span key={i}>
            <span
              className={
                m.sentiment > 0
                  ? 'text-green-600'
                  : m.sentiment < 0
                    ? 'text-red-600'
                    : 'text-muted-foreground'
              }
            >
              {m.time}: {label}
              {m.text && m.text !== label ? ` (${m.text})` : ''}
            </span>
          </span>
        );
      })}
    </div>
  );
}
