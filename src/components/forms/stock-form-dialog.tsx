'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, TrendingUp } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CreateStockInput, Market, StockSearchResult } from '@/domain/models';
import { useCreateStock } from '@/hooks';

export interface StockFormDialogProps {
  /** 是否開啟 */
  open: boolean;
  /** 關閉回調 */
  onOpenChange: (open: boolean) => void;
  /** 預填的代碼 */
  defaultTicker?: string;
  /** 預填的公司名稱 (e.g. from AI) */
  defaultName?: string;
  /** 預填的市場 */
  defaultMarket?: Market;
  /** 建立成功回調 */
  onSuccess?: (stock: StockSearchResult) => void;
}

export function StockFormDialog({
  open,
  onOpenChange,
  defaultTicker = '',
  defaultName = '',
  defaultMarket,
  onSuccess,
}: StockFormDialogProps) {
  const t = useTranslations('forms');
  const createStock = useCreateStock();

  const MARKET_OPTIONS: { value: Market; label: string }[] = [
    { value: 'US', label: t('stockForm.markets.us') },
    { value: 'TW', label: t('stockForm.markets.tw') },
    { value: 'HK', label: t('stockForm.markets.hk') },
    { value: 'CRYPTO', label: t('stockForm.markets.crypto') },
  ];
  const [formData, setFormData] = React.useState<CreateStockInput>({
    ticker: defaultTicker,
    name: defaultName,
    market: defaultMarket ?? 'US',
  });

  // 當預填代碼或名稱變更時更新表單
  React.useEffect(() => {
    if (open) {
      setFormData((prev) => ({
        ...prev,
        ticker: defaultTicker ? defaultTicker.toUpperCase() : prev.ticker,
        name: defaultName || prev.name,
        market: defaultMarket ?? prev.market,
      }));
    }
  }, [open, defaultTicker, defaultName, defaultMarket]);

  // 重置表單
  const resetForm = () => {
    setFormData({
      ticker: '',
      name: '',
      market: 'US',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.ticker.trim() || !formData.name.trim()) return;

    try {
      const newStock = await createStock.mutateAsync({
        ticker: formData.ticker.trim().toUpperCase(),
        name: formData.name.trim(),
        market: formData.market,
      });

      const stockResult: StockSearchResult = {
        id: newStock.id,
        ticker: newStock.ticker,
        name: newStock.name,
        logoUrl: newStock.logoUrl,
      };

      onSuccess?.(stockResult);
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error('Failed to create Stock:', error);
    }
  };

  const handleClose = () => {
    if (!createStock.isPending) {
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
              <TrendingUp className="h-5 w-5" />
              {t('stockForm.title')}
            </DialogTitle>
            <DialogDescription>{t('stockForm.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* 股票代碼 */}
            <div className="grid gap-2">
              <Label htmlFor="stock-ticker">
                {t('stockForm.ticker')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="stock-ticker"
                placeholder={t('stockForm.tickerPlaceholder')}
                value={formData.ticker}
                onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
                disabled={createStock.isPending}
                autoFocus
                className="uppercase"
              />
              <p className="text-muted-foreground text-xs">{t('stockForm.helpText')}</p>
            </div>

            {/* 公司名稱 */}
            <div className="grid gap-2">
              <Label htmlFor="stock-name">
                {t('stockForm.name')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="stock-name"
                placeholder={t('stockForm.namePlaceholder')}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={createStock.isPending}
              />
            </div>

            {/* 市場 */}
            <div className="grid gap-2">
              <Label htmlFor="stock-market">{t('stockForm.market')}</Label>
              <Select
                value={formData.market}
                onValueChange={(value: Market) => setFormData({ ...formData, market: value })}
                disabled={createStock.isPending}
              >
                <SelectTrigger id="stock-market">
                  <SelectValue placeholder={t('stockForm.marketPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {MARKET_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={createStock.isPending}
            >
              {t('stockForm.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!formData.ticker.trim() || !formData.name.trim() || createStock.isPending}
            >
              {createStock.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('stockForm.creating')}
                </>
              ) : (
                t('stockForm.create')
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
