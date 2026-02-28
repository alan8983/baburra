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
  ChevronLeft,
  ChevronRight,
  Sparkles,
  LogOut,
  Import,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

import { useUIStore } from '@/stores';
import { ROUTES } from '@/lib/constants';
import { APP_CONFIG } from '@/lib/constants/config';
import { TrumpetIcon } from '@/components/icons/trumpet-icon';
import { useAiUsage } from '@/hooks/use-ai';
import { useAuth } from '@/hooks/use-auth';
import { useDraftCount } from '@/hooks/use-drafts';
import { useOnboarding } from '@/hooks/use-onboarding';
import { Badge } from '@/components/ui/badge';

const iconMap = {
  LayoutDashboard,
  PenLine,
  FileText,
  Users,
  TrendingUp,
  Newspaper,
  Bookmark,
  Settings,
  Import,
};

// Navigation items will be translated in component
const navItems: Array<{
  key: string;
  href: string;
  icon: keyof typeof iconMap;
  showBadge?: boolean;
  showNewWhenNotOnboarded?: boolean;
}> = [
  { key: 'dashboard', href: ROUTES.DASHBOARD, icon: 'LayoutDashboard' },
  { key: 'quickInput', href: ROUTES.INPUT, icon: 'PenLine' },
  { key: 'import', href: ROUTES.IMPORT, icon: 'Import', showNewWhenNotOnboarded: true },
  { key: 'drafts', href: ROUTES.DRAFTS, icon: 'FileText', showBadge: true },
  { key: 'bookmarks', href: ROUTES.BOOKMARKS, icon: 'Bookmark' },
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

interface NavItemProps {
  label: string;
  href: string;
  icon: keyof typeof iconMap;
  badgeCount?: number;
  showNewBadge?: boolean;
  isCollapsed: boolean;
}

function NavItem({ label, href, icon, badgeCount, showNewBadge, isCollapsed }: NavItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  const Icon = iconMap[icon];

  return (
    <Link href={href}>
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        className={cn(
          'w-full justify-start',
          isCollapsed ? 'px-2' : 'px-3',
          isActive && 'bg-primary/10 font-semibold'
        )}
      >
        <Icon className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left">{label}</span>
            {badgeCount != null && badgeCount > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-medium text-white">
                {badgeCount}
              </span>
            )}
            {showNewBadge && (
              <Badge variant="secondary" className="ml-auto px-1.5 py-0 text-[10px]">
                New
              </Badge>
            )}
          </>
        )}
      </Button>
    </Link>
  );
}

function AiQuotaFooter({ isCollapsed }: { isCollapsed: boolean }) {
  const t = useTranslations('common');
  const { data: usage, isLoading } = useAiUsage();

  if (isCollapsed) {
    // 收合狀態只顯示圖示
    const percentage = usage ? (usage.remaining / usage.weeklyLimit) * 100 : 100;
    const colorClass =
      percentage > 50 ? 'text-green-500' : percentage > 20 ? 'text-yellow-500' : 'text-red-500';

    return (
      <div className="flex justify-center border-t p-2">
        <Sparkles
          className={cn('h-4 w-4', isLoading ? 'text-muted-foreground animate-pulse' : colorClass)}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="border-t p-4">
        <div className="text-muted-foreground animate-pulse text-xs">
          <span>{t('ai.quota')}: </span>
          <span className="font-medium">{t('ai.quotaLoading')}</span>
        </div>
        <div className="bg-muted mt-2 h-1.5 w-full rounded-full" />
      </div>
    );
  }

  if (!usage) {
    return null;
  }

  const percentage = (usage.remaining / usage.weeklyLimit) * 100;
  const colorClass =
    percentage > 50 ? 'bg-green-500' : percentage > 20 ? 'bg-yellow-500' : 'bg-red-500';

  // 格式化重置時間
  const formatResetTime = () => {
    if (!usage.resetAt) return '';
    const reset = new Date(usage.resetAt);
    const now = new Date();
    const diffDays = Math.ceil((reset.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return t('time.resetToday');
    if (diffDays === 1) return t('time.resetTomorrow');
    return t('time.resetInDays', { days: diffDays });
  };

  return (
    <div className="border-t p-4">
      <div className="flex items-center justify-between text-xs">
        <div className="text-muted-foreground flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          <span>{t('ai.quota')}</span>
        </div>
        <span className="text-muted-foreground">{formatResetTime()}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-bold">{usage.remaining}</span>
        <span className="text-muted-foreground text-sm">
          / {usage.weeklyLimit} {t('ai.quotaThisWeek')}
        </span>
      </div>
      <div className="bg-muted mt-2 h-1.5 w-full rounded-full">
        <div
          className={cn('h-full rounded-full transition-all', colorClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function Sidebar() {
  const t = useTranslations('common');
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { data: draftCount = 0 } = useDraftCount();
  const { isOnboardingCompleted } = useOnboarding();

  return (
    <aside
      className={cn(
        'bg-sidebar relative flex flex-col border-r transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex h-16 items-center border-b px-4',
          sidebarOpen ? 'justify-between' : 'justify-center'
        )}
      >
        {sidebarOpen && (
          <Link href={ROUTES.DASHBOARD} className="flex items-center gap-2">
            <TrumpetIcon className="text-primary h-6 w-6" />
            <span className="font-semibold">{APP_CONFIG.APP_NAME}</span>
          </Link>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleSidebar}>
          {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-4">
        <div className="space-y-1">
          {navItems.map((item) => (
            <NavItem
              key={item.href}
              label={t(`nav.${item.key}`)}
              href={item.href}
              icon={item.icon}
              badgeCount={item.showBadge ? draftCount : undefined}
              showNewBadge={item.showNewWhenNotOnboarded && !isOnboardingCompleted}
              isCollapsed={!sidebarOpen}
            />
          ))}
        </div>

        <Separator className="my-4" />

        <div className="space-y-1">
          {resourceItems.map((item) => (
            <NavItem
              key={item.href}
              label={t(`nav.${item.key}`)}
              href={item.href}
              icon={item.icon}
              isCollapsed={!sidebarOpen}
            />
          ))}
        </div>

        <Separator className="my-4" />

        <div className="space-y-1">
          {settingsItems.map((item) => (
            <NavItem
              key={item.href}
              label={t(`nav.${item.key}`)}
              href={item.href}
              icon={item.icon}
              isCollapsed={!sidebarOpen}
            />
          ))}
        </div>
      </ScrollArea>

      {/* AI Quota Footer */}
      <AiQuotaFooter isCollapsed={!sidebarOpen} />

      {/* Logout Button */}
      <LogoutButton isCollapsed={!sidebarOpen} />
    </aside>
  );
}

function LogoutButton({ isCollapsed }: { isCollapsed: boolean }) {
  const t = useTranslations('common');
  const { signOut, loading } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
    } catch {
      // 錯誤已在 hook 中處理
    }
  };

  if (isCollapsed) {
    return (
      <div className="flex justify-center border-t p-2">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive h-8 w-8"
          onClick={handleLogout}
          disabled={loading}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="border-t p-4">
      <Button
        variant="ghost"
        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 w-full justify-start"
        onClick={handleLogout}
        disabled={loading}
      >
        <LogOut className="mr-2 h-4 w-4" />
        {t('actions.logout')}
      </Button>
    </div>
  );
}
