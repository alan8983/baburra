#!/usr/bin/env tsx
import * as fs from 'node:fs';
import * as path from 'node:path';

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    if (!process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}

import { downloadYoutubeAudioStream } from '../src/infrastructure/api/youtube-audio.client';

async function main() {
  console.log('Testing EP650 (IL_5Qvka5sU) — should fall back to yt-dlp...\n');
  const start = Date.now();
  const result = await downloadYoutubeAudioStream('https://www.youtube.com/watch?v=IL_5Qvka5sU');
  console.log('\nmimeType:', result.mimeType);
  console.log('durationSeconds:', result.durationSeconds);
  console.log('format:', result.format);
  console.log('bytesTotal:', result.bytesTotal);

  // Consume 2MB to verify stream is readable
  let bytes = 0;
  for await (const chunk of result.stream) {
    bytes += chunk.length;
    if (bytes > 2 * 1024 * 1024) {
      result.stream.destroy();
      break;
    }
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Read ${(bytes / 1024 / 1024).toFixed(1)} MB from stream in ${elapsed}s`);
  console.log('\nSUCCESS');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
