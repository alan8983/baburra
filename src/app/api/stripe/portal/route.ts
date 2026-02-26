/**
 * Stripe Customer Portal API
 * POST /api/stripe/portal
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { getCurrentUserId } from '@/infrastructure/supabase/server';
import { getSubscription } from '@/infrastructure/repositories/subscription.repository';
import { internalError } from '@/lib/api/error';

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const subscription = await getSubscription(userId);

    if (!subscription.stripeCustomerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 });
    }

    const origin = request.headers.get('origin') || 'http://localhost:3000';

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${origin}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return internalError(error, 'Failed to create portal session');
  }
}
