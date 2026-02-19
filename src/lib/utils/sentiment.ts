/**
 * Maps a numeric sentiment value to the corresponding translation key suffix.
 * Usage with next-intl: tCommon(`sentiment.${sentimentKey(value)}`)
 */
export function sentimentKey(sentiment: number): string {
  const keys: Record<number, string> = {
    [-2]: 'stronglyBearish',
    [-1]: 'bearish',
    [0]: 'neutral',
    [1]: 'bullish',
    [2]: 'stronglyBullish',
  };
  return keys[sentiment] ?? 'neutral';
}
