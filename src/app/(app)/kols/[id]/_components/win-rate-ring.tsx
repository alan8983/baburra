'use client';

import { cn } from '@/lib/utils';
import { useColorPalette } from '@/lib/colors/color-palette-context';

interface WinRateRingProps {
  value: number | null; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
  /**
   * 'fill-from-zero' (default): a single coloured arc grows clockwise from
   * 12 o'clock, length proportional to `value`. Used for σ-based hit rate
   * where 0% is the visual baseline.
   *
   * 'centred-gauge': two arcs grow outward from 12 o'clock — green clockwise
   * for `value > 50`, red counter-clockwise for `value < 50` — with arc
   * length proportional to `|value − 50|`. Used for directional hit rate
   * where 50% is the random baseline and direction-of-deviation matters.
   */
  mode?: 'fill-from-zero' | 'centred-gauge';
}

export function WinRateRing({
  value,
  size = 120,
  strokeWidth = 10,
  className,
  label,
  mode = 'fill-from-zero',
}: WinRateRingProps) {
  const { colors } = useColorPalette();
  void colors;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        {mode === 'fill-from-zero' && value !== null && (
          <FillFromZeroArc
            value={value}
            radius={radius}
            center={center}
            strokeWidth={strokeWidth}
            circumference={circumference}
          />
        )}
        {mode === 'centred-gauge' && value !== null && (
          <CentredGaugeArcs
            value={value}
            radius={radius}
            center={center}
            size={size}
            strokeWidth={strokeWidth}
            circumference={circumference}
          />
        )}
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold">{value !== null ? `${value.toFixed(0)}%` : '—'}</span>
        {label && <span className="text-muted-foreground text-xs">{label}</span>}
      </div>
    </div>
  );
}

interface ArcProps {
  value: number;
  radius: number;
  center: number;
  strokeWidth: number;
  circumference: number;
}

function FillFromZeroArc({ value, radius, center, strokeWidth, circumference }: ArcProps) {
  const offset = circumference - (value / 100) * circumference;
  const ringColor =
    value >= 50
      ? 'stroke-emerald-500 dark:stroke-emerald-400'
      : 'stroke-red-500 dark:stroke-red-400';
  return (
    <circle
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeDasharray={circumference}
      strokeDashoffset={offset}
      className={cn('animate-ring-fill', ringColor)}
    />
  );
}

function CentredGaugeArcs({
  value,
  radius,
  center,
  size,
  strokeWidth,
  circumference,
}: ArcProps & { size: number }) {
  // Deviation is in [0, 50]; arc length is `deviation / 100 × C` (so a max
  // deviation of 50 fills exactly half the ring).
  const deviation = Math.abs(value - 50);
  const arcLen = (deviation / 100) * circumference;

  if (value > 50) {
    return (
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${arcLen} ${circumference}`}
        className="animate-ring-fill stroke-emerald-500 dark:stroke-emerald-400"
      />
    );
  }
  if (value < 50) {
    // Mirror horizontally to draw the arc counter-clockwise from 12 o'clock.
    return (
      <g transform={`scale(-1, 1) translate(${-size}, 0)`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${arcLen} ${circumference}`}
          className="animate-ring-fill stroke-red-500 dark:stroke-red-400"
        />
      </g>
    );
  }
  // value === 50: no coloured arc; the grey baseline is the entire signal.
  return null;
}
