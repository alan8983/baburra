'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
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
import type { KOLSearchResult } from '@/domain/models';
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
  const t = useTranslations('forms');
  const createKol = useCreateKol();
  const [name, setName] = React.useState(defaultName);

  // 當預填名稱變更時更新表單
  React.useEffect(() => {
    if (open && defaultName) {
      setName(defaultName);
    }
  }, [open, defaultName]);

  const resetForm = () => {
    setName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    try {
      const newKOL = await createKol.mutateAsync({
        name: name.trim(),
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
              {t('kolForm.title')}
            </DialogTitle>
            <DialogDescription>{t('kolForm.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="kol-name">
                {t('kolForm.name')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="kol-name"
                placeholder={t('kolForm.namePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={createKol.isPending}
                autoFocus
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
              {t('kolForm.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || createKol.isPending}>
              {createKol.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('kolForm.creating')}
                </>
              ) : (
                t('kolForm.create')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
