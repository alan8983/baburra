/**
 * Stripe Webhook Handler
 * POST /api/stripe/webhook
 *
 * Handles subscription lifecycle events from Stripe.
 * This route is public (bypasses auth in middleware).
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import {
  getUserIdByStripeCustomerId,
  updateSubscription,
} from '@/infrastructure/repositories/subscription.repository';

/** Extract period end from subscription (Stripe v20+: lives on items, not subscription) */
function getPeriodEnd(sub: Stripe.Subscription): Date | null {
  const item = sub.items?.data?.[0];
  if (item?.current_period_end) {
    return new Date(item.current_period_end * 1000);
  }
  return null;
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Missing STRIPE_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription' || !session.customer || !session.subscription) break;

        const customerId =
          typeof session.customer === 'string' ? session.customer : session.customer.id;
        const userId = await getUserIdByStripeCustomerId(customerId);
        if (!userId) {
          console.error('No user found for Stripe customer:', customerId);
          break;
        }

        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id;

        // Fetch subscription to get period end
        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        await updateSubscription(userId, {
          subscriptionTier: 'premium',
          stripeSubscriptionId: subscriptionId,
          subscriptionPeriodEnd: getPeriodEnd(sub),
        });
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const userId = await getUserIdByStripeCustomerId(customerId);
        if (!userId) break;

        const isActive = sub.status === 'active' || sub.status === 'trialing';

        await updateSubscription(userId, {
          subscriptionTier: isActive ? 'premium' : 'free',
          subscriptionPeriodEnd: getPeriodEnd(sub),
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const userId = await getUserIdByStripeCustomerId(customerId);
        if (!userId) break;

        await updateSubscription(userId, {
          subscriptionTier: 'free',
          stripeSubscriptionId: null,
          subscriptionPeriodEnd: null,
        });
        break;
      }

      default:
        // Unhandled event type — ignore
        break;
    }
  } catch (error) {
    console.error('Error processing webhook event:', event.type, error);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
