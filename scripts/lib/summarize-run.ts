/**
 * Summarize a seed-script run from its JSONL log.
 *
 * Input: a JSONL file where each line is a record produced per URL by the
 * seed script, with shape:
 *   { url, status, timings?: StageTiming[], error?, ... }
 *
 * Output: a run-summary JSON file with attempted/passed/failed counts, the
 * mechanical `success_rate`, and per-stage p50/p95 latency.
 *
 * Exits best-effort on malformed input — partial runs still produce a
 * summary with a `warnings` array and `partial: true`.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { StageTiming, PipelineStage } from '../../src/domain/models/pipeline-timing';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RunLogEntry {
  url: string;
  status: 'success' | 'duplicate' | 'mirror_linked' | 'error';
  error?: string;
  timings?: StageTiming[];
}

export interface StageAggregate {
  p50: number;
  p95: number;
  count: number;
}

export interface RunSummary {
  attempted: number;
  passed: number;
  failed: number;
  duplicates: number;
  success_rate: number;
  stages: Partial<Record<PipelineStage, StageAggregate>>;
  partial?: boolean;
  warnings?: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Parse a JSONL string into log entries + warnings for malformed lines.
 * Blank lines are skipped silently.
 */
export function parseJsonl(text: string): { entries: RunLogEntry[]; warnings: string[] } {
  const entries: RunLogEntry[] = [];
  const warnings: string[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'url' in parsed &&
        'status' in parsed
      ) {
        entries.push(parsed as RunLogEntry);
      } else {
        warnings.push(`line ${i + 1}: not a RunLogEntry (missing url or status)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`line ${i + 1}: JSON parse failed: ${msg.slice(0, 100)}`);
    }
  }
  return { entries, warnings };
}

/**
 * Aggregate a list of log entries into a RunSummary. Pure function — no I/O.
 */
export function aggregateSummary(
  entries: RunLogEntry[],
  opts: { partial?: boolean; warnings?: string[] } = {}
): RunSummary {
  const passed = entries.filter((e) => e.status === 'success').length;
  const duplicates = entries.filter(
    (e) => e.status === 'duplicate' || e.status === 'mirror_linked'
  ).length;
  const failed = entries.filter((e) => e.status === 'error').length;
  const attempted = entries.length;
  const success_rate = attempted === 0 ? 0 : round1((passed / attempted) * 100);

  const stageMsByName: Partial<Record<PipelineStage, number[]>> = {};
  for (const entry of entries) {
    if (!entry.timings) continue;
    for (const t of entry.timings) {
      if (!stageMsByName[t.stage]) stageMsByName[t.stage] = [];
      stageMsByName[t.stage]!.push(t.ms);
    }
  }

  const stages: Partial<Record<PipelineStage, StageAggregate>> = {};
  for (const stage of Object.keys(stageMsByName) as PipelineStage[]) {
    const list = stageMsByName[stage]!.slice().sort((a, b) => a - b);
    stages[stage] = {
      p50: Math.round(percentile(list, 50)),
      p95: Math.round(percentile(list, 95)),
      count: list.length,
    };
  }

  const summary: RunSummary = {
    attempted,
    passed,
    failed,
    duplicates,
    success_rate,
    stages,
  };
  if (opts.partial || attempted === 0) summary.partial = true;
  if (opts.warnings && opts.warnings.length > 0) summary.warnings = opts.warnings;
  return summary;
}

/**
 * Read a JSONL log from disk and return the aggregated summary. Best-effort:
 * a missing/unreadable file still returns a partial summary with a warning.
 */
export function summarizeFromFile(jsonlPath: string, partial = false): RunSummary {
  try {
    const text = fs.readFileSync(jsonlPath, 'utf-8');
    const { entries, warnings } = parseJsonl(text);
    return aggregateSummary(entries, { partial, warnings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return aggregateSummary([], { partial: true, warnings: [`file read failed: ${msg}`] });
  }
}

/**
 * Summarize a JSONL log and write the result to `<jsonlPath>.summary.json`
 * (or to an explicit output path). Returns the written path.
 */
export function writeSummary(
  jsonlPath: string,
  opts: { partial?: boolean; outputPath?: string } = {}
): string {
  const summary = summarizeFromFile(jsonlPath, opts.partial);
  const outputPath =
    opts.outputPath ??
    jsonlPath.replace(/\.jsonl$/, '').concat('.summary.json') ??
    path.join(path.dirname(jsonlPath), 'summary.json');
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf-8');
  return outputPath;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function isMain(): boolean {
  // Run as a CLI when invoked directly via `tsx scripts/lib/summarize-run.ts`.
  // Don't assume specific argv[0] — tsx is the typical invoker in this project.
  return Boolean(process.argv[1] && process.argv[1].endsWith('summarize-run.ts'));
}

if (isMain()) {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: tsx scripts/lib/summarize-run.ts <jsonl-path> [--partial]');
    process.exit(1);
  }
  const partial = process.argv.includes('--partial');
  const output = writeSummary(input, { partial });
  console.log(`Wrote summary: ${output}`);
}
