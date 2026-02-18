'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  PenLine,
  FileText,
  Users,
  TrendingUp,
  Newspaper,
  Settings,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useUIStore } from '@/stores';
import { ROUTES } from '@/lib/constants';
import { APP_CONFIG } from '@/lib/constants/config';
import { useAuth } from '@/hooks/use-auth';
import { useDraftCount } from '@/hooks/use-drafts';

const iconMap = {
  LayoutDashboard,
  PenLine,
  FileText,
  Users,
  TrendingUp,
  Newspaper,
  Settings,
};

const allNavItems: Array<{
  key: string;
  href: string;
  icon: keyof typeof iconMap;
  showBadge?: boolean;
}> = [
  { key: 'dashboard', href: ROUTES.DASHBOARD, icon: 'LayoutDashboard' },
  { key: 'quickInput', href: ROUTES.INPUT, icon: 'PenLine' },
  { key: 'drafts', href: ROUTES.DRAFTS, icon: 'FileText', showBadge: true },
  { key: 'kolList', href: ROUTES.KOLS, icon: 'Users' },
  { key: 'stocks', href: ROUTES.STOCKS, icon: 'TrendingUp' },
  { key: 'allPosts', href: ROUTES.POSTS, icon: 'Newspaper' },
  { key: 'settings', href: ROUTES.SETTINGS, icon: 'Settings' },
];

export function MobileNav() {
  const t = useTranslations('common');
  const pathname = usePathname();
  const { mobileMenuOpen, setMobileMenuOpen } = useUIStore();
  const { signOut, loading } = useAuth();
  const { data: draftCount = 0 } = useDraftCount();

  const handleLogout = async () => {
    try {
      await signOut();
      setMobileMenuOpen(false);
    } catch {
      // 錯誤已在 hook 中處理
    }
  };

  return (
    <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2">
            <TrendingUp className="text-primary h-5 w-5" />
            {APP_CONFIG.APP_NAME}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-1">
            {allNavItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = iconMap[item.icon];

              return (
                <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
                  <Button
                    variant={isActive ? 'secondary' : 'ghost'}
                    className={cn(
                      'w-full justify-start',
                      isActive && 'bg-primary/10 font-semibold'
                    )}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    <span className="flex-1 text-left">{t(`nav.${item.key}`)}</span>
                    {item.showBadge && draftCount > 0 && (
                      <Badge variant="secondary" className="ml-auto">
                        {draftCount}
                      </Badge>
                    )}
                  </Button>
                </Link>
              );
            })}
          </div>

          <Separator className="my-4" />

          {/* AI Quota */}
          <div className="rounded-lg border p-3">
            <div className="text-muted-foreground text-xs">
              <span>{t('ai.quota')}: </span>
              <span className="text-foreground font-medium">12/15</span>
              <span> {t('ai.quotaThisWeek')}</span>
            </div>
            <div className="bg-muted mt-2 h-1.5 w-full rounded-full">
              <div className="bg-primary h-full rounded-full" style={{ width: '80%' }} />
            </div>
          </div>

          <Separator className="my-4" />

          {/* Logout Button */}
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 w-full justify-start"
            onClick={handleLogout}
            disabled={loading}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t('actions.logout')}
          </Button>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
