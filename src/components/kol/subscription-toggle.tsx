'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscribe, useUnsubscribe, useSubscriptions } from '@/hooks/use-subscriptions';
import { TrackingLimitGate } from '@/components/paywall/tracking-limit-gate';
import { useUserTier } from '@/hooks/use-feature-gate';
import { TIER_LIMITS } from '@/lib/constants/tiers';

interface SubscriptionToggleProps {
  kolId: string;
  sourceId: string;
  isSubscribed: boolean;
}

export function SubscriptionToggle({ kolId, sourceId, isSubscribed }: SubscriptionToggleProps) {
  const t = useTranslations('subscriptions');
  const subscribe = useSubscribe();
  const unsubscribe = useUnsubscribe();
  const { data: subscriptions = [] } = useSubscriptions();
  const userTier = useUserTier();
  const [showLimitDialog, setShowLimitDialog] = useState(false);

  const isPending = subscribe.isPending || unsubscribe.isPending;

  const handleToggle = () => {
    const input = { kolId, sourceId };
    if (isSubscribed) {
      unsubscribe.mutate(input);
    } else {
      // Pre-check tracking limit before calling API
      const limit = TIER_LIMITS[userTier].kolTracking;
      if (subscriptions.length >= limit) {
        setShowLimitDialog(true);
        return;
      }
      subscribe.mutate(input);
    }
  };

  return (
    <>
      <Button
        variant={isSubscribed ? 'secondary' : 'outline'}
        size="sm"
        onClick={handleToggle}
        disabled={isPending}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isSubscribed ? (
          t('following')
        ) : (
          t('follow')
        )}
      </Button>
      <TrackingLimitGate
        open={showLimitDialog}
        onOpenChange={setShowLimitDialog}
        subscriptions={subscriptions}
        userTier={userTier}
      />
    </>
  );
}
