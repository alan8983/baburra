'use client';

import { Bell, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ROUTES } from '@/lib/constants';
import { useNotifications } from '@/hooks/use-notifications';

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const t = useTranslations('scrape.notifications');
  const { notifications, unreadCount, dismiss, dismissAll } = useNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="end" forceMount>
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t('title')}</span>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-auto px-1 py-0 text-xs"
              onClick={(e) => {
                e.preventDefault();
                dismissAll();
              }}
            >
              {t('dismissAll')}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {notifications.length === 0 ? (
          <div className="text-muted-foreground px-2 py-4 text-center text-sm">{t('empty')}</div>
        ) : (
          notifications.slice(0, 10).map((notification) => (
            <DropdownMenuItem key={notification.id} asChild className="cursor-pointer">
              <div className="flex items-start gap-2 px-2 py-2">
                <Link
                  href={notification.kolId ? ROUTES.KOL_DETAIL(notification.kolId) : '#'}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate text-sm font-medium">
                    {t('scrapeComplete', {
                      count: notification.imported,
                      kolName: notification.kolName,
                    })}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatRelativeTime(notification.timestamp)}
                  </p>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dismiss(notification.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
