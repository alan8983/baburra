/**
 * Stripe Checkout Session API
 * POST /api/stripe/checkout
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import {
  getSubscription,
  setStripeCustomerId,
} from '@/infrastructure/repositories/subscription.repository';
import { internalError } from '@/lib/api/error';

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { priceId } = await request.json();

    const monthlyPriceId = process.env.STRIPE_PRICE_ID_MONTHLY;
    const annualPriceId = process.env.STRIPE_PRICE_ID_ANNUAL;
    const allowedPriceIds = [monthlyPriceId, annualPriceId].filter(Boolean);

    if (!priceId || !allowedPriceIds.includes(priceId)) {
      return NextResponse.json({ error: 'Invalid price ID' }, { status: 400 });
    }

    const subscription = await getSubscription(userId);

    if (subscription.subscriptionTier === 'premium') {
      return NextResponse.json({ error: 'Already subscribed to premium' }, { status: 400 });
    }

    // Reuse existing Stripe customer or create one
    let stripeCustomerId = subscription.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        metadata: { userId },
      });
      stripeCustomerId = customer.id;
      await setStripeCustomerId(userId, stripeCustomerId);
    }

    const origin = request.headers.get('origin') || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings?checkout=success`,
      cancel_url: `${origin}/settings?checkout=cancel`,
      subscription_data: {
        metadata: { userId },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return internalError(error, 'Failed to create checkout session');
  }
}
