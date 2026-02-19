'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronsUpDown, Loader2, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { KOLSearchResult } from '@/domain/models';
import { useKols } from '@/hooks';

export interface KOLSelectorProps {
  /** 選中的 KOL */
  value: KOLSearchResult | null;
  /** 選擇變更回調 */
  onChange: (kol: KOLSearchResult | null) => void;
  /** 當用戶要新增 KOL 時的回調 */
  onCreateNew?: (name: string) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 佔位文字 */
  placeholder?: string;
  /** 自訂 className */
  className?: string;
}

export function KOLSelector({
  value,
  onChange,
  onCreateNew,
  disabled = false,
  placeholder,
  className,
}: KOLSelectorProps) {
  const t = useTranslations('forms');
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

  // 使用 API 取得 KOL 列表
  const { data, isLoading } = useKols({
    search: debouncedSearch || undefined,
    limit: 20,
  });

  const kols: KOLSearchResult[] = React.useMemo(() => {
    if (!data?.data) return [];
    return data.data.map((kol) => ({
      id: kol.id,
      name: kol.name,
      avatarUrl: kol.avatarUrl,
    }));
  }, [data]);

  // 檢查是否可以新增 (搜尋詞不在現有列表中)
  const canCreateNew = React.useMemo(() => {
    if (!search.trim()) return false;
    const lowerSearch = search.toLowerCase().trim();
    return !kols.some((kol) => kol.name.toLowerCase() === lowerSearch);
  }, [search, kols]);

  const handleSelect = (kol: KOLSearchResult) => {
    onChange(kol);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const handleCreateNew = () => {
    if (onCreateNew && search.trim()) {
      onCreateNew(search.trim());
      setOpen(false);
      setSearch('');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        className={cn(
          buttonVariants({ variant: 'outline' }),
          'w-full justify-between font-normal',
          !value && 'text-muted-foreground',
          className
        )}
        data-testid="kol-selector-trigger"
      >
        {value ? (
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              <AvatarImage src={value.avatarUrl || undefined} />
              <AvatarFallback className="text-xs">{value.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="truncate">{value.name}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <span>{placeholder ?? t('kolSelector.placeholder')}</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          {value && (
            <div
              role="button"
              tabIndex={0}
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              className="shrink-0 cursor-pointer opacity-50 hover:opacity-100 focus:outline-none"
              data-testid="kol-selector-clear-button"
              aria-label={t('kolSelector.clearSelection')}
            >
              <X className="h-4 w-4" />
            </div>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start" data-testid="kol-selector-popover">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('kolSelector.searchPlaceholder')}
            value={search}
            onValueChange={setSearch}
            data-testid="kol-selector-input"
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
                <span className="text-muted-foreground ml-2 text-sm">
                  {t('kolSelector.searching')}
                </span>
              </div>
            ) : (
              <>
                <CommandEmpty>
                  {search ? (
                    <div className="py-2 text-center text-sm">
                      {t('kolSelector.notFound', { query: search })}
                    </div>
                  ) : (
                    <div className="py-2 text-center text-sm">{t('kolSelector.noData')}</div>
                  )}
                </CommandEmpty>
                <CommandGroup heading={t('kolSelector.list')}>
                  {kols.map((kol) => (
                    <CommandItem
                      key={kol.id}
                      value={kol.id}
                      onSelect={() => handleSelect(kol)}
                      className="cursor-pointer"
                      data-testid={`kol-selector-item-${kol.id}`}
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={kol.avatarUrl || undefined} />
                        <AvatarFallback className="text-xs">{kol.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate">{kol.name}</span>
                      {value?.id === kol.id && <Check className="text-primary h-4 w-4" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {!isLoading && (canCreateNew || onCreateNew) && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={handleCreateNew}
                    className="cursor-pointer"
                    disabled={!canCreateNew}
                    data-testid="kol-selector-create-button"
                  >
                    <Plus className="h-4 w-4" />
                    <span>
                      {canCreateNew
                        ? t('kolSelector.createNew', { name: search })
                        : t('kolSelector.createNewHint')}
                    </span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
