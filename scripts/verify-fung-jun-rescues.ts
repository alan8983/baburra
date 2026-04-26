#!/usr/bin/env tsx
/**
 * One-shot: verify whether the 8 馮君 → real-ticker rescues are signal or noise.
 *
 * For each post that's now linked to a 馮君-rescued stock (3044/3622/4966/6121/
 * 6244/6435/6441/6533.TW), pull the cached transcript and grep for:
 *   - the canonical company name (e.g. "譜瑞", "晶心科")
 *   - the original "馮君" hallucination
 *   - "馮" alone (in case Gemini split a word and saw 馮君 in a longer name)
 *
 * Outcome interpretation:
 *   - canonical name FOUND in transcript → rescue is correct, post is signal.
 *   - canonical name ABSENT, "馮君" or "馮" present → rescue is misattribution,
 *     this linkage is noise on the canonical stock's win-rate.
 *   - both absent → unrelated to either, just a stray Gemini binding; noise.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

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

interface Rescue {
  ticker: string;
  canonicalName: string;
  /** Substrings to search for as "this post is genuinely about <ticker>". */
  signalTokens: string[];
}

const RESCUES: Rescue[] = [
  { ticker: '3044.TW', canonicalName: '健鼎',     signalTokens: ['健鼎', '健頂', 'TRIPOD'] },
  { ticker: '3622.TW', canonicalName: '洋華',     signalTokens: ['洋華', 'YOUNG FAST'] },
  { ticker: '4966.TW', canonicalName: '譜瑞-KY',  signalTokens: ['譜瑞', 'PARADE'] },
  { ticker: '6121.TW', canonicalName: '新普',     signalTokens: ['新普', 'SIMPLO'] },
  { ticker: '6244.TW', canonicalName: '茂迪',     signalTokens: ['茂迪', 'MOTECH'] },
  { ticker: '6435.TW', canonicalName: '大中',     signalTokens: ['大中', 'TA-I'] },
  { ticker: '6441.TW', canonicalName: '廣錠',     signalTokens: ['廣錠', 'QUANTEL'] },
  { ticker: '6533.TW', canonicalName: '晶心科',   signalTokens: ['晶心科', '晶心', 'ANDES'] },
];

const HALLUCINATION_TOKENS = ['馮君', '馮', '鳳君'];

async function main() {
  const supabase = createAdminClient();
  let signalLinkages = 0;
  let noiseLinkages = 0;
  let unverifiable = 0;

  for (const r of RESCUES) {
    console.log('\n' + '='.repeat(80));
    console.log(`STOCK ${r.ticker}  (now: ${r.canonicalName})`);
    console.log('='.repeat(80));

    const { data: stock } = await supabase
      .from('stocks')
      .select('id, name')
      .eq('ticker', r.ticker)
      .eq('market', 'TW')
      .maybeSingle();
    if (!stock) {
      console.log('  (stock row not found — skipped)');
      continue;
    }

    const { data: links } = await supabase
      .from('post_stocks')
      .select('post_id, posts(source_url, kol_id, kols(name))')
      .eq('stock_id', stock.id);
    const linkRows = (links ?? []) as unknown as Array<{
      post_id: string;
      posts: {
        source_url: string | null;
        kol_id: string;
        kols: { name: string } | { name: string }[] | null;
      } | null;
    }>;

    if (linkRows.length === 0) {
      console.log('  no post linkages (clean)');
      continue;
    }
    console.log(`  ${linkRows.length} post linkage(s) to inspect`);

    for (const link of linkRows) {
      const url = link.posts?.source_url;
      const kolField = link.posts?.kols;
      const kolName = Array.isArray(kolField) ? kolField[0]?.name : kolField?.name;
      console.log(`\n  POST ${link.post_id}  kol=${kolName ?? '?'}\n    url=${url ?? '(none)'}`);
      if (!url) {
        console.log('    (no source_url — cannot fetch transcript)');
        unverifiable++;
        continue;
      }
      const { data: t } = await supabase
        .from('transcripts')
        .select('content')
        .eq('source_url', url)
        .maybeSingle();
      if (!t) {
        console.log('    (no cached transcript — cannot verify)');
        unverifiable++;
        continue;
      }
      const content = t.content as string;

      const signalHits = r.signalTokens
        .map((tok) => ({ tok, count: occurrences(content, tok) }))
        .filter((x) => x.count > 0);
      const hallucHits = HALLUCINATION_TOKENS
        .map((tok) => ({ tok, count: occurrences(content, tok) }))
        .filter((x) => x.count > 0);

      if (signalHits.length > 0) {
        console.log(`    ✓ SIGNAL — canonical mentioned: ${signalHits.map((h) => `${h.tok}×${h.count}`).join(', ')}`);
        signalLinkages++;
      } else if (hallucHits.length > 0) {
        console.log(`    ✗ NOISE — only hallucination token(s): ${hallucHits.map((h) => `${h.tok}×${h.count}`).join(', ')}`);
        noiseLinkages++;
      } else {
        console.log('    ✗ NOISE — neither canonical nor hallucination found in transcript');
        noiseLinkages++;
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Signal linkages (canonical mentioned in transcript): ${signalLinkages}`);
  console.log(`  Noise linkages  (canonical absent):                  ${noiseLinkages}`);
  console.log(`  Unverifiable    (no transcript):                     ${unverifiable}`);
  console.log(`  TOTAL inspected: ${signalLinkages + noiseLinkages + unverifiable}`);
}

function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let from = 0;
  // Case-insensitive scan for English tokens; Chinese chars match as-is.
  const isAscii = /^[\x00-\x7F]+$/.test(needle);
  const hay = isAscii ? haystack.toUpperCase() : haystack;
  const ndl = isAscii ? needle.toUpperCase() : needle;
  while (from < hay.length) {
    const i = hay.indexOf(ndl, from);
    if (i < 0) break;
    n++;
    from = i + ndl.length;
  }
  return n;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
