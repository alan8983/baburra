'use client';

import { useAnimatedCounter } from '@/lib/animations';

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  formatter?: (value: number, locale: string) => string;
  locale?: string;
}

export function AnimatedNumber({
  value,
  duration = 600,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
  formatter,
  locale = 'en',
}: AnimatedNumberProps) {
  const animated = useAnimatedCounter(value, { duration, decimals, enabled: true });

  const display = formatter ? formatter(animated, locale) : animated.toFixed(decimals);

  return (
    <span className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
