'use client';

import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSubscribe, useUnsubscribe } from '@/hooks/use-subscriptions';

interface SubscriptionToggleProps {
  kolId: string;
  sourceId: string;
  isSubscribed: boolean;
}

export function SubscriptionToggle({ kolId, sourceId, isSubscribed }: SubscriptionToggleProps) {
  const t = useTranslations('subscriptions');
  const subscribe = useSubscribe();
  const unsubscribe = useUnsubscribe();

  const isPending = subscribe.isPending || unsubscribe.isPending;

  const handleToggle = () => {
    const input = { kolId, sourceId };
    if (isSubscribed) {
      unsubscribe.mutate(input);
    } else {
      subscribe.mutate(input);
    }
  };

  return (
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
  );
}
