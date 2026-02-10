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
import { LocaleSwitcher } from '@/components/layout/locale-switcher';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/infrastructure/supabase/client';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const { user, loading: authLoading } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // 初始化顯示名稱
  useEffect(() => {
    if (user) {
      setDisplayName(user.user_metadata?.display_name || '');
    }
  }, [user]);

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: displayName || null,
        },
      });

      if (error) throw error;

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading) {
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
          <CardTitle>個人資料</CardTitle>
          <CardDescription>更新您的個人資訊</CardDescription>
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
              更換頭像
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
              變更已儲存
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="displayName">顯示名稱</Label>
            <Input
              id="displayName"
              placeholder="您的顯示名稱"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="your@email.com" value={user.email || ''} disabled />
            <p className="text-muted-foreground text-xs">Email 無法更改</p>
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                儲存中...
              </>
            ) : (
              '儲存變更'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* AI Quota Section */}
      <Card>
        <CardHeader>
          <CardTitle>AI 配額</CardTitle>
          <CardDescription>您的 AI 功能使用狀況</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">本週使用量</p>
              <p className="text-muted-foreground text-sm">每週一重置</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">12 / 15</p>
              <p className="text-muted-foreground text-xs">次</p>
            </div>
          </div>

          <div className="bg-muted h-2 w-full rounded-full">
            <div className="bg-primary h-full rounded-full" style={{ width: '80%' }} />
          </div>

          <p className="text-muted-foreground text-sm">
            免費用戶每週可使用 15 次 AI 分析功能。升級至 Premium 可獲得更多配額。
          </p>

          <Button variant="outline" className="w-full">
            升級至 Premium
          </Button>
        </CardContent>
      </Card>

      {/* Subscription Section */}
      <Card>
        <CardHeader>
          <CardTitle>訂閱方案</CardTitle>
          <CardDescription>管理您的訂閱</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">Free Plan</p>
              <p className="text-muted-foreground text-sm">基本功能，每週 15 次 AI 分析</p>
            </div>
            <span className="bg-primary/10 text-primary rounded-full px-3 py-1 text-sm font-medium">
              目前方案
            </span>
          </div>

          <Separator />

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Premium Plan</p>
                <p className="text-muted-foreground text-sm">每週 100 次 AI 分析、優先支援</p>
              </div>
              <p className="font-bold">$9.99/月</p>
            </div>
            <Button className="mt-4 w-full">升級</Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">危險區域</CardTitle>
          <CardDescription>這些操作無法復原，請謹慎操作</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">刪除帳戶</p>
              <p className="text-muted-foreground text-sm">永久刪除您的帳戶和所有資料</p>
            </div>
            <Button variant="destructive" size="sm">
              刪除帳戶
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
