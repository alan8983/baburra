'use client';

import { cn } from '@/lib/utils';

interface FadeInProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}

/**
 * Wraps content in a fade-in animation.
 * Used for skeleton-to-content transitions.
 */
export function FadeIn({ children, className, delay }: FadeInProps) {
  return (
    <div
      className={cn('animate-fade-in', className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
