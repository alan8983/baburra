'use client';

import * as React from 'react';
import { Loader2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CreateKOLInput, KOLSearchResult } from '@/domain/models';
import { useCreateKol } from '@/hooks';

export interface KOLFormDialogProps {
  /** 是否開啟 */
  open: boolean;
  /** 關閉回調 */
  onOpenChange: (open: boolean) => void;
  /** 預填的名稱 */
  defaultName?: string;
  /** 建立成功回調 */
  onSuccess?: (kol: KOLSearchResult) => void;
}

export function KOLFormDialog({
  open,
  onOpenChange,
  defaultName = '',
  onSuccess,
}: KOLFormDialogProps) {
  const createKol = useCreateKol();
  const [formData, setFormData] = React.useState<CreateKOLInput>({
    name: defaultName,
    bio: '',
    socialLinks: {},
  });

  // 當預填名稱變更時更新表單
  React.useEffect(() => {
    if (open && defaultName) {
      setFormData((prev) => ({ ...prev, name: defaultName }));
    }
  }, [open, defaultName]);

  // 重置表單
  const resetForm = () => {
    setFormData({
      name: '',
      bio: '',
      socialLinks: {},
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) return;

    try {
      const newKOL = await createKol.mutateAsync({
        name: formData.name.trim(),
        bio: formData.bio || undefined,
        socialLinks: formData.socialLinks,
      });

      const kolResult: KOLSearchResult = {
        id: newKOL.id,
        name: newKOL.name,
        avatarUrl: newKOL.avatarUrl,
      };

      onSuccess?.(kolResult);
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error('Failed to create KOL:', error);
    }
  };

  const handleClose = () => {
    if (!createKol.isPending) {
      onOpenChange(false);
      resetForm();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              新增 KOL
            </DialogTitle>
            <DialogDescription>
              建立新的 KOL 資料，之後可以在 KOL 管理頁面編輯詳細資訊
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* 名稱 */}
            <div className="grid gap-2">
              <Label htmlFor="kol-name">
                名稱 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="kol-name"
                placeholder="輸入 KOL 名稱"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                disabled={createKol.isPending}
                autoFocus
              />
            </div>

            {/* 簡介 (可選) */}
            <div className="grid gap-2">
              <Label htmlFor="kol-bio">簡介 (可選)</Label>
              <Textarea
                id="kol-bio"
                placeholder="簡短介紹這位 KOL..."
                value={formData.bio || ''}
                onChange={(e) =>
                  setFormData({ ...formData, bio: e.target.value })
                }
                disabled={createKol.isPending}
                rows={3}
              />
            </div>

            {/* 社群連結 (可選) */}
            <div className="grid gap-2">
              <Label htmlFor="kol-twitter">Twitter / X (可選)</Label>
              <Input
                id="kol-twitter"
                placeholder="https://twitter.com/..."
                value={formData.socialLinks?.twitter || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    socialLinks: {
                      ...formData.socialLinks,
                      twitter: e.target.value,
                    },
                  })
                }
                disabled={createKol.isPending}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="kol-facebook">Facebook (可選)</Label>
              <Input
                id="kol-facebook"
                placeholder="https://facebook.com/..."
                value={formData.socialLinks?.facebook || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    socialLinks: {
                      ...formData.socialLinks,
                      facebook: e.target.value,
                    },
                  })
                }
                disabled={createKol.isPending}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createKol.isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={!formData.name.trim() || createKol.isPending}>
              {createKol.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  建立中...
                </>
              ) : (
                '建立 KOL'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
