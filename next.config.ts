import type { NextConfig } from 'next';
import path from 'path';
import { fileURLToPath } from 'url';
import createNextIntlPlugin from 'next-intl/plugin';

const projectDir = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  /* 強制 webpack 以專案目錄為 resolve context，避免在父目錄 C:\\Cursor_Master 解析 tailwindcss */
  webpack: (config) => {
    config.context = path.resolve(projectDir);
    return config;
  },
};

export default withNextIntl(nextConfig);
