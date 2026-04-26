#!/usr/bin/env tsx
/**
 * Diagnostic: trace dubious stock entries back to transcript context.
 *
 * For each suspect token (e.g. "馮君", "宏捷"), we:
 *   1. Find matching rows in `stocks` (by name) and `post_stocks` linking to them
 *   2. For every such post, pull the cached transcript via posts.source_url
 *   3. Print every occurrence of the token with surrounding context
 *
 * This tells us whether the bad mapping comes from:
 *   - A Deepgram mistranscription (token appears in the transcript text)
 *   - A Gemini hallucination (token does NOT appear in the transcript text)
 *   - A name-collision pun (token appears as an unrelated phrase, e.g. 馮君 = 風險)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Load env BEFORE other imports
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

import { createAdminClient } from '../src/infrastructure/supabase/admin';

interface Suspect {
  /** What we expect to see in the stocks table (or just a substring match). */
  nameLike: string;
  /** Optional ticker filter for narrower lookup. */
  ticker?: string;
  /** Tokens to grep for inside the transcript (defaults to nameLike). */
  grep?: string[];
}

const SUSPECTS: Suspect[] = [
  { nameLike: '馮君', grep: ['馮君', '風險', '風雲', '鳳君'] },
  { nameLike: '宏捷', ticker: '2353.TW', grep: ['宏捷', '宏碁'] },
  { nameLike: '宏碁', ticker: '2353.TW', grep: ['宏碁', '宏捷'] },
];

const CONTEXT_CHARS = 40;
const MAX_HITS_PER_TRANSCRIPT = 6;
const MAX_POSTS_PER_SUSPECT = 8;

function findOccurrences(text: string, needle: string): Array<{ idx: number; context: string }> {
  const hits: Array<{ idx: number; context: string }> = [];
  let from = 0;
  while (from < text.length) {
    const idx = text.indexOf(needle, from);
    if (idx < 0) break;
    const start = Math.max(0, idx - CONTEXT_CHARS);
    const end = Math.min(text.length, idx + needle.length + CONTEXT_CHARS);
    const before = text.slice(start, idx).replace(/\s+/g, ' ');
    const after = text.slice(idx + needle.length, end).replace(/\s+/g, ' ');
    hits.push({ idx, context: `…${before}【${needle}】${after}…` });
    from = idx + needle.length;
  }
  return hits;
}

async function main() {
  const supabase = createAdminClient();

  for (const suspect of SUSPECTS) {
    console.log('\n' + '='.repeat(80));
    console.log(`SUSPECT: name~"${suspect.nameLike}"${suspect.ticker ? `, ticker=${suspect.ticker}` : ''}`);
    console.log('='.repeat(80));

    // 1. Find candidate stocks
    let stockQuery = supabase
      .from('stocks')
      .select('id, ticker, name, market, created_at, updated_at')
      .ilike('name', `%${suspect.nameLike}%`);
    if (suspect.ticker) {
      stockQuery = stockQuery.eq('ticker', suspect.ticker);
    }
    const { data: stocks, error: stockErr } = await stockQuery;
    if (stockErr) {
      console.error('stock query failed:', stockErr);
      continue;
    }
    if (!stocks || stocks.length === 0) {
      console.log('  (no matching stocks in DB)');
      continue;
    }

    for (const stock of stocks) {
      console.log(`\n  STOCK ${stock.ticker} | name="${stock.name}" | market=${stock.market} | id=${stock.id}`);

      // 2. Find post_stocks linking to this stock
      const { data: links } = await supabase
        .from('post_stocks')
        .select('post_id, source, inference_reason, posts(source_url, posted_at, kol_id, kols(name))')
        .eq('stock_id', stock.id)
        .limit(MAX_POSTS_PER_SUSPECT);

      const linkRows = (links ?? []) as unknown as Array<{
        post_id: string;
        source: string | null;
        inference_reason: string | null;
        posts:
          | {
              source_url: string | null;
              posted_at: string;
              kol_id: string;
              kols: { name: string } | { name: string }[] | null;
            }
          | null;
      }>;

      console.log(`  → ${linkRows.length} post_stocks rows (showing up to ${MAX_POSTS_PER_SUSPECT})`);

      let anyTranscriptHit = false;
      let postsScanned = 0;

      for (const link of linkRows) {
        const post = link.posts;
        const sourceUrl = post?.source_url;
        const kolField = post?.kols;
        const kolName = Array.isArray(kolField)
          ? kolField[0]?.name
          : kolField?.name;

        console.log(`\n    POST ${link.post_id} | kol="${kolName ?? '?'}" | url=${sourceUrl ?? '(none)'} | source=${link.source}`);
        if (link.inference_reason) {
          console.log(`      inference_reason: ${link.inference_reason}`);
        }

        if (!sourceUrl) {
          console.log('      (no source_url — cannot fetch transcript)');
          continue;
        }
        const { data: transcript } = await supabase
          .from('transcripts')
          .select('content, source, language')
          .eq('source_url', sourceUrl)
          .single();
        if (!transcript) {
          console.log('      (no cached transcript for this URL)');
          continue;
        }
        postsScanned++;

        const grepTerms = suspect.grep ?? [suspect.nameLike];
        for (const term of grepTerms) {
          const hits = findOccurrences(transcript.content, term);
          if (hits.length === 0) continue;
          if (term === suspect.nameLike || term === stock.name) anyTranscriptHit = true;
          console.log(`      grep "${term}": ${hits.length} hits (transcript source=${transcript.source})`);
          for (const hit of hits.slice(0, MAX_HITS_PER_TRANSCRIPT)) {
            console.log(`        ${hit.context}`);
          }
          if (hits.length > MAX_HITS_PER_TRANSCRIPT) {
            console.log(`        … (${hits.length - MAX_HITS_PER_TRANSCRIPT} more)`);
          }
        }
      }

      if (postsScanned > 0 && !anyTranscriptHit) {
        console.log(`\n  ⚠ Token "${stock.name}" never appeared verbatim in any inspected transcript (${postsScanned} scanned).`);
        console.log(`    → likely AI hallucination, NOT a transcription error.`);
      } else if (anyTranscriptHit) {
        console.log(`\n  ✓ Token "${stock.name}" was found in transcripts → likely transcription artifact (or correct).`);
      }
    }
  }

  // ---- Scope check: any stock name shared by 2+ distinct tickers is a smell ----
  console.log('\n' + '='.repeat(80));
  console.log('SCOPE: stock names shared across multiple tickers (top 30)');
  console.log('='.repeat(80));
  const { data: allStocks } = await supabase
    .from('stocks')
    .select('ticker, name, market')
    .order('name');
  if (allStocks && allStocks.length > 0) {
    const byName = new Map<string, Array<{ ticker: string; market: string }>>();
    for (const s of allStocks as Array<{ ticker: string; name: string; market: string }>) {
      const key = (s.name || '').trim();
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push({ ticker: s.ticker, market: s.market });
    }
    const dupes = Array.from(byName.entries())
      .filter(([, rows]) => rows.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 30);
    console.log(`  found ${dupes.length} duplicate-name groups (showing top 30)`);
    for (const [name, rows] of dupes) {
      const tickers = rows.map((r) => `${r.ticker}(${r.market})`).join(', ');
      console.log(`  • "${name}" → ${rows.length} tickers: ${tickers}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
