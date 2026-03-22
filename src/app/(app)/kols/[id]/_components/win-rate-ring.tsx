'use client';

import { cn } from '@/lib/utils';
import { useColorPalette } from '@/lib/colors/color-palette-context';

interface WinRateRingProps {
  value: number | null; // 0-100
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
}

export function WinRateRing({
  value,
  size = 120,
  strokeWidth = 10,
  className,
  label,
}: WinRateRingProps) {
  const { colors } = useColorPalette();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = value !== null ? circumference - (value / 100) * circumference : circumference;
  const center = size / 2;

  const ringColor =
    value !== null && value >= 50
      ? 'stroke-emerald-500 dark:stroke-emerald-400'
      : value !== null
        ? 'stroke-red-500 dark:stroke-red-400'
        : 'stroke-muted';

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        style={
          {
            '--ring-circumference': `${circumference}`,
            '--ring-offset': `${offset}`,
          } as React.CSSProperties
        }
      >
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        {/* Progress ring */}
        {value !== null && (
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
