#!/usr/bin/env tsx
/**
 * Diagnostic: test cleanup + AI analysis on a single cached transcript.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load env BEFORE any other imports
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

import { cleanTranscript } from '../src/domain/services/transcript-cleanup';
import { createAdminClient } from '../src/infrastructure/supabase/admin';

async function main() {
  const supabase = createAdminClient();

  // Get one Gooaye transcript
  const { data, error } = await supabase
    .from('transcripts')
    .select('source_url, content')
    .like('source_url', '%youtube.com/watch%')
    .eq('source', 'deepgram')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    console.error('Failed to fetch transcript:', error);
    process.exit(1);
  }

  console.log('Source:', data.source_url);
  console.log('Raw length:', data.content.length);
  console.log('\n=== RAW (first 500 chars) ===');
  console.log(data.content.slice(0, 500));

  const cleaned = cleanTranscript(data.content);
  console.log('\n=== CLEANED (first 500 chars) ===');
  console.log(cleaned.slice(0, 500));
  console.log('\nCleaned length:', cleaned.length);

  // Check if any known tickers appear in cleaned text
  const tickerPatterns = ['TSMC', 'TSM', '台積電', 'NVDA', '輝達', 'SPY', 'S&P', 'ETF', '半導體', '聯準會'];
  console.log('\n=== Ticker patterns found in cleaned text ===');
  for (const pattern of tickerPatterns) {
    const count = (cleaned.match(new RegExp(pattern, 'g')) || []).length;
    if (count > 0) console.log(`  ${pattern}: ${count} occurrences`);
  }

  // Now try the AI analysis
  console.log('\n=== Running AI analysis (analyzeDraftContent) ===');
  const { analyzeDraftContent } = await import('../src/domain/services/ai.service');
  try {
    const analysis = await analyzeDraftContent(cleaned);
    console.log('Tickers found:', analysis.stockTickers.length);
    for (const t of analysis.stockTickers) {
      console.log(`  ${t.ticker} (${t.name}) — ${t.market}, confidence: ${t.confidence}, source: ${t.source}`);
    }
    console.log('Sentiment:', analysis.sentiment);
    console.log('Reasoning:', analysis.reasoning?.slice(0, 200));
  } catch (err) {
    console.error('AI analysis failed:', err);
  }
}

main().catch(console.error);
