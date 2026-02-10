'use client';

import { Bell, Menu, Search, User, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useUIStore } from '@/stores';
import { ROUTES } from '@/lib/constants';
import { useAuth } from '@/hooks/use-auth';
import Link from 'next/link';

export function Header() {
  const t = useTranslations('common');
  const { setMobileMenuOpen } = useUIStore();
  const { user, signOut, loading } = useAuth();

  return (
    <header className="bg-background sticky top-0 z-40 flex h-16 items-center gap-4 border-b px-4 lg:px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setMobileMenuOpen(true)}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      {/* Search */}
      <div className="flex-1">
        <form className="relative max-w-md">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4" />
          <Input
            type="search"
            placeholder={t('actions.search')}
            className="bg-muted w-full appearance-none pl-8"
          />
        </form>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-medium">
            2
          </span>
          <span className="sr-only">Notifications</span>
        </Button>

        {/* User menu */}
        {user && !loading ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user.user_metadata?.avatar_url || '/avatars/user.png'} alt="User" />
                  <AvatarFallback>
                    {user.user_metadata?.display_name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || <User className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm leading-none font-medium">
                    {user.user_metadata?.display_name || t('actions.user')}
                  </p>
                  <p className="text-muted-foreground text-xs leading-none">{user.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={ROUTES.SETTINGS}>{t('nav.settings')}</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={async () => {
                  try {
                    await signOut();
                  } catch (error) {
                    // 錯誤已在 hook 中處理
                  }
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {t('actions.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          !loading && (
            <Button variant="ghost" asChild>
              <Link href={ROUTES.LOGIN}>{t('actions.login')}</Link>
            </Button>
          )
        )}
      </div>
    </header>
  );
}
