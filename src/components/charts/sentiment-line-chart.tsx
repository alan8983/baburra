'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  createChart,
  ColorType,
  AreaSeries,
  createSeriesMarkers,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';
import type { CandlestickData } from '@/domain/models/stock';
import type { Sentiment } from '@/domain/models/post';
import { sentimentKey } from '@/lib/utils/sentiment';
import { resolveThemeColors } from './chart-utils';

export interface LineChartMarker {
  time: string;
  sentiment: number;
  text?: string; // KOL name (shown on hover)
  postId?: string; // for click-to-navigate
}

interface SentimentLineChartProps {
  candles: CandlestickData[];
  sentimentMarkers: LineChartMarker[];
  onMarkerClick?: (postId: string) => void;
  height?: number;
  className?: string;
}

const SENTIMENT_MARKER_COLORS: Record<number, string> = {
  2: '#166534', // Strong Buy — dark green
  1: '#22c55e', // Buy — bright green
  0: '#eab308', // Hold — orange-yellow
  [-1]: '#ef4444', // Sell — bright red
  [-2]: '#991b1b', // Strong Sell — dark red
};

function sentimentToMarkerColor(sentiment: number): string {
  return SENTIMENT_MARKER_COLORS[sentiment] ?? '#6b7280';
}

export function SentimentLineChart({
  candles,
  sentimentMarkers = [],
  onMarkerClick,
  height = 250,
  className = '',
}: SentimentLineChartProps) {
  const t = useTranslations('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Build a time→marker lookup map for efficient matching in event handlers
  const markersByTime = useMemo(() => {
    const map = new Map<string, LineChartMarker[]>();
    for (const m of sentimentMarkers) {
      const existing = map.get(m.time);
      if (existing) existing.push(m);
      else map.set(m.time, [m]);
    }
    return map;
  }, [sentimentMarkers]);

  const markersByTimeRef = useRef(markersByTime);
  useEffect(() => {
    markersByTimeRef.current = markersByTime;
  }, [markersByTime]);

  const handleClick = useCallback(
    (param: MouseEventParams<Time>) => {
      if (!param.time || !onMarkerClick) return;
      const timeStr = String(param.time);
      const matched = markersByTimeRef.current.get(timeStr);
      const first = matched?.find((m) => m.postId);
      if (first?.postId) {
        onMarkerClick(first.postId);
      }
    },
    [onMarkerClick]
  );

  useEffect(() => {
    if (!containerRef.current || candles.length === 0) return;

    const { foregroundColor, gridColor } = resolveThemeColors(containerRef.current);

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: foregroundColor,
      },
      width: containerRef.current.clientWidth,
      height,
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      autoSize: true,
      crosshair: {
        horzLine: { visible: true, labelVisible: true },
        vertLine: { visible: true, labelVisible: true },
      },
    });

    chartRef.current = chart;

    // Area series with neutral/gray gradient
    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: 'rgba(150, 150, 150, 0.8)',
      topColor: 'rgba(150, 150, 150, 0.2)',
      bottomColor: 'transparent',
      lineWidth: 2,
    });

    // Extract close prices from candle data
    const lineData = candles.map((c) => ({ time: c.time, value: c.close }));
    areaSeries.setData(lineData);

    // Add sentiment markers on the line
    if (sentimentMarkers.length > 0) {
      const markers = sentimentMarkers.map((m) => ({
        time: m.time as string,
        position: 'inBar' as const,
        shape: 'circle' as const,
        color: sentimentToMarkerColor(m.sentiment),
        size: 2,
      }));
      createSeriesMarkers(areaSeries, markers);
    }

    // Hover tooltip via crosshair move
    const tooltip = tooltipRef.current;
    chart.subscribeCrosshairMove((param) => {
      if (!tooltip) return;
      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        tooltip.style.display = 'none';
        return;
      }

      const timeStr = String(param.time);
      const matched = markersByTimeRef.current.get(timeStr);
      if (!matched || matched.length === 0) {
        tooltip.style.display = 'none';
        return;
      }

      // Build tooltip content
      const lines = matched.map((m) => {
        const label = t(`sentiment.${sentimentKey(m.sentiment)}`);
        const color = sentimentToMarkerColor(m.sentiment);
        const name = m.text ?? '';
        return `<div class="flex items-center gap-1.5"><span style="background:${color}" class="inline-block h-2.5 w-2.5 rounded-full"></span><span class="font-medium">${name}</span><span class="text-muted-foreground">${label}</span></div>`;
      });

      tooltip.innerHTML = `<div class="space-y-1 text-xs">${lines.join('')}</div>`;
      tooltip.style.display = 'block';

      // Position tooltip near cursor, clamped within container
      const container = containerRef.current;
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const tooltipWidth = tooltip.offsetWidth;
        let left = param.point.x + 16;
        if (left + tooltipWidth > containerRect.width) {
          left = param.point.x - tooltipWidth - 16;
        }
        tooltip.style.left = `${Math.max(0, left)}px`;
        tooltip.style.top = `${Math.max(0, param.point.y - 30)}px`;
      }
    });

    // Click handler for navigation
    chart.subscribeClick(handleClick);

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, sentimentMarkers, height, handleClick]);

  return (
    <div className="relative">
      <div ref={containerRef} className={`${className} ${onMarkerClick ? 'cursor-pointer' : ''}`} />
      {/* Floating tooltip */}
      <div
        ref={tooltipRef}
        className="bg-popover text-popover-foreground pointer-events-none absolute z-10 hidden rounded-md border px-3 py-2 shadow-md"
        style={{ top: 0, left: 0 }}
      />
      {/* Static legend */}
      <SentimentLineLegend />
    </div>
  );
}

function SentimentLineLegend() {
  const t = useTranslations('common');
  const levels: { sentiment: Sentiment; color: string }[] = [
    { sentiment: 2, color: SENTIMENT_MARKER_COLORS[2] },
    { sentiment: 1, color: SENTIMENT_MARKER_COLORS[1] },
    { sentiment: 0, color: SENTIMENT_MARKER_COLORS[0] },
    { sentiment: -1, color: SENTIMENT_MARKER_COLORS[-1] },
    { sentiment: -2, color: SENTIMENT_MARKER_COLORS[-2] },
  ];

  return (
    <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs">
      {levels.map((l) => (
        <span key={l.sentiment} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: l.color }}
          />
          <span className="text-muted-foreground">
            {t(`sentiment.${sentimentKey(l.sentiment)}`)}
          </span>
        </span>
      ))}
    </div>
  );
}
