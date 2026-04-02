import { AppShell } from '@/components/layout';
import { ImportStatusToast } from '@/components/import/import-status-toast';
import { BetaBanner } from '@/components/layout/beta-banner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BetaBanner />
      <AppShell>
        {children}
        <ImportStatusToast />
      </AppShell>
    </>
  );
}
