import { type NextRequest, NextResponse } from 'next/server';

// ── Experiment Configuration ──

export const AB_EXPERIMENTS = {
  ONBOARDING_BEFORE_REG: 'onboarding_before_reg_v1',
} as const;

export type Variant = 'A' | 'B';

export const AB_COOKIE_NAME = 'ab_variant';
export const AB_COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

// ── Server-side (Middleware) ──

/** Deterministic 50/50 split */
export function assignVariant(): Variant {
  return Math.random() < 0.5 ? 'A' : 'B';
}

/** Read variant from request cookie (server-side) */
export function getVariantFromRequest(request: NextRequest): Variant | null {
  const cookie = request.cookies.get(AB_COOKIE_NAME);
  if (cookie?.value === 'A' || cookie?.value === 'B') {
    return cookie.value as Variant;
  }
  return null;
}

/** Set variant cookie on response */
export function setVariantCookie(response: NextResponse, variant: Variant): void {
  response.cookies.set(AB_COOKIE_NAME, variant, {
    path: '/',
    httpOnly: false, // client-side needs to read it
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: AB_COOKIE_MAX_AGE,
  });
}

// ── Client-side ──

/** Read variant from document.cookie (client-side) */
export function getVariantFromCookie(): Variant | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${AB_COOKIE_NAME}=([AB])`));
  return match ? (match[1] as Variant) : null;
}
