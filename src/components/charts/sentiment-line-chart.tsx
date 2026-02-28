'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  createChart,
  ColorType,
  AreaSeries,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';
import type { CandlestickData } from '@/domain/models/stock';
import type { Sentiment } from '@/domain/models/post';
import { sentimentKey } from '@/lib/utils/sentiment';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import { resolveThemeColors } from './chart-utils';
import { TriangleMarkersPrimitive } from './triangle-markers-primitive';

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

export function SentimentLineChart({
  candles,
  sentimentMarkers = [],
  onMarkerClick,
  height = 250,
  className = '',
}: SentimentLineChartProps) {
  const t = useTranslations('common');
  const { colors } = useColorPalette();
  const sentimentMarkerHex = colors.sentimentMarkerHex;
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

  // Refs for values used inside the chart effect but that should not trigger chart re-creation
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const sentimentMarkerHexRef = useRef(sentimentMarkerHex);
  useEffect(() => {
    sentimentMarkerHexRef.current = sentimentMarkerHex;
  }, [sentimentMarkerHex]);

  const sentimentMarkersRef = useRef(sentimentMarkers);
  useEffect(() => {
    sentimentMarkersRef.current = sentimentMarkers;
  }, [sentimentMarkers]);

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

    // Add custom triangle sentiment markers via canvas primitive
    const currentMarkers = sentimentMarkersRef.current;
    const currentHex = sentimentMarkerHexRef.current;
    if (currentMarkers.length > 0) {
      const trianglePrimitive = new TriangleMarkersPrimitive();
      trianglePrimitive.setPriceData(candles.map((c) => ({ time: c.time, close: c.close })));
      trianglePrimitive.setData(
        currentMarkers.map((m) => ({
          time: m.time,
          sentiment: m.sentiment,
          color: currentHex[m.sentiment] ?? '#6b7280',
        }))
      );
      areaSeries.attachPrimitive(trianglePrimitive);
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

      // Build tooltip content (uses refs for latest values without triggering effect re-runs)
      const lines = matched.map((m) => {
        const label = tRef.current(`sentiment.${sentimentKey(m.sentiment)}`);
        const color = sentimentMarkerHexRef.current[m.sentiment] ?? '#6b7280';
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
  }, [candles, height, handleClick]);

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
  const { colors } = useColorPalette();
  const levels: { sentiment: Sentiment; color: string }[] = [
    { sentiment: 2, color: colors.sentimentMarkerHex[2] },
    { sentiment: 1, color: colors.sentimentMarkerHex[1] },
    { sentiment: 0, color: colors.sentimentMarkerHex[0] },
    { sentiment: -1, color: colors.sentimentMarkerHex[-1] },
    { sentiment: -2, color: colors.sentimentMarkerHex[-2] },
  ];

  return (
    <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs">
      {levels.map((l) => (
        <span key={l.sentiment} className="flex items-center gap-1.5">
          {l.sentiment > 0 ? (
            <span
              className="inline-block h-0 w-0"
              style={{
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderBottom: `8px solid ${l.color}`,
              }}
            />
          ) : l.sentiment < 0 ? (
            <span
              className="inline-block h-0 w-0"
              style={{
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: `8px solid ${l.color}`,
              }}
            />
          ) : (
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: l.color }}
            />
          )}
          <span className="text-muted-foreground">
            {t(`sentiment.${sentimentKey(l.sentiment)}`)}
          </span>
        </span>
      ))}
    </div>
  );
}
