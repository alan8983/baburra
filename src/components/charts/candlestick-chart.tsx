'use client';

import { useEffect, useRef } from 'react';
import {
  createChart,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  createSeriesMarkers,
} from 'lightweight-charts';
import type { AutoscaleInfo } from 'lightweight-charts';
import type { CandlestickData, VolumeData } from '@/domain/models/stock';
import { useColorPalette } from '@/lib/colors/color-palette-context';
import type { FinancialColors } from '@/lib/colors/financial-colors';
import { resolveThemeColors } from './chart-utils';

export interface SentimentMarkerItem {
  time: string;
  sentiment: number;
  price?: number;
  text?: string;
}

interface CandlestickChartProps {
  candles: CandlestickData[];
  volumes?: VolumeData[];
  sentimentMarkers?: SentimentMarkerItem[];
  height?: number;
  className?: string;
}

function sentimentToMarkerShape(sentiment: number): 'arrowUp' | 'arrowDown' | 'circle' {
  if (sentiment > 0) return 'arrowUp';
  if (sentiment < 0) return 'arrowDown';
  return 'circle';
}

function sentimentToColor(sentiment: number, colors: FinancialColors): string {
  if (sentiment > 0) return colors.bullish.hex;
  if (sentiment < 0) return colors.bearish.hex;
  return colors.neutral.hex;
}

export function CandlestickChart({
  candles,
  volumes = [],
  sentimentMarkers = [],
  height = 400,
  className = '',
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const { colors } = useColorPalette();

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
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.candlestick.upColor,
      downColor: colors.candlestick.downColor,
      borderUpColor: colors.candlestick.upColor,
      borderDownColor: colors.candlestick.downColor,
      wickUpColor: colors.candlestick.upColor,
      wickDownColor: colors.candlestick.downColor,
    });
    candlestickSeries.setData(candles);

    if (sentimentMarkers.length > 0) {
      const markers = sentimentMarkers.map((m) => ({
        time: m.time as string,
        position: 'aboveBar' as const,
        shape: sentimentToMarkerShape(m.sentiment) as 'arrowUp' | 'arrowDown' | 'circle',
        color: sentimentToColor(m.sentiment, colors),
        text: m.text,
        ...(m.price != null && { price: m.price }),
      }));
      createSeriesMarkers(candlestickSeries, markers);
    }

    if (volumes.length > 0) {
      chart.addPane();
      const volumeSeries = chart.addSeries(
        HistogramSeries,
        {
          autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
            const res = original();
            if (res !== null && res.priceRange) {
              res.priceRange.minValue = 0;
              res.priceRange.maxValue *= 1.2; // 120% of max visible volume
            }
            return res;
          },
        },
        1
      );
      volumeSeries.setData(
        volumes.map((v) => ({
          time: v.time,
          value: v.value,
          color: v.color,
        }))
      );
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.2, bottom: 0 },
        borderVisible: false,
      });
    }

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, volumes, sentimentMarkers, height, colors]);

  return <div ref={containerRef} className={className} />;
}
