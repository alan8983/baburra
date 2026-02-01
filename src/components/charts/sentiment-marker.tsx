'use client';

import type { SentimentMarkerItem } from './candlestick-chart';
import { SENTIMENT_LABELS } from '@/domain/models/post';

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
    text: options?.text ?? SENTIMENT_LABELS[sentiment as keyof typeof SENTIMENT_LABELS],
  };
}

/**
 * 圖表下方情緒圖例（可選）
 */
export function SentimentMarkerLegend({ markers }: { markers: SentimentMarkerItem[] }) {
  if (markers.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
      {markers.map((m, i) => (
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
            {m.time}: {SENTIMENT_LABELS[m.sentiment as keyof typeof SENTIMENT_LABELS]}
            {m.text && m.text !== SENTIMENT_LABELS[m.sentiment as keyof typeof SENTIMENT_LABELS] ? ` (${m.text})` : ''}
          </span>
        </span>
      ))}
    </div>
  );
}
