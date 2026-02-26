'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useProfile } from '@/hooks/use-profile';
import type { ColorPalette } from '@/domain/models/user';
import { getFinancialColors, DEFAULT_PALETTE, type FinancialColors } from './financial-colors';

interface ColorPaletteContextValue {
  palette: ColorPalette;
  colors: FinancialColors;
}

const ColorPaletteContext = createContext<ColorPaletteContextValue | null>(null);

export function ColorPaletteProvider({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();
  const palette = profile?.colorPalette ?? DEFAULT_PALETTE;

  const value = useMemo(() => ({ palette, colors: getFinancialColors(palette) }), [palette]);

  return <ColorPaletteContext.Provider value={value}>{children}</ColorPaletteContext.Provider>;
}

export function useColorPalette(): ColorPaletteContextValue {
  const ctx = useContext(ColorPaletteContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider
    return {
      palette: DEFAULT_PALETTE,
      colors: getFinancialColors(DEFAULT_PALETTE),
    };
  }
  return ctx;
}
