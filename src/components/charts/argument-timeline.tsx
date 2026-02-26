'use client';

/**
 * 論點時間分布圖表
 * Scatter/bubble chart showing argument mentions over time by category.
 * X-axis: months, Y-axis: argument categories, color: sentiment, size: confidence
 */

import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { StockArgumentSummary } from '@/hooks/use-ai';
import { useColorPalette } from '@/lib/colors/color-palette-context';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelinePoint {
  id: string;
  date: Date;
  categoryCode: string;
  categoryName: string;
  sentiment: number;
  confidence: number | null;
  summary: string | null;
  kolName: string;
}

interface ArgumentTimelineProps {
  data: StockArgumentSummary;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_PADDING = { top: 24, right: 16, bottom: 48, left: 120 };
const ROW_HEIGHT = 36;
const MIN_CHART_HEIGHT = 160;
const DOT_MIN_R = 4;
const DOT_MAX_R = 10;

// sentimentColor is now resolved inside the component via useColorPalette

function sentimentOpacity(s: number): number {
  return Math.abs(s) >= 2 ? 0.9 : 0.7;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flatten the hierarchical StockArgumentSummary into a flat list of points. */
function flattenArguments(data: StockArgumentSummary): TimelinePoint[] {
  const points: TimelinePoint[] = [];
  for (const group of data.summary) {
    for (const child of group.children) {
      for (const arg of child.arguments) {
        points.push({
          id: arg.id,
          date: new Date(arg.createdAt),
          categoryCode: child.category.code,
          categoryName: child.category.name,
          sentiment: arg.sentiment,
          confidence: arg.confidence,
          summary: arg.summary,
          kolName: arg.kol?.name ?? '',
        });
      }
    }
  }
  return points;
}

/** Generate an array of month ticks spanning [minDate, maxDate]. */
function monthTicks(minDate: Date, maxDate: Date): Date[] {
  const ticks: Date[] = [];
  const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1);
  const cur = new Date(start);
  while (cur <= end) {
    ticks.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return ticks;
}

/** Radius based on confidence (0–1 scale). */
function dotRadius(confidence: number | null): number {
  const c = confidence ?? 0.5;
  return DOT_MIN_R + (DOT_MAX_R - DOT_MIN_R) * Math.max(0, Math.min(1, c));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArgumentTimeline({ data }: ArgumentTimelineProps) {
  const t = useTranslations('stocks.detail.arguments');
  const { colors } = useColorPalette();

  const sentimentColor = (s: number): string => {
    if (s >= 2) return colors.bullish.hexDark;
    if (s >= 1) return colors.bullish.hex;
    if (s === 0) return '#9ca3af'; // gray-400
    if (s >= -1) return colors.bearish.hex;
    return colors.bearish.hexDark;
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    point: TimelinePoint;
  } | null>(null);

  const { points, categories, ticks, minTs, maxTs } = useMemo(() => {
    const pts = flattenArguments(data);
    if (pts.length === 0) return { points: [], categories: [], ticks: [], minTs: 0, maxTs: 0 };

    // Unique categories in display order
    const catOrder: string[] = [];
    const catNameMap = new Map<string, string>();
    for (const group of data.summary) {
      for (const child of group.children) {
        if (!catOrder.includes(child.category.code)) {
          catOrder.push(child.category.code);
          catNameMap.set(child.category.code, child.category.name);
        }
      }
    }

    const dates = pts.map((p) => p.date.getTime());
    const mn = new Date(Math.min(...dates));
    const mx = new Date(Math.max(...dates));
    const tk = monthTicks(mn, mx);

    return {
      points: pts,
      categories: catOrder.map((code) => ({ code, name: catNameMap.get(code)! })),
      ticks: tk,
      minTs: tk[0]?.getTime() ?? mn.getTime(),
      maxTs: tk[tk.length - 1]?.getTime() ?? mx.getTime(),
    };
  }, [data]);

  if (points.length === 0) return null;

  const chartWidth = '100%';
  const innerHeight = Math.max(MIN_CHART_HEIGHT, categories.length * ROW_HEIGHT);
  const svgHeight = innerHeight + CHART_PADDING.top + CHART_PADDING.bottom;

  // Map category code → y position (center of row)
  const catY = new Map<string, number>();
  categories.forEach((cat, i) => {
    catY.set(cat.code, CHART_PADDING.top + i * ROW_HEIGHT + ROW_HEIGHT / 2);
  });

  const timeSpan = maxTs - minTs || 1;

  function xPos(date: Date, totalWidth: number): number {
    const inner = totalWidth - CHART_PADDING.left - CHART_PADDING.right;
    return CHART_PADDING.left + ((date.getTime() - minTs) / timeSpan) * inner;
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width={chartWidth}
        height={svgHeight}
        viewBox={`0 0 800 ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible"
      >
        {/* Horizontal grid lines per category */}
        {categories.map((cat) => (
          <line
            key={`grid-${cat.code}`}
            x1={CHART_PADDING.left}
            x2={800 - CHART_PADDING.right}
            y1={catY.get(cat.code)!}
            y2={catY.get(cat.code)!}
            className="stroke-border"
            strokeWidth={1}
            strokeDasharray="4 4"
            strokeOpacity={0.4}
          />
        ))}

        {/* Y-axis labels (category names) */}
        {categories.map((cat) => (
          <text
            key={`label-${cat.code}`}
            x={CHART_PADDING.left - 8}
            y={catY.get(cat.code)!}
            textAnchor="end"
            dominantBaseline="central"
            className="fill-foreground text-xs"
            fontSize={12}
          >
            {cat.name}
          </text>
        ))}

        {/* X-axis month ticks */}
        {ticks.map((tick, i) => {
          const tx = xPos(tick, 800);
          return (
            <g key={`tick-${i}`}>
              <line
                x1={tx}
                x2={tx}
                y1={CHART_PADDING.top}
                y2={CHART_PADDING.top + innerHeight}
                className="stroke-border"
                strokeWidth={1}
                strokeOpacity={0.2}
              />
              <text
                x={tx}
                y={CHART_PADDING.top + innerHeight + 20}
                textAnchor="middle"
                className="fill-muted-foreground text-xs"
                fontSize={11}
              >
                {tick.toLocaleDateString(undefined, { month: 'short' })}
              </text>
              {/* Show year label on January or first tick */}
              {(tick.getMonth() === 0 || i === 0) && (
                <text
                  x={tx}
                  y={CHART_PADDING.top + innerHeight + 34}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                  fontSize={10}
                >
                  {tick.getFullYear()}
                </text>
              )}
            </g>
          );
        })}

        {/* Data points */}
        {points.map((pt) => {
          const cx = xPos(pt.date, 800);
          const cy = catY.get(pt.categoryCode);
          if (cy === undefined) return null;
          const r = dotRadius(pt.confidence);
          return (
            <circle
              key={pt.id}
              cx={cx}
              cy={cy}
              r={r}
              fill={sentimentColor(pt.sentiment)}
              fillOpacity={sentimentOpacity(pt.sentiment)}
              stroke={sentimentColor(pt.sentiment)}
              strokeWidth={1}
              strokeOpacity={0.3}
              className="cursor-pointer transition-transform hover:scale-125"
              onMouseEnter={(e) => {
                const svg = e.currentTarget.ownerSVGElement;
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                const scaleX = rect.width / 800;
                const scaleY = rect.height / svgHeight;
                setTooltip({
                  x: cx * scaleX,
                  y: cy * scaleY,
                  point: pt,
                });
              }}
              onMouseLeave={() => setTooltip(null)}
            />
          );
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="bg-popover text-popover-foreground border-border pointer-events-none absolute z-50 max-w-60 rounded-md border px-3 py-2 text-xs shadow-md"
          style={{
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="font-medium">{tooltip.point.categoryName}</div>
          {tooltip.point.kolName && (
            <div className="text-muted-foreground mt-0.5 text-[10px]">{tooltip.point.kolName}</div>
          )}
          {tooltip.point.summary && (
            <div className="text-muted-foreground mt-1 line-clamp-2">{tooltip.point.summary}</div>
          )}
          <div className="mt-1 flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: sentimentColor(tooltip.point.sentiment) }}
            />
            <span>
              {tooltip.point.sentiment > 0
                ? t('bullish')
                : tooltip.point.sentiment < 0
                  ? t('bearish')
                  : t('neutral')}
            </span>
            {tooltip.point.confidence != null && (
              <span className="text-muted-foreground">
                {Math.round(tooltip.point.confidence * 100)}%
              </span>
            )}
          </div>
          <div className="text-muted-foreground mt-1">
            {tooltip.point.date.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: colors.bullish.hex }}
          />
          {t('bullish')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-400" />
          {t('neutral')}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: colors.bearish.hex }}
          />
          {t('bearish')}
        </span>
        <span className="text-muted-foreground ml-2">{t('timeline.sizeHint')}</span>
      </div>
    </div>
  );
}

export default ArgumentTimeline;
