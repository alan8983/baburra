#!/usr/bin/env node

/**
 * 快速建立 E2E 測試案例檔案
 *
 * 用法：
 *   node scripts/add-e2e-case.mjs "測試名稱"
 *   node scripts/add-e2e-case.mjs "港股看多 — 騰訊"
 *
 * 會在 tests/e2e/fixtures/quick-input/ 建立一個 .txt 檔案，
 * 打開後貼上文章內容即可。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '..', 'tests', 'e2e', 'fixtures', 'quick-input');

const name = process.argv[2];

if (!name) {
  console.error('用法: node scripts/add-e2e-case.mjs "測試名稱"');
  console.error('範例: node scripts/add-e2e-case.mjs "港股看多 — 騰訊"');
  process.exit(1);
}

// Slugify: replace spaces/special chars with hyphens, keep CJK and alphanumeric
const slug = name
  .replace(/\s*—\s*/g, '-')
  .replace(/[^\p{L}\p{N}-]/gu, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase();

const filename = `${slug}.txt`;
const filepath = path.join(FIXTURES_DIR, filename);

if (!fs.existsSync(FIXTURES_DIR)) {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
}

if (fs.existsSync(filepath)) {
  console.error(`檔案已存在: ${filepath}`);
  process.exit(1);
}

const template = `# ${name}\n---\n在這裡貼上文章內容...\n`;

fs.writeFileSync(filepath, template, 'utf-8');
console.log(`已建立: ${path.relative(process.cwd(), filepath)}`);
console.log(`請打開檔案，將「在這裡貼上文章內容...」替換為實際內容。`);
