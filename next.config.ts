import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /* 強制 webpack 以專案目錄為 resolve context，避免在父目錄 C:\\Cursor_Master 解析 tailwindcss */
  webpack: (config) => {
    config.context = path.resolve(projectDir);
    return config;
  },
};

export default nextConfig;
