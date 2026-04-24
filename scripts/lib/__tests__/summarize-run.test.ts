import { describe, it, expect } from 'vitest';
import { parseJsonl, aggregateSummary } from '../summarize-run';
import type { StageTiming } from '../../../src/domain/models/pipeline-timing';

function makeEntry(
  url: string,
  status: 'success' | 'duplicate' | 'mirror_linked' | 'error',
  timings?: StageTiming[]
) {
  return { url, status, ...(timings ? { timings } : {}) };
}

describe('summarize-run', () => {
  describe('parseJsonl', () => {
    it('parses well-formed log lines', () => {
      const text = [
        JSON.stringify(makeEntry('a', 'success')),
        JSON.stringify(makeEntry('b', 'error')),
        '', // blank line, skipped
        JSON.stringify(makeEntry('c', 'duplicate')),
      ].join('\n');
      const { entries, warnings } = parseJsonl(text);
      expect(entries).toHaveLength(3);
      expect(warnings).toHaveLength(0);
    });

    it('records a warning for malformed JSON but still returns valid lines', () => {
      const text = [
        JSON.stringify(makeEntry('a', 'success')),
        '{not valid json',
        JSON.stringify(makeEntry('b', 'error')),
      ].join('\n');
      const { entries, warnings } = parseJsonl(text);
      expect(entries).toHaveLength(2);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/line 2/);
      expect(warnings[0]).toMatch(/JSON parse failed/);
    });

    it('warns on valid JSON missing required fields', () => {
      const text = [JSON.stringify({ unrelated: 'object' })].join('\n');
      const { entries, warnings } = parseJsonl(text);
      expect(entries).toHaveLength(0);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/missing url or status/);
    });
  });

  describe('aggregateSummary — well-formed log', () => {
    it('computes correct success_rate and per-stage p50/p95', () => {
      const timings = (ms: number): StageTiming[] => [
        { stage: 'deepgram', ms, ok: true, retries: 0 },
        { stage: 'gemini_sentiment', ms: ms / 10, ok: true, retries: 0 },
      ];
      const entries = [
        makeEntry('a', 'success', timings(1000)),
        makeEntry('b', 'success', timings(2000)),
        makeEntry('c', 'success', timings(3000)),
        makeEntry('d', 'success', timings(4000)),
        makeEntry('e', 'error'), // no timings
      ];
      const summary = aggregateSummary(entries);
      expect(summary.attempted).toBe(5);
      expect(summary.passed).toBe(4);
      expect(summary.failed).toBe(1);
      expect(summary.success_rate).toBe(80);
      expect(summary.stages.deepgram).toBeDefined();
      expect(summary.stages.deepgram!.count).toBe(4);
      expect(summary.stages.deepgram!.p50).toBe(2500); // midpoint of 2000/3000
      expect(summary.stages.deepgram!.p95).toBe(3850); // 95th percentile of 4 values
      expect(summary.stages.gemini_sentiment).toBeDefined();
      expect(summary.stages.gemini_sentiment!.count).toBe(4);
    });

    it('counts duplicates + mirror_linked separately from passed/failed', () => {
      const entries = [
        makeEntry('a', 'success'),
        makeEntry('b', 'duplicate'),
        makeEntry('c', 'mirror_linked'),
        makeEntry('d', 'error'),
      ];
      const summary = aggregateSummary(entries);
      expect(summary.attempted).toBe(4);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.duplicates).toBe(2);
      expect(summary.success_rate).toBe(25);
    });
  });

  describe('aggregateSummary — edge cases', () => {
    it('zero-attempt input returns success_rate: 0 and partial: true', () => {
      const summary = aggregateSummary([]);
      expect(summary.attempted).toBe(0);
      expect(summary.success_rate).toBe(0);
      expect(summary.partial).toBe(true);
      expect(summary.stages).toEqual({});
    });

    it('carries warnings from the parse step into the summary', () => {
      const summary = aggregateSummary([makeEntry('a', 'success')], {
        warnings: ['line 7: JSON parse failed'],
      });
      expect(summary.warnings).toEqual(['line 7: JSON parse failed']);
      expect(summary.partial).toBeUndefined(); // non-empty run, not partial
    });

    it('flags partial when the caller signals interrupted run', () => {
      const summary = aggregateSummary([makeEntry('a', 'success')], { partial: true });
      expect(summary.partial).toBe(true);
      expect(summary.success_rate).toBe(100);
    });

    it('omits stage entries when no entry recorded that stage', () => {
      const entries = [makeEntry('a', 'success')];
      const summary = aggregateSummary(entries);
      // no timings provided → no stage entries
      expect(summary.stages).toEqual({});
    });
  });
});
