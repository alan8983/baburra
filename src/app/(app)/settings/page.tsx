'use client';

import { useState, useEffect } from 'react';
import { User, Loader2, AlertCircle, Crown, ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { useAuth } from '@/hooks/use-auth';
import { useProfile, useUpdateProfile } from '@/hooks/use-profile';
import { useAiUsage } from '@/hooks/use-ai';
import { useStripeCheckout, useStripePortal } from '@/hooks/use-subscription';
import { createClient } from '@/infrastructure/supabase/client';
import { APP_CONFIG } from '@/lib/constants/config';

const TIMEZONE_OPTION_KEYS = [
  { value: 'Asia/Taipei', key: 'taipei' },
  { value: 'Asia/Shanghai', key: 'shanghai' },
  { value: 'Asia/Tokyo', key: 'tokyo' },
  { value: 'Asia/Hong_Kong', key: 'hongkong' },
  { value: 'Asia/Singapore', key: 'singapore' },
  { value: 'America/New_York', key: 'newYork' },
  { value: 'America/Los_Angeles', key: 'losAngeles' },
  { value: 'Europe/London', key: 'london' },
  { value: 'UTC', key: 'utc' },
] as const;

export default function SettingsPage() {
  const t = useTranslations('settings');

  const TIMEZONE_OPTIONS = TIMEZONE_OPTION_KEYS.map((tz) => ({
    value: tz.value,
    label: t(`timezone.options.${tz.key}`),
  }));
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: aiUsage } = useAiUsage();
  const stripeCheckout = useStripeCheckout();
  const stripePortal = useStripePortal();
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Taipei');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isPremium = aiUsage?.subscriptionTier === 'premium';
  const usageCount = aiUsage?.usageCount ?? 0;
  const weeklyLimit = aiUsage?.weeklyLimit ?? APP_CONFIG.AI_FREE_WEEKLY_LIMIT;
  const usagePercent = weeklyLimit > 0 ? Math.round((usageCount / weeklyLimit) * 100) : 0;

  // 初始化顯示名稱和時區
  useEffect(() => {
    if (user) {
      setDisplayName(user.user_metadata?.display_name || '');
    }
  }, [user]);

  useEffect(() => {
    if (profile) {
      if (profile.displayName) setDisplayName(profile.displayName);
      setTimezone(profile.timezone);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // 更新 Supabase auth user_metadata
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: displayName || null,
        },
      });

      if (error) throw error;

      // 更新 profiles 表（displayName + timezone）
      await updateProfile.mutateAsync({ displayName, timezone });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('profile.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center">
          <p className="text-muted-foreground">{t('loginRequired')}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-muted-foreground">{t('description')}</p>
        </div>
        <LocaleSwitcher />
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          <CardDescription>{t('profile.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={user.user_metadata?.avatar_url || '/avatars/user.png'} />
              <AvatarFallback>
                {user.user_metadata?.display_name?.[0]?.toUpperCase() ||
                  user.email?.[0]?.toUpperCase() || <User className="h-8 w-8" />}
              </AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm" disabled>
              {t('profile.changeAvatar')}
            </Button>
          </div>

          {saveError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {t('profile.saveSuccess')}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="displayName">{t('profile.displayName')}</Label>
            <Input
              id="displayName"
              placeholder={t('profile.displayNamePlaceholder')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t('profile.email')}</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={user.email || ''}
              disabled
            />
            <p className="text-muted-foreground text-xs">{t('profile.emailCannotChange')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">{t('timezone.label')}</Label>
            <Select value={timezone} onValueChange={setTimezone} disabled={isSaving}>
              <SelectTrigger id="timezone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">{t('timezone.description')}</p>
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('profile.saving')}
              </>
            ) : (
              t('profile.save')
            )}
          </Button>
        </CardContent>
      </Card>

      {/* AI Quota Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {t('aiQuota.title')}
            {isPremium && <Crown className="h-4 w-4 text-yellow-500" />}
          </CardTitle>
          <CardDescription>{t('aiQuota.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('aiQuota.weeklyUsage')}</p>
              <p className="text-muted-foreground text-sm">{t('aiQuota.resetWeekly')}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">
                {usageCount} / {weeklyLimit}
              </p>
              <p className="text-muted-foreground text-xs">{t('aiQuota.times')}</p>
            </div>
          </div>

          <div className="bg-muted h-2 w-full rounded-full">
            <div
              className={`h-full rounded-full ${
                usagePercent > 80
                  ? 'bg-red-500'
                  : usagePercent > 50
                    ? 'bg-yellow-500'
                    : 'bg-primary'
              }`}
              style={{ width: `${Math.min(usagePercent, 100)}%` }}
            />
          </div>

          <p className="text-muted-foreground text-sm">
            {isPremium ? t('aiQuota.premiumUserDescription') : t('aiQuota.freeUserDescription')}
          </p>

          {!isPremium && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                const priceId =
                  billingPeriod === 'annual'
                    ? process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL
                    : process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY;
                if (priceId) stripeCheckout.mutate({ priceId });
              }}
              disabled={stripeCheckout.isPending}
            >
              {stripeCheckout.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('aiQuota.upgradeToPremium')}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Subscription Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('subscription.title')}</CardTitle>
          <CardDescription>{t('subscription.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current plan badge */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">
                {isPremium ? t('subscription.premiumPlanName') : t('subscription.freePlanName')}
              </p>
              <p className="text-muted-foreground text-sm">
                {isPremium
                  ? t('subscription.premiumDescription')
                  : t('subscription.freeDescription')}
              </p>
            </div>
            <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-medium">
              {t('subscription.currentPlan')}
            </span>
          </div>

          {isPremium ? (
            /* Premium user: manage subscription */
            <Button
              variant="outline"
              className="w-full"
              onClick={() => stripePortal.mutate()}
              disabled={stripePortal.isPending}
            >
              {stripePortal.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              {t('subscription.manageSubscription')}
            </Button>
          ) : (
            /* Free user: upgrade options */
            <>
              <Separator />

              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{t('subscription.premiumPlanName')}</p>
                    <p className="text-muted-foreground text-sm">
                      {t('subscription.premiumDescription')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">
                      $
                      {billingPeriod === 'annual'
                        ? APP_CONFIG.PREMIUM_ANNUAL_PRICE
                        : APP_CONFIG.PREMIUM_MONTHLY_PRICE}
                      /
                      {billingPeriod === 'annual'
                        ? t('subscription.year')
                        : t('subscription.month')}
                    </p>
                    {billingPeriod === 'annual' && (
                      <p className="text-xs text-green-600">
                        ${APP_CONFIG.PREMIUM_ANNUAL_PRICE / 12}/{t('subscription.month')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Billing period toggle */}
                <div className="mt-3 flex gap-2">
                  <Button
                    variant={billingPeriod === 'monthly' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setBillingPeriod('monthly')}
                  >
                    {t('subscription.monthly')}
                  </Button>
                  <Button
                    variant={billingPeriod === 'annual' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setBillingPeriod('annual')}
                  >
                    {t('subscription.annual')} (-25%)
                  </Button>
                </div>

                <Button
                  className="mt-4 w-full"
                  onClick={() => {
                    const priceId =
                      billingPeriod === 'annual'
                        ? process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL
                        : process.env.NEXT_PUBLIC_STRIPE_PRICE_ID_MONTHLY;
                    if (priceId) stripeCheckout.mutate({ priceId });
                  }}
                  disabled={stripeCheckout.isPending}
                >
                  {stripeCheckout.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {t('subscription.upgrade')}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">{t('dangerZone.title')}</CardTitle>
          <CardDescription>{t('dangerZone.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('dangerZone.deleteAccount')}</p>
              <p className="text-muted-foreground text-sm">
                {t('dangerZone.deleteAccountDescription')}
              </p>
            </div>
            <Button variant="destructive" size="sm">
              {t('dangerZone.deleteAccount')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
