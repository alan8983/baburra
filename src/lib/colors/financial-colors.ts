/**
 * Centralized financial color system
 * Single source of truth for all bullish/bearish/neutral colors across the app.
 */

import type { ColorPalette } from '@/domain/models/user';
import type { Sentiment } from '@/domain/models/post';
import type { CandlestickData, VolumeData } from '@/domain/models/stock';

// =====================
// Types
// =====================

export interface FinancialColors {
  bullish: {
    text: string; // Tailwind: primary text color for bullish
    textStrong: string; // Tailwind: strong text (e.g., strongly bullish)
    textLight: string; // Tailwind: light text
    bg: string; // Tailwind: solid background (500)
    bgDark: string; // Tailwind: darker solid background (600)
    bgBadge: string; // Tailwind: badge background + text
    bgBadgeLight: string; // Tailwind: light badge
    hoverBorder: string; // Tailwind: hover state for selector
    hex: string; // Hex: bright
    hexDark: string; // Hex: dark variant
    rgba50: string; // RGBA: 50% opacity
  };
  bearish: {
    text: string;
    textStrong: string;
    textLight: string;
    bg: string;
    bgDark: string;
    bgBadge: string;
    bgBadgeLight: string;
    hoverBorder: string;
    hex: string;
    hexDark: string;
    rgba50: string;
  };
  neutral: {
    text: string;
    bg: string;
    bgBadge: string;
    hex: string;
  };

  // Pre-built records keyed by Sentiment (-3..3)
  sentimentBadgeColors: Record<Sentiment, string>;
  sentimentMarkerHex: Record<number, string>;

  // Chart-specific
  candlestick: {
    upColor: string;
    downColor: string;
  };

  // Volume bar colors
  volumeUp: string;
  volumeDown: string;
}

// =====================
// Raw color sets
// =====================

const GREEN = {
  text: 'text-green-600',
  textStrong: 'text-green-700',
  textLight: 'text-green-500',
  bg: 'bg-green-500',
  bgDark: 'bg-green-600',
  bgBadge: 'bg-green-600 text-white border-green-600',
  bgBadgeLight: 'bg-green-100 text-green-700 border-green-200',
  hoverBorder: 'hover:bg-green-50 hover:text-green-600 hover:border-green-200',
  hoverBorderStrong: 'hover:bg-green-50 hover:text-green-700 hover:border-green-300',
  sentimentBadge: 'text-green-600 bg-green-100',
  sentimentBadgeStrong: 'text-green-600 bg-green-100',
  sentimentBadgeExtreme: 'text-green-700 bg-green-200',
  sentimentBadgeLight: 'text-green-500 bg-green-50',
  sentimentBadgeMild: 'text-green-400 bg-green-50',
  hex: '#22c55e',
  hexDark: '#166534',
  hexExtreme: '#14532d',
  rgba50: 'rgba(34, 197, 94, 0.5)',
};

const RED = {
  text: 'text-red-600',
  textStrong: 'text-red-700',
  textLight: 'text-red-500',
  bg: 'bg-red-500',
  bgDark: 'bg-red-600',
  bgBadge: 'bg-red-600 text-white border-red-600',
  bgBadgeLight: 'bg-red-100 text-red-700 border-red-200',
  hoverBorder: 'hover:bg-red-50 hover:text-red-600 hover:border-red-200',
  hoverBorderStrong: 'hover:bg-red-50 hover:text-red-700 hover:border-red-300',
  sentimentBadge: 'text-red-600 bg-red-100',
  sentimentBadgeStrong: 'text-red-600 bg-red-100',
  sentimentBadgeExtreme: 'text-red-700 bg-red-200',
  sentimentBadgeLight: 'text-red-500 bg-red-50',
  sentimentBadgeMild: 'text-red-400 bg-red-50',
  hex: '#ef4444',
  hexDark: '#991b1b',
  hexExtreme: '#7f1d1d',
  rgba50: 'rgba(239, 68, 68, 0.5)',
};

const NEUTRAL = {
  text: 'text-gray-500',
  bg: 'bg-gray-400',
  bgBadge: 'text-gray-500 bg-gray-100',
  hex: '#6b7280',
};

// =====================
// Public API
// =====================

export const DEFAULT_PALETTE: ColorPalette = 'asian';

export function getFinancialColors(palette: ColorPalette): FinancialColors {
  // American: green=bullish, red=bearish
  // Asian:    red=bullish,   green=bearish
  const bull = palette === 'american' ? GREEN : RED;
  const bear = palette === 'american' ? RED : GREEN;

  return {
    bullish: {
      text: bull.text,
      textStrong: bull.textStrong,
      textLight: bull.textLight,
      bg: bull.bg,
      bgDark: bull.bgDark,
      bgBadge: bull.bgBadge,
      bgBadgeLight: bull.bgBadgeLight,
      hoverBorder: bull.hoverBorder,
      hex: bull.hex,
      hexDark: bull.hexDark,
      rgba50: bull.rgba50,
    },
    bearish: {
      text: bear.text,
      textStrong: bear.textStrong,
      textLight: bear.textLight,
      bg: bear.bg,
      bgDark: bear.bgDark,
      bgBadge: bear.bgBadge,
      bgBadgeLight: bear.bgBadgeLight,
      hoverBorder: bear.hoverBorder,
      hex: bear.hex,
      hexDark: bear.hexDark,
      rgba50: bear.rgba50,
    },
    neutral: NEUTRAL,

    sentimentBadgeColors: {
      [-3]: bear.sentimentBadgeExtreme,
      [-2]: bear.sentimentBadgeStrong,
      [-1]: bear.sentimentBadgeMild,
      [0]: NEUTRAL.bgBadge,
      [1]: bull.sentimentBadgeMild,
      [2]: bull.sentimentBadgeStrong,
      [3]: bull.sentimentBadgeExtreme,
    } as Record<Sentiment, string>,

    sentimentMarkerHex: {
      3: bull.hexExtreme,
      2: bull.hexDark,
      1: bull.hex,
      0: '#eab308', // Hold — stays orange-yellow
      [-1]: bear.hex,
      [-2]: bear.hexDark,
      [-3]: bear.hexExtreme,
    },

    candlestick: {
      upColor: bull.hex,
      downColor: bear.hex,
    },

    volumeUp: bull.rgba50,
    volumeDown: bear.rgba50,
  };
}

/**
 * Recolor volume bars on the client side based on user's color palette.
 * Call this after fetching volume data from the API.
 */
export function recolorVolumes(
  volumes: VolumeData[],
  colors: FinancialColors,
  candles: CandlestickData[]
): VolumeData[] {
  const candleMap = new Map(candles.map((c) => [c.time, c]));
  return volumes.map((v) => {
    const candle = candleMap.get(v.time);
    const isUp = candle ? candle.close >= candle.open : true;
    return { ...v, color: isUp ? colors.volumeUp : colors.volumeDown };
  });
}
