'use client';

import { usePathname } from 'next/navigation';
import { ROUTES } from '@/lib/constants';
import { Sidebar, Header, MobileNav, OnboardingGuard } from '@/components/layout';

/**
 * App shell that handles sidebar visibility based on current route.
 * Hides sidebar/header on the onboarding page for a focused experience.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname === ROUTES.ONBOARDING;

  if (isOnboarding) {
    return (
      <div className="flex h-screen overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="bg-muted/30 flex-1 overflow-y-auto">{children}</main>
        </div>
        <OnboardingGuard />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile Navigation */}
      <MobileNav />

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="bg-muted/30 flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>

      <OnboardingGuard />
    </div>
  );
}
