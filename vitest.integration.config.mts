/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Integration-test runner. These tests hit a real Supabase instance via the
// service-role key. They auto-skip when NEXT_PUBLIC_SUPABASE_URL or
// SUPABASE_SERVICE_ROLE_KEY are unset (see src/test-utils/supabase-fixtures.ts),
// so running this config without env vars is safe — tests will report as
// skipped, not failed.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.integration.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.next'],
    // Integration tests contend for DB rows; run sequentially to keep fixture
    // lifecycle simple.
    fileParallelism: false,
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
