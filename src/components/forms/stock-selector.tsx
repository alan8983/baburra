'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, Plus, Search, TrendingUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { StockSearchResult } from '@/domain/models';
import { useStocks } from '@/hooks';

export interface StockSelectorProps {
  /** 選中的 Stock 列表 */
  value: StockSearchResult[];
  /** 選擇變更回調 */
  onChange: (stocks: StockSearchResult[]) => void;
  /** 當用戶要新增 Stock 時的回調 */
  onCreateNew?: (ticker: string) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 佔位文字 */
  placeholder?: string;
  /** 自訂 className */
  className?: string;
  /** 最多可選數量 */
  maxSelection?: number;
}

export function StockSelector({
  value,
  onChange,
  onCreateNew,
  disabled = false,
  placeholder = '搜尋或選擇標的...',
  className,
  maxSelection,
}: StockSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  // Debounce 搜尋詞
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // 使用 API 取得 Stock 列表
  const { data, isLoading } = useStocks({
    search: debouncedSearch || undefined,
    limit: 20,
  });

  const stocks: StockSearchResult[] = React.useMemo(() => {
    if (!data?.data) return [];
    return data.data.map((stock) => ({
      id: stock.id,
      ticker: stock.ticker,
      name: stock.name,
      logoUrl: stock.logoUrl,
    }));
  }, [data]);

  // 檢查是否可以新增 (搜尋詞不在現有列表中)
  const canCreateNew = React.useMemo(() => {
    if (!search.trim()) return false;
    const upperSearch = search.toUpperCase().trim();
    return !stocks.some((stock) => stock.ticker.toUpperCase() === upperSearch);
  }, [search, stocks]);

  // 檢查是否已達最大選擇數量
  const isMaxReached = maxSelection !== undefined && value.length >= maxSelection;

  // 檢查 stock 是否已被選中
  const isSelected = (stock: StockSearchResult) => {
    return value.some((s) => s.id === stock.id);
  };

  const handleSelect = (stock: StockSearchResult) => {
    if (isSelected(stock)) {
      // 取消選擇
      onChange(value.filter((s) => s.id !== stock.id));
    } else if (!isMaxReached) {
      // 新增選擇
      onChange([...value, stock]);
    }
  };

  const handleRemove = (stock: StockSearchResult, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange(value.filter((s) => s.id !== stock.id));
  };

  const handleCreateNew = () => {
    if (onCreateNew && search.trim()) {
      onCreateNew(search.trim().toUpperCase());
      setSearch('');
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* 已選擇的標的 Badge 列表 */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((stock) => (
            <Badge
              key={stock.id}
              variant="secondary"
              className="hover:bg-secondary/80 cursor-pointer gap-1 pr-1"
            >
              <span className="font-semibold">{stock.ticker}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={(e) => handleRemove(stock, e)}
                disabled={disabled}
                data-testid={`stock-selector-remove-${stock.id}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {/* 搜尋選擇器 */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            'w-full justify-between font-normal',
            'text-muted-foreground'
          )}
          data-testid="stock-selector-trigger"
        >
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span>
              {value.length > 0
                ? `已選擇 ${value.length} 個標的${maxSelection ? ` (最多 ${maxSelection})` : ''}`
                : placeholder}
            </span>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </PopoverTrigger>
        <PopoverContent
          className="w-[350px] p-0"
          align="start"
          data-testid="stock-selector-popover"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="搜尋代碼或名稱..."
              value={search}
              onValueChange={setSearch}
              data-testid="stock-selector-input"
            />
            <CommandList>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                  <span className="text-muted-foreground ml-2 text-sm">搜尋中...</span>
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    {search ? (
                      <div className="py-2 text-center text-sm">找不到「{search}」</div>
                    ) : (
                      <div className="py-2 text-center text-sm">沒有投資標的資料</div>
                    )}
                  </CommandEmpty>
                  <CommandGroup heading="投資標的">
                    {stocks.map((stock) => {
                      const selected = isSelected(stock);
                      const canSelect = selected || !isMaxReached;

                      return (
                        <CommandItem
                          key={stock.id}
                          value={stock.id}
                          onSelect={() => canSelect && handleSelect(stock)}
                          className={cn(
                            'cursor-pointer',
                            !canSelect && 'cursor-not-allowed opacity-50'
                          )}
                          data-testid={`stock-selector-item-${stock.id}`}
                        >
                          <div className="mr-2 flex h-5 w-5 items-center justify-center rounded border">
                            {selected && <Check className="text-primary h-4 w-4" />}
                          </div>
                          <div className="flex flex-1 items-center gap-2">
                            <TrendingUp className="text-muted-foreground h-4 w-4" />
                            <span className="font-semibold">{stock.ticker}</span>
                            <span className="text-muted-foreground truncate">{stock.name}</span>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
              {!isLoading && (canCreateNew || onCreateNew) && !isMaxReached && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={handleCreateNew}
                      className="cursor-pointer"
                      disabled={!canCreateNew}
                      data-testid="stock-selector-create-button"
                    >
                      <Plus className="h-4 w-4" />
                      <span>
                        {canCreateNew
                          ? `新增標的「${search.toUpperCase()}」`
                          : '輸入代碼以新增標的'}
                      </span>
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
