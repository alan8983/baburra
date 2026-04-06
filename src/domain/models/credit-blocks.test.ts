import { describe, it, expect } from 'vitest';
import { CREDIT_BLOCKS, composeCost, type Recipe } from './credit-blocks';

describe('CREDIT_BLOCKS', () => {
  it('matches the locked prices in docs/CREDIT_COST_BREAKDOWN.md', () => {
    expect(CREDIT_BLOCKS['scrape.html'].credits).toBe(0.2);
    expect(CREDIT_BLOCKS['scrape.youtube_meta'].credits).toBe(0.2);
    expect(CREDIT_BLOCKS['scrape.youtube_captions'].credits).toBe(0.5);
    expect(CREDIT_BLOCKS['scrape.rss'].credits).toBe(0.3);
    expect(CREDIT_BLOCKS['scrape.apify.profile'].credits).toBe(2.0);
    expect(CREDIT_BLOCKS['scrape.apify.post'].credits).toBe(0.5);
    expect(CREDIT_BLOCKS['download.audio.short'].credits).toBe(0.3);
    expect(CREDIT_BLOCKS['download.audio.long'].credits).toBe(0.1);
    expect(CREDIT_BLOCKS['transcribe.audio'].credits).toBe(1.5);
    expect(CREDIT_BLOCKS['transcribe.cached_transcript'].credits).toBe(0.2);
    expect(CREDIT_BLOCKS['ai.analyze.short'].credits).toBe(1.0);
    expect(CREDIT_BLOCKS['ai.analyze.long'].credits).toBe(1.0);
    expect(CREDIT_BLOCKS['ai.reroll'].credits).toBe(2.0);
  });

  it('exposes a single transcription block (no separate Deepgram/Gemini entries)', () => {
    const ids = Object.keys(CREDIT_BLOCKS);
    expect(ids).toContain('transcribe.audio');
    expect(ids).not.toContain('transcribe.deepgram');
    expect(ids).not.toContain('transcribe.gemini_audio');
  });
});

describe('composeCost', () => {
  it('returns 0 for an empty recipe', () => {
    expect(composeCost([])).toBe(0);
  });

  it('is additive across blocks', () => {
    const recipe: Recipe = [
      { block: 'scrape.html', units: 1 },
      { block: 'ai.analyze.short', units: 1 },
    ];
    // 0.2 + 1.0 = 1.2 -> ceil -> 2
    expect(composeCost(recipe)).toBe(2);
  });

  it('multiplies units correctly', () => {
    const recipe: Recipe = [{ block: 'transcribe.audio', units: 10 }];
    // 1.5 * 10 = 15
    expect(composeCost(recipe)).toBe(15);
  });

  it('rounds fractional totals UP at the final step only', () => {
    // 0.2 + 0.2 + 0.5 = 0.9 -> ceil -> 1
    expect(
      composeCost([
        { block: 'scrape.html', units: 1 },
        { block: 'scrape.youtube_meta', units: 1 },
        { block: 'scrape.youtube_captions', units: 1 },
      ])
    ).toBe(1);
    // Two fractional blocks summing to a whole number stay whole
    expect(composeCost([{ block: 'download.audio.long', units: 30 }])).toBe(3);
  });

  it('podcast-with-cached-transcript recipe sums to 2', () => {
    // scrape.rss(0.3) + transcribe.cached_transcript(0.2) + ai.analyze.short(1.0) = 1.5 -> 2
    expect(
      composeCost([
        { block: 'scrape.rss', units: 1 },
        { block: 'transcribe.cached_transcript', units: 1 },
        { block: 'ai.analyze.short', units: 1 },
      ])
    ).toBe(2);
  });

  it('long-video recipe scales linearly with minutes', () => {
    const min = 12;
    const recipe: Recipe = [
      { block: 'scrape.youtube_meta', units: 1 },
      { block: 'download.audio.long', units: min },
      { block: 'transcribe.audio', units: min },
      { block: 'ai.analyze.short', units: 1 },
    ];
    // 0.2 + 0.1*12 + 1.5*12 + 1.0 = 0.2 + 1.2 + 18 + 1 = 20.4 -> 21
    expect(composeCost(recipe)).toBe(21);
  });
});
