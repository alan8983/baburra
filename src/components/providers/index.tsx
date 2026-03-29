'use client';

// 統一 Providers 包裝

import { ReactNode } from 'react';
import { QueryProvider } from './query-provider';
import { ColorPaletteProvider } from '@/lib/colors/color-palette-context';
import { UpgradePromptProvider } from '@/components/paywall/upgrade-prompt';
import { Toaster } from '@/components/ui/sonner';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryProvider>
      <ColorPaletteProvider>
        <UpgradePromptProvider>
          {children}
          <Toaster position="top-right" richColors />
        </UpgradePromptProvider>
      </ColorPaletteProvider>
    </QueryProvider>
  );
}
