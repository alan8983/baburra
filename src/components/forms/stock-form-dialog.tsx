'use client';

import * as React from 'react';
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

const MARKET_OPTIONS: { value: Market; label: string }[] = [
  { value: 'US', label: '美股 (US)' },
  { value: 'TW', label: '台股 (TW)' },
  { value: 'HK', label: '港股 (HK)' },
  { value: 'CRYPTO', label: '加密貨幣' },
];

export interface StockFormDialogProps {
  /** 是否開啟 */
  open: boolean;
  /** 關閉回調 */
  onOpenChange: (open: boolean) => void;
  /** 預填的代碼 */
  defaultTicker?: string;
  /** 建立成功回調 */
  onSuccess?: (stock: StockSearchResult) => void;
}

export function StockFormDialog({
  open,
  onOpenChange,
  defaultTicker = '',
  onSuccess,
}: StockFormDialogProps) {
  const createStock = useCreateStock();
  const [formData, setFormData] = React.useState<CreateStockInput>({
    ticker: defaultTicker,
    name: '',
    market: 'US',
  });

  // 當預填代碼變更時更新表單
  React.useEffect(() => {
    if (open && defaultTicker) {
      setFormData((prev) => ({ ...prev, ticker: defaultTicker.toUpperCase() }));
    }
  }, [open, defaultTicker]);

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
              新增投資標的
            </DialogTitle>
            <DialogDescription>建立新的投資標的，之後系統會自動抓取股價資料</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* 股票代碼 */}
            <div className="grid gap-2">
              <Label htmlFor="stock-ticker">
                股票代碼 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="stock-ticker"
                placeholder="例如：AAPL、TSLA、2330"
                value={formData.ticker}
                onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
                disabled={createStock.isPending}
                autoFocus
                className="uppercase"
              />
              <p className="text-muted-foreground text-xs">
                請輸入股票代碼，例如美股輸入 AAPL，台股輸入 2330
              </p>
            </div>

            {/* 公司名稱 */}
            <div className="grid gap-2">
              <Label htmlFor="stock-name">
                公司名稱 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="stock-name"
                placeholder="例如：Apple Inc."
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={createStock.isPending}
              />
            </div>

            {/* 市場 */}
            <div className="grid gap-2">
              <Label htmlFor="stock-market">市場</Label>
              <Select
                value={formData.market}
                onValueChange={(value: Market) => setFormData({ ...formData, market: value })}
                disabled={createStock.isPending}
              >
                <SelectTrigger id="stock-market">
                  <SelectValue placeholder="選擇市場" />
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
              取消
            </Button>
            <Button
              type="submit"
              disabled={!formData.ticker.trim() || !formData.name.trim() || createStock.isPending}
            >
              {createStock.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  建立中...
                </>
              ) : (
                '建立標的'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
