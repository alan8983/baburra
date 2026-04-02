'use client';

import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUpgradePrompt } from '@/components/paywall/upgrade-prompt';
import { useUnsubscribe, type Subscription } from '@/hooks/use-subscriptions';
import { getEffectiveKolLimit } from '@/lib/constants/tiers';
import type { SubscriptionTier } from '@/domain/models/user';

interface TrackingLimitGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscriptions: Subscription[];
  userTier: SubscriptionTier;
}

export function TrackingLimitGate({
  open,
  onOpenChange,
  subscriptions,
  userTier,
}: TrackingLimitGateProps) {
  const t = useTranslations('paywall');
  const { openUpgrade } = useUpgradePrompt();
  const unsubscribe = useUnsubscribe();
  const limit = getEffectiveKolLimit(userTier);
  const current = subscriptions.length;

  const nextTier = userTier === 'free' ? 'pro' : 'max';
  const nextLimit = getEffectiveKolLimit(nextTier);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('tracking.title')}</DialogTitle>
          <DialogDescription>{t('tracking.description', { current, limit })}</DialogDescription>
        </DialogHeader>

        <div className="mb-2">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {current}/{limit}
            </span>
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${Math.min((current / limit) * 100, 100)}%` }}
            />
          </div>
        </div>

        <div className="max-h-48 space-y-2 overflow-y-auto">
          {subscriptions.map((sub) => (
            <div key={sub.id} className="flex items-center justify-between gap-2 py-1">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar className="size-7">
                  <AvatarImage src={sub.kolAvatarUrl ?? undefined} />
                  <AvatarFallback className="text-xs">{sub.kolName.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <span className="truncate text-sm">{sub.kolName}</span>
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() =>
                  unsubscribe.mutate(
                    { kolId: sub.kolId, sourceId: sub.kolSourceId },
                    { onSuccess: () => onOpenChange(subscriptions.length - 1 >= limit) }
                  )
                }
                disabled={unsubscribe.isPending}
              >
                {t('tracking.unsubscribe')}
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={() => {
              onOpenChange(false);
              openUpgrade(nextTier);
            }}
          >
            {t('tracking.upgrade', { limit: nextLimit })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
