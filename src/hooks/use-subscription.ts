/**
 * Subscription Hook — Stripe 訂閱管理
 */

import { useMutation } from '@tanstack/react-query';
import { API_ROUTES } from '@/lib/constants/routes';

interface CheckoutInput {
  priceId: string;
}

/**
 * 建立 Stripe Checkout session 並跳轉到付款頁面
 */
export function useStripeCheckout() {
  return useMutation<void, Error, CheckoutInput>({
    mutationFn: async ({ priceId }) => {
      const res = await fetch(API_ROUTES.STRIPE_CHECKOUT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create checkout session');
      }
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    },
  });
}

/**
 * 開啟 Stripe Customer Portal 讓用戶自助管理訂閱
 */
export function useStripePortal() {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const res = await fetch(API_ROUTES.STRIPE_PORTAL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to open billing portal');
      }
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      }
    },
  });
}
