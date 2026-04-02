export type BillingMode = 'beta' | 'production';

export const BILLING_MODE: BillingMode =
  (process.env.NEXT_PUBLIC_BILLING_MODE as BillingMode) || 'production';

export const BETA_CREDIT_LIMIT = 5000;
export const BETA_KOL_TRACKING_LIMIT = 50;
export const USER_CAP = Number(process.env.USER_CAP) || 100;

export function isBetaMode(): boolean {
  return BILLING_MODE === 'beta';
}
