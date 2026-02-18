'use client';

import { useState, useEffect } from 'react';
import { User, Loader2, AlertCircle } from 'lucide-react';
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
import { createClient } from '@/infrastructure/supabase/client';

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Taipei', label: '台北 (UTC+8)' },
  { value: 'Asia/Shanghai', label: '上海 (UTC+8)' },
  { value: 'Asia/Tokyo', label: '東京 (UTC+9)' },
  { value: 'Asia/Hong_Kong', label: '香港 (UTC+8)' },
  { value: 'Asia/Singapore', label: '新加坡 (UTC+8)' },
  { value: 'America/New_York', label: '紐約 (UTC-5)' },
  { value: 'America/Los_Angeles', label: '洛杉磯 (UTC-8)' },
  { value: 'Europe/London', label: '倫敦 (UTC+0)' },
  { value: 'UTC', label: 'UTC' },
] as const;

export default function SettingsPage() {
  const t = useTranslations('settings');
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState('Asia/Taipei');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

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
            <Label htmlFor="email">Email</Label>
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
          <CardTitle>{t('aiQuota.title')}</CardTitle>
          <CardDescription>{t('aiQuota.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('aiQuota.weeklyUsage')}</p>
              <p className="text-muted-foreground text-sm">{t('aiQuota.resetWeekly')}</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">12 / 15</p>
              <p className="text-muted-foreground text-xs">{t('aiQuota.times')}</p>
            </div>
          </div>

          <div className="bg-muted h-2 w-full rounded-full">
            <div className="bg-primary h-full rounded-full" style={{ width: '80%' }} />
          </div>

          <p className="text-muted-foreground text-sm">{t('aiQuota.freeUserDescription')}</p>

          <Button variant="outline" className="w-full">
            {t('aiQuota.upgradeToPremium')}
          </Button>
        </CardContent>
      </Card>

      {/* Subscription Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('subscription.title')}</CardTitle>
          <CardDescription>{t('subscription.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">Free Plan</p>
              <p className="text-muted-foreground text-sm">{t('subscription.freeDescription')}</p>
            </div>
            <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-medium">
              {t('subscription.currentPlan')}
            </span>
          </div>

          <Separator />

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Premium Plan</p>
                <p className="text-muted-foreground text-sm">
                  {t('subscription.premiumDescription')}
                </p>
              </div>
              <p className="font-bold">$9.99/月</p>
            </div>
            <Button className="mt-4 w-full">{t('subscription.upgrade')}</Button>
          </div>
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
