/**
 * Maps a numeric sentiment value to the corresponding translation key suffix.
 * Usage with next-intl: tCommon(`sentiment.${sentimentKey(value)}`)
 */
export function sentimentKey(sentiment: number): string {
  const keys: Record<number, string> = {
    [-3]: 'stronglyBearish',
    [-2]: 'bearish',
    [-1]: 'slightlyBearish',
    [0]: 'neutral',
    [1]: 'slightlyBullish',
    [2]: 'bullish',
    [3]: 'stronglyBullish',
  };
  return keys[sentiment] ?? 'neutral';
}
