'use client';

import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">設定</h1>
        <p className="text-muted-foreground">
          管理您的帳戶設定和偏好
        </p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle>個人資料</CardTitle>
          <CardDescription>
            更新您的個人資訊
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src="/avatars/user.png" />
              <AvatarFallback>
                <User className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm">
              更換頭像
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="displayName">顯示名稱</Label>
            <Input
              id="displayName"
              placeholder="您的顯示名稱"
              defaultValue="開發者"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              defaultValue="dev@example.com"
              disabled
            />
            <p className="text-xs text-muted-foreground">
              Email 無法更改
            </p>
          </div>

          <Button>儲存變更</Button>
        </CardContent>
      </Card>

      {/* AI Quota Section */}
      <Card>
        <CardHeader>
          <CardTitle>AI 配額</CardTitle>
          <CardDescription>
            您的 AI 功能使用狀況
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">本週使用量</p>
              <p className="text-sm text-muted-foreground">
                每週一重置
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">12 / 15</p>
              <p className="text-xs text-muted-foreground">次</p>
            </div>
          </div>

          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: '80%' }}
            />
          </div>

          <p className="text-sm text-muted-foreground">
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
          <CardDescription>
            管理您的訂閱
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">Free Plan</p>
              <p className="text-sm text-muted-foreground">
                基本功能，每週 15 次 AI 分析
              </p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              目前方案
            </span>
          </div>

          <Separator />

          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Premium Plan</p>
                <p className="text-sm text-muted-foreground">
                  每週 100 次 AI 分析、優先支援
                </p>
              </div>
              <p className="font-bold">$9.99/月</p>
            </div>
            <Button className="mt-4 w-full">
              升級
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">危險區域</CardTitle>
          <CardDescription>
            這些操作無法復原，請謹慎操作
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">刪除帳戶</p>
              <p className="text-sm text-muted-foreground">
                永久刪除您的帳戶和所有資料
              </p>
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
