import { AppShell } from '@/components/layout';
import { ImportStatusToast } from '@/components/import/import-status-toast';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {children}
      <ImportStatusToast />
    </AppShell>
  );
}
