'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  PenLine,
  FileText,
  Users,
  TrendingUp,
  Newspaper,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useUIStore } from '@/stores';
import { ROUTES } from '@/lib/constants';
import { useAiUsage } from '@/hooks/use-ai';

const iconMap = {
  LayoutDashboard,
  PenLine,
  FileText,
  Users,
  TrendingUp,
  Newspaper,
  Settings,
};

const navItems = [
  { label: 'Dashboard', href: ROUTES.DASHBOARD, icon: 'LayoutDashboard' },
  { label: '快速輸入', href: ROUTES.INPUT, icon: 'PenLine' },
  { label: '草稿', href: ROUTES.DRAFTS, icon: 'FileText', showBadge: true },
] as const;

const resourceItems = [
  { label: 'KOL 列表', href: ROUTES.KOLS, icon: 'Users' },
  { label: '投資標的', href: ROUTES.STOCKS, icon: 'TrendingUp' },
  { label: '所有文章', href: ROUTES.POSTS, icon: 'Newspaper' },
] as const;

const settingsItems = [
  { label: '設定', href: ROUTES.SETTINGS, icon: 'Settings' },
] as const;

interface NavItemProps {
  label: string;
  href: string;
  icon: keyof typeof iconMap;
  showBadge?: boolean;
  isCollapsed: boolean;
}

function NavItem({ label, href, icon, showBadge, isCollapsed }: NavItemProps) {
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
          isActive && 'bg-accent'
        )}
      >
        <Icon className={cn('h-4 w-4', !isCollapsed && 'mr-2')} />
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left">{label}</span>
            {showBadge && (
              <Badge variant="secondary" className="ml-auto">
                3
              </Badge>
            )}
          </>
        )}
      </Button>
    </Link>
  );
}

function AiQuotaFooter({ isCollapsed }: { isCollapsed: boolean }) {
  const { data: usage, isLoading } = useAiUsage();

  if (isCollapsed) {
    // 收合狀態只顯示圖示
    const percentage = usage ? (usage.remaining / usage.weeklyLimit) * 100 : 100;
    const colorClass = percentage > 50 ? 'text-green-500' : percentage > 20 ? 'text-yellow-500' : 'text-red-500';

    return (
      <div className="border-t p-2 flex justify-center">
        <Sparkles className={cn('h-4 w-4', isLoading ? 'animate-pulse text-muted-foreground' : colorClass)} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="border-t p-4">
        <div className="text-xs text-muted-foreground animate-pulse">
          <span>AI 配額: </span>
          <span className="font-medium">載入中...</span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-muted" />
      </div>
    );
  }

  if (!usage) {
    return null;
  }

  const percentage = (usage.remaining / usage.weeklyLimit) * 100;
  const colorClass = percentage > 50 ? 'bg-green-500' : percentage > 20 ? 'bg-yellow-500' : 'bg-red-500';

  // 格式化重置時間
  const formatResetTime = () => {
    if (!usage.resetAt) return '';
    const reset = new Date(usage.resetAt);
    const now = new Date();
    const diffDays = Math.ceil((reset.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return '今天重置';
    if (diffDays === 1) return '明天重置';
    return `${diffDays}天後重置`;
  };

  return (
    <div className="border-t p-4">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>AI 配額</span>
        </div>
        <span className="text-muted-foreground">{formatResetTime()}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-lg font-bold">{usage.remaining}</span>
        <span className="text-sm text-muted-foreground">/ {usage.weeklyLimit} 本週</span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', colorClass)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useUIStore();

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r bg-sidebar transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-16'
      )}
    >
      {/* Logo */}
      <div className={cn('flex h-16 items-center border-b px-4', sidebarOpen ? 'justify-between' : 'justify-center')}>
        {sidebarOpen && (
          <Link href={ROUTES.DASHBOARD} className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            <span className="font-semibold">KOL Tracker</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={toggleSidebar}
        >
          {sidebarOpen ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-2 py-4">
        <div className="space-y-1">
          {navItems.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              isCollapsed={!sidebarOpen}
            />
          ))}
        </div>

        <Separator className="my-4" />

        <div className="space-y-1">
          {resourceItems.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              isCollapsed={!sidebarOpen}
            />
          ))}
        </div>

        <Separator className="my-4" />

        <div className="space-y-1">
          {settingsItems.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              isCollapsed={!sidebarOpen}
            />
          ))}
        </div>
      </ScrollArea>

      {/* AI Quota Footer */}
      <AiQuotaFooter isCollapsed={!sidebarOpen} />
    </aside>
  );
}
