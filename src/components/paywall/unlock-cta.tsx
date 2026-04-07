'use client';

import { LockKeyhole, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUpgradePrompt } from '@/components/paywall/upgrade-prompt';
import { useUnlockLayer2Mutation, useUnlockLayer3Mutation } from '@/hooks/use-unlocks';

type Variant =
  | { kind: 'layer2'; kolId: string; stockId: string }
  | { kind: 'layer3_locked' } // Free tier
  | { kind: 'layer3_credit_gated'; stockId: string; cost: number }; // Pro tier

interface UnlockCtaProps {
  variant: Variant;
  className?: string;
}

/**
 * Paywall CTA for Layer 2 / Layer 3 content.
 * - `layer2`: Free users click to spend one of their monthly free unlocks.
 *   On quota exhaustion the server throws 402 which opens the upgrade prompt.
 * - `layer3_locked`: Free users see upgrade-to-Pro prompt.
 * - `layer3_credit_gated`: Pro users spend credits to unlock a stock page.
 */
export function UnlockCta({ variant, className }: UnlockCtaProps) {
  const { openUpgrade } = useUpgradePrompt();
  const unlockL2 = useUnlockLayer2Mutation();
  const unlockL3 = useUnlockLayer3Mutation();

  if (variant.kind === 'layer2') {
    const handleClick = async () => {
      try {
        await unlockL2.mutateAsync({ kolId: variant.kolId, stockId: variant.stockId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('UPGRADE_REQUIRED') || msg.includes('402')) {
          openUpgrade('pro');
        }
      }
    };

    return (
      <div
        className={
          'bg-card flex flex-col items-center gap-3 rounded-lg border p-6 text-center ' +
          (className ?? '')
        }
      >
        <Sparkles className="text-primary size-6" />
        <div>
          <p className="text-sm font-medium">Unlock this KOL&apos;s deep dive</p>
          <p className="text-muted-foreground text-xs">
            See the full argument chain, backtest detail, and stance timeline for this ticker.
          </p>
        </div>
        <Button size="sm" onClick={handleClick} disabled={unlockL2.isPending}>
          {unlockL2.isPending ? 'Unlocking…' : 'Use a free unlock'}
        </Button>
      </div>
    );
  }

  if (variant.kind === 'layer3_locked') {
    return (
      <div
        className={
          'bg-card flex flex-col items-center gap-3 rounded-lg border p-6 text-center ' +
          (className ?? '')
        }
      >
        <LockKeyhole className="text-muted-foreground size-6" />
        <div>
          <p className="text-sm font-medium">Stock page is a Pro feature</p>
          <p className="text-muted-foreground text-xs">
            Upgrade to see cross-KOL consensus, sentiment trends, and aggregated arguments.
          </p>
        </div>
        <Button size="sm" onClick={() => openUpgrade('pro')}>
          Upgrade to Pro
        </Button>
      </div>
    );
  }

  // layer3_credit_gated
  const handleClick = async () => {
    try {
      await unlockL3.mutateAsync({ stockId: variant.stockId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('INSUFFICIENT_CREDITS')) {
        openUpgrade('max');
      }
    }
  };

  return (
    <div
      className={
        'bg-card flex flex-col items-center gap-3 rounded-lg border p-6 text-center ' +
        (className ?? '')
      }
    >
      <Zap className="text-primary size-6" />
      <div>
        <p className="text-sm font-medium">Unlock this stock page</p>
        <p className="text-muted-foreground text-xs">
          Spend {variant.cost} credits to unlock cross-KOL insights for this ticker. Unlocks are
          permanent.
        </p>
      </div>
      <Button size="sm" onClick={handleClick} disabled={unlockL3.isPending}>
        {unlockL3.isPending ? 'Unlocking…' : `Unlock (${variant.cost} credits)`}
      </Button>
    </div>
  );
}
