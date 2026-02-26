'use client';

// 統一 Providers 包裝

import { ReactNode } from 'react';
import { QueryProvider } from './query-provider';
import { ColorPaletteProvider } from '@/lib/colors/color-palette-context';
import { Toaster } from '@/components/ui/sonner';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryProvider>
      <ColorPaletteProvider>
        {children}
        <Toaster position="top-right" richColors />
      </ColorPaletteProvider>
    </QueryProvider>
  );
}
