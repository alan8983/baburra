'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// ── Reduced motion detection ──────────────────────────────────────────────────

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

function subscribeReducedMotion(callback: () => void): () => void {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

/**
 * Hook that returns whether reduced motion is preferred.
 * Uses useSyncExternalStore to avoid setState-in-effect lint errors.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );
}

// ── Animated counter ──────────────────────────────────────────────────────────

/**
 * Hook that counts from 0 to a target value over a duration.
 * Respects prefers-reduced-motion.
 */
export function useAnimatedCounter(
  target: number,
  options: {
    duration?: number;
    decimals?: number;
    enabled?: boolean;
  } = {}
) {
  const { duration = 600, decimals = 0, enabled = true } = options;
  const [value, setValue] = useState(0);
  const hasAnimated = useRef(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || hasAnimated.current) return;

    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || target === 0) {
      // Use rAF to avoid synchronous setState in effect
      rafRef.current = requestAnimationFrame(() => {
        setValue(target);
      });
      hasAnimated.current = true;
      return;
    }

    hasAnimated.current = true;
    const startTime = performance.now();

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = eased * target;

      setValue(Number(currentValue.toFixed(decimals)));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration, decimals, enabled]);

  return value;
}

// ── Stagger utility ───────────────────────────────────────────────────────────

/**
 * Returns a stagger class name for list items.
 * Used with the .animate-fade-up class.
 */
export function getStaggerClass(index: number): string {
  const capped = Math.min(index + 1, 10);
  return `animate-fade-up stagger-${capped}`;
}
