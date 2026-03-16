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
  Bookmark,
  Settings,
  Search,
  Rss,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

import { useUIStore } from '@/stores';
import { ROUTES } from '@/lib/constants';
import { APP_CONFIG } from '@/lib/constants/config';
import { TrumpetIcon } from '@/components/icons/trumpet-icon';
import { useDraftCount } from '@/hooks/use-drafts';
import { useOnboarding } from '@/hooks/use-onboarding';
import { Badge } from '@/components/ui/badge';
import { AiQuotaFooter, LogoutButton } from './sidebar';

const iconMap = {
  LayoutDashboard,
  PenLine,
  FileText,
  Users,
  TrendingUp,
  Newspaper,
  Bookmark,
  Settings,
  Search,
  Rss,
};

// Matching desktop sidebar groupings exactly
const navItems: Array<{
  key: string;
  href: string;
  icon: keyof typeof iconMap;
  showBadge?: boolean;
  showNewWhenNotOnboarded?: boolean;
}> = [
  { key: 'dashboard', href: ROUTES.DASHBOARD, icon: 'LayoutDashboard' },
  { key: 'quickInput', href: ROUTES.INPUT, icon: 'PenLine', showNewWhenNotOnboarded: true },
  { key: 'scrape', href: ROUTES.SCRAPE, icon: 'Search' },
  { key: 'drafts', href: ROUTES.DRAFTS, icon: 'FileText', showBadge: true },
  { key: 'bookmarks', href: ROUTES.BOOKMARKS, icon: 'Bookmark' },
  { key: 'subscriptions', href: ROUTES.SUBSCRIPTIONS, icon: 'Rss' },
];

const resourceItems: Array<{
  key: string;
  href: string;
  icon: keyof typeof iconMap;
}> = [
  { key: 'kolList', href: ROUTES.KOLS, icon: 'Users' },
  { key: 'stocks', href: ROUTES.STOCKS, icon: 'TrendingUp' },
  { key: 'allPosts', href: ROUTES.POSTS, icon: 'Newspaper' },
];

const settingsItems: Array<{
  key: string;
  href: string;
  icon: keyof typeof iconMap;
}> = [{ key: 'settings', href: ROUTES.SETTINGS, icon: 'Settings' }];

export function MobileNav() {
  const t = useTranslations('common');
  const pathname = usePathname();
  const { mobileMenuOpen, setMobileMenuOpen } = useUIStore();
  const { data: draftCount = 0 } = useDraftCount();
  const { isOnboardingCompleted } = useOnboarding();

  const renderNavItem = (item: {
    key: string;
    href: string;
    icon: keyof typeof iconMap;
    showBadge?: boolean;
    showNewWhenNotOnboarded?: boolean;
  }) => {
    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = iconMap[item.icon];

    return (
      <Link key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)}>
        <Button
          variant={isActive ? 'secondary' : 'ghost'}
          className={cn('w-full justify-start', isActive && 'bg-primary/10 font-semibold')}
        >
          <Icon className="mr-2 h-4 w-4" />
          <span className="flex-1 text-left">{t(`nav.${item.key}`)}</span>
          {item.showBadge && draftCount > 0 && (
            <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
              {draftCount}
            </span>
          )}
          {item.showNewWhenNotOnboarded && !isOnboardingCompleted && (
            <Badge variant="secondary" className="ml-auto px-1.5 py-0 text-[10px]">
              New
            </Badge>
          )}
        </Button>
      </Link>
    );
  };

  return (
    <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
      <SheetContent side="left" className="flex w-72 flex-col p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2">
            <TrumpetIcon className="text-primary h-5 w-5" />
            {APP_CONFIG.APP_NAME}
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-2 py-4">
          <div className="space-y-1">{navItems.map(renderNavItem)}</div>

          <Separator className="my-4" />

          <div className="space-y-1">{resourceItems.map(renderNavItem)}</div>

          <Separator className="my-4" />

          <div className="space-y-1">{settingsItems.map(renderNavItem)}</div>
        </ScrollArea>

        {/* AI Quota Footer — real dynamic data */}
        <AiQuotaFooter isCollapsed={false} />

        {/* Logout Button — shared component */}
        <LogoutButton isCollapsed={false} />
      </SheetContent>
    </Sheet>
  );
}
