import { describe, it, expect } from 'vitest';
import {
  mergeIsolatedLetters,
  applyDictionary,
  convertSimplifiedToTraditional,
  cleanTranscript,
} from '../transcript-cleanup';

// ── Pass 1: mergeIsolatedLetters ───────────────────────────────────────────

describe('mergeIsolatedLetters', () => {
  it('merges ticker symbol fragments', () => {
    expect(mergeIsolatedLetters('T S M C')).toBe('TSMC');
    expect(mergeIsolatedLetters('N V D A')).toBe('NVDA');
    expect(mergeIsolatedLetters('A A P L')).toBe('AAPL');
  });

  it('merges 2-letter sequences', () => {
    expect(mergeIsolatedLetters('A I is great')).toBe('AI is great');
  });

  it('merges 3-letter sequences', () => {
    expect(mergeIsolatedLetters('E T F')).toBe('ETF');
    expect(mergeIsolatedLetters('G D P')).toBe('GDP');
  });

  it('preserves single isolated letters', () => {
    expect(mergeIsolatedLetters('I went to A store')).toBe('I went to A store');
  });

  it('does not merge lowercase letter sequences', () => {
    expect(mergeIsolatedLetters('t s m c')).toBe('t s m c');
  });

  it('handles multiple sequences in one string', () => {
    expect(mergeIsolatedLetters('Buy T S L A and N V D A')).toBe('Buy TSLA and NVDA');
  });

  it('returns empty string unchanged', () => {
    expect(mergeIsolatedLetters('')).toBe('');
  });

  it('handles sequence at start of string', () => {
    expect(mergeIsolatedLetters('A M D is bullish')).toBe('AMD is bullish');
  });

  it('handles sequence at end of string', () => {
    expect(mergeIsolatedLetters('Buy A M D')).toBe('Buy AMD');
  });
});

// ── Pass 2: applyDictionary ────────────────────────────────────────────────

describe('applyDictionary', () => {
  it('replaces exact match Chinese terms', () => {
    expect(applyDictionary('台 积 电 是好股票')).toBe('台積電 是好股票');
  });

  it('replaces regex pattern terms', () => {
    // "T S M C?" should match both "T S M C" and "T S M"
    expect(applyDictionary('T S M C is great')).toBe('TSMC is great');
    expect(applyDictionary('T S M is great')).toBe('TSMC is great');
  });

  it('replaces multiple terms in one pass', () => {
    const input = '台 积 电 和 辉 达';
    const result = applyDictionary(input);
    expect(result).toContain('台積電');
    expect(result).toContain('輝達');
  });

  it('leaves text unchanged when no patterns match', () => {
    const input = 'Hello world, nothing to replace here';
    expect(applyDictionary(input)).toBe(input);
  });

  it('replaces KOL name fragments', () => {
    expect(applyDictionary('欢迎 收听 古 玩')).toContain('股癌');
    expect(applyDictionary('欢迎 收听 古 哀')).toContain('股癌');
    expect(applyDictionary('欢迎 收听 古 癌')).toContain('股癌');
  });

  it('replaces brand names', () => {
    expect(applyDictionary('N or d VPN 赞助')).toBe('NordVPN 赞助');
  });

  it('replaces financial terms', () => {
    expect(applyDictionary('S & P 500')).toBe('S&P 500');
  });
});

// ── Pass 3: convertSimplifiedToTraditional ─────────────────────────────────

describe('convertSimplifiedToTraditional', () => {
  it('converts Simplified to Traditional Chinese', () => {
    const result = convertSimplifiedToTraditional('投资市场');
    expect(result).toBe('投資市場');
  });

  it('leaves already-Traditional text mostly unchanged', () => {
    // OpenCC cn→twp may normalise some chars but shouldn't break Traditional text
    const input = '台積電';
    const result = convertSimplifiedToTraditional(input);
    // May become 臺積電 — that's OK, dictionary handles 臺→台 post-conversion
    expect(result).toMatch(/[台臺]積電/);
  });

  it('leaves English-only text unchanged', () => {
    const input = 'TSMC is a great company';
    expect(convertSimplifiedToTraditional(input)).toBe(input);
  });

  it('handles empty string', () => {
    expect(convertSimplifiedToTraditional('')).toBe('');
  });

  it('converts compound words', () => {
    // cn→twp should handle phrase-level conversion
    const result = convertSimplifiedToTraditional('软件');
    expect(result).toBe('軟體');
  });
});

// ── Integration: cleanTranscript ───────────────────────────────────────────

describe('cleanTranscript', () => {
  it('handles combined Gooaye-style transcript issues', async () => {
    const input = '欢迎 收听 古 玩 今天 讨论 T S M C 和 台 积 电 的 半 导 体 趋势';
    const result = await cleanTranscript(input);

    expect(result).toContain('股癌');
    expect(result).toContain('TSMC');
    expect(result).toContain('台積電');
    expect(result).toContain('半導體');
  });

  it('cleans mixed English ticker and Chinese content', async () => {
    const input = 'N V D A 辉 达 今天涨了 S & P 500 也创新高';
    const result = await cleanTranscript(input);

    expect(result).toContain('NVDA');
    expect(result).toContain('輝達');
    expect(result).toContain('S&P');
  });

  it('is idempotent', async () => {
    const input = '欢迎 收听 古 玩 T S M C 台 积 电 N V D A';
    const once = await cleanTranscript(input);
    const twice = await cleanTranscript(once);
    expect(twice).toBe(once);
  });

  it('handles empty string', async () => {
    expect(await cleanTranscript('')).toBe('');
  });

  it('handles pure English text without breaking it', async () => {
    const input = 'TSMC reported strong earnings this quarter';
    const result = await cleanTranscript(input);
    expect(result).toBe(input);
  });
});
