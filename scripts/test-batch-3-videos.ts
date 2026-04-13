#!/usr/bin/env tsx
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

import { processUrl } from '../src/domain/services/import-pipeline.service';

const URLS = [
  'https://www.youtube.com/watch?v=IL_5Qvka5sU',
  'https://www.youtube.com/watch?v=PpgaPfnZuHI',
  'https://www.youtube.com/watch?v=g4Oeovjs42U',
];

async function main() {
  const kolCache = new Map();
  for (const url of URLS) {
    console.log(`\n--- Processing: ${url} ---`);
    try {
      const result = await processUrl(url, 'a0000000-0000-4000-8000-000000000001', 'Asia/Taipei', true, kolCache);
      console.log('Result:', result.status, result.error || '');
      if (result.status === 'success') {
        console.log('  Post ID:', result.postId);
      }
    } catch (err) {
      console.error('THREW:', err instanceof Error ? err.message : err);
    }
  }
}

main().catch(console.error);
